import Container     from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import CheckBox      from '../../../node_modules/neo.mjs/src/form/field/CheckBox.mjs';
import FormContainer from '../../../node_modules/neo.mjs/src/form/Container.mjs';
import EmailField    from '../../../node_modules/neo.mjs/src/form/field/Email.mjs';
import PasswordField from '../../../node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../src/button/Button.mjs';
import client        from '../../../src/jmap/Client.mjs';
import ModuleRegistry from '../../../src/ModuleRegistry.mjs';
import {fmt, t} from '../../../src/Translate.mjs';

/**
 * GO login screen (go.login.LoginPanel + LoginDialog + UsernamePanel): the logo top left,
 * the language menu top right and "Powered by" at the bottom on the header colour, in the
 * middle a window "Login required" with username / password, "remember my login",
 * "Forgot login credentials?" and Next. The forgot card replaces the login card in the
 * window (GO opens go.login.ForgotDialog over it).
 *
 * A user with secondary authenticators (2FA) gets a loginToken instead of a session: each
 * pending authenticator shows the card its module registered (ModuleRegistry `loginPanels`,
 * GO.login.AuthenticatorPanel) until api/auth.php answers with the session.
 */
class LoginView extends Container {
    static config = {
        className: 'GO.view.LoginView',
        cls      : ['go-login'],
        layout   : {ntype: 'vbox', align: 'center', pack: 'center'},
        items    : [{
            ntype: 'component',
            cls  : ['go-login-logo'],
            role : 'img',
            title: Neo.config.goTitle || 'Group Office'
        }, {
            // menu: see construct()
            module   : Button,
            cls      : ['go-login-language'],
            icon     : 'language',
            reference: 'languageButton',
            tooltip  : t('Language')
        }, {
            ntype    : 'container',
            cls      : ['go-login-window'],
            reference: 'window',
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : [{
                ntype    : 'component',
                tag      : 'h3',
                cls      : ['go-login-title'],
                flex     : 'none',
                reference: 'title',
                text     : t('Login required')
            }, {
                ntype    : 'container',
                reference: 'cards',
                flex     : 'none',
                layout   : {ntype: 'card', activeIndex: 0, removeInactiveCards: false},
                items    : [{
                    module   : FormContainer,
                    reference: 'loginForm',
                    keys     : {Enter: 'up.onLogin'},
                    layout   : {ntype: 'vbox', align: 'stretch'},
                    items    : [{
                        ntype : 'container',
                        cls   : ['go-login-fields'],
                        flex  : 'none',
                        layout: {ntype: 'vbox', align: 'stretch'},
                        items : [{
                            module       : TextField,
                            name         : 'username',
                            labelText    : t('Username'),
                            labelPosition: 'inline',
                            autoComplete : 'username',
                            required     : true
                        }, {
                            module       : PasswordField,
                            name         : 'password',
                            labelText    : t('Password'),
                            labelPosition: 'inline',
                            autoComplete : 'current-password',
                            required     : true
                        }, {
                            // GO hides it when the session ends after inactivity anyway
                            module    : CheckBox,
                            cls       : ['go-login-remember'],
                            name      : 'rememberLogin',
                            hidden    : Neo.config.goLogoutWhenInactive > 0,
                            hideLabel : true,
                            valueLabel: t('Remember my login on this computer until I press logout')
                        }, {
                            ntype    : 'component',
                            cls      : ['go-login-error'],
                            reference: 'error',
                            hidden   : true
                        }]
                    }, {
                        module: Toolbar,
                        cls   : ['go-login-buttons'],
                        flex  : 'none',
                        items : [{
                            module : Button,
                            cls    : ['go-login-forgot'],
                            text   : t('Forgot login credentials?'),
                            handler: 'up.onForgot'
                        }, '->', {
                            module   : Button,
                            reference: 'loginButton',
                            ui       : 'primary',
                            text     : t('Next'),
                            handler  : 'up.onLogin'
                        }]
                    }, {
                        // "Sign in with ..." of modules (Neo.php goLoginButtons, e.g. OpenID Connect)
                        ntype    : 'container',
                        cls      : ['go-login-signin'],
                        flex     : 'none',
                        reference: 'signInButtons',
                        hidden   : !Neo.config.goLoginButtons?.length,
                        layout   : {ntype: 'vbox', align: 'stretch'}
                    }]
                }, {
                    // go.login.ForgotDialog
                    module   : FormContainer,
                    reference: 'forgotForm',
                    keys     : {Enter: 'up.onSendForgot'},
                    layout   : {ntype: 'vbox', align: 'stretch'},
                    items    : [{
                        ntype : 'container',
                        cls   : ['go-login-fields'],
                        flex  : 'none',
                        layout: {ntype: 'vbox', align: 'stretch'},
                        items : [{
                            ntype: 'component',
                            text : t('Enter your email address')
                        }, {
                            module       : EmailField,
                            name         : 'email',
                            labelText    : t('E-mail'),
                            labelPosition: 'inline',
                            autoComplete : 'email',
                            required     : true
                        }, {
                            ntype    : 'component',
                            cls      : ['go-login-message'],
                            reference: 'forgotMessage',
                            hidden   : true
                        }]
                    }, {
                        module: Toolbar,
                        cls   : ['go-login-buttons'],
                        flex  : 'none',
                        items : [{
                            module : Button,
                            text   : t('Back'),
                            handler: 'up.showLoginCard'
                        }, '->', {
                            module   : Button,
                            reference: 'forgotButton',
                            ui       : 'primary',
                            text     : t('Send'),
                            handler  : 'up.onSendForgot'
                        }]
                    }]
                }, {
                    // go.login.RecoveryDialog: "#recover/<hash>-<redirect>" of the recovery mail
                    module   : FormContainer,
                    reference: 'recoverForm',
                    keys     : {Enter: 'up.onSaveRecover'},
                    layout   : {ntype: 'vbox', align: 'stretch'},
                    items    : [{
                        ntype    : 'container',
                        cls      : ['go-login-fields'],
                        reference: 'recoverFields',
                        flex     : 'none',
                        layout   : {ntype: 'vbox', align: 'stretch'},
                        items    : [{
                            ntype    : 'component',
                            reference: 'recoverUser',
                            text     : t('Loading...')
                        }, {
                            module       : PasswordField,
                            name         : 'newPassword',
                            labelText    : t('New password'),
                            labelPosition: 'inline',
                            autoComplete : 'new-password',
                            required     : true
                        }, {
                            module       : PasswordField,
                            name         : 'confirmPassword',
                            labelText    : t('Confirm password'),
                            labelPosition: 'inline',
                            autoComplete : 'new-password',
                            required     : true
                        }]
                    }, {
                        ntype    : 'component',
                        cls      : ['go-login-message'],
                        reference: 'recoverMessage',
                        hidden   : true
                    }, {
                        module: Toolbar,
                        cls   : ['go-login-buttons'],
                        flex  : 'none',
                        items : [{
                            module : Button,
                            text   : t('Back'),
                            handler: 'up.onRecoverDone'
                        }, '->', {
                            module   : Button,
                            reference: 'recoverButton',
                            ui       : 'primary',
                            text     : t('Save'),
                            handler  : 'up.onSaveRecover'
                        }]
                    }]
                }]
            }]
        }, {
            ntype: 'component',
            cls  : ['go-login-powered'],
            html : 'Powered by GroupOffice<br><a target="_blank" rel="noopener" href="https://www.group-office.com">https://www.group-office.com</a>'
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            item = (text, lang) => ({text, handler: () => me.setLanguage(lang)});

        me.getReference('signInButtons').add((Neo.config.goLoginButtons || []).map(({text, url}) => ({
            module : Button,
            text,
            handler: () => me.signInWith(url)
        })));

        me.getReference('languageButton').menu = {
            align: {edgeAlign: 't100-b100'},
            items: [item(t('My selected language'), ''), {separator: true},
                ...(Neo.config.goLanguages || []).map(([lang, text]) => item(text, lang))]
        }
    }

    async onLogin() {
        let me     = this,
            form   = me.getReference('loginForm'),
            button = me.getReference('loginButton');

        if (button.disabled || !await form.validate()) {
            return
        }

        const {username, password, rememberLogin} = await form.getValues();

        button.disabled = true;
        me.showError(null);

        me.rememberLogin = !!rememberLogin;

        try {
            const result = await client.login(username, password, !!rememberLogin);

            if (result.loginToken) {
                await me.showAuthenticator(result)
            } else if (!result.success) {
                me.showError(result.message)
            }
        } catch (e) {
            me.showError(e.message)
        } finally {
            button.disabled = false
        }
    }

    /**
     * Login token of the running login with pending authenticators
     * @member {String|null} loginToken=null
     */
    loginToken = null

    /**
     * @member {Boolean} rememberLogin=false
     */
    rememberLogin = false

    /**
     * Authenticator id → its card (GO.login.AuthenticatorPanel)
     * @member {Object} authenticatorCards={}
     */
    authenticatorCards = {}

    /**
     * The card of the first pending authenticator (go.AuthenticationManager)
     * @param {Object} result client.login()/authenticate(): loginToken, authenticators, errors
     */
    async showAuthenticator({loginToken, authenticators, errors}) {
        let me   = this,
            id   = authenticators[0],
            card = me.authenticatorCards[id];

        me.loginToken = loginToken;

        if (!card) {
            const load = ModuleRegistry.getLoginPanel(id);

            if (!load) {
                me.showLoginCard();
                me.showError(fmt(t('The login method "{method}" is not supported by this client.'), {method: id}));
                return
            }

            card = me.authenticatorCards[id] = me.getReference('cards').add({
                module         : (await load()).default,
                authenticatorId: id,
                listeners      : {
                    next  : ({panel}) => me.onAuthenticatorNext(panel),
                    cancel: () => me.reset()
                }
            });

            await me.timeout(0) // rendered before its fields are reset
        }

        await card.clear();
        errors?.[id] && await card.setErrors(errors[id]);

        me.getReference('title').text = card.title || t('Login required');
        me.getReference('cards').layout.activeIndex = me.getReference('cards').items.indexOf(card)
    }

    /**
     * Sends a card's data (api/auth.php with the loginToken)
     * @param {GO.login.AuthenticatorPanel} panel
     */
    async onAuthenticatorNext(panel) {
        let me   = this,
            data = await panel.getAuthenticatorData();

        if (!data) {
            return
        }

        panel.setBusy(true);
        panel.showError(null);

        try {
            const result = await client.authenticate(me.loginToken, {[panel.authenticatorId]: data}, me.rememberLogin);

            if (result.success) {
                me.loginToken = null
            } else if (result.errors?.[panel.authenticatorId]) {
                await panel.setErrors(result.errors[panel.authenticatorId])
            } else if (result.loginToken && result.authenticators?.length) {
                await me.showAuthenticator(result)
            } else {
                panel.showError(result.message || t('Login failed'))
            }
        } catch (e) {
            panel.showError(e.message)
        } finally {
            panel.isDestroyed || panel.setBusy(false)
        }
    }

    /**
     * A module's "Sign in with ..." button: its page (e.g. OpenID Connect) logs in and comes back
     * @param {String} url relative to GO
     */
    signInWith(url) {
        Neo.Main.redirectTo({url: client.baseUrl + url, windowId: this.windowId})
    }

    /**
     * go.login.LoginPanel: reloads GO in the picked language ('' = the user's own)
     * @param {String} lang
     */
    setLanguage(lang) {
        Neo.Main.redirectTo({
            url     : client.baseUrl + 'index.php?SET_LANGUAGE=' + encodeURIComponent(lang),
            windowId: this.windowId
        })
    }

    /**
     * go.login.UsernamePanel.showForgot(): the configured URL or the e-mail form
     */
    onForgot() {
        let me  = this,
            url = Neo.config.goLostPasswordUrl;

        if (url) {
            Neo.Main.windowOpen({url, windowName: '_blank', windowId: me.windowId});
            return
        }

        me.getReference('forgotForm').reset({email: ''});
        me.showForgotMessage(null);
        me.getReference('title').text = t('Forgot login credentials?');
        me.getReference('cards').layout.activeIndex = 1
    }

    showLoginCard() {
        let me = this;

        me.getReference('title').text = t('Login required');
        me.getReference('cards').layout.activeIndex = 0
    }

    /**
     * go.login.ForgotDialog.submit(): api/auth.php {action: 'forgotten'}
     */
    async onSendForgot() {
        let me     = this,
            form   = me.getReference('forgotForm'),
            button = me.getReference('forgotButton');

        if (button.disabled || !await form.validate()) {
            return
        }

        const {email} = await form.getValues();

        button.disabled = true;

        try {
            const response = await fetch(client.apiUrl + 'auth.php', {
                method     : 'POST',
                credentials: 'same-origin',
                headers    : {'Content-Type': 'application/json'},
                body       : JSON.stringify({action: 'forgotten', email})
            });

            if (!response.ok) {
                throw new Error(response.statusText)
            }

            me.showForgotMessage(t('An e-mail with instructions has been sent to your e-mail address.'))
        } catch (e) {
            me.showForgotMessage(t('Sorry, an error occurred') + ': ' + e.message, true)
        } finally {
            button.disabled = false
        }
    }

    /**
     * api/auth.php POST
     * @param {Object} data
     * @returns {Promise<Object>}
     */
    async postAuth(data) {
        const response = await fetch(client.apiUrl + 'auth.php', {
            method     : 'POST',
            credentials: 'same-origin',
            headers    : {'Content-Type': 'application/json'},
            body       : JSON.stringify(data)
        });

        return response.json().catch(() => ({}))
    }

    /**
     * go.login.RecoveryDialog.show(): the "set a new password" card of a recovery link
     * (docs/neo-switch.md, D5). The Viewport calls it before it restores the session.
     * @param {String} hash 40 hex digits
     * @param {String} [redirect] still URL encoded, as User::sendRecoveryMail() wrote it
     */
    async showRecover(hash, redirect='') {
        let me = this;

        me.recoverHash     = hash;
        me.recoverRedirect = safeRedirect(redirect);

        me.getReference('recoverForm').reset({newPassword: '', confirmPassword: ''});
        me.getReference('recoverFields').hidden = false;
        me.getReference('recoverButton').hidden = false;
        me.getReference('recoverUser').text     = t('Loading...');
        me.showRecoverMessage(null);
        me.getReference('title').text = t('Reset password');
        me.getReference('cards').layout.activeIndex = me.getReference('cards').items.indexOf(me.getReference('recoverForm'));

        let result = {};

        try {
            result = await me.postAuth({action: 'recover', hash})
        } catch (e) {
            console.error(e)
        }

        if (result.username) {
            me.getReference('recoverUser').text = result.displayName
                ? `${result.displayName} (${result.username})`
                : result.username
        } else {
            me.getReference('recoverFields').hidden = true;
            me.getReference('recoverButton').hidden = true;
            me.showRecoverMessage(t('This password recovery link is invalid'), true)
        }
    }

    /**
     * go.login.RecoveryDialog.submit()
     */
    async onSaveRecover() {
        let me     = this,
            form   = me.getReference('recoverForm'),
            button = me.getReference('recoverButton');

        if (button.disabled || button.hidden || !await form.validate()) {
            return
        }

        const {newPassword, confirmPassword} = await form.getValues();

        if (newPassword !== confirmPassword) {
            me.showRecoverMessage(t("The passwords didn't match"), true);
            return
        }

        button.disabled = true;

        try {
            const result = await me.postAuth({action: 'recover', hash: me.recoverHash, newPassword});

            if (result.passwordChanged) {
                if (me.recoverRedirect) {
                    Neo.Main.redirectTo({url: me.recoverRedirect, windowId: me.windowId});
                    return
                }

                me.getReference('recoverFields').hidden = true;
                button.hidden = true;
                me.showRecoverMessage(t('Your password was changed successfully'));
                return
            }

            const errors = Object.values(result.validationErrors || {}).map(e => e.description).filter(Boolean);
            me.showRecoverMessage(errors.length ? errors.join(' ') : t('This password recovery link is invalid'), true)
        } catch (e) {
            me.showRecoverMessage(t('Sorry, an error occurred') + ': ' + e.message, true)
        } finally {
            button.disabled = false
        }
    }

    /**
     * Back from the recovery card: the Viewport shows the login or, with a session, the main view
     */
    onRecoverDone() {
        this.recoverHash = null;
        this.showLoginCard();
        this.up({className: 'GO.view.Viewport'})?.onRecoverDone()
    }

    showRecoverMessage(message, isError=false) {
        let el = this.getReference('recoverMessage');

        el.text   = message || '';
        el.hidden = !message;
        el.toggleCls('go-login-error', isError)
    }

    reset(message) {
        let me = this;

        me.loginToken = null;

        me.showLoginCard();
        me.getReference('loginForm').reset({username: '', password: ''});
        me.showError(message || null)
    }

    showError(message) {
        let error = this.getReference('error');

        error.text   = message || '';
        error.hidden = !message
    }

    showForgotMessage(message, isError=false) {
        let el = this.getReference('forgotMessage');

        el.text   = message || '';
        el.hidden = !message;
        el.toggleCls('go-login-error', isError)
    }
}

/**
 * The redirect of a recovery link, only when it stays inside this GroupOffice: decoded once
 * (PHP urlencode()), same origin and below the installation path, http(s) only.
 * The classic client checks the same in go/core/views/extjs3/Router.js.
 * @param {String} value
 * @returns {String|null} absolute URL
 */
export function safeRedirect(value) {
    if (!value) {
        return null
    }

    try {
        const base = new URL(client.baseUrl, globalThis.location.href),
              url  = new URL(decodeURIComponent(String(value).replace(/\+/g, ' ')), base);

        return /^https?:$/.test(url.protocol) && url.origin === base.origin && url.pathname.startsWith(base.pathname)
            ? url.href
            : null
    } catch (e) {
        return null
    }
}

export default Neo.setupClass(LoginView);
