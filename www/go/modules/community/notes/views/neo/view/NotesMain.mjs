import Toolbar       from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_CREATE, LEVEL_MANAGE, LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button        from '../../../../../../../views/neo/src/button/Button.mjs';
import SearchButton  from '../../../../../../../views/neo/src/button/SearchButton.mjs';
import Grid          from '../../../../../../../views/neo/src/grid/Grid.mjs';
import {selectRow}   from '../../../../../../../views/neo/src/grid/selectRow.mjs';
import CheckBox      from '../../../../../../../views/neo/src/component/CheckBox.mjs';
import TableTitle    from '../../../../../../../views/neo/src/component/TableTitle.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import JmapStore     from '../../../../../../../views/neo/src/data/JmapStore.mjs';
import CheckList     from '../../../../../../../views/neo/src/list/CheckList.mjs';
import {escapeHtml, formatUserDateTime, smartDateTime} from '../../../../../../../views/neo/src/Format.mjs';
import {notifyError}    from '../../../../../../../views/neo/src/Notify.mjs';
import ConfirmDialog    from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import FilterPanel      from '../../../../../../../views/neo/src/view/FilterPanel.mjs';
import MainThreeColumnPanel from '../../../../../../../views/neo/src/view/MainThreeColumnPanel.mjs';
import {fmt, translator} from '../../../../../../../views/neo/src/Translate.mjs';
import NoteBookModel from '../model/NoteBook.mjs';
import NoteModel     from '../model/Note.mjs';
import NoteBookDialog from './NoteBookDialog.mjs';
import NoteDetail    from './NoteDetail.mjs';
import NoteDialog    from './NoteDialog.mjs';

// GOUI loads 20 per scroll step; 40 fills a tall screen in one request
const PAGE_SIZE = 40;

const t = translator('community', 'notes');

const dateTimeRenderer = ({value}) => value ? `<span title="${escapeHtml(formatUserDateTime(value))}">${escapeHtml(smartDateTime(value))}</span>` : '';

/** Principal id → name, for the "Created by" / "Modified by" columns */
const principalNames = new Map();

const principalRenderer = ({value}) => value ? escapeHtml(principalNames.get(String(value)) ?? '') : '';

// filters for saved filters, GOUI modules.register({entities: [{name: 'Note', filters}]})
const NOTE_FILTERS = [
    {name: 'text',        type: 'string', multiple: false, title: t('Query')},
    {name: 'name',        type: 'string', multiple: true,  title: t('Name')},
    {name: 'content',     type: 'string', multiple: true,  title: t('Content')},
    {name: 'commentedat', type: 'date',   multiple: false, title: t('Commented at')},
    {name: 'modifiedat',  type: 'date',   multiple: false, title: t('Modified at')},
    {name: 'createdat',   type: 'date',   multiple: false, title: t('Created at')}
];

/**
 * Notes main panel: notebooks | notes grid | note detail, laid out like the GOUI notes
 * module (go/modules/community/notes/views/goui/script/Main.ts)
 */
class NotesMain extends MainThreeColumnPanel {
    static config = {
        className: 'GO.notes.view.NotesMain',
        cls      : ['go-notes'],
        // GOUI's id: the panel widths are shared with the GOUI notes module
        stateName: 'notes',
        /**
         * Route prefix, set by the shell (GO.view.MainView)
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    /**
     * Note to select once the grid has loaded (deep link or after create)
     * @member {String|null} pendingNoteId=null
     */
    pendingNoteId = null
    /**
     * All note books, also while the sidebar list is filtered by its search (the dialog needs them)
     * @member {Object[]} noteBooks=[]
     */
    noteBooks = []
    /**
     * @member {String} noteBookSearch=''
     */
    noteBookSearch = ''

    createWest() {
        return {
            ntype : 'container',
            cls   : ['go-scroll'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                items : [{
                    // GOUI selectallcheckboxfield
                    module   : CheckBox,
                    reference: 'selectAllNoteBooks',
                    flex     : 'none',
                    listeners: {change: ({checked}) => this.onSelectAllNoteBooks(checked)}
                }, {
                    ntype: 'component',
                    tag  : 'h4',
                    cls  : ['go-toolbar-heading'],
                    text : t('Notebooks')
                }, '->', {
                    module   : SearchButton,
                    cls      : ['small'],
                    listeners: {search: ({text}) => this.onNoteBookSearch(text)}
                }, {
                    module   : Button,
                    icon     : 'add',
                    cls      : ['small'],
                    reference: 'addNoteBookButton',
                    tooltip  : t('Add note book'),
                    handler  : () => this.openNoteBookDialog(null)
                }, this.hideWestButton()]
            }, {
                module      : CheckList,
                reference   : 'noteBookList',
                flex        : 'none',
                displayField: 'name',
                rowMenu     : record => this.getNoteBookMenu(record),
                store       : {
                    module    : JmapStore,
                    entity    : 'NoteBook',
                    model     : NoteBookModel,
                    // GOUI: note books the user can read (not all he can see as admin)
                    jmapFilter: {permissionLevel: 10},
                    jmapSort  : [{property: 'name', isAscending: true}]
                }
            }, {
                module   : FilterPanel,
                reference: 'filterPanel',
                flex     : 'none',
                entity   : 'Note',
                filters  : NOTE_FILTERS,
                listeners: {filterChange: ({filter}) => this.onSavedFilterChange(filter)}
            }]
        }
    }

