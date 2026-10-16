import Field  from '../../node_modules/neo.mjs/src/form/field/Base.mjs';
import client from '../jmap/Client.mjs';
import {avatarColor, initials} from '../Format.mjs';
import {fmt, t} from '../Translate.mjs';
import {LEVEL_CREATE, LEVEL_DELETE, LEVEL_MANAGE, LEVEL_READ, LEVEL_WRITE} from '../Acl.mjs';

const PAGE_SIZE = 40;

/** entity name → default ACL, from Module/query (entities[name].defaultAcl) */
const defaultAcls = new Map();

/**
 * Permissions of an ACL owning entity (note book, address book, …), like GOUI
 * groupoffice-core permissions/SharePanel.ts: every group and user group with a
 * level select, the ones in the entity's ACL first (Group filter inAcl).
 *
 * A form field with name "acl": the value is GO's acl property, {groupId: level}.
 * Clearing a level sets the group to null, which removes it on Entity/set
 * (AclSetterTrait/Acl::addGroup()), so the value can go to the server as is.
 *
 * The whole panel is this field's own vdom (no child fields): a form.Container
 * collects every BaseField below it, a search field inside would end up in the
 * form values.
 *
 *     {module: SharePanel, flex: 1}
 *     sharePanel.setEntity('NoteBook', id)   // id null: new entity, default ACL
 */
class SharePanel extends Field {
    static config = {
        className: 'GO.permissions.SharePanel',
        ntype    : 'go-sharepanel',
        baseCls  : ['go-sharepanel'],
        name     : 'acl',
        /**
         * Level options, GOUI SharePanel.levels: [{value, name}]; value '' = no access
         * @member {Object[]|null} levels=null
         */
        levels: null,
        /**
         * Shown groups: 'both', 'users' or 'groups' (GOUI starts with groups)
         * @member {String} principalType_='groups'
         */
        principalType_: 'groups',
        /**
         * @member {Object|null} value=null
         */
        value: null,
        _vdom:
        {cn: [
            {cls: ['go-sharepanel-tbar'], cn: [
                {cls: ['go-sharepanel-segments'], role: 'group', cn: []},
                {flex: 1},
                {tag: 'input', type: 'search', cls: ['go-sharepanel-search'], autocomplete: 'off'}
            ]},
            {cls: ['go-sharepanel-list'], role: 'list', cn: []}
        ]}
    }

    /** Entity whose ACL is shown: {entity, id} */
    entity = null
    /** Loaded Group records */
    groups = []
    /** principal id → {name, avatarId} */
    principals = {}
    total = 0
    searchText = ''
    loadingGroups = false
    loadGeneration = 0
    #searchTimer = null

    get segmentsNode() {return this.vdom.cn[0].cn[0]}
    get searchNode()   {return this.vdom.cn[0].cn[2]}
    get listNode()     {return this.vdom.cn[1]}

