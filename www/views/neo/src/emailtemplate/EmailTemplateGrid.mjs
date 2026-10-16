import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import SearchButton  from '../button/SearchButton.mjs';
import client        from '../jmap/Client.mjs';
import ActionTable   from '../list/ActionTable.mjs';
import {notify, notifyError} from '../Notify.mjs';
import {fmt, t}      from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';

/**
 * Template copied with "Copy", pasted into any template list (go.copyEmailTemplate)
 */
const clipboard = {EmailTemplate: null, PdfTemplate: null};

/**
 * The templates of a module (go.emailtemplate.GridPanel): search, paste, add; per row
 * edit, copy and delete. For a module's settings card or dialog:
 *
 *     {module: EmailTemplateGrid, templateModule: {package: 'business', name: 'support'}, key: 'ticket'}
 *
 * `templateModule` is the owning module ({package, name}), `key` narrows it (e.g. a book id;
 * setKey() changes it), `templateDefaults` are values of a new template.
 * GO.pdftemplate.PdfTemplateGrid extends it for PDF templates.
 */
class EmailTemplateGrid extends Container {
    static config = {
        className: 'GO.emailtemplate.EmailTemplateGrid',
        baseCls  : ['go-template-grid', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * JMAP entity
         * @member {String} entity='EmailTemplate'
         */
        entity: 'EmailTemplate',
        /**
         * Module that owns the templates: {package, name}
         * @member {Object|null} templateModule=null
         */
        templateModule: null,
        /**
         * Key within the module (null for none)
         * @member {String|null} key=null
         */
        key: null,
        /**
         * Values of a new template
         * @member {Object|null} templateDefaults=null
         */
        templateDefaults: null,
        /**
         * Title left in the toolbar
         * @member {String|null} title=null
         */
        title: null
    }

    /** search text */
    searchText = ''

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-template-grid-tbar'],
            flex  : 'none',
            items : [...me.title ? [{ntype: 'component', cls: ['go-template-grid-title'], text: me.title}] : [], '->', {
                module   : SearchButton,
                listeners: {search: ({text}) => {
                    me.searchText = text || '';
                    me.load()
                }}
            }, {
                module : Button,
                icon   : 'content_paste',
                tooltip: t('Paste'),
                handler: () => me.paste()
            }, {
                module : Button,
                icon   : 'add',
                tooltip: t('Add'),
                handler: () => me.edit(null)
            }]
        }, {
            module   : ActionTable,
            reference: 'table',
            flex     : 'none',
            columns  : [
                {text: t('Name'), field: 'name', flex: true},
                {text: t('Language'), field: 'language'}
            ],
            actions  : [
                {action: 'edit', icon: 'edit', tooltip: t('Edit')},
                {action: 'copy', icon: 'content_copy', tooltip: t('Copy')},
                {action: 'delete', icon: 'delete', tooltip: t('Delete')}
            ],
            listeners: {
                action        : ({action, record}) => me.onAction(action, record),
                rowDoubleClick: ({record}) => me.edit(record.id)
            }
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        client.watch([me.entity]);
        me.removeStateListener = client.on('stateChange', ({changed}) => {
            changed?.includes(me.entity) && me.load()
        });

        me.load()
    }

    destroy(...args) {
        this.removeStateListener?.();
        super.destroy(...args)
    }

    /**
     * @param {String|null} key
     */
    setKey(key) {
        this.key = key;
        this.load()
    }

    /**
     * Entity/query filter of the module and key
     * @returns {Object}
     */
    getFilter() {
        let me = this;

        return {
            module: me.templateModule,
            key   : me.key ?? null,
            ...me.searchText ? {text: me.searchText} : {}
        }
    }

    async load() {
        let me = this;

        if (!me.templateModule) {
            return
        }

        try {
            const {list} = await client.queryGet(me.entity, {
                filter    : me.getFilter(),
                sort      : [{property: 'name', isAscending: true}],
                // the permission check reads moduleId (else "must not be accessed before initialization")
                properties: ['id', 'name', 'language', 'moduleId']
            });

            me.isDestroyed || (me.getReference('table').records = list)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {String} action
     * @param {Object} record
     */
    onAction(action, record) {
        action === 'edit'   && this.edit(record.id);
        action === 'copy'   && this.copy(record);
        action === 'delete' && this.remove(record)
    }

    /**
     * The dialog class (subclasses: PDF template dialog)
     * @returns {Promise<Object>} module with a default export
     */
    loadDialog() {
        return import('./EmailTemplateDialog.mjs')
    }

    /**
     * @param {String|null} id null: new
     * @param {Object} [values] of a new template
     */
    async edit(id, values) {
        let me = this;

        const {default: Dialog} = await me.loadDialog();

        Neo.create(Dialog, {
            appName : me.appName,
            windowId: me.windowId,
            entityId: id,
            ...id ? {} : {values: {...me.templateDefaults || {}, ...values || {}, module: me.templateModule, key: me.key ?? null}}
        }).on('save', () => me.load())
    }

    /**
     * Keeps the whole template for "Paste"
     * @param {Object} record
     */
    async copy(record) {
        let me = this;

        try {
            const [template] = await client.get(me.entity, [record.id]);

            if (template) {
                const {id, moduleId, key, permissionLevel, ...values} = template;

                // attachments / blocks belong to the copy: without their ids and owner
                Object.entries(values).forEach(([name, value]) => {
                    Array.isArray(value) && (values[name] = value.map(item => {
                        if (item && typeof item === 'object') {
                            const copy = {...item};
                            delete copy.id;
                            Object.keys(copy).filter(k => /TemplateId$/.test(k)).forEach(k => delete copy[k]);
                            return copy
                        }
                        return item
                    }))
                });

                clipboard[me.entity] = values;
                notify(me, fmt(t("'{item}' copied"), {item: template.name}))
            }
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * A new template from the copied one, in this module and key
     */
    paste() {
        let me     = this,
            values = clipboard[me.entity];

        if (!values) {
            notify(me, t('Copy one first'), {title: t('Error')});
            return
        }

        me.edit(null, structuredClone(values))
    }

    /**
     * @param {Object} record
     */
    async remove(record) {
        let me = this;

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Confirm delete'),
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: record.name})
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            await client.set(me.entity, {destroy: [record.id]});
            me.load()
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(EmailTemplateGrid);