    createCenter() {
        return {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                cls   : ['go-bg-mid', 'go-border-bottom'],
                items : [this.showWestButton(), {
                    module   : TableTitle,
                    reference: 'tableTitle',
                    title    : t('All notes')
                }, '->', {
                    module   : SearchButton,
                    listeners: {search: ({text}) => this.onSearch(text)}
                }, {
                    module   : Button,
                    icon     : 'add',
                    ui       : 'primary',
                    reference: 'newButton',
                    tooltip  : t('Add'),
                    handler  : 'up.onNew'
                }]
            }, {
                module   : Grid,
                reference: 'grid',
                flex     : 1,
                store    : {
                    module    : JmapStore,
                    entity    : 'Note',
                    model     : NoteModel,
                    pageSize  : PAGE_SIZE,
                    // GOUI: more notes load when the grid is scrolled to the end
                    scrollLoad: true,
                    // the creator/modifier columns show names: GO sorts names as creator/modifier
                    sortProperties: {createdBy: 'creator', modifiedBy: 'modifier'},
                    // shows the header's sort arrow; JmapStore sends it to the server
                    sorters   : [{property: 'name', direction: 'ASC'}],
                    properties: ['id', 'name', 'content', 'noteBookId', 'createdAt', 'modifiedAt',
                                 'createdBy', 'modifiedBy', 'password', 'permissionLevel', 'filesFolderId']
                },
                // GOUI NoteGrid columns; right click on the header shows/hides them
                stateId: 'notes-noteGrid',
                columns: [{
                    dataField: 'id',
                    text     : t('ID'),
                    width    : 80,
                    hidden   : true
                }, {
                    dataField: 'name',
                    text     : t('Name'),
                    flex     : 1,
                    hideable : false,
                    renderer : ({record}) => (record.password ? '🔒 ' : '') + escapeHtml(record.name)
                }, {
                    dataField: 'createdAt',
                    text     : t('Created at'),
                    cellAlign: 'right',
                    width    : 164,
                    hidden   : true,
                    renderer : dateTimeRenderer
                }, {
                    // GOUI datetimecolumn: right aligned, smart date, full date as title
                    dataField: 'modifiedAt',
                    text     : t('Modified at'),
                    cellAlign: 'right',
                    width    : 164,
                    renderer : dateTimeRenderer
                }, {
                    dataField: 'createdBy',
                    stateKey : 'creator/name',
                    text     : t('Created by'),
                    width    : 160,
                    hidden   : true,
                    renderer : principalRenderer
                }, {
                    dataField: 'modifiedBy',
                    stateKey : 'modifier/name',
                    text     : t('Modified by'),
                    width    : 160,
                    hidden   : true,
                    renderer : principalRenderer
                }]
            }]
        }
    }

    createEast() {
        return {
            module   : NoteDetail,
            reference: 'detail'
        }
    }

    /**
     * Open dialogs: closing the module (MainView.closeModule) closes them too
     * @member {Set<GO.view.Dialog>} dialogs
     */
    dialogs = new Set()

    destroy(...args) {
        // close(), not destroy(): it removes the modal mask and the dialog's DOM
        this.dialogs.forEach(dialog => dialog.isDestroyed || dialog.close());
        super.destroy(...args)
    }

    /**
     * @param {GO.view.Dialog} dialog
     * @returns {GO.view.Dialog}
     */
    trackDialog(dialog) {
        // drop closed ones, the set lives as long as the module
        this.dialogs.forEach(d => d.isDestroyed && this.dialogs.delete(d));
        this.dialogs.add(dialog);
        return dialog
    }

    onConstructed() {
        super.onConstructed();

        let me        = this,
            bookList  = me.getReference('noteBookList'),
            grid      = me.getReference('grid'),
            noteStore = grid.store,
            detail    = me.getReference('detail');

        bookList.selectionModel.on('selectionChange', me.onNoteBookSelectionChange, me);
        bookList.store.on('load', me.onNoteBooksLoad, me);

        grid.view.selectionModel.on('selectionChange', me.onNoteSelectionChange, me);
        // neo toggles a clicked row, GOUI keeps it selected: tapping the open note again (a phone
        // after "close") must show it, not deselect it
        grid.on('rowClick', event => {
            const sm     = grid.view.selectionModel,
                  record = event.record || sm.getRecord(event.data?.path),
                  id     = record && grid.view.getRecordId(record);

            if (record && !sm.isSelectedRow(id)) {
                selectRow(grid, id);
                me.showInDetail(record);
                me.activatePanel('east')
            }
        });
        // GO: double click edits (same rules as the detail's Edit button)
        grid.on('rowDoubleClick', ({record}) => {
            if (record && !record.password && record.permissionLevel >= LEVEL_WRITE) {
                me.openDialog(record)
            }
        });
        noteStore.on('load', me.onNotesLoad, me);
        noteStore.on('loadMore', me.updateNoteCount, me);
        noteStore.on('load',     me.loadPrincipalNames, me);
        noteStore.on('loadMore', me.loadPrincipalNames, me);
        grid.body.on('scrollEdge', () => noteStore.loadMore().catch(() => {})); // loadError shows it

        // GOUI createEast(): back to the grid on a phone
        detail.getReference('toolbar').insert(0, me.showCenterButton());

        detail.on({
            edit  : ({note}) => me.openDialog(note),
            delete: ({note}) => me.deleteNote(note)
        });

        // also reloads on push and paging, which nobody awaits
        bookList.store.on('loadError', ({error}) => me.showError(error));
        noteStore.on('loadError', ({error}) => me.showError(error));

        me.initialLoad = me.loadInitial()
    }

    /**
     * Note books first: like GOUI, the user's default (or last used) note books start
     * checked, and the notes load for them
     */
    async loadInitial() {
        let me       = this,
            bookList = me.getReference('noteBookList'),
            settings = null;

        const [books, user] = await Promise.allSettled([
            bookList.store.load(),
            client.get('User', [client.user.id], ['notesSettings'])
        ]);

        if (me.isDestroyed) {
            return
        }

        if (user.status === 'fulfilled') {
            settings = user.value[0]?.notesSettings || null
        }

        me.notesSettings = settings;

        const ids = !settings ? [] : settings.rememberLastItems
                  ? settings.lastNoteBookIds || []
                  : [settings.defaultNoteBookId].filter(Boolean),
              records = books.status === 'fulfilled'
                  ? ids.map(id => bookList.store.get(String(id))).filter(Boolean)
                  : [];

        if (records.length) {
            me.restoringNoteBooks = true;
            bookList.selectionModel.select(records); // fires selectionChange: loads the notes
            me.restoringNoteBooks = false
        } else {
            me.getReference('grid').store.load().catch(() => {})
        }
    }

    /**
     * Called by the shell for "#notes/<path>", e.g. "#notes/note/5"
     * @param {String} path
     */
    route(path) {
        const match = path.match(/^note\/(\d+)$/);

        if (match) {
            this.showNote(match[1])
        }
    }

    async showNote(id) {
        let me     = this,
            record = me.getReference('grid').store.get(id);

        me.activatePanel('east');

        if (record) {
            me.pendingNoteId = null;
            selectRow(me.getReference('grid'), id);
            me.showInDetail(record);
            return
        }

        // not loaded (yet) or not on the current page: onNotesLoad() selects it when it shows up
        me.pendingNoteId = id;
        me.fetchIntoDetail(id)
    }

    /**
     * Shows a note that is not in the grid's page. A later selection wins over
     * an older fetch.
     * @param {String} id
     */
    async fetchIntoDetail(id) {
        let me         = this,
            generation = me.detailGeneration = (me.detailGeneration || 0) + 1;

        try {
            const [note] = await client.get('Note', [id]);

            if (!me.isDestroyed && generation === me.detailGeneration) {
                me.getReference('detail').setNote(note || null)
            }
        } catch (e) {
            me.isDestroyed || me.showError(e)
        }
    }

    getNoteBookName(id) {
        return this.getReference('noteBookList').store.get(id)?.name || ''
    }

    showInDetail(note) {
        // invalidates a pending fetchIntoDetail()
        this.detailGeneration = (this.detailGeneration || 0) + 1;
        this.getReference('detail').setNote(note)
    }

    async onNoteBooksLoad() {
        let me = this;

        // a search shows a subset; keep the full list for the dialog and the add button
        if (!me.noteBookSearch) {
            me.noteBooks = [...me.getReference('noteBookList').store.items]
        } else if (!me.noteBooks.length) {
            // searched before the first full load came back
            try {
                me.noteBooks = (await client.queryGet('NoteBook', {sort: [{property: 'name', isAscending: true}]})).list
            } catch (e) {
                me.showError(e);
                return
            }
        }

        if (!me.isDestroyed) {
            me.getReference('newButton').disabled = !me.noteBooks.some(b => b.permissionLevel >= LEVEL_CREATE);
            me.syncSelectAll()
        }
    }

    onNoteBookSearch(text) {
        this.noteBookSearch = text;
        this.getReference('noteBookList').store.setFilter({text: text || undefined}).catch(() => {})
    }

    onNoteBookSelectionChange() {
        let me   = this,
            list = me.getReference('noteBookList'),
            ids  = list.getCheckedIds();

        me.syncSelectAll();

        // GOUI: remembered for the next visit when the user wants that
        if (!me.restoringNoteBooks && me.notesSettings?.rememberLastItems) {
            client.set('User', {update: {[client.user.id]: {notesSettings: {lastNoteBookIds: ids}}}}).catch(() => {})
        }

        me.getReference('tableTitle').title = ids.length ? ids.map(id => me.getNoteBookName(id)).join(', ') : t('All notes');

        // nothing checked: no restriction, all notes (same as the server and GOUI)
        me.getReference('grid').store.setFilter({noteBookId: ids.length ? ids : undefined}).catch(() => {})
    }

    syncSelectAll() {
        let list    = this.getReference('noteBookList'),
            count   = list.store.count,
            checked = list.selectionModel.getSelection().length;

        this.getReference('selectAllNoteBooks').set({
            checked      : count > 0 && checked === count,
            indeterminate: checked > 0 && checked < count
        })
    }

    onSelectAllNoteBooks(checked) {
        let model = this.getReference('noteBookList').selectionModel;

        if (checked) {
            model.select([...this.getReference('noteBookList').store.items])
        } else {
            model.deselectAll()
        }
    }

    getNoteBookMenu(record) {
        const manage = record.permissionLevel >= LEVEL_MANAGE;

        return [{
            text    : t('Edit'),
            icon    : 'edit',
            disabled: !manage,
            handler : () => this.openNoteBookDialog(record)
        }, {
            text    : t('Delete'),
            icon    : 'delete',
            disabled: !manage,
            handler : () => this.deleteNoteBook(record)
        }]
    }

    openNoteBookDialog(record) {
        let me = this;

        me.trackDialog(Neo.create(NoteBookDialog, {
            appName   : me.appName,
            windowId  : me.windowId,
            noteBookId: record?.id || null,
            name      : record?.name || ''
        }))
        // the list reloads by itself (push of the NoteBook change)
    }

    async deleteNoteBook(record) {
        let me = this;

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: record.name})
        });

        if (!confirmed) {
            return
        }

        try {
            await client.set('NoteBook', {destroy: [record.id]})
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * Checked saved filters (FilterPanel), ANDed with the note book and search filters
     * @param {Object|undefined} filter
     */
    onSavedFilterChange(filter) {
        this.getReference('grid').store.setFilter({savedFilter: filter}).catch(() => {})
    }

    onSearch(text) {
        this.getReference('grid').store.setFilter({text: text || undefined}).catch(() => {})
    }

    onNoteSelectionChange({records}) {
        let me   = this,
            note = records[0] || null;

        // the user picked another note: forget an older deep link waiting for its page
        note && (me.pendingNoteId = null);
        // GOUI showNote(): a phone shows the detail
        note && me.activatePanel('east');
        me.showInDetail(note);

        // deep link; route() → showNote() selects without firing selectionChange again
        note && me.moduleName && Neo.Main.setRoute({value: `${me.moduleName}/note/${note.id}`, windowId: me.windowId})
    }

    /**
     * Names for the "Created by" / "Modified by" columns, then the rows render again
     */
    async loadPrincipalNames() {
        let me      = this,
            grid    = me.getReference('grid'),
            missing = new Set();

        grid?.store.items.forEach(note => {
            [note.createdBy, note.modifiedBy].forEach(id => id && !principalNames.has(String(id)) && missing.add(String(id)))
        });

        if (!missing.size) {
            return
        }

        try {
            (await client.get('Principal', [...missing], ['id', 'name'])).forEach(p => principalNames.set(String(p.id), p.name))
        } catch (e) {
            return
        }

        // unknown or deleted users: don't ask again
        missing.forEach(id => principalNames.has(id) || principalNames.set(id, ''));

        !me.isDestroyed && !grid.isDestroyed && grid.body?.createViewData()
    }

    onNotesLoad() {
        // a load can finish after the view (e.g. of a closed window) is gone
        if (this.isDestroyed || !this.getReference('grid')) {
            return
        }

        let me     = this,
            store  = me.getReference('grid').store,
            detail = me.getReference('detail'),
            id     = me.pendingNoteId || detail.note?.id;

        me.updateNoteCount();

        me.pendingNoteId = null;

        if (!id) {
            return
        }

        const record = store.get(id);

        if (record) {
            selectRow(me.getReference('grid'), id);
            me.showInDetail(record)
        } else {
            // the note is gone (deleted elsewhere) or filtered out
            me.fetchIntoDetail(id)
        }
    }

    updateNoteCount() {
        const total = this.getReference('grid').store.totalCount || 0;
        this.getReference('tableTitle').subtitle = `${total} ${total === 1 ? 'note' : 'notes'}`
    }

    onNew() {
        this.openDialog(null)
    }

    /**
     * Header "+" menu (GO.view.MainView)
     */
    async onQuickAdd() {
        // a fresh view still loads its note books (the dialog lists them)
        await this.initialLoad;
        this.isDestroyed || this.onNew()
    }

    openDialog(note) {
        let me        = this,
            books     = me.noteBooks,
            writable  = books.filter(b => b.permissionLevel >= LEVEL_CREATE),
            list      = me.getReference('noteBookList'),
            checked   = list.selectionModel.getSelection().map(itemId => String(list.getItemRecordId(itemId))),
            defaultId = writable.find(b => checked.includes(b.id))?.id || writable[0]?.id;

        let dialog;

        try {
            dialog = Neo.create(NoteDialog, {
            appName  : me.appName,
            windowId : me.windowId,
            noteId   : note?.id || null,
            noteBooks: note ? books : writable,
            values   : note
                ? {name: note.name, noteBookId: note.noteBookId, content: note.content}
                : {name: '', noteBookId: defaultId, content: ''}
            })
        } catch (e) {
            me.showError(e);
            return
        }

        me.trackDialog(dialog);

        dialog.on('saved', ({id}) => {
            if (me.isDestroyed) {
                return
            }

            me.pendingNoteId = id;
            me.getReference('grid').store.load().catch(() => {}) // loadError shows it
        })
    }

    async deleteNote(note) {
        let me = this;

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: note.name})
        });

        if (!confirmed) {
            return
        }

        try {
            await client.set('Note', {destroy: [note.id]});
            me.showInDetail(null);
            me.getReference('grid').store.load().catch(() => {}) // loadError shows it
        } catch (e) {
            me.showError(e)
        }
    }

    showError(error) {
        notifyError(this, error)
    }
}

export default Neo.setupClass(NotesMain);
