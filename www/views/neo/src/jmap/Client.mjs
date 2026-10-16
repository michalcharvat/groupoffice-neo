/**
 * Group Office JMAP client for the neo.mjs App worker.
 *
 * Auth follows GO's browser model: the HttpOnly cookie set by api/auth.php
 * authenticates every request (same-origin fetch sends it from the worker too),
 * every POST carries the CSRF token from the session. The access token is never
 * stored client-side.
 *
 * Method calls made in the same tick are batched into one api/jmap.php request.
 */
import {userFormat} from '../Format.mjs';
import {t}          from '../Translate.mjs';

/** User properties the shell keeps in client.user */
export const USER_PROPERTIES = ['id', 'username', 'displayName', 'avatarId', 'dateFormat', 'timeFormat', 'language',
    'start_module', 'theme', 'themeColorScheme', 'isAdmin'];

class Client {
    /** Web root of Group Office, e.g. "/" */
    baseUrl = '/'
    /** JMAP session (api/jmap.php GET or api/auth.php login response) */
    session = null
    /** Logged-in core User (USER_PROPERTIES) */
    user = null

    #csrfToken = null
    #queue = []
    #flushScheduled = false
    #callId = 0
    #listeners = {}
    #sseAbort = null
    #sseTypes = new Set()
    #states = {}

    get apiUrl() {
        return this.baseUrl + 'api/'
    }

    on(event, fn) {
        (this.#listeners[event] ??= new Set()).add(fn);
        return () => this.#listeners[event].delete(fn)
    }

    fire(event, data) {
        this.#listeners[event]?.forEach(fn => fn(data))
    }

    /**
     * Restores the session from the cookie (or remember-me handled by index.php).
     * @returns {Promise<Object|null>} the session, or null when not logged in
     */
    async restoreSession() {
        const response = await fetch(this.apiUrl + 'jmap.php', {credentials: 'same-origin'});

        if (response.status === 401) {
            return null
        }

        if (!response.ok) {
            throw new Error(`Session request failed: ${response.status} ${response.statusText}`)
        }

        await this.#setSession(await response.json());
        return this.session
    }

    /**
     * @param {String} username
     * @param {String} password
     * @param {Boolean} rememberLogin
     * @returns {Promise<{success: Boolean, message?: String}>}
     */
    async login(username, password, rememberLogin=false) {
        return this.#authRequest({username, password, rememberLogin})
    }

    /**
     * Next login step of a user with more authenticators (2FA): the loginToken of
     * login() and the data of the pending authenticators.
     * @param {String} loginToken
     * @param {Object} authenticators e.g. {otpauthenticator: {otp_code: '123456'}}
     * @param {Boolean} rememberLogin
     * @returns {Promise<{success: Boolean, message?: String, loginToken?: String, authenticators?: String[], errors?: Object}>}
     *   errors: authenticator id → {field: {code, description}}
     */
    async authenticate(loginToken, authenticators, rememberLogin=false) {
        return this.#authRequest({loginToken, authenticators, rememberLogin})
    }

    /**
     * POST api/auth.php: 201 logged in, 200/400 with a loginToken: authenticators pending
     * @param {Object} body
     * @returns {Promise<Object>}
     */
    async #authRequest(body) {
        const response = await fetch(this.apiUrl + 'auth.php', {
            method     : 'POST',
            credentials: 'same-origin',
            headers    : {'Content-Type': 'application/json'},
            body       : JSON.stringify(body)
        });

        let data = null;

        try {
            data = await response.json()
        } catch (e) {
            // empty or non-JSON error body
        }

        if (response.status === 201) {
            delete data.accessToken; // the cookie carries it
            await this.#setSession(data);
            return {success: true}
        }

        // more authenticators (2FA), or their data was wrong (400 with errors)
        if ((response.status === 200 || response.status === 400) && data?.loginToken) {
            return {success: false, loginToken: data.loginToken, authenticators: data.authenticators || [], errors: data.errors || null}
        }

        if (response.status === 503) {
            return {success: false, message: t("Sorry, maintenance mode is enabled and you can't login right now. Please come back later or contact your system administrator")}
        }

        return {success: false, message: data?.validationErrors ? t('Wrong username or password.') : (response.statusText || t('Login failed'))}
    }

