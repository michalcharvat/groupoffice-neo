import TextField       from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import {destroyEntities} from '../data/destroyEntities.mjs';
import {LEVEL_DELETE, LEVEL_WRITE} from '../Acl.mjs';
import client          from '../jmap/Client.mjs';
import {notifyError}   from '../Notify.mjs';
import {t}             from '../Translate.mjs';
import EntityListPanel from './EntityListPanel.mjs';
import LookupDialog    from './LookupDialog.mjs';

/**
 * @summary The JMAP filter of a search text: `{text}` (the classic tbsearch), null when empty.
 * @param {String|null|undefined} query
 * @returns {Object|null}
 */
export function lookupFilter(query) {
    const text = (query || '').trim();

    return text ? {text} : null
}

/**
 * @summary Whether a lookup record may be edited: its permission level at least write.
 * @param {Object} record {permissionLevel}
 * @returns {Boolean}
 */
export function mayEditLookup(record) {
    return (record?.permissionLevel || 0) >= LEVEL_WRITE
}

/**
 * @summary Whether a lookup record may be deleted: its permission level at least delete.
 * @param {Object} record {permissionLevel}
 * @returns {Boolean}
 */
export function mayDeleteLookup(record) {
    return (record?.permissionLevel || 0) >= LEVEL_DELETE
}

/**
 * @summary One lookup list of a LookupSettingsDialog (the classic Status / Type / Category grids of a
 * module Settings dialog): a JMAP entity in a GO.list.ActionTable with search (filter `text`), add,
 * edit and delete. Configured by a lookup definition; the dialog is a LookupDialog with the
 * definition's fields. Edit and delete follow the record's `permissionLevel`, so `properties` must
 * contain it. Fires `change {entity}` after a save or delete.
 *
 *     {module: LookupListPanel, entity: 'AmdCrewCurrency', dialogTitle: t('Currency'), properties: [...],
 *      columns: [...], fields: () => [...], prepare: async list => list}
 */
class LookupListPanel extends EntityListPanel {
    static config = {
        className: 'GO.systemsettings.LookupListPanel',
        baseCls  : ['go-entity-list-panel', 'go-lookup-list-panel', 'neo-container'],
        jmapSort : [{property: 'name', isAscending: true}],
        /**
         * Title of the dialog
         * @member {String|null} dialogTitle=null
         */
        dialogTitle: null,
        /**
         * Returns the dialog's form items
         * @member {Function|null} fields=null
         */
        fields: null,
        /**
         * The entity owns an ACL: the dialog has a Permissions tab
         * @member {Boolean} share=false
         */
        share: false,
        /**
         * async list => rows: adds looked up names to the records
         * @member {Function|null} prepare=null
         */
        prepare: null,
        /**
         * Values of a new record (e.g. a default the form would otherwise submit empty)
         * @member {Object|null} defaults=null
         */
        defaults: null
    }

    /**
     * Counts loads: only the answer of the latest one is shown
     * @member {Number} loadCounter=0
     */
    loadCounter = 0

    /**
     * @summary The search box left of the add button.
     * @returns {Object[]}
     */
    createToolbarItems() {
        const me = this;

        return [{
            module         : TextField,
            reference      : 'search',
            cls            : ['go-lookup-search'],
            hideLabel      : true,
            placeholderText: t('Search'),
            width          : 240,
            listeners      : {change: () => me.onSearchChange()}
        }]
    }

    /**
     * @summary Reloads a moment after the last key stroke.
     */
    onSearchChange() {
        const me = this;

        clearTimeout(me.searchTimer);
        me.searchTimer = setTimeout(() => me.isDestroyed || me.load(), 300)
    }

    /**
     * @summary Loads the rows matching jmapFilter and the search; an older answer arriving late is dropped.
     */
    async load() {
        const me      = this,
              counter = ++me.loadCounter,
              search  = lookupFilter(me.getReference('search')?.value),
              // AND keeps both: a compound jmapFilter or its own text would swallow a merged key
              filter  = me.jmapFilter && search ? {operator: 'AND', conditions: [me.jmapFilter, search]} : me.jmapFilter || search || undefined;

        try {
            const {list} = await client.queryGet(me.entity, {filter, sort: me.jmapSort, properties: me.properties}),
                  records = await me.prepareRecords(list);

            !me.isDestroyed && counter === me.loadCounter && (me.getReference('table').records = records)
        } catch (e) {
            !me.isDestroyed && counter === me.loadCounter && notifyError(me, e)
        }
    }

    /**
     * @summary The definition's prepare(), if any.
     * @param {Object[]} list
     * @returns {Promise<Object[]>}
     */
    async prepareRecords(list) {
        return this.prepare ? this.prepare(list) : list
    }

    /**
     * @summary Edit button and double click with write permission on the record.
     * @param {Object} record
     * @returns {Boolean}
     */
    mayEdit(record) {
        return mayEditLookup(record)
    }

    /**
     * @summary Delete button with delete permission on the record.
     * @param {Object} record
     * @returns {Boolean}
     */
    mayDelete(record) {
        return mayDeleteLookup(record)
    }

    /**
     * @summary Opens the LookupDialog of this lookup; the list reloads after a save.
     * @param {String|null} id null: new
     * @param {Object} [values]
     * @returns {Promise<GO.systemsettings.LookupDialog>}
     */
    async edit(id, values) {
        const me      = this,
              initial = id ? values : {...me.defaults, ...values},
              dialog  = me.createDialog({
                  appName   : me.appName,
                  windowId  : me.windowId,
                  entityName: me.entity,
                  title     : me.dialogTitle,
                  fields    : me.fields,
                  share     : me.share,
                  entityId  : id,
                  ...initial ? {values: initial} : {}
              });

        dialog.on('save', () => me.onChanged());

        return dialog
    }

    /**
     * @summary The dialog edit() opens: a LookupDialog; a lookup with more fields returns its own.
     * @param {Object} config
     * @returns {GO.systemsettings.LookupDialog}
     */
    createDialog(config) {
        return Neo.create(LookupDialog, config)
    }

    /**
     * @summary Deletes a record after a confirmation, then reloads and tells the other lists.
     * @param {Object} record
     */
    async remove(record) {
        await destroyEntities(this, this.entity, [record], {displayField: this.displayField}) && this.onChanged()
    }

    /**
     * @summary A record was saved: reload, and tell the other lists (their names may come from it).
     */
    onChanged() {
        this.load();
        this.fire('change', {entity: this.entity})
    }

    /**
     * @summary Stops a pending search reload.
     */
    destroy(...args) {
        clearTimeout(this.searchTimer);
        super.destroy(...args)
    }
}

export default Neo.setupClass(LookupListPanel);