    construct(config) {
        super.construct(config);

        let me = this;

        me.listNode.id   = me.id + '__list';
        me.searchNode.id = me.id + '__search';
        me.searchNode.placeholder = t('Search');
        me.renderSegments();

        me.addDomListeners([
            {change: me.onLevelChange,   delegate: '.go-sharepanel-level',  scope: me},
            {click : me.onSegmentClick,  delegate: '.go-sharepanel-segment', scope: me},
            {input : me.onSearchInput,   delegate: '.go-sharepanel-search', scope: me},
            {scroll: me.onListScroll,    delegate: '.go-sharepanel-list',   scope: me}
        ])
    }

    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        // without setEntity(): all groups, sorted by name
        value && !this.loadGeneration && this.load()
    }

    destroy(...args) {
        clearTimeout(this.#searchTimer);
        super.destroy(...args)
    }

    /**
     * @returns {Object[]} [{value, name}]
     */
    getLevels() {
        return this.levels || [
            {value: '',           name: ''},
            {value: LEVEL_READ,   name: t('Read')},
            {value: LEVEL_CREATE, name: t('Create')},
            {value: LEVEL_WRITE,  name: t('Write')},
            {value: LEVEL_DELETE, name: t('Delete')},
            {value: LEVEL_MANAGE, name: t('Manage')}
        ]
    }

    /**
     * Sets the entity whose ACL members are listed first and loads the groups.
     * Without id (new entity) the value becomes the entity's default ACL.
     * @param {String} entity e.g. "NoteBook"
     * @param {Number|String|null} [id]
     * @returns {Promise<void>}
     */
    async setEntity(entity, id=null) {
        let me = this;

        me.entity = {entity, id};

        if (!id) {
            const acl = await me.getDefaultAcl(entity);

            if (me.isDestroyed || me.entity?.entity !== entity || me.entity.id) {
                return
            }
            // clean: the server copies the default ACL anyway when acl is not sent
            me.reset(acl ? {...acl} : null)
        }

        return me.load()
    }

    /**
     * Forgets the cached default ACLs (after they were changed in System settings)
     */
    static clearDefaultAcls() {
        defaultAcls.clear()
    }

    /**
     * @param {String} entity
     * @returns {Promise<Object|null>}
     */
    async getDefaultAcl(entity) {
        if (!defaultAcls.has(entity)) {
            try {
                // the server needs package and name to compute entities ("Typed property Module::$package")
                const {list} = await client.queryGet('Module', {properties: ['id', 'package', 'name', 'entities']});

                list.forEach(module => Object.entries(module.entities || {}).forEach(([name, info]) => {
                    defaultAcls.set(name, info?.defaultAcl || null)
                }))
            } catch (e) {
                console.warn('SharePanel: no default ACL for', entity, e)
            }
        }

        return defaultAcls.get(entity) || null
    }

    /**
     * Group/query filter, GOUI GroupTable filters
     * @returns {Object}
     */
    getFilter() {
        let me     = this,
            filter = {
                hideUsers : me.principalType === 'groups',
                hideGroups: me.principalType === 'users'
            };

        me.searchText && (filter.text = me.searchText);
        me.entity     && (filter.inAcl = me.entity.id ? {entity: me.entity.entity, id: me.entity.id} : {entity: me.entity.entity, default: true});

        return filter
    }

    /**
     * Reloads the group list from the first page
     * @returns {Promise<void>}
     */
    async load() {
        let me = this;

        me.groups = [];
        me.total  = 0;

        return me.loadPage(++me.loadGeneration)
    }

    /**
     * @param {Number} generation
     * @returns {Promise<void>}
     */
    async loadPage(generation) {
        let me = this,
            list, total;

        me.loadingGroups = true;

        try {
            ({list, total} = await client.queryGet('Group', {
                filter    : me.getFilter(),
                sort      : [{property: 'name', isAscending: true}],
                position  : me.groups.length,
                limit     : PAGE_SIZE,
                properties: ['id', 'name', 'users', 'isUserGroupFor']
            }));

            if (me.isDestroyed || generation !== me.loadGeneration) {
                return
            }

            await me.loadPrincipals(list);
        } catch (e) {
            if (!me.isDestroyed && generation === me.loadGeneration) {
                me.loadingGroups = false;
                me.renderList(e.message || String(e))
            }
            return
        }

        if (me.isDestroyed || generation !== me.loadGeneration) {
            return
        }

        me.groups    = me.groups.concat(list.filter(g => !me.groups.some(o => o.id === g.id)));
        me.total     = total;
        me.loadingGroups = false;
        me.renderList()
    }

    /**
     * Names of the first three members and the user of a personal group
     * @param {Object[]} groups
     * @returns {Promise<void>}
     */
    async loadPrincipals(groups) {
        let me  = this,
            ids = new Set();

        groups.forEach(g => {
            (g.users || []).slice(0, 3).forEach(id => ids.add(String(id)));
            g.isUserGroupFor && ids.add(String(g.isUserGroupFor))
        });

        const missing = [...ids].filter(id => !me.principals[id]);

        if (missing.length) {
            (await client.get('Principal', missing, ['id', 'name', 'avatarId'])).forEach(p => {
                me.principals[String(p.id)] = p
            })
        }
    }

    /**
     * @param {String} [error]
     */
    renderList(error) {
        let me     = this,
            value  = me.value || {},
            levels = me.getLevels(),
            rows;

        if (error) {
            rows = [{cls: ['go-empty'], text: error}]
        } else if (!me.groups.length) {
            rows = me.loadingGroups ? [] : [{cls: ['go-empty'], text: t('No items to display')}]
        } else {
            rows = me.groups.map(group => me.createRow(group, value[group.id], levels))
        }

        me.listNode.cn = rows;
        me.update()
    }

    /**
     * @param {Object} group
     * @param {Number|null|undefined} level
     * @param {Object[]} levels
     * @returns {Object} vdom
     */
    createRow(group, level, levels) {
        let me      = this,
            user    = group.isUserGroupFor ? me.principals[String(group.isUserGroupFor)] : null,
            users   = group.users || [],
            members = users.slice(0, 3).map(id => me.principals[String(id)]?.name).filter(Boolean).join(', '),
            more    = users.length - 3,
            name    = String(group.name ?? ''),
            current = level ? String(level) : '';

        more > 0 && (members += fmt(t(' and {count} more'), {count: more}));

        return {
            cls          : ['go-sharepanel-row', ...(current ? ['go-sharepanel-shared'] : [])],
            role         : 'listitem',
            'data-group-id': String(group.id),
            cn: [
                me.createAvatar(name, user?.avatarId), {
                    cls: ['go-sharepanel-text'],
                    cn : [
                        {cls: ['go-sharepanel-name'], text: name},
                        {tag: 'small', text: members}
                    ]
                }, {
                    // the wrapper draws the GO chevron instead of the native one
                    cls: ['go-sharepanel-level-wrap'],
                    cn : [{
                        tag            : 'select',
                        cls            : ['go-sharepanel-level'],
                        'aria-label'   : fmt('{0}: {1}', [t('Level'), name]),
                        'data-group-id': String(group.id),
                        value          : current,
                        cn             : levels.map(o => ({
                            tag     : 'option',
                            value   : String(o.value),
                            selected: String(o.value) === current ? true : null,
                            text    : o.name
                        }))
                    }]
                }
            ]
        }
    }

    /**
     * @param {String} name
     * @param {String} [avatarId] blob id
     * @returns {Object} vdom
     */
    createAvatar(name, avatarId) {
        return avatarId ? {
            tag: 'img',
            cls: ['go-avatar', 'go-avatar-small'],
            alt: '',
            src: client.baseUrl + 'api/thumb.php?blob=' + encodeURIComponent(avatarId) + '&w=64&h=64&zc=1'
        } : {
            tag  : 'span',
            cls  : ['go-avatar', 'go-avatar-small'],
            style: {backgroundColor: avatarColor(name)},
            text : initials(name)
        }
    }

    renderSegments() {
        let me = this;

        me.segmentsNode.cn = [['both', t('All')], ['users', t('Users')], ['groups', t('Groups')]].map(([value, text]) => ({
            tag           : 'button',
            type          : 'button',
            cls           : ['go-sharepanel-segment', ...(me.principalType === value ? ['go-active'] : [])],
            'aria-pressed': String(me.principalType === value),
            'data-show'   : value,
            text
        }));

        me.update()
    }

    afterSetPrincipalType(value, oldValue) {
        let me = this;

        if (oldValue !== undefined) {
            me.renderSegments();
            me.entity !== null && me.load()
        }
    }

    /**
     * Copies the object: level changes must not alter the record it came from
     * @param {Object|null} value
     * @returns {Object|null}
     */
    beforeSetValue(value) {
        return value && typeof value === 'object' ? {...value} : null
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        oldValue !== undefined && this.renderList()
    }

    /**
     * {groupId: level}; removed groups are null
     * @returns {Object|null}
     */
    getSubmitValue() {
        return this.value
    }

    /**
     * Levels differ from the loaded ACL (null entries count as absent)
     * @returns {Boolean}
     */
    get isDirty() {
        return !Neo.isEqual(normalize(this.value), normalize(this.originalConfig.value))
    }

    onLevelChange(data) {
        let me      = this,
            groupId = data.path?.find(node => node.data?.groupId)?.data.groupId,
            level   = parseInt(data.value, 10) || null,
            oldValue = me.value;

        if (!groupId) {
            return
        }

        me.value = {...(me.value || {}), [groupId]: level};
        me.fireUserChangeEvent(me.value, oldValue)
    }

    onSegmentClick(data) {
        const show = data.path?.find(node => node.data?.show)?.data.show;
        show && (this.principalType = show)
    }

    onSearchInput(data) {
        let me = this;

        clearTimeout(me.#searchTimer);

        me.#searchTimer = setTimeout(() => {
            const text = String(data.value || '').trim();

            if (!me.isDestroyed && text !== me.searchText) {
                me.searchText = text;
                me.load()
            }
        }, 300)
    }

    async onListScroll(data) {
        let me = this;

        if (me.loadingGroups || me.groups.length >= me.total || data.target?.id !== me.listNode.id) {
            return
        }

        const {clientHeight, scrollHeight} = await Neo.main.DomAccess.getScrollingDimensions({id: me.listNode.id, windowId: me.windowId});

        if (!me.loadingGroups && data.scrollTop + clientHeight >= scrollHeight - 60) {
            me.loadPage(me.loadGeneration)
        }
    }
}

/**
 * @param {Object|null} acl
 * @returns {Object} entries with a level, ids as strings
 */
function normalize(acl) {
    const out = {};

    Object.entries(acl || {}).forEach(([id, level]) => {
        level && (out[String(id)] = Number(level))
    });

    return out
}

export default Neo.setupClass(SharePanel);