    async logout() {
        const response = await fetch(this.apiUrl + 'auth.php', {
            method     : 'DELETE',
            credentials: 'same-origin',
            headers    : this.#headers()
        });

        // 401: the session was gone already
        if (!response.ok && response.status !== 401) {
            throw new Error(`Logout failed: ${response.status} ${response.statusText}`)
        }

        this.stopPush();
        this.session    = null;
        this.user       = null;
        this.#csrfToken = null;
        this.fire('logout')
    }

    /**
     * Takes the logged-in user's (changed) properties: date and time formats follow
     * @param {Object|null} user User with USER_PROPERTIES
     */
    setUser(user) {
        this.user = user && this.user?.id === user.id ? {...this.user, ...user} : user || null;

        user?.dateFormat && (userFormat.dateFormat = user.dateFormat);
        user?.timeFormat && (userFormat.timeFormat = user.timeFormat)
    }

    /**
     * @returns {Boolean} the user may manage users (core capability, like go.User.capabilities)
     */
    get mayChangeUsers() {
        return !!this.session?.capabilities?.['go:core:core']?.mayChangeUsers
    }

    /**
     * @returns {Boolean} the user may manage groups (core capability mayChangeGroups)
     */
    get mayChangeGroups() {
        return !!this.session?.capabilities?.['go:core:core']?.mayChangeGroups
    }

    /**
     * @returns {Boolean} the user may manage custom fields (core capability mayChangeCustomFields)
     */
    get mayChangeCustomFields() {
        return !!this.session?.capabilities?.['go:core:core']?.mayChangeCustomFields
    }

    /**
     * @returns {Boolean} the user is in the Admins group (go.User.isAdmin)
     */
    get isAdmin() {
        return !!this.user?.isAdmin
    }

    hasCapability(name) {
        return !!this.session?.capabilities?.[name]
    }

