import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_CREATE, LEVEL_MANAGE} from '../../../../../views/neo/src/Acl.mjs';
import Button        from '../../../../../views/neo/src/button/Button.mjs';
import SearchButton  from '../../../../../views/neo/src/button/SearchButton.mjs';
import TableTitle    from '../../../../../views/neo/src/component/TableTitle.mjs';
import {enableDragDrop} from '../../../../../views/neo/src/component/dragDrop.mjs';
import Grid          from '../../../../../views/neo/src/grid/Grid.mjs';
import MultiSelectToolbar from '../../../../../views/neo/src/grid/MultiSelectToolbar.mjs';
import {selectRow}   from '../../../../../views/neo/src/grid/selectRow.mjs';
import MenuList      from '../../../../../views/neo/src/menu/List.mjs';
import ModuleRegistry from '../../../../../views/neo/src/ModuleRegistry.mjs';
import {escapeHtml, fileSize, formatUserDateTime, smartDateTime} from '../../../../../views/neo/src/Format.mjs';
import {notify, notifyError} from '../../../../../views/neo/src/Notify.mjs';
import {getState, setState} from '../../../../../views/neo/src/State.mjs';
import {fmt, t as coreT} from '../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../views/neo/src/view/ConfirmDialog.mjs';
import MainThreeColumnPanel from '../../../../../views/neo/src/view/MainThreeColumnPanel.mjs';
import * as api      from '../api.mjs';
import checker       from '../checker.mjs';
import MessageStore  from '../data/MessageStore.mjs';
import {imapText, LEVEL_DELEGATED, parseRoutePath, routePath, t} from '../util.mjs';
import * as accountActions from './account/accountActions.mjs';
import * as accountApi from './account/accountApi.mjs';
import {compose}     from './composer/compose.mjs';
import MessagePanel  from './message/MessagePanel.mjs';
import {openMessageWindow} from './message/openMessageWindow.mjs';
import AccountTree   from './AccountTree.mjs';
import FolderPickerDialog from './FolderPickerDialog.mjs';
import PromptDialog  from './PromptDialog.mjs';
import SearchDialog  from './SearchDialog.mjs';

/**
 * Quick search types (ExtJS MessagesGrid search type menu, GO.email.search_type)
 */
const SEARCH_TYPES = [
    ['any',     () => t('Any field')],
    ['from',    () => t('From')],
    ['subject', () => t('Subject')],
    ['to',      () => t('Recipient')],
    ['cc',      () => t('Recipient (CC)')],
    ['body',    () => t('Body')]
];

const dateRenderer = ({value}) => value ? `<span title="${escapeHtml(formatUserDateTime(value * 1000))}">${escapeHtml(smartDateTime(value * 1000))}</span>` : '';

const unseenCls = ({record}) => record?.seen ? null : 'go-email-unseen';

/**
 * Status icons of a message (ExtJS MessagesGrid.renderIcon())
 */
function iconRenderer({record}) {
    const icons = [];

    record.seen || icons.push('<span class="go-email-unseen-dot"></span>');
    record.answered && icons.push(['reply', '']);
    record.forwarded && icons.push(['forward', '']);
    record.has_attachments && icons.push(['attachment', '']);
    record.x_priority && record.x_priority < 3 && icons.push(['priority_high', 'go-email-priority']);
    record.x_priority > 3 && icons.push(['low_priority', '']);
    record.flagged && icons.push(['flag', 'go-email-flag']);

    return icons.map(icon => typeof icon === 'string' ? icon : `<i class="go-icon ${icon[1]}">${icon[0]}</i>`).join('')
}

/**
 * Sender over subject (ExtJS MessagesGrid.renderMessage()); a sender address that differs
 * from the shown name is in the title
 */
function messageRenderer({record}) {
    const title = record.sender ? ` title="${escapeHtml(record.sender)}"` : '';

    return `<div class="go-email-row-from"${title}>${escapeHtml(record.from)}</div>`
        + `<div class="go-email-row-subject">${escapeHtml(record.subject)}</div>`
}

function labelsRenderer({record}) {
    return (record.labels || []).map(label =>
        `<span class="go-email-label" title="${escapeHtml(label.name)}">${escapeHtml(label.name)}</span>`).join('')
}

/**
 * The e-mail module (ExtJS GO.email.EmailClient): accounts and folders | messages | message.
 *
 * Routes (below "#email/"): "<accountId>/<mailbox>[/<uid>]", the mailbox URI encoded.
 */
