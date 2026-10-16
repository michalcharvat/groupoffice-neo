import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';
import client    from '../jmap/Client.mjs';
import {t}       from '../Translate.mjs';

/** core groups */
const ADMINS = '1', EVERYONE = '2';

/**
 * The modules a group may use and the group's extra rights per module
 * (go.groups.GroupModuleGrid, admins only): a check per module, the module's rights
 * (mayManage, …) as checks once the group has the module. Saved after the group
 * (save(groupId)) as Module.permissions, {groupId: {groupId, rights: {name: true}}}.
 */
class GroupModulesPanel extends Component {
    static config = {
        className: 'GO.groups.GroupModulesPanel',
        baseCls  : ['go-groupmodules'],
        /**
         * Group id, null for a new group
         * @member {String|null} groupId_=null
         */
        groupId_: null,
        /**
         * @member {Boolean} readOnly_=false
         */
        readOnly_: false,
        _vdom:
        {cn: [
            {cls: ['go-groupmodules-tbar'], cn: [
                {flex: 1},
                {tag: 'input', type: 'search', cls: ['go-groupmodules-search'], autocomplete: 'off'}
            ]},
            {cls: ['go-groupmodules-list'], role: 'list', cn: []}
        ]}
    }

    /** Modules: {id, name, package, label, rights, permissions} */
    modules = []
    /** module id → {enabled, rights: {name: true}} of this group, changed ones only */
    changes = {}
    searchText = ''
    loaded = false

    get searchNode() {return this.vdom.cn[0].cn[1]}
    get listNode()   {return this.vdom.cn[1]}

    construct(config) {
        super.construct(config);

        let me = this;

        me.searchNode.placeholder = t('Search');

        me.addDomListeners([
            {click: me.onClick,       delegate: '.go-groupmodules-toggle', scope: me},
            {input: me.onSearchInput, delegate: '.go-groupmodules-search', scope: me}
        ])
    }

    afterSetReadOnly(value, oldValue) {
        this.toggleCls('go-readonly', value);
        oldValue !== undefined && this.renderList()
    }

    afterSetGroupId(value, oldValue) {
        oldValue !== undefined && this.loaded && this.renderList()
    }

    /**
     * Loads all installed modules with their permissions
     * @returns {Promise<void>}
     */
    async load() {
        let me = this;

        try {
            const {list} = await client.queryGet('Module', {
                sort      : [{property: 'name', isAscending: true}],
                properties: ['id', 'name', 'package', 'rights', 'permissions', 'enabled']
            });

            if (me.isDestroyed) {
                return
            }

            me.modules = list.filter(m => m.enabled !== false).map(m => {
                const pkg   = m.package || 'legacy',
                      label = t('name', pkg, m.name);

                // t() falls back to core's "name"
                return {...m, label: label === t('name') ? m.name : label}
            }).sort((a, b) => a.label.localeCompare(b.label));

            me.loaded = true;
            me.renderList()
        } catch (e) {
            me.isDestroyed || me.renderList(e.message || String(e))
        }
    }

    /**
     * @param {Object} module
     * @returns {{enabled: Boolean, rights: Object}} the group's state of a module, changes included
     * @protected
     */
    stateOf(module) {
        const change = this.changes[module.id];

        if (change) {
            return change
        }

        const permission = this.groupId ? module.permissions?.[this.groupId] : null;
        return {enabled: !!permission, rights: {...permission?.rights || {}}}
    }

    /**
     * @returns {Boolean} something was changed
     */
    isModified() {
        return Object.keys(this.changes).length > 0
    }

    /**
     * @param {String} [error]
     * @protected
     */
    renderList(error) {
        let me   = this,
            text = me.searchText.toLowerCase(),
            rows;

        if (error) {
            rows = [{cls: ['go-empty'], text: error}]
        } else {
            rows = me.modules
                .filter(m => !text || m.label.toLowerCase().includes(text) || m.name.toLowerCase().includes(text))
                .map(m => me.createRow(m))
        }

        me.listNode.cn = rows.length ? rows : [{cls: ['go-empty'], text: t('No items to display')}];
        me.update()
    }

