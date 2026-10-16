import Field  from '../../../node_modules/neo.mjs/src/form/field/Base.mjs';
import client from '../../jmap/Client.mjs';
import {avatarColor, initials} from '../../Format.mjs';
import {t}    from '../../Translate.mjs';

const PAGE_SIZE = 40;

/**
 * Checkbox list over a JMAP entity as one form field: the value is the array of checked
 * ids (ExtJS go.users.UserGroupGrid / go.groups.GroupUserGrid, a grid with a check column).
 * A search box filters, the list loads more on scroll. Like GO.permissions.SharePanel the
 * whole list is this field's own vdom: fields inside would end up in the form values.
 *
 *     {module: EntityCheckList, name: 'groups', entity: 'Group', jmapFilter: {hideUsers: true}}
 *
 * Subclasses describe a row in rowData(record) and may load extra data per page in
 * prepare(list) (GO.groups.GroupCheckList: member names).
 */
class EntityCheckList extends Field {
    static config = {
        className: 'GO.form.field.EntityCheckList',
        ntype    : 'go-entitychecklist',
        baseCls  : ['go-entitychecklist'],
        /**
         * JMAP entity
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * Entity/get properties
         * @member {String[]} properties=['id', 'name']
         */
        properties: ['id', 'name'],
        /**
         * Entity/query filter, without the search text. Changing it reloads.
         * @member {Object} jmapFilter_={}
         */
        jmapFilter_: {},
        /**
         * @member {Object[]} jmapSort=[{property: 'name', isAscending: true}]
         */
        jmapSort: [{property: 'name', isAscending: true}],
        /**
         * Title left of the search box
         * @member {String|null} title=null
         */
        title: null,
        /**
         * Checks can't be changed (e.g. a user's groups for non-admins)
         * @member {Boolean} readOnly_=false
         */
        readOnly_: false,
        /**
         * @member {String[]|null} value=null
         */
        value: null,
        _vdom:
        {cn: [
            {cls: ['go-entitychecklist-tbar'], cn: [
                {tag: 'span', cls: ['go-entitychecklist-title']},
                {flex: 1},
                {tag: 'input', type: 'search', cls: ['go-entitychecklist-search'], autocomplete: 'off'}
            ]},
            {cls: ['go-entitychecklist-list'], role: 'list', cn: []}
        ]}
    }

    /** Loaded records */
    records = []
    total = 0
    searchText = ''
    loading = false
    loadGeneration = 0
    #searchTimer = null

    get titleNode()  {return this.vdom.cn[0].cn[0]}
    get searchNode() {return this.vdom.cn[0].cn[2]}
    get listNode()   {return this.vdom.cn[1]}