class EmailMain extends MainThreeColumnPanel {
    static config = {
        className: 'GO.email.EmailMain',
        cls      : ['go-email'],
        stateName: 'email',
        /**
         * Route prefix, set by the shell (GO.view.MainView)
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    /**
     * The open folder
     * @member {Number|null} accountId=null
     */
    accountId = null
    /**
     * @member {String|null} mailbox=null
     */
    mailbox = null
    /**
     * Message to select once the grid has loaded (deep link)
     * @member {Number|null} pendingUid=null
     */
    pendingUid = null
    /**
     * Quick search type, see SEARCH_TYPES
     * @member {String} searchType='any'
     */
    searchType = 'any'
    /**
     * 'current' or 'all' (quick search)
     * @member {String} searchIn='current'
     */
    searchIn = 'current'
    /**
     * @member {String} searchText=''
     */
    searchText = ''
    /**
     * Advanced search: {query, searchIn, values} or null
     * @member {Object|null} advancedSearch=null
     */
    advancedSearch = null
    /**
     * Last known unread counts: "<accountId>:<mailbox>" → count
     * @member {Map<String, Number>} unseenCounts
     */
    unseenCounts = new Map()

    createWest() {
        return {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                items : [{
                    ntype: 'component',
                    tag  : 'h4',
                    cls  : ['go-toolbar-heading'],
                    text : t('E-mail')
                }, '->', {
                    module : Button,
                    icon   : 'refresh',
                    cls    : ['small'],
                    tooltip: coreT('Refresh'),
                    handler: () => this.refresh(true)
                }, {
                    module : Button,
                    icon   : 'manage_accounts',
                    cls    : ['small'],
                    tooltip: t('Accounts'),
                    handler: () => this.openAccounts()
                }, this.hideWestButton()]
            }, {
                module   : AccountTree,
                reference: 'tree',
                flex     : 1,
                cls      : ['go-scroll']
            }, {
                ntype    : 'component',
                reference: 'usage',
                flex     : 'none',
                cls      : ['go-email-usage'],
                hidden   : true,
                text     : ''
            }]
        }
    }

    createCenter() {
        return {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype: 'container',
                flex : 'none',
                cls  : ['go-mstb-host'],
                items: [{
                    module: Toolbar,
                    cls   : ['go-bg-mid', 'go-border-bottom'],
                    items : [this.showWestButton(), {
                        module   : TableTitle,
                        reference: 'tableTitle',
                        title    : t('E-mail')
                    }, '->', {
                        module   : Button,
                        icon     : 'mark_email_unread',
                        reference: 'unreadButton',
                        pressed  : false, // a toggle: neo 14 renders aria-pressed only for a boolean
                        tooltip  : t('Show unread'),
                        handler  : () => this.toggleFilter('unread')
                    }, {
                        module   : Button,
                        icon     : 'flag',
                        reference: 'flaggedButton',
                        pressed  : false, // a toggle: neo 14 renders aria-pressed only for a boolean
                        tooltip  : t('Show flagged'),
                        handler  : () => this.toggleFilter('flagged')
                    }, {
                        module   : SearchButton,
                        reference: 'searchButton',
                        listeners: {search: ({text}) => this.onSearch(text)}
                    }, {
                        module   : Button,
                        icon     : 'tune',
                        reference: 'searchOptionsButton',
                        tooltip  : t('Search options'),
                        handler  : () => this.showSearchMenu()
                    }, {
                        module   : Button,
                        icon     : 'delete',
                        reference: 'deleteButton',
                        tooltip  : coreT('Delete'),
                        disabled : true,
                        handler  : () => this.deleteMessages(this.getSelected())
                    }, {
                        module   : Button,
                        icon     : 'more_vert',
                        reference: 'moreButton',
                        tooltip  : coreT('More options'),
                        handler  : () => this.showMessageMenu(this.getSelected(), this.getReference('moreButton').id)
                    }, {
                        module   : Button,
                        icon     : 'edit',
                        ui       : 'primary',
                        reference: 'composeButton',
                        tooltip  : t('Compose'),
                        handler  : () => this.onCompose()
                    }]
                }, {
                    module   : MultiSelectToolbar,
                    reference: 'multiSelectToolbar',
                    items    : [{
                        module : Button,
                        icon   : 'mark_email_read',
                        tooltip: t('Mark as read'),
                        handler: () => this.setSeen(this.getSelected(), true)
                    }, {
                        module : Button,
                        icon   : 'mark_email_unread',
                        tooltip: t('Mark as unread'),
                        handler: () => this.setSeen(this.getSelected(), false)
                    }, {
                        module : Button,
                        icon   : 'flag',
                        tooltip: t('Add flag'),
                        handler: () => this.setFlagged(this.getSelected(), true)
                    }, {
                        module   : Button,
                        icon     : 'drive_file_move',
                        tooltip  : t('Move email to...'),
                        handler  : () => this.moveMessages(this.getSelected())
                    }, {
                        module   : Button,
                        icon     : 'delete',
                        tooltip  : coreT('Delete'),
                        handler  : () => this.deleteMessages(this.getSelected())
                    }, {
                        module   : Button,
                        icon     : 'more_vert',
                        reference: 'mstbMoreButton',
                        tooltip  : coreT('More options'),
                        handler  : () => this.showMessageMenu(this.getSelected(), this.getReference('mstbMoreButton').id)
                    }]
                }]
            }, {
                module     : Grid,
                reference  : 'grid',
                flex       : 1,
                cls        : ['go-email-grid'],
                multiSelect: true,
                // two lines per message like ExtJS
                rowHeight  : 52,
                // ExtJS MessagesGrid view emptyText: a folder, search or unified view without messages
                emptyText  : coreT('No items to display'),
                emptyIcon  : 'mail',
                store      : {
                    module : MessageStore,
                    sorters: [{property: 'internal_udate', direction: 'DESC'}]
                },
                stateId: 'email-messageGrid',
                columns: [{
                    dataField: 'icons',
                    text     : '',
                    width    : 64,
                    sortable : false,
                    hideable : false,
                    renderer : iconRenderer
                }, {
                    dataField: 'labels',
                    text     : t('Labels'),
                    width    : 100,
                    sortable : false,
                    hidden   : true,
                    renderer : labelsRenderer
                }, {
                    // ExtJS "message" column: sender (recipients in sent items) over the subject
                    dataField: 'from',
                    text     : t('Message'),
                    flex     : 1,
                    hideable : false,
                    cellCls  : ({record}) => ['go-email-message-cell', ...(record?.seen ? [] : ['go-email-unseen'])],
                    renderer : messageRenderer
                }, {
                    dataField: 'subject',
                    text     : t('Subject'),
                    width    : 200,
                    hidden   : true,
                    cellCls  : unseenCls,
                    renderer : ({record}) => escapeHtml(record.subject)
                }, {
                    dataField: 'mailboxname',
                    text     : t('Folder'),
                    width    : 140,
                    sortable : false,
                    hidden   : true,
                    renderer : ({record}) => escapeHtml(record.mailboxname)
                }, {
                    // ExtJS "Date": the arrival time
                    dataField: 'internal_udate',
                    text     : coreT('Date'),
                    width    : 100,
                    cellAlign: 'right',
                    cellCls  : unseenCls,
                    renderer : dateRenderer
                }, {
                    dataField: 'udate',
                    text     : t('Date sent'),
                    width    : 140,
                    cellAlign: 'right',
                    hidden   : true,
                    renderer : dateRenderer
                }, {
                    dataField: 'size',
                    text     : coreT('Size'),
                    width    : 90,
                    cellAlign: 'right',
                    hidden   : true,
                    renderer : ({value}) => escapeHtml(fileSize(value))
                }]
            }]
        }
    }

    createEast() {
        return {
            module   : MessagePanel,
            reference: 'messagePanel'
        }
    }

    /**
     * Open dialogs: closing the module closes them too
     * @member {Set<GO.view.Dialog>} dialogs
     */
    dialogs = new Set()

    destroy(...args) {
        let me = this;

        me.removeCheckListener?.();
        me.dialogs.forEach(dialog => dialog.isDestroyed || dialog.close());
        super.destroy(...args)
    }

    /**
     * @param {GO.view.Dialog} dialog
     * @returns {GO.view.Dialog}
     */
    trackDialog(dialog) {
        this.dialogs.forEach(d => d.isDestroyed && this.dialogs.delete(d));
        this.dialogs.add(dialog);
        return dialog
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            tree  = me.getReference('tree'),
            grid  = me.getReference('grid'),
            store = grid.store,
            panel = me.getReference('messagePanel');

        tree.on({
            nodeSelect: ({node}) => me.onNodeSelect(node),
            menu      : ({node, target}) => me.showNodeMenu(node, target),
            load      : () => me.onTreeLoad(),
            expand    : ({node}) => me.syncTreeSelection(node)
        });
        tree.on('loadError', ({error}) => me.showError(error));

        grid.view.selectionModel.on('selectionChange', me.onSelectionChange, me);
        me.getReference('multiSelectToolbar').setGrid(grid);
        grid.on('rowClick', event => {
            const sm     = grid.view.selectionModel,
                  data   = event.data || {},
                  record = event.record || sm.getRecord(data.path),
                  id     = record && grid.view.getRecordId(record);

            // a click on the shown message again (a phone after "close") shows it
            if (record && !data.ctrlKey && !data.metaKey && !data.shiftKey && sm.selectedRows.length === 1 && sm.isSelectedRow(id)) {
                me.showMessage(record);
                me.activatePanel('east')
            }
        });
        // ExtJS: drafts and sent items open in the composer (task opendraft), other mail in a window
        grid.on('rowDoubleClick', ({record}) => {
            if (!record) {
                return
            }

            const response = grid.store.response;

            (response.drafts || response.sent) && !me.multipleFolders
                ? compose({appName: me.appName, windowId: me.windowId, accountId: record.account_id,
                    loadUrl: 'email/message/openDraft', loadParams: {account_id: record.account_id, mailbox: record.mailbox, uid: record.uid}})
                : me.openInWindow(record)
        });

        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-email-grid'], windowId: me.windowId});
        grid.addDomListeners({contextmenu: me.onGridContextMenu, scope: me});

        me.enableMessageDragDrop();

        store.on('response', ({response}) => me.onStoreResponse(response));
        store.on('load', me.onMessagesLoad, me);
        store.on('loadMore', me.updateCount, me);
        store.on('loadError', ({error}) => me.showError(error));
        grid.body.on('scrollEdge', () => store.loadMore().catch(() => {}));

        panel.getReference('toolbar').insert(0, me.showCenterButton());
        panel.on('load', ({message}) => me.onMessageLoaded(message));

        // the mail check of the module (../checker.mjs, ExtJS GO.checker "email/account/checkUnseen")
        me.removeCheckListener = checker.onStatus(status => me.onMailStatus(status));

        getState('email-search', me.windowId).then(state => {
            if (!me.isDestroyed && state?.searchType && SEARCH_TYPES.some(([type]) => type === state.searchType)) {
                me.searchType = state.searchType
            }
        }).catch(() => {})
    }

    /**
     * Called by the shell for "#email/<path>"
     * @param {String} path
     */
    route(path) {
        let me     = this,
            target = parseRoutePath(path);

        if (!target) {
            // "#email": the folder that is open, else the first INBOX once the tree is there
            me.accountId || me.openDefaultFolder();
            return
        }

        if (target.mailbox === null) {
            me.openDefaultFolder(target.accountId);
            return
        }

        if (target.accountId !== me.accountId || target.mailbox !== me.mailbox) {
            me.openFolder(target.accountId, target.mailbox, {uid: target.uid, fromRoute: true})
        } else if (target.uid) {
            me.showUid(target.uid)
        }
    }

    /**
     * The first account's INBOX (ExtJS opens it at start)
     * @param {Number|null} [accountId]
     */
    openDefaultFolder(accountId=null) {
        let me   = this,
            tree = me.getReference('tree');

        if (!tree.accountIds.length) {
            // onTreeLoad() comes back here
            me.wantDefaultFolder = accountId || true;
            return
        }

        const id = accountId && tree.accountIds.includes(Number(accountId)) ? Number(accountId) : tree.accountIds[0];

        me.openFolder(id, 'INBOX')
    }

    onTreeLoad() {
        let me   = this,
            tree = me.getReference('tree');

        if (me.wantDefaultFolder) {
            const accountId = me.wantDefaultFolder === true ? null : me.wantDefaultFolder;

            me.wantDefaultFolder = null;
            me.openDefaultFolder(accountId)
        }

        me.syncTreeSelection();
        me.updateUsage();
        me.updateTitle();

        // the tree's counts are fresh: remember them
        tree.nodes.forEach(node => node.entity === 'folder' && me.unseenCounts.set(`${node.accountId}:${node.mailbox}`, node.unseen || 0))
    }

    /**
     * Highlights the open folder in the tree
     */
    syncTreeSelection() {
        let me = this;

        me.accountId && me.getReference('tree').selectNode(`f:${me.accountId}:${me.mailbox}`)
    }

    /**
     * The quota of the open account (INBOX node `usage`, HTML)
     */
    updateUsage() {
        let me    = this,
            inbox = me.accountId && me.getReference('tree').getFolderNode(me.accountId, 'INBOX'),
            text  = String(inbox?.data?.usage || '').replace(/<[^>]*>/g, '').trim(),
            usage = me.getReference('usage');

        usage.text   = text;
        usage.hidden = !text
    }

    /**
     * @param {Object} node AccountTree node
     */
    onNodeSelect(node) {
        let me   = this,
            tree = me.getReference('tree');

        if (node.entity === 'account' || node.entity === 'section' || (node.entity === 'folder' && node.data?.noselect)) {
            tree.expandedIds.has(node.id) ? tree.collapse(node.id) : tree.expand(node.id).catch(e => me.showError(e));
            me.syncTreeSelection();
            return
        }

        if (node.entity === 'sectionNode' && !(node.accountId && typeof node.mailbox === 'string')) {
            tree.sections.find(s => s.id === node.sectionId)?.onSelect?.(node, me);
            return
        }

        me.openFolder(node.accountId, node.mailbox);
        // a phone shows the messages
        me.activatePanel('center')
    }

    /**
     * Shows the messages of a folder
     * @param {Number} accountId
     * @param {String} mailbox
     * @param {Object} [opts]
     * @param {Number|null} [opts.uid] message to show once loaded
     * @param {Boolean} [opts.fromRoute]
     * @returns {Promise<void>}
     */
    async openFolder(accountId, mailbox, {uid=null, fromRoute=false}={}) {
        let me    = this,
            grid  = me.getReference('grid'),
            store = grid.store;

        accountId = Number(accountId);

        const changed = accountId !== me.accountId || mailbox !== me.mailbox;

        me.accountId  = accountId;
        me.mailbox    = mailbox;
        me.pendingUid = uid;

        if (changed) {
            me.labels = null;
            grid.view.selectionModel.clear?.();
            me.getReference('messagePanel').reset();
            // no actions on the old folder's rows while (or when failing) to load the new one
            me.permissionLevel = 0;
            store.response     = {};
            store.totalCount   = 0;
            me.clearingStore   = true;
            store.data         = [];
            me.clearingStore   = false;
            me.updateTitle();
            me.updateButtons()
        }

        me.syncTreeSelection();
        me.updateUsage();

        fromRoute || !me.moduleName || Neo.Main.setRoute({value: `${me.moduleName}/${routePath(accountId, mailbox)}`, windowId: me.windowId});

        // a search in another folder is not kept, filters are (ExtJS)
        store.params = {...store.params, account_id: accountId, mailbox};
        me.applySearchParams();

        await store.load().catch(() => {}) // loadError shows it
    }

    updateTitle() {
        let me   = this,
            node = me.accountId && me.getReference('tree').getFolderNode(me.accountId, me.mailbox);

        me.getReference('tableTitle').title = node?.text || me.mailbox || t('E-mail')
    }

    /**
     * Search and filter parameters of the store (no load)
     */
    applySearchParams() {
        let me     = this,
            store  = me.getReference('grid').store,
            params = {...store.params},
            text   = imapText(me.searchText);

        delete params.query;
        delete params.searchIn;

        if (me.advancedSearch) {
            params.query    = me.advancedSearch.query || undefined;
            params.searchIn = me.advancedSearch.searchIn !== 'current' ? me.advancedSearch.searchIn : undefined
        } else if (text) {
            params.query    = me.searchType === 'any' ? `TEXT "${text}"` : `${me.searchType.toUpperCase()} "${text}"`;
            params.searchIn = me.searchIn === 'all' ? 'all' : undefined
        }

        Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
        store.params = params
    }

    onSearch(text) {
        let me = this;

        me.searchText     = text || '';
        me.advancedSearch = null;
        me.applySearchParams();
        me.reload()
    }

    /**
     * ExtJS search type menu: field, current / all folders, advanced
     */
    showSearchMenu() {
        let me    = this,
            check = on => on ? 'radio_button_checked' : 'radio_button_unchecked',
            pick  = (key, value) => {
                me[key] = value;
                key === 'searchType' && setState('email-search', {searchType: value}, me.windowId).catch(() => {});

                if (me.searchText) {
                    me.advancedSearch = null;
                    me.applySearchParams();
                    me.reload()
                }
            };

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : me.getReference('searchOptionsButton').id,
            items   : [
                ...SEARCH_TYPES.map(([type, text]) => ({text: text(), icon: check(me.searchType === type), handler: () => pick('searchType', type)})),
                {separator: true},
                {text: t('Current folder'), icon: check(me.searchIn === 'current'), handler: () => pick('searchIn', 'current')},
                {text: t('All folders'),    icon: check(me.searchIn === 'all'),     handler: () => pick('searchIn', 'all')},
                {separator: true},
                {text: t('Advanced'), icon: 'manage_search', handler: () => me.openAdvancedSearch()},
                ...(me.advancedSearch ? [{text: t('Reset search'), icon: 'search_off', handler: () => me.resetSearch()}] : [])
            ]
        })
    }

    async openAdvancedSearch() {
        let me = this;

        const labels = await me.loadLabels().catch(() => []);

        if (me.isDestroyed) {
            return
        }

        const search = await SearchDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            labels,
            values  : me.advancedSearch?.values || {}
        });

        if (!search || me.isDestroyed) {
            return
        }

        me.advancedSearch = search.query || search.searchIn !== 'current' ? search : null;
        me.applySearchParams();
        me.reload()
    }

    resetSearch() {
        let me = this;

        me.advancedSearch = null;
        me.applySearchParams();
        me.reload()
    }

    /**
     * Show unread / flagged messages only (ExtJS showUnreadButton, "Show flagged")
     * @param {'unread'|'flagged'} name
     */
    toggleFilter(name) {
        let me     = this,
            store  = me.getReference('grid').store,
            on     = !store.params[name],
            button = me.getReference(name + 'Button');

        button.pressed = on;
        store.params   = {...store.params, [name]: on ? 1 : undefined};
        on || delete store.params[name];
        me.reload()
    }

    /**
     * Reloads the messages, keeping what is scrolled into view
     * @param {Object} [extra] parameters of this request (move, delete)
     * @returns {Promise<Object[]|null>}
     */
    reload(extra=null) {
        return this.getReference('grid').store.load({keepCount: true, extra}).catch(() => null)
    }

    /**
     * Reloads the tree (and its counts) and the messages
     * @param {Boolean} [tree] reload the tree too
     */
    refresh(tree=false) {
        let me = this;

        tree && me.getReference('tree').reload().catch(e => me.showError(e));
        me.reload()
    }

    /**
     * @param {Object} response email/message/store without results
     */
    onStoreResponse(response) {
        let me      = this,
            store   = me.getReference('grid').store,
            showsTo = !!(response.sent || response.drafts);

        Object.entries(response.unseen || {}).forEach(([mailbox, count]) => me.setUnseen(me.accountId, mailbox, count));

        if (response.deleteFeedback) {
            notifyError(me, new Error(response.deleteFeedback))
        }

        // sent items and drafts show the recipients in the "from" column (ExtJS)
        if (showsTo !== !!me.showsTo) {
            me.showsTo = showsTo;
            me.setColumnText('from', showsTo ? t('To') : t('Message'))
        }

        // a search over several folders: show the folder column
        if (!!response.multipleFolders !== !!me.multipleFolders) {
            me.multipleFolders = !!response.multipleFolders;
            me.getReference('grid').setColumnHidden('mailboxname', !me.multipleFolders)
        }

        me.permissionLevel = Number(response.permission_level) || 0;
        me.getReference('composeButton').disabled = !store.params.account_id;
        me.updateButtons()
    }

    /**
     * @param {String} dataField
     * @param {String} text
     */
    setColumnText(dataField, text) {
        const grid   = this.getReference('grid'),
              column = grid.allColumns.find(c => c.dataField === dataField);

        if (column && column.text !== text) {
            column.text = text;
            grid.applyColumns()
        }
    }

    onMessagesLoad() {
        let me    = this,
            grid  = me.getReference('grid'),
            store = grid.store,
            panel = me.getReference('messagePanel'),
            uid   = me.pendingUid || (panel.message?.accountId === me.accountId && panel.message?.mailbox === me.mailbox ? panel.message.uid : null);

        if (me.isDestroyed || me.clearingStore) {
            return
        }

        me.updateCount();
        me.updateTitle();

        if (!uid) {
            return
        }

        const record = store.items.find(r => r.uid === Number(uid) && r.mailbox === me.mailbox);

        if (record) {
            me.pendingUid = null;
            selectRow(grid, record.id);
            panel.message?.uid === record.uid || me.showMessage(record)
        } else if (me.pendingUid) {
            // a deep link to a message that is not on the first page
            me.pendingUid = null;
            panel.load({accountId: me.accountId, mailbox: me.mailbox, uid: Number(uid)});
            me.activatePanel('east')
        } else if (!me.multipleFolders) {
            // the shown message is gone (moved, deleted)
            panel.reset()
        }
    }

    updateCount() {
        let me    = this,
            store = me.getReference('grid').store,
            total = store.totalCount || 0;

        me.getReference('tableTitle').subtitle = fmt(t('{count} messages'), {count: total})
    }

    /**
     * Enables the toolbar actions for the selection and permission
     */
    updateButtons() {
        let me       = this,
            selected = me.getSelected();

        me.getReference('deleteButton').disabled = !selected.length || !me.mayChange()
    }

    /**
     * Whether the user may move and delete mail of the open account (ExtJS: not readOnly)
     * @returns {Boolean}
     */
    mayChange() {
        return this.permissionLevel >= LEVEL_CREATE && !this.multipleFolders
    }

    /**
     * @returns {Object[]} selected messages
     */
    getSelected() {
        return this.getReference('grid')?.getSelectedRecords() || []
    }

    onSelectionChange({records}) {
        let me = this;

        me.updateButtons();

        if (records.length !== 1) {
            return
        }

        const record = records[0];

        me.showMessage(record);
        me.activatePanel('east');

        me.moduleName && Neo.Main.setRoute({value: `${me.moduleName}/${routePath(record.account_id, me.mailbox, record.mailbox === me.mailbox ? record.uid : null)}`, windowId: me.windowId})
    }

    /**
     * @param {Object} record
     */
    showMessage(record) {
        this.getReference('messagePanel').load({accountId: record.account_id, mailbox: record.mailbox, uid: record.uid})
    }

    /**
     * Deep link: select the message when it is in the grid, else load it into the view
     * @param {Number} uid
     */
    showUid(uid) {
        let me     = this,
            grid   = me.getReference('grid'),
            record = grid.store.items.find(r => r.uid === Number(uid) && r.mailbox === me.mailbox);

        if (record) {
            selectRow(grid, record.id);
            me.getReference('messagePanel').message?.uid === record.uid || me.showMessage(record)
        } else {
            me.pendingUid = uid;
            grid.store.isLoaded && me.onMessagesLoad()
        }
    }

    /**
     * MessagePanel loaded a message: mark it as read like ExtJS (unless the account says not to)
     * @param {Object} message email/message/view response
     */
    onMessageLoaded(message) {
        let me        = this,
            accountId = Number(message.account_id),
            record    = me.getReference('grid').store.items.find(r => r.account_id === accountId && r.uid === Number(message.uid) && r.mailbox === message.mailbox),
            // a window may show a message of another account than the grid
            level     = Number(me.getReference('tree').getAccountNode(accountId)?.data?.permission_level) || 0;

        if (message.seen || message.do_not_mark_as_read || (record && record.seen)) {
            return
        }

        if (level >= LEVEL_DELEGATED) {
            me.setSeen(record ? [record] : [{uid: Number(message.uid), mailbox: message.mailbox, account_id: accountId}], true, {silent: true, level})
        }
    }

    openInWindow(record) {
        let me     = this,
            dialog = me.trackDialog(openMessageWindow({appName: me.appName, windowId: me.windowId, accountId: record.account_id, mailbox: record.mailbox, uid: record.uid}));

        dialog.getReference('messagePanel')?.on('load', ({message}) => me.onMessageLoaded(message))
    }

    /**
     * Messages per mailbox (a search over several folders mixes them)
     * @param {Object[]} records
     * @returns {Map<String, Object[]>}
     */
    groupByMailbox(records) {
        const groups = new Map();

        records.forEach(record => {
            groups.has(record.mailbox) || groups.set(record.mailbox, []);
            groups.get(record.mailbox).push(record)
        });

        return groups
    }

    /**
     * Mark as read / unread (ExtJS EmailClient: "Seen" needs delegated, "unseen" CREATE)
     * @param {Object[]} records
     * @param {Boolean} seen
     * @param {Object} [opts]
     * @param {Boolean} [opts.silent] no error toast for a missing permission
     * @param {Number} [opts.level] permission level on the messages' account (default: the open one)
     */
    async setSeen(records, seen, {silent=false, level=null}={}) {
        let me = this;

        records = records.filter(r => r.seen !== seen);

        if (!records.length) {
            return
        }

        if ((level ?? me.permissionLevel) < (seen ? LEVEL_DELEGATED : LEVEL_CREATE)) {
            silent || notifyError(me, new Error(coreT("You don't have permission to perform this action")));
            return
        }

        await me.changeFlag(records, 'Seen', !seen, record => record.seen = seen)
    }

    /**
     * @param {Object[]} records
     * @param {Boolean} flagged
     */
    async setFlagged(records, flagged) {
        let me = this;

        records = records.filter(r => r.flagged !== flagged);

        if (!records.length) {
            return
        }

        if (me.permissionLevel < LEVEL_DELEGATED) {
            notifyError(me, new Error(coreT("You don't have permission to perform this action")));
            return
        }

        await me.changeFlag(records, 'Flagged', !flagged, record => record.flagged = flagged)
    }

    /**
     * Adds or removes a label (an IMAP keyword) on messages
     * @param {Object[]} records
     * @param {Object} label {name, flag, color}
     * @param {Boolean} on
     */
    async setLabel(records, label, on) {
        let me = this;

        records = records.filter(r => (r.labels || []).some(l => l.flag === label.flag) !== on);

        if (!records.length) {
            return
        }

        await me.changeFlag(records, label.flag, !on, record => {
            const rest = (record.labels || []).filter(l => l.flag !== label.flag);
            record.labels = on ? [...rest, {name: label.name, color: label.color, flag: label.flag}] : rest
        })
    }

    /**
     * email/message/setFlag per mailbox, then the records and unread counts
     * @param {Object[]} records
     * @param {String} flag
     * @param {Boolean} clear
     * @param {Function} apply changes a record once the server did
     * @protected
     */
    async changeFlag(records, flag, clear, apply) {
        let me = this;

        try {
            for (const [mailbox, group] of me.groupByMailbox(records)) {
                const accountId = group[0].account_id,
                      response  = await api.setFlag(accountId, mailbox, group.map(r => r.uid), flag, clear);

                group.forEach(apply);
                response.unseen !== undefined && me.setUnseen(accountId, mailbox, response.unseen)
            }
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * Moves to the trash, or deletes (in the trash or without one) after asking (ExtJS deleteSelected())
     * @param {Object[]} records
     */
    async deleteMessages(records) {
        let me    = this,
            store = me.getReference('grid').store;

        if (!records.length || !me.mayChange()) {
            return
        }

        if (store.response.deleteConfirm) {
            const confirmed = await ConfirmDialog.ask({
                appName : me.appName,
                windowId: me.windowId,
                message : records.length === 1
                    ? fmt(coreT("Are you sure you want to delete '{item}'?"), {item: escapeHtml(records[0].subject)})
                    : fmt(coreT('Are you sure you want to delete the {count} items?'), {count: records.length})
            });

            if (!confirmed || me.isDestroyed) {
                return
            }
        }

        me.getReference('grid').view.selectionModel.clear?.();
        await me.reload({delete_keys: JSON.stringify(records.map(r => r.uid))});
        me.afterMessagesGone()
    }

    /**
     * Moves messages to a folder picked in a dialog (ExtJS drag to the tree, "Move email to...")
     * @param {Object[]} records
     */
    async moveMessages(records) {
        let me = this;

        if (!records.length || !me.mayChange()) {
            return
        }

        const target = await FolderPickerDialog.ask({appName: me.appName, windowId: me.windowId, title: t('Move email to...')});

        if (!target || me.isDestroyed) {
            return
        }

        await me.moveTo(records, target.accountId, target.mailbox)
    }

    /**
     * @param {Object[]} records messages of the open folder
     * @param {Number} accountId
     * @param {String} mailbox
     */
    async moveTo(records, accountId, mailbox) {
        let me   = this,
            uids = records.map(r => r.uid);

        if (Number(accountId) === me.accountId && mailbox === me.mailbox) {
            return
        }

        me.getReference('grid').view.selectionModel.clear?.();

        if (Number(accountId) === me.accountId) {
            // email/message/store moves before it lists (ExtJS AccountsTree beforenodedrop)
            await me.reload({action: 'move', messages: JSON.stringify(uids), to_mailbox: mailbox});
            me.afterMessagesGone();
            return
        }

        // another account: email/message/move copies in batches (ExtJS progress box); the
        // source is fixed now, the user may open another folder meanwhile
        const fromAccountId = me.accountId,
              fromMailbox   = me.mailbox;

        try {
            let left = uids;

            notify(me, t('Moving...'));

            while (left.length) {
                const response = await api.moveToAccount({
                    from_account_id: fromAccountId,
                    to_account_id  : accountId,
                    from_mailbox   : fromMailbox,
                    to_mailbox     : mailbox,
                    messages       : left,
                    total          : uids.length
                });

                left = response.messages?.length ? response.messages : []
            }
        } catch (e) {
            me.showError(e)
        }

        await me.reload();
        me.afterMessagesGone();
        me.checkUnseen()
    }

    /**
     * ExtJS ddGroup "EmailDD": messages dragged from the grid onto a folder of the tree (or a
     * section node of a folder, e.g. a favourite) move there, with Ctrl / Alt / Cmd they are
     * copied; tree rows: accounts change their order, folders move below another folder
     */
    enableMessageDragDrop() {
        let me   = this,
            grid = me.getReference('grid'),
            tree = me.getReference('tree');

        enableDragDrop(grid, {drag: '.neo-grid-row', group: 'email', onDrop: () => {}})
            .catch(e => console.error('E-mail drag and drop', e));

        enableDragDrop(tree, {
            drag  : '.go-email-drag',
            drop  : '.go-email-drop',
            group : 'email',
            onDrop: event => me.onTreeDrop(event)
        }).catch(e => console.error('E-mail drag and drop', e))
    }

    /**
     * @param {Object} event goDrop of WS/DragDrop
     */
    onTreeDrop(event) {
        let me     = this,
            grid   = me.getReference('grid'),
            tree   = me.getReference('tree'),
            target = tree.getNode(tree.getItemRecordId(event.targetId)),
            source = event.source;

        if (!target || !source) {
            return
        }

        if (source.rootId === tree.id) {
            const dragged = tree.getNode(tree.getItemRecordId(source.itemId));

            dragged && dragged !== target && me.onTreeNodeDrop(dragged, target);
            return
        }

        // data-record-id: the internal id or the key (Body.getRecord() takes both)
        const record   = source.recordId && grid.body.getRecord(source.recordId),
              selected = me.getSelected();

        // messages go to a folder that can hold them (not an account or a "noselect" folder)
        if (!record || !target.mailbox || target.data?.noselect) {
            return
        }

        const records = selected.includes(record) ? selected : [record];

        if (event.copy) {
            me.copyTo(records, target.accountId, target.mailbox)
        } else if (me.mayChange()) {
            me.moveTo(records, target.accountId, target.mailbox)
        }
    }

    /**
     * A tree row dropped on another one (ExtJS AccountsTree nodedrop)
     * @param {Object} dragged account or folder node
     * @param {Object} target account, folder or section node
     */
    onTreeNodeDrop(dragged, target) {
        let me   = this,
            tree = me.getReference('tree');

        if (dragged.entity === 'account') {
            if (target.entity !== 'account') {
                return
            }

            // dragged down: below the target, dragged up: above it
            const ids  = tree.accountIds.filter(id => id !== dragged.accountId),
                  down = tree.accountIds.indexOf(dragged.accountId) < tree.accountIds.indexOf(target.accountId);

            ids.splice(ids.indexOf(target.accountId) + (down ? 1 : 0), 0, dragged.accountId);
            me.saveAccountOrder(ids);
            return
        }

        // a folder below a folder or the root of its own account (email/folder/move)
        if (dragged.entity !== 'folder' || !['account', 'folder'].includes(target.entity) || target.accountId !== dragged.accountId
            || !!target.data?.noinferiors || me.isBelow(target, dragged) || tree.getParentNode(dragged.id)?.id === target.id) {
            return
        }

        me.moveFolderTo(dragged, target.entity === 'account' ? target.data?.mailbox || '' : target.mailbox)
    }

    /**
     * Copies messages to a folder of any account (ExtJS AccountsTree copyDroppedNodes,
     * email/account/copyMailTo)
     * @param {Object[]} records
     * @param {Number} accountId
     * @param {String} mailbox
     */
    async copyTo(records, accountId, mailbox) {
        let me = this;

        try {
            await accountApi.copyMailTo(records.map(r => ({
                accountId  : r.account_id,
                mailboxPath: r.mailbox,
                mailUid    : r.uid,
                seen       : r.seen ?? null
            })), accountId, mailbox);
        } catch (e) {
            me.showError(e);
            return
        }

        if (me.isDestroyed) {
            return
        }

        Number(accountId) === me.accountId && mailbox === me.mailbox && await me.reload();
        me.checkUnseen()
    }

    /**
     * The view and the tree after messages left the folder
     */
    afterMessagesGone() {
        let me    = this,
            panel = me.getReference('messagePanel'),
            store = me.getReference('grid').store;

        if (panel.message && !store.items.some(r => r.uid === panel.message.uid && r.mailbox === panel.message.mailbox)) {
            panel.reset()
        }

        me.updateButtons()
    }

    /**
     * ExtJS GO.email.moveToSpam
     * @param {Object[]} records
     */
    async moveToSpam(records) {
        let me = this;

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : t('Are you sure you want to classify this message as spam?')
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            for (const [mailbox, group] of me.groupByMailbox(records)) {
                await api.moveToSpam(group[0].account_id, mailbox, group.map(r => r.uid))
            }
        } catch (e) {
            me.showError(e)
        }

        await me.reload();
        me.afterMessagesGone();
        me.checkUnseen()
    }

    /**
     * ExtJS GO.email.moveToInbox ("not spam"): from the spam folder to INBOX
     * @param {Object[]} records
     */
    async moveToInbox(records) {
        let me = this;

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : t('Are you sure you want to remove the spam mark and move this message into your inbox?')
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            for (const record of records) {
                await api.moveToInbox(record.account_id, record.uid)
            }
        } catch (e) {
            me.showError(e)
        }

        await me.reload();
        me.afterMessagesGone();
        me.checkUnseen()
    }

    /**
     * Labels of the open account (email/label/store), cached per folder
     * @returns {Promise<Object[]>}
     */
    async loadLabels() {
        let me = this;

        if (!me.labels || me.labels.accountId !== me.accountId) {
            const accountId = me.accountId,
                  list      = await api.labels(accountId);

            me.labels = Object.assign(list, {accountId})
        }

        return me.labels
    }

    onGridContextMenu(data) {
        let me     = this,
            grid   = me.getReference('grid'),
            row    = data.path.find(node => node.cls?.includes('neo-grid-row') && node.data?.recordId),
            record = row && grid.store.get(row.data.recordId);

        if (!record) {
            return
        }

        const selected = grid.getSelectedRecords(),
              records  = selected.includes(record) ? selected : [record];

        // selected without opening it: opening marks it as read
        selected.includes(record) || selectRow(grid, record.id);

        me.showMessageMenu(records, data.path[0]?.id || row.id)
    }

    /**
     * Items other modules add to the ⋮ menu without a selection (ExtJS MessagesGrid
     * settingsMenu, e.g. smime "Public SMIME certificates"): ModuleRegistry key
     * `emailMenuItems`, a function (emailMain) => GO.menu.List items
     * @returns {Object[]}
     * @protected
     */
    extraMenuItems() {
        const items = ModuleRegistry.getConfigs('emailMenuItems').flat().flatMap(fn => {
            try {
                return fn(this) || []
            } catch (e) {
                console.error('emailMenuItems', e);
                return []
            }
        });

        return items.length ? [{separator: true}, ...items] : []
    }

    /**
     * Actions on messages (ExtJS MessageContextMenu, the parts of the message list)
     * @param {Object[]} records
     * @param {String} target DOM id
     */
    async showMessageMenu(records, target) {
        let me         = this,
            generation = me.menuGeneration = (me.menuGeneration || 0) + 1,
            delegated  = me.permissionLevel >= LEVEL_DELEGATED,
            change     = me.mayChange(),
            inSpam     = me.getReference('tree').getFolderNode(me.accountId, me.mailbox)?.special === 'spam',
            labels     = [];

        if (!records.length) {
            MenuList.showAt({appName: me.appName, windowId: me.windowId, target, items: [
                {text: coreT('Refresh'), icon: 'refresh', handler: () => me.refresh(true)},
                {text: t('Accounts'), icon: 'manage_accounts', handler: () => me.openAccounts()},
                ...me.extraMenuItems()
            ]});
            return
        }

        if (delegated) {
            labels = await me.loadLabels().catch(() => []);

            // a newer menu, or the view is gone
            if (me.isDestroyed || generation !== me.menuGeneration) {
                return
            }
        }

        const single = records.length === 1 ? records[0] : null,
              items  = [];

        single && items.push({text: t('Open in new window'), icon: 'open_in_new', handler: () => me.openInWindow(single)}, {separator: true});

        records.some(r => !r.seen) && items.push({text: t('Mark as read'), icon: 'mark_email_read', disabled: !delegated, handler: () => me.setSeen(records, true)});
        records.some(r => r.seen) && items.push({text: t('Mark as unread'), icon: 'mark_email_unread', disabled: me.permissionLevel < LEVEL_CREATE, handler: () => me.setSeen(records, false)});
        records.some(r => !r.flagged) && items.push({text: t('Add flag'), icon: 'flag', disabled: !delegated, handler: () => me.setFlagged(records, true)});
        records.some(r => r.flagged) && items.push({text: t('Remove flag'), icon: 'outlined_flag', disabled: !delegated, handler: () => me.setFlagged(records, false)});

        if (labels.length) {
            items.push({
                text : t('Labels'),
                icon : 'label',
                items: labels.map(label => {
                    const on = records.every(r => (r.labels || []).some(l => l.flag === label.flag));
                    return {text: label.name, icon: on ? 'check_box' : 'check_box_outline_blank', handler: () => me.setLabel(records, label, !on)}
                })
            })
        }

        items.push({separator: true},
            {text: t('Move email to...'), icon: 'drive_file_move', disabled: !change, handler: () => me.moveMessages(records)},
            inSpam
                ? {text: t('Not spam'), icon: 'move_to_inbox', disabled: !change, handler: () => me.moveToInbox(records)}
                : {text: t('Move to spam folder'), icon: 'report', disabled: !change, handler: () => me.moveToSpam(records)},
            {separator: true},
            {text: coreT('Delete'), icon: 'delete', disabled: !change, handler: () => me.deleteMessages(records)});

        MenuList.showAt({appName: me.appName, windowId: me.windowId, target, items})
    }

    /**
     * Row menu of the tree: account (ExtJS AccountContextMenu), folder (MailboxContextMenu)
     * or a node of an extension section
     * @param {Object} node
     * @param {String} target DOM id
     */
    showNodeMenu(node, target) {
        let me    = this,
            tree  = me.getReference('tree'),
            items = node.entity === 'account' ? me.getAccountMenu(node)
                  : node.entity === 'folder' ? me.getFolderMenu(node)
                  : tree.sections.find(s => s.id === node.sectionId)?.rowMenu?.(node, me) || [];

        tree.showMenu(items, target)
    }

    /**
     * @param {Object} node account node
     * @returns {Object[]}
     */
    getAccountMenu(node) {
        let me    = this,
            tree  = me.getReference('tree'),
            level = Number(node.data?.permission_level) || 0,
            index = tree.accountIds.indexOf(node.accountId);

        return [{
            text    : t('Add folder'),
            icon    : 'create_new_folder',
            disabled: level < LEVEL_CREATE || !!node.data?.noinferiors,
            // the account's root (mbroot, e.g. "INBOX" on servers with folders below INBOX)
            handler : () => me.createFolder(node.accountId, node.data?.mailbox || '', node)
        }, {
            text    : t('Subscribe to folders'),
            icon    : 'checklist',
            disabled: level < LEVEL_CREATE,
            handler : () => me.afterDialog(accountActions.openFoldersDialog(me, node.accountId))
        }, {
            text   : coreT('Refresh'),
            icon   : 'refresh',
            handler: () => me.refresh(true)
        }, {separator: true}, {
            text    : t('Move up'),
            icon    : 'arrow_upward',
            disabled: index < 1,
            handler : () => me.moveAccount(node.accountId, -1)
        }, {
            text    : t('Move down'),
            icon    : 'arrow_downward',
            disabled: index < 0 || index >= tree.accountIds.length - 1,
            handler : () => me.moveAccount(node.accountId, 1)
        }, {separator: true}, {
            text    : coreT('Properties'),
            icon    : 'settings',
            disabled: level < LEVEL_MANAGE,
            handler : () => me.afterDialog(accountActions.openAccountDialog(me, node.accountId))
        }]
    }

    /**
     * @param {Object} node folder node
     * @returns {Object[]}
     */
    getFolderMenu(node) {
        let me      = this,
            tree    = me.getReference('tree'),
            level   = Number(node.data?.permission_level) || 0,
            change  = level >= LEVEL_CREATE,
            special = !!node.special,
            inbox   = tree.getFolderNode(node.accountId, 'INBOX'),
            items   = [{
                text    : t('Add folder'),
                icon    : 'create_new_folder',
                disabled: !change || !!node.data?.noinferiors,
                handler : () => me.createFolder(node.accountId, node.mailbox, node)
            }, {
                text    : t('Rename folder'),
                icon    : 'edit',
                disabled: !change || node.mailbox === 'INBOX',
                handler : () => me.renameFolder(node)
            }, {
                text    : t('Move folder'),
                icon    : 'drive_file_move',
                disabled: !change || special,
                handler : () => me.moveFolder(node)
            }, {separator: true}, {
                text    : t('Mark as read'),
                icon    : 'mark_email_read',
                disabled: level < LEVEL_DELEGATED || !!node.data?.noselect,
                handler : () => me.markFolderRead(node)
            }, {
                text    : t('Move old mails'),
                icon    : 'auto_delete',
                disabled: !change || !!node.data?.noselect,
                handler : () => me.afterDialog(accountActions.openMoveOldMailDialog(me, node.accountId, node.mailbox))
            }, {
                text    : t('Empty folder'),
                icon    : 'delete_sweep',
                disabled: !change || !!node.data?.noselect,
                handler : () => me.emptyFolder(node)
            }, {
                text    : coreT('Delete'),
                icon    : 'delete',
                disabled: !change || special,
                handler : () => me.deleteFolder(node)
            }, {separator: true}];

        // IMAP ACL ("Share"): when the server supports it, for managers (ExtJS hasAcl())
        inbox?.data?.acl_supported && level >= LEVEL_MANAGE && items.push({
            text   : t('Share'),
            icon   : 'share',
            handler: () => me.afterDialog(accountActions.openImapAclDialog(me, node.accountId, node.mailbox))
        });

        items.push({
            text    : t('Subscribe to folders'),
            icon    : 'checklist',
            disabled: !change,
            handler : () => me.afterDialog(accountActions.openFoldersDialog(me, node.accountId))
        }, {separator: true}, {
            text    : coreT('Properties'),
            icon    : 'settings',
            disabled: !change,
            handler : () => me.afterDialog(accountActions.openFolderDialog(me, node.accountId, node.mailbox))
        });

        // extension point: e.g. emailfavorites "Add to favorites"
        const extra = tree.sections.flatMap(section => section.folderMenuItems?.(node, me) || []);
        extra.length && items.push({separator: true}, ...extra);

        return items
    }

    /**
     * Reloads the tree when a dialog saved something
     * @param {Promise<Boolean>} promise
     */
    async afterDialog(promise) {
        const saved = await promise.catch(e => {
            this.showError(e);
            return false
        });

        saved && !this.isDestroyed && this.refresh(true)
    }

    openAccounts() {
        this.afterDialog(accountActions.openAccountsDialog(this))
    }

    /**
     * @param {Number} accountId
     * @param {String} parent mailbox, '' for the top level
     * @param {Object} node the node to expand afterwards
     */
    async createFolder(accountId, parent, node) {
        let me = this;

        const name = await PromptDialog.ask({appName: me.appName, windowId: me.windowId, title: t('Add folder'), labelText: t('Enter the folder name:')});

        if (!name || me.isDestroyed) {
            return
        }

        try {
            await api.createFolder(accountId, parent, name);
            await me.reloadTree();
            me.getReference('tree').expand(node.id).catch(() => {})
        } catch (e) {
            me.showError(e);
            me.reloadTree()
        }
    }

    async renameFolder(node) {
        let me = this;

        const name = await PromptDialog.ask({appName: me.appName, windowId: me.windowId, title: t('Rename folder'), labelText: t('Enter the folder name:'), value: node.data?.name || node.text});

        if (!name || me.isDestroyed || name === node.text) {
            return
        }

        try {
            await api.renameFolder(node.accountId, node.mailbox, name);

            // the open folder (or one below it) has a new name: open the INBOX
            me.isOpenFolderIn(node) && (me.accountId = null)

            await me.reloadTree();
            me.accountId || me.openDefaultFolder(node.accountId)
        } catch (e) {
            me.showError(e);
            me.reloadTree()
        }
    }

    async moveFolder(node) {
        let me = this;

        const target = await FolderPickerDialog.ask({
            appName  : me.appName,
            windowId : me.windowId,
            title    : t('Move folder'),
            accountId: node.accountId,
            allowRoot: true,
            exclude  : node.mailbox
        });

        if (!target || me.isDestroyed) {
            return
        }

        await me.moveFolderTo(node, target.mailbox)
    }

    /**
     * @param {Object} node folder node
     * @param {String} targetMailbox the new parent, the account's root folder for the top level
     */
    async moveFolderTo(node, targetMailbox) {
        let me = this;

        try {
            await api.moveFolder(node.accountId, node.mailbox, targetMailbox);

            me.isOpenFolderIn(node) && (me.accountId = null);

            await me.reloadTree();
            me.accountId || me.openDefaultFolder(node.accountId)
        } catch (e) {
            me.showError(e);
            me.reloadTree()
        }
    }

    async markFolderRead(node) {
        let me = this;

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : fmt(t("Are you sure you want to mark all messages in folder '{name}' as read?"), {name: escapeHtml(node.text)})
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            await api.markFolderRead(node.accountId, node.mailbox);
            me.setUnseen(node.accountId, node.mailbox, 0);

            if (me.accountId === node.accountId && me.mailbox === node.mailbox) {
                me.reload()
            }
        } catch (e) {
            me.showError(e)
        }
    }

    async emptyFolder(node) {
        let me = this;

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : fmt(t("Are you sure you want to EMPTY '{name}'?"), {name: escapeHtml(node.text)})
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            await api.truncateFolder(node.accountId, node.mailbox);
            me.setUnseen(node.accountId, node.mailbox, 0);

            if (me.accountId === node.accountId && me.mailbox === node.mailbox) {
                me.getReference('messagePanel').reset();
                me.reload()
            }

            // the trash got the messages
            me.reloadTree()
        } catch (e) {
            me.showError(e)
        }
    }

    async deleteFolder(node) {
        let me    = this,
            tree  = me.getReference('tree'),
            trash = tree.getFolderNodes(node.accountId).find(n => n.special === 'trash'),
            // the trash can't have subfolders: the folder is deleted, not moved there (ExtJS)
            trashable = !trash?.data?.noinferiors,
            inTrash   = !!trash && me.isBelow(node, trash);

        if (!trashable || inTrash || !trash) {
            const confirmed = await ConfirmDialog.ask({
                appName : me.appName,
                windowId: me.windowId,
                message : fmt(coreT("Are you sure you want to delete '{item}'?"), {item: escapeHtml(node.text)})
            });

            if (!confirmed || me.isDestroyed) {
                return
            }
        }

        try {
            await api.deleteFolder(node.accountId, node.mailbox, trashable);

            me.isOpenFolderIn(node) && (me.accountId = null)

            await me.reloadTree();
            me.accountId || me.openDefaultFolder(node.accountId)
        } catch (e) {
            me.showError(e);
            me.reloadTree()
        }
    }

    /**
     * Whether `node` is `ancestor` or below it in the tree
     * @param {Object} node
     * @param {Object} ancestor
     * @returns {Boolean}
     */
    isBelow(node, ancestor) {
        const tree = this.getReference('tree');

        for (let current = node; current; current = tree.getParentNode(current.id)) {
            if (current.id === ancestor.id) {
                return true
            }
        }

        return false
    }

    /**
     * Whether the open folder is `node` or below it
     * @param {Object} node folder node
     * @returns {Boolean}
     */
    isOpenFolderIn(node) {
        let me   = this,
            open = me.accountId && me.getReference('tree').getFolderNode(me.accountId, me.mailbox);

        return me.accountId === node.accountId && (me.mailbox === node.mailbox || (!!open && me.isBelow(open, node)))
    }

    /**
     * Account order of this user (ExtJS: drag accounts in the tree, email/account/saveSort)
     * @param {Number} accountId
     * @param {Number} step -1 up, 1 down
     */
    async moveAccount(accountId, step) {
        let me    = this,
            ids   = [...me.getReference('tree').accountIds],
            index = ids.indexOf(accountId),
            to    = index + step;

        if (index < 0 || to < 0 || to >= ids.length) {
            return
        }

        ids.splice(index, 1);
        ids.splice(to, 0, accountId);

        await me.saveAccountOrder(ids)
    }

    /**
     * @param {Number[]} ids all account ids, first = top
     */
    async saveAccountOrder(ids) {
        let me = this;

        try {
            await api.saveSort(ids);
            await me.reloadTree()
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * @returns {Promise<void>}
     */
    reloadTree() {
        return this.getReference('tree').reload().catch(e => this.showError(e))
    }

    /**
     * Unread count of a folder: tree and, when it is the open folder and grew, the grid
     * @param {Number} accountId
     * @param {String} mailbox
     * @param {Number} unseen
     */
    setUnseen(accountId, mailbox, unseen) {
        let me  = this,
            key = `${accountId}:${mailbox}`;

        unseen = Number(unseen) || 0;
        me.unseenCounts.set(key, unseen);
        me.getReference('tree').setUnseen(accountId, mailbox, unseen);
        // the module's badge
        checker.setUnseen(accountId, mailbox, unseen)
    }

    /**
     * Checks the mail now (../checker.mjs), e.g. after flags changed: the folder counts and
     * the module's badge follow
     * @returns {Promise<Object|null>}
     */
    checkUnseen() {
        return checker.check()
    }

    /**
     * ExtJS GO.checker email/account/checkUnseen: counts of the checked folders; new mail
     * in the open folder reloads the grid (the notification comes from ../checker.mjs)
     * @param {Object} status email_status {total_unseen, has_new, unseen: [{account_id, mailbox, unseen}]}
     */
    onMailStatus(status) {
        let me         = this,
            reloadGrid = false;

        if (me.isDestroyed) {
            return
        }

        (status.unseen || []).forEach(({account_id, mailbox, unseen}) => {
            const key = `${account_id}:${mailbox}`,
                  old = me.unseenCounts.get(key);

            if (old !== undefined && old !== Number(unseen) && Number(account_id) === me.accountId && mailbox === me.mailbox) {
                reloadGrid = true
            }

            me.setUnseen(account_id, mailbox, unseen)
        });

        reloadGrid && me.reload()
    }

    onCompose() {
        compose({appName: this.appName, windowId: this.windowId, accountId: this.accountId})
    }

    /**
     * Header "+" menu (GO.view.MainView)
     */
    onQuickAdd() {
        this.onCompose()
    }

    showError(error) {
        notifyError(this, error)
    }
}

export default Neo.setupClass(EmailMain);