    /**
     * @param {Object} module
     * @returns {Object} vdom
     * @protected
     */
    createRow(module) {
        let me     = this,
            state  = me.stateOf(module),
            pkg    = module.package || 'legacy',
            // Admins have every module; Everyone always has the core modules (GroupModuleGrid)
            locked = me.readOnly || String(me.groupId) === ADMINS || (String(me.groupId) === EVERYONE && module.package === 'core'),
            icon   = `${client.apiUrl}download.php?blob=${encodeURIComponent(`core/moduleIcon/${pkg}/${module.name}`)}`,
            rights = (module.rights || []).filter(r => r !== 'mayRead');

        return {
            cls        : ['go-groupmodules-row', ...state.enabled ? ['go-groupmodules-enabled'] : []],
            role       : 'listitem',
            'data-module-id': String(module.id),
            cn: [
                {cls: ['go-groupmodules-icon'], style: {backgroundImage: `url("${icon}")`}},
                {cls: ['go-groupmodules-text'], cn: [
                    {cls: ['go-groupmodules-name'], text: module.label},
                    {tag: 'small', text: pkg}
                ]},
                {cls: ['go-groupmodules-rights'], removeDom: !state.enabled || !rights.length, cn: rights.map(right => ({
                    tag : 'label',
                    cls : ['go-groupmodules-right', 'go-groupmodules-toggle'],
                    'data-module-id': String(module.id),
                    'data-right'    : right,
                    cn  : [
                        {tag: 'span', cls: ['go-check', ...state.rights[right] ? ['go-checked'] : [], ...locked ? ['go-disabled'] : []], role: 'checkbox', 'aria-checked': String(!!state.rights[right])},
                        {tag: 'span', text: t(right, pkg, module.name)}
                    ]
                }))},
                {
                    tag            : 'span',
                    cls            : ['go-check', 'go-groupmodules-toggle', ...state.enabled ? ['go-checked'] : [], ...locked ? ['go-disabled'] : []],
                    role           : 'checkbox',
                    'aria-checked' : String(state.enabled),
                    'aria-label'   : module.label,
                    'data-module-id': String(module.id)
                }
            ]
        }
    }

    onClick(data) {
        let me     = this,
            node   = data.path?.find(n => n.data?.moduleId),
            module = node && me.modules.find(m => String(m.id) === node.data.moduleId);

        if (!module || me.readOnly || String(me.groupId) === ADMINS || (String(me.groupId) === EVERYONE && module.package === 'core')) {
            return
        }

        const state = me.stateOf(module),
              next  = {enabled: state.enabled, rights: {...state.rights}},
              right = node.data.right;

        right ? (next.rights[right] = !next.rights[right]) : (next.enabled = !next.enabled);
        next.enabled || (next.rights = {});

        me.changes[module.id] = next;
        me.renderList()
    }

    onSearchInput(data) {
        this.searchText = String(data.value || '').trim();
        this.renderList()
    }

    /**
     * Saves the changed modules' permissions for the group (after the group itself, a new
     * group only has its id then). Other groups' permissions are taken from a fresh load.
     * @param {String} groupId
     * @returns {Promise<void>}
     */
    async save(groupId) {
        let me      = this,
            changes = {...me.changes},
            ids     = Object.keys(changes);

        if (!ids.length) {
            return
        }

        const modules = await client.get('Module', ids, ['id', 'name', 'package', 'permissions']),
              update  = {};

        modules.forEach(module => {
            const change = changes[module.id];

            update[module.id] = {permissions: {
                ...module.permissions || {},
                // null removes the group
                [groupId]: change.enabled ? {groupId, rights: Object.fromEntries(Object.entries(change.rights).filter(([, on]) => on))} : null
            }};
        });

        const response = await client.call('Module/set', {update});

        if (response.notUpdated && Object.keys(response.notUpdated).length) {
            throw new Error(t('Failed to save') + ': ' + Object.values(response.notUpdated).map(e => e.description || e.type).join(', '))
        }

        // keep what was changed meanwhile
        ids.forEach(id => me.changes[id] === changes[id] && delete me.changes[id])
    }
}

export default Neo.setupClass(GroupModulesPanel);