    /**
     * Queue one JMAP method call. Calls made in the same tick share one HTTP request.
     * @param {String} method e.g. "Note/get"
     * @param {Object} args
     * @returns {Promise<Object>} the method response arguments
     */
    call(method, args={}) {
        return new Promise((resolve, reject) => {
            this.#queue.push({method, args, id: 'c' + (++this.#callId), resolve, reject});

            if (!this.#flushScheduled) {
                this.#flushScheduled = true;
                queueMicrotask(() => this.#flush())
            }
        })
    }

    /**
     * Entity/query + Entity/get in one request using a result reference.
     * @returns {Promise<{list: Object[], total: Number, ids: String[]}>}
     */
    async queryGet(entity, {filter, sort, position=0, limit, properties}={}) {
        const queryArgs = {filter, sort, position, calculateTotal: true};

        if (limit) {
            queryArgs.limit = limit
        }

        // both calls are queued in the same tick → one request
        const id     = 'c' + (this.#callId + 1),
              query  = this.call(entity + '/query', queryArgs),
              get    = this.call(entity + '/get', {'#ids': {resultOf: id, path: '/ids'}, properties}),
              [q, g] = await Promise.all([query, get]);

        this.#baseState(entity, g.state);

        return {list: g.list, total: q.total, ids: q.ids}
    }

    async get(entity, ids, properties) {
        const response = await this.call(entity + '/get', {ids, properties});
        this.#baseState(entity, response.state);
        return response.list
    }

    /**
     * Entity/set with errors turned into exceptions.
     * @returns {Promise<Object>} the set response
     */
    async set(entity, {create, update, destroy}) {
        const response = await this.call(entity + '/set', {create, update, destroy}),
              errors   = {...response.notCreated, ...response.notUpdated, ...response.notDestroyed},
              first    = Object.values(errors)[0];

        if (first) {
            throw new Error(Client.describeSetError(first))
        }

        return response
    }

    /**
     * Uploads a file as a JMAP blob (api/upload.php)
     * @param {File|Blob} file
     * @returns {Promise<Object>} {blobId, name, size, type}
     */
    async upload(file) {
        const response = await fetch(this.apiUrl + 'upload.php', {
            method     : 'POST',
            credentials: 'same-origin',
            headers    : {
                ...this.#headers(),
                'Content-Type': file.type || 'application/octet-stream',
                // RFC 5987, decoded by Request::headerDecode()
                'X-File-Name' : "UTF-8''" + encodeURIComponent(file.name || 'file')
            },
            body: file
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }

    /**
     * URL of a legacy controller action (index.php?r=...), e.g. a file download
     * @param {String} route e.g. "files/file/download"
     * @param {Object} params
     * @returns {String}
     */
    legacyUrl(route, params={}) {
        const query = new URLSearchParams({r: route, security_token: Client.securityToken(), ...params});
        return this.baseUrl + 'index.php?' + query
    }

    /**
     * The legacy security token of the newest GO window: a shared worker outlives the
     * page that started it, a later login gets a new PHP session and token
     * @returns {String}
     */
    static securityToken() {
        const tokens = Object.values(Neo.windowConfigs || {}).map(c => c?.goSecurityToken).filter(Boolean);
        return tokens.pop() || Neo.config.goSecurityToken || ''
    }

    /**
     * Calls a legacy controller action (GO.request in the ExtJS client)
     * @param {String} route e.g. "files/folder/list"
     * @param {Object} params form parameters
     * @returns {Promise<Object>} the JSON response; success: false becomes an exception
     */
    async legacy(route, params={}) {
        const response = await fetch(this.legacyUrl(route), {
            method     : 'POST',
            credentials: 'same-origin',
            // the session needs the CSRF token like JMAP (else Access denied); as an AJAX
            // request GO answers errors with JSON instead of its HTML exception page
            headers    : {...this.#headers(), 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest'},
            body       : new URLSearchParams(params)
        });

        if (response.status === 401) {
            this.fire('unauthorized');
            throw new Error('Not authenticated')
        }

        let data;

        try {
            data = Client.parseLegacyJson(await response.text())
        } catch (e) {
            throw new Error(`${route} failed: ${response.status} ${response.statusText}`)
        }

        if (!response.ok || data.success === false) {
            throw new Error(data.feedback || data.message || `${route} failed`)
        }

        return data
    }

    /**
     * Legacy controllers may put JavaScript functions into their JSON ("startjs:...:endjs",
     * e.g. a file's open handler) which ExtJS evaluates. They become null here.
     * @param {String} text
     * @returns {Object}
     */
    static parseLegacyJson(text) {
        try {
            return JSON.parse(text)
        } catch (e) {
            // fall through: remove function literals outside strings
        }

        let out = '', i = 0, inString = false;

        while (i < text.length) {
            const c = text[i];

            if (inString) {
                out += c;
                c === '\\' ? (out += text[++i]) : c === '"' && (inString = false);
                i++;
                continue
            }

            if (c === '"') {
                inString = true
            } else if (text.startsWith('function', i)) {
                // skip to the matching closing brace of the function body
                let depth = 0, j = text.indexOf('{', i), str = false;

                for (; j < text.length; j++) {
                    const d = text[j];

                    if (str) {
                        d === '\\' ? j++ : (d === str && (str = false))
                    } else if (d === '"' || d === "'") {
                        str = d
                    } else if (d === '{') {
                        depth++
                    } else if (d === '}' && --depth === 0) {
                        break
                    }
                }

                out += 'null';
                i = j + 1;
                continue
            }

            out += c;
            i++
        }

        return JSON.parse(out)
    }

    static describeSetError(error) {
        if (error.validationErrors) {
            return Object.entries(error.validationErrors)
                .map(([field, e]) => `${field}: ${e.description || e.code}`)
                .join('\n')
        }

        return error.description || error.type || t('Save failed')
    }

    /**
     * Server-Sent Events for the given entity types. GO sends "state" events with
     * a map of entity name → state, plus "ping". EventSource can't be used in all
     * worker setups consistently, so the stream is read with fetch.
     * @param {String[]} types entity names, e.g. ["Note", "NoteBook"]
     */
    watch(types) {
        const before = this.#sseTypes.size;
        types.forEach(t => this.#sseTypes.add(t));

        if (this.#sseTypes.size !== before) {
            this.#startPush()
        }
    }

    stopPush() {
        this.#sseAbort?.abort();
        this.#sseAbort = null
    }

    async #startPush() {
        this.stopPush();

        if (!this.session?.eventSourceUrl) {
            return
        }

        const abort = this.#sseAbort = new AbortController(),
              url   = this.apiUrl + 'sse.php?types=' + [...this.#sseTypes].join(',');

        let retry = 0;

        while (!abort.signal.aborted) {
            try {
                const response = await fetch(url, {
                    credentials: 'same-origin',
                    headers    : {Accept: 'text/event-stream'},
                    signal     : abort.signal
                });

                if (response.status === 401) {
                    this.fire('unauthorized');
                    return
                }

                if (!response.ok || !response.body) {
                    throw new Error('SSE ' + response.status)
                }

                if (retry > 0) {
                    // events may have been missed while disconnected
                    this.fire('stateChange', {reconnect: true, changed: [...this.#sseTypes]})
                }

                retry = 0;
                await this.#readEvents(response.body, abort.signal)
            } catch (e) {
                if (abort.signal.aborted) {
                    return
                }
                console.warn('GO push connection lost, reconnecting', e)
            }

            retry++;
            await new Promise(r => setTimeout(r, Math.min(30000, 1000 * 2 ** Math.min(retry, 5))))
        }
    }

    async #readEvents(body, signal) {
        const reader  = body.pipeThrough(new TextDecoderStream()).getReader();
        let   buffer  = '';

        while (!signal.aborted) {
            const {value, done} = await reader.read();

            if (done) {
                return
            }

            buffer += value;

            let end;

            while ((end = buffer.indexOf('\n\n')) > -1) {
                const block = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
                this.#onEvent(block)
            }
        }
    }

    #onEvent(block) {
        let event = 'message', data = '';

        block.split('\n').forEach(line => {
            if (line.startsWith('event:')) {
                event = line.slice(6).trim()
            } else if (line.startsWith('data:')) {
                data += line.slice(5).trim()
            }
        });

        if (event !== 'state' || !data) {
            return
        }

        const states  = JSON.parse(data),
              changed = [];

        // only push events move known states (see #baseState()); a type never fetched yet
        // has no store to reload
        Object.entries(states).forEach(([entity, state]) => {
            if (!(entity in this.#states)) {
                this.#states[entity] = state
            } else if (this.#states[entity] !== state) {
                this.#states[entity] = state;
                changed.push(entity)
            }
        });

        changed.length && this.fire('stateChange', {changed, states})
    }

    /**
     * The state of the first fetch of a type is the baseline the first push is compared
     * with. Later fetches must not move it: a dialog that saves and reads back its entity
     * would take the new state, and the push of its own change would no longer reload the
     * lists showing it.
     * @param {String} entity
     * @param {String} state
     */
    #baseState(entity, state) {
        state !== undefined && !(entity in this.#states) && (this.#states[entity] = state)
    }

    #headers() {
        const headers = {'Content-Type': 'application/json'};

        if (this.#csrfToken) {
            headers['X-CSRF-Token'] = this.#csrfToken
        }

        return headers
    }

    async #setSession(session) {
        const previousUserId = this.session?.userId;

        this.#csrfToken = session.CSRFToken;
        delete session.CSRFToken;
        this.session = session;
        this.#states = {};

        const [user] = await this.get('User', [session.userId], USER_PROPERTIES);
        this.setUser(user);

        // another tab of this browser logged in as someone else (shared worker)
        if (previousUserId && previousUserId !== session.userId) {
            this.fire('userChanged', session)
        }

        // push stops on logout; restart it for the watched types
        if (this.#sseTypes.size && !this.#sseAbort) {
            this.#startPush()
        }

        this.fire('login', session)
    }

    async #flush() {
        const calls = this.#queue;
        this.#queue = [];
        this.#flushScheduled = false;

        let responses;

        try {
            const response = await fetch(this.apiUrl + 'jmap.php', {
                method     : 'POST',
                credentials: 'same-origin',
                headers    : this.#headers(),
                body       : JSON.stringify(calls.map(c => [c.method, c.args, c.id]))
            });

            if (response.status === 401) {
                this.fire('unauthorized');
                throw new Error('Not authenticated')
            }

            if (!response.ok) {
                throw new Error(`JMAP request failed: ${response.status} ${response.statusText}`)
            }

            responses = await response.json()
        } catch (e) {
            calls.forEach(c => c.reject(e));
            return
        }

        const byId = {};
        responses.forEach(([method, args, id]) => byId[id] = {method, args});

        calls.forEach(c => {
            const r = byId[c.id];

            if (!r) {
                c.reject(new Error('No response for ' + c.method))
            } else if (r.method === 'error') {
                c.reject(new Error(r.args.message || r.args.type || 'JMAP error'))
            } else {
                c.resolve(r.args)
            }
        })
    }
}

export default new Client();
