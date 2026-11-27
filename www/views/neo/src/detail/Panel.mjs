import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_DELETE, LEVEL_WRITE} from '../Acl.mjs';
import Button          from '../button/Button.mjs';
import DetailFieldsets from '../customfields/DetailFieldsets.mjs';
import {destroyEntities} from '../data/destroyEntities.mjs';
import {download}      from '../download.mjs';
import client          from '../jmap/Client.mjs';
import AddLinkButton    from '../link/AddLinkButton.mjs';
import LinkBrowseButton from '../link/LinkBrowseButton.mjs';
import LinkCards        from '../link/LinkCards.mjs';
import {notifyError}   from '../Notify.mjs';
import {print}         from '../print.mjs';
import {t}             from '../Translate.mjs';
import CommentsPanel from './CommentsPanel.mjs';
import FilesPanel    from './FilesPanel.mjs';
import HistoryPanel  from './HistoryPanel.mjs';

/**
 * The standard cards a detail can add below its own body, in the order of `cards`
 * @type {Object<String, Object>}
 */
const CARDS = {
    customFields: {module: DetailFieldsets},
    comments    : {module: CommentsPanel, hidden: true},
    files       : {module: FilesPanel, hidden: true},
    links       : {module: LinkCards},
    history     : {module: HistoryPanel, hidden: true}
};

/**
 * @summary Right pane of an entity (GOUI DetailPanel, ExtJS go.detail.Panel): a toolbar with Edit,
 * add / browse links and ⋮ (Print, optional Download PDF, Delete by permissionLevel), a scrolling
 * column with the subclass's body and the standard cards it asks for, and a "Not found" state.
 *
 * The record comes from the host (`setRecord(record)`, e.g. the grid's selected row, which reloads on
 * push itself) or from `load(id)`, which gets `entityName` by id and loads it again when the server
 * reports a change of a `watch` entity.
 *
 *     class NoteDetail extends Panel {
 *         static config = {className: 'GO.notes.view.NoteDetail', entityName: 'Note',
 *             cards: ['customFields', 'comments', 'files', 'links', 'history']}
 *         createBody()           {return [{ntype: 'component', reference: 'body'}]}
 *         renderRecord(record)   {this.getReference('body').html = …}
 *     }
 *
 * Subclass hooks: createBody(), createToolbarItems(), createMoreMenu(), createBottomItems(),
 * renderRecord(record), canEdit(record), canDelete(record), getTitle(record), getDownloadUrl(record).
 * Events: edit {record}, delete {record} (the host confirms and deletes; a detail without a host
 * calls deleteRecord() in onDelete()), deleted {record}.
 * References: toolbar, editButton, addLinkButton, linkBrowseButton, moreButton, scroller, notFound,
 * and customFields, comments, files, links, history for the cards in `cards`.
 * @class GO.detail.Panel
 * @extends Neo.container.Base
 */