    construct(config) {
        super.construct(config);

        let me = this;

        me.listNode.id   = me.id + '__list';
        me.searchNode.id = me.id + '__search';
        me.searchNode.placeholder = t('Search');
        me.titleNode.text   = me.title || '';
        me.titleNode.removeDom = !me.title;

        me.addDomListeners([
            {click : me.onRowClick,    delegate: '.go-entitychecklist-row',    scope: me},
            {input : me.onSearchInput, delegate: '.go-entitychecklist-search', scope: me},
            {scroll: me.onListScroll,  delegate: '.go-entitychecklist-list',   scope: me}
        ])
    }

    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        value && !this.loadGeneration && this.load()
    }

    afterSetJmapFilter(value, oldValue) {
        oldValue !== undefined && this.loadGeneration && this.load()
    }

    afterSetReadOnly(value, oldValue) {
        let me = this;

        me.toggleCls('go-readonly', value);
        oldValue !== undefined && me.renderList()
    }

    destroy(...args) {
        clearTimeout(this.#searchTimer);
        super.destroy(...args)
    }

    /**
     * Reloads from the first page
     * @returns {Promise<void>}
     */
    load() {
        let me = this;

        me.records = [];
        me.total   = 0;

        return me.loadPage(++me.loadGeneration)
    }

    /**
     * @param {Number} generation
     * @returns {Promise<void>}
     * @protected
     */
    async loadPage(generation) {
        let me = this,
            list, total;

        if (!me.entity) {
            return
        }

        me.loading = true;

        try {
            ({list, total} = await client.queryGet(me.entity, {
                filter    : {...me.jmapFilter, ...me.searchText ? {text: me.searchText} : {}},
                sort      : me.jmapSort,
                position  : me.records.length,
                limit     : PAGE_SIZE,
                properties: me.properties
            }));

            if (me.isDestroyed || generation !== me.loadGeneration) {
                return
            }

            await me.prepare(list)
        } catch (e) {
            if (!me.isDestroyed && generation === me.loadGeneration) {
                me.loading = false;
                me.renderList(e.message || String(e))
            }
            return
        }

        if (me.isDestroyed || generation !== me.loadGeneration) {
            return
        }

        me.records = me.records.concat(list.filter(r => !me.records.some(o => o.id === r.id)));
        me.total   = total;
        me.loading = false;
        me.renderList()
    }

    /**
     * Extra data a page of records needs for rowData()
     * @param {Object[]} list
     * @returns {Promise<void>}
     */
    async prepare(list) {
    }

    /**
     * @param {Object} record
     * @returns {Object} {name, description, avatarId}
     */
    rowData(record) {
        return {name: String(record.name ?? ''), description: record.description || '', avatarId: record.avatarId}
    }

    /**
     * @param {String} [error]
     * @protected
     */
    renderList(error) {
        let me      = this,
            checked = new Set((me.value || []).map(String)),
            rows;

        if (error) {
            rows = [{cls: ['go-empty'], text: error}]
        } else if (!me.records.length) {
            rows = me.loading ? [] : [{cls: ['go-empty'], text: t('No items to display')}]
        } else {
            rows = me.records.map(record => me.createRow(record, checked.has(String(record.id))))
        }

        me.listNode.cn = rows;
        me.update()
    }

    /**
     * @param {Object} record
     * @param {Boolean} checked
     * @returns {Object} vdom
     * @protected
     */
    createRow(record, checked) {
        const {name, description, avatarId} = this.rowData(record);

        return {
            cls        : ['go-entitychecklist-row', ...checked ? ['go-entitychecklist-checked'] : []],
            role       : 'listitem',
            'data-id'  : String(record.id),
            cn: [
                EntityCheckList.avatar(name, avatarId), {
                    cls: ['go-entitychecklist-text'],
                    cn : [
                        {cls: ['go-entitychecklist-name'], text: name},
                        {tag: 'small', text: description || '', removeDom: !description}
                    ]
                }, {
                    tag           : 'span',
                    cls           : ['go-check', ...checked ? ['go-checked'] : []],
                    role          : 'checkbox',
                    'aria-checked': String(checked),
                    'aria-label'  : name
                }
            ]
        }
    }

    /**
     * Avatar like GO.permissions.SharePanel
     * @param {String} name
     * @param {String} [avatarId] blob id
     * @returns {Object} vdom
     */
    static avatar(name, avatarId) {
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

    /**
     * Copies the array: toggles must not alter the record it came from
     * @param {Array|null} value
     * @returns {String[]}
     */
    beforeSetValue(value) {
        return Array.isArray(value) ? value.map(String) : []
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        oldValue !== undefined && this.renderList()
    }

    /**
     * @returns {String[]}
     */
    getSubmitValue() {
        return this.value || []
    }

    /**
     * Other ids than loaded (order does not matter)
     * @returns {Boolean}
     */
    get isDirty() {
        const sorted = v => [...(v || [])].map(String).sort();
        return !Neo.isEqual(sorted(this.value), sorted(this.originalConfig.value))
    }

    onRowClick(data) {
        let me = this,
            id = data.path?.find(node => node.data?.id)?.data.id,
            oldValue = me.value;

        if (!id || me.readOnly || me.disabled) {
            return
        }

        const value = new Set(me.value || []);
        value.has(id) ? value.delete(id) : value.add(id);

        me.value = [...value];
        me.fireUserChangeEvent(me.value, oldValue)
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

        if (me.loading || me.records.length >= me.total || data.target?.id !== me.listNode.id) {
            return
        }

        const {clientHeight, scrollHeight} = await Neo.main.DomAccess.getScrollingDimensions({id: me.listNode.id, windowId: me.windowId});

        if (!me.loading && data.scrollTop + clientHeight >= scrollHeight - 60) {
            me.loadPage(me.loadGeneration)
        }
    }
}

export default Neo.setupClass(EntityCheckList);