class Panel extends Container {
    static config = {
        /**
         * @member {String} className='GO.detail.Panel'
         * @protected
         */
        className: 'GO.detail.Panel',
        baseCls  : ['go-detail-panel', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * JMAP entity shown, e.g. 'Note': cards, links and load() use it
         * @member {String|null} entityName=null
         */
        entityName: null,
        /**
         * Properties load() asks for, null: all
         * @member {String[]|null} properties=null
         */
        properties: null,
        /**
         * Standard cards below the body, in this order: 'customFields', 'comments', 'files', 'links', 'history'
         * @member {String[]} cards=[]
         */
        cards: [],
        /**
         * Add and browse link buttons in the toolbar
         * @member {Boolean} hasLinks=true
         */
        hasLinks: true,
        /**
         * Entities whose changes make load() load again, null: [entityName]
         * @member {String[]|null} watch=null
         */
        watch: null
    }

    /**
     * The shown record, null: none
     * @member {Object|null} record=null
     */
    record = null

    /**
     * Id asked for by the last load(), null after setRecord()
     * @member {String|null} requestedId=null
     */
    requestedId = null

    /**
     * @summary Builds the toolbar, the scroller with the body and the cards, and the bottom items.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : Toolbar,
            cls      : ['go-border-bottom'],
            flex     : 'none',
            reference: 'toolbar',
            items    : [...me.createToolbarItems(), {
                module   : Button,
                icon     : 'edit',
                reference: 'editButton',
                tooltip  : t('Edit'),
                disabled : true,
                handler  : () => me.onEdit()
            }, ...me.hasLinks ? [
                {module: AddLinkButton, reference: 'addLinkButton'},
                {module: LinkBrowseButton, reference: 'linkBrowseButton'}
            ] : [], {
                module   : Button,
                icon     : 'more_vert',
                reference: 'moreButton',
                tooltip  : t('More'),
                disabled : true
            }]
        }, {
            ntype    : 'component',
            cls      : ['go-empty'],
            flex     : 'none',
            reference: 'notFound',
            hidden   : true,
            text     : t('Not found')
        }, {
            // GOUI DetailPanel: the entity's own cards, then the standard ones
            ntype    : 'container',
            cls      : ['go-detail-scroller'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'scroller',
            items    : [
                ...me.createBody().map(item => ({flex: 'none', ...item})),
                ...me.cards.map(name => ({...CARDS[name], reference: name, flex: 'none'}))
            ]
        }, ...me.createBottomItems()];

        const watched = me.watch || (me.entityName ? [me.entityName] : []);

        if (watched.length) {
            client.watch(watched);

            me.removeStateListener = client.on('stateChange', ({changed}) => {
                me.requestedId && changed?.some(e => watched.includes(e)) && me.reload()
            })
        }
    }

    /**
     * @summary Sets the ⋮ menu.
     */
    onConstructed() {
        super.onConstructed();
        this.getReference('moreButton').menu = this.createMoreMenu()
    }

    /**
     * @summary Stops following server changes.
     * @param {...*} args
     */
    destroy(...args) {
        this.removeStateListener?.();
        super.destroy(...args)
    }

    /**
     * @summary Items of the scroller above the standard cards (the entity's own card).
     * @returns {Object[]}
     */
    createBody() {
        return []
    }

    /**
     * @summary Toolbar items left of Edit; '->' pushes the buttons to the right.
     * @returns {Array}
     */
    createToolbarItems() {
        return ['->']
    }

    /**
     * @summary Items of the ⋮ menu: Print, Download PDF (when getDownloadUrl() gives one) and Delete
     * (id 'delete', disabled without delete permission). Subclasses add theirs to the result.
     * @returns {Object[]}
     */
    createMoreMenu() {
        let me = this;

        return [
            {id: 'print', text: t('Print'), icon: 'print', handler: () => me.onPrint()},
            ...me.getDownloadUrl === Panel.prototype.getDownloadUrl ? [] : [
                {id: 'download', text: t('Download PDF'), icon: 'cloud_download', handler: () => me.onDownload()}
            ],
            {separator: true},
            {id: 'delete', text: t('Delete'), icon: 'delete', handler: () => me.onDelete()}
        ]
    }

    /**
     * @summary Items below the scroller (e.g. a bottom toolbar).
     * @returns {Object[]}
     */
    createBottomItems() {
        return []
    }

    /**
     * @summary Loads and shows a record by id, null: none. A later call (or setRecord()) wins.
     * @param {String|Number|null} id
     * @returns {Promise<Object|null>} the record, null when none, gone or failed
     */
    async load(id) {
        let me         = this,
            generation = me.loadGeneration = (me.loadGeneration || 0) + 1;

        me.requestedId = id != null && id !== '' ? String(id) : null;

        // another record: the shown one must not stay actionable while the new one loads
        if (!me.requestedId || String(me.record?.id) !== me.requestedId) {
            me.showRecord(null)
        }

        if (!me.requestedId) {
            return null
        }

        try {
            const [record] = await client.get(me.entityName, [me.requestedId], me.properties || undefined);

            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            me.showRecord(record || null, !record);
            return record || null
        } catch (e) {
            !me.isDestroyed && generation === me.loadGeneration && notifyError(me, e);
            return null
        }
    }

    /**
     * @summary Loads the record of the last load() again; a record from setRecord() stays as it is.
     * @returns {Promise<Object|null>}
     */
    reload() {
        return this.requestedId ? this.load(this.requestedId) : Promise.resolve(this.record)
    }

    /**
     * @summary Shows a record the host has (also again after it reloaded), null: none.
     * Cancels a pending load(); push reloads are then the host's.
     * @param {Object|null} record
     */
    setRecord(record) {
        let me = this;

        me.loadGeneration = (me.loadGeneration || 0) + 1;
        me.requestedId    = null;
        me.showRecord(record)
    }

    /**
     * @summary Points the toolbar and the cards to the record and renders it.
     * @param {Object|null} record
     * @param {Boolean} [notFound=false] show "Not found" instead of nothing
     * @protected
     */
    showRecord(record, notFound = false) {
        let me     = this,
            id     = record?.id != null ? String(record.id) : null,
            entity = record ? me.entityName : null,
            more   = me.getReference('moreButton');

        me.record = record;

        me.getReference('notFound').hidden = !notFound;
        me.getReference('editButton').disabled = !record || !me.canEdit(record);
        more.disabled = !record;
        more.setMenuItemDisabled('delete', !record || !me.canDelete(record));

        if (me.hasLinks) {
            me.getReference('addLinkButton').setEntity(entity, id, record);

            if (me.getReference('linkBrowseButton').target?.entityId !== id) {
                me.getReference('linkBrowseButton').setEntity(entity, id)
            }
        }

        me.cards.forEach(name => {
            const card = me.getReference(name);

            if (name === 'customFields') {
                // also for the same record: this follows a reload (e.g. after editing)
                card.setEntity(entity, id);
                return
            }

            if (name !== 'links') {
                card.hidden = !record
            }

            // the same record keeps its content while it reloads
            if (String(card.current?.entityId ?? '') !== String(id ?? '')) {
                card.setEntity(entity, id, record)
            } else if (record && card.current) {
                card.current.record = record
            }
        });

        me.renderRecord(record)
    }

    /**
     * @summary Shows the record in the body, null: empties it.
     * @param {Object|null} record
     */
    renderRecord(record) {}

    /**
     * @summary The Edit button is enabled.
     * @param {Object} record
     * @returns {Boolean}
     */
    canEdit(record) {
        return (record.permissionLevel || 0) >= LEVEL_WRITE
    }

    /**
     * @summary ⋮ Delete is enabled.
     * @param {Object} record
     * @returns {Boolean}
     */
    canDelete(record) {
        return (record.permissionLevel || 0) >= LEVEL_DELETE
    }

    /**
     * @summary Title of a print and the delete question.
     * @param {Object} record
     * @returns {String}
     */
    getTitle(record) {
        return record.name || record.title || ''
    }

    /**
     * @summary URL of the record's PDF; overriding it adds ⋮ Download PDF.
     * @param {Object} record
     * @returns {String|null}
     */
    getDownloadUrl(record) {
        return null
    }

    /**
     * @summary Fires edit {record}.
     */
    onEdit() {
        this.record && this.fire('edit', {record: this.record})
    }

    /**
     * @summary Fires delete {record}; the host confirms and deletes.
     */
    onDelete() {
        this.record && this.fire('delete', {record: this.record})
    }

    /**
     * @summary Asks "Confirm delete", destroys the record, empties the detail and fires deleted {record}.
     * For a detail without a host that deletes (override onDelete() to call it).
     * @returns {Promise<Boolean>} true when it was deleted
     */
    async deleteRecord() {
        let me     = this,
            record = me.record;

        if (!record || !await destroyEntities(me, me.entityName, [{id: record.id, name: me.getTitle(record)}]) || me.isDestroyed) {
            return false
        }

        // the detail may show another record by now
        String(me.record?.id) === String(record.id) && me.setRecord(null);
        me.fire('deleted', {record});
        return true
    }

    /**
     * @summary Prints the body with its cards.
     */
    onPrint() {
        this.record && print(this.getReference('scroller'), {title: this.getTitle(this.record)})
    }

    /**
     * @summary Downloads the record's PDF.
     */
    onDownload() {
        const url = this.record && this.getDownloadUrl(this.record);

        url && download(this.windowId, url)
    }
}

export default Neo.setupClass(Panel);
