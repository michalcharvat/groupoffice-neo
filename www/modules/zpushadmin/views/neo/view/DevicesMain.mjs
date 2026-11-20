import Container       from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Store           from '../../../../../views/neo/node_modules/neo.mjs/src/data/Store.mjs';
import Toolbar         from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button          from '../../../../../views/neo/src/button/Button.mjs';
import SearchButton    from '../../../../../views/neo/src/button/SearchButton.mjs';
import DescriptionList from '../../../../../views/neo/src/component/DescriptionList.mjs';
import Splitter        from '../../../../../views/neo/src/component/Splitter.mjs';
import Grid            from '../../../../../views/neo/src/grid/Grid.mjs';
import client          from '../../../../../views/neo/src/jmap/Client.mjs';
import {notify, notifyError} from '../../../../../views/neo/src/Notify.mjs';
import ConfirmDialog   from '../../../../../views/neo/src/view/ConfirmDialog.mjs';
import {decodeEntities, escapeHtml} from '../../../../../views/neo/src/Format.mjs';
import {fmt, t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';
import DeviceDialog    from './DeviceDialog.mjs';

const t = translator('legacy', 'zpushadmin');

const text = ({value}) => escapeHtml(value ?? '');

/**
 * Status of a device as the grid shows it (DevicesGrid "Status")
 * @param {Object} record
 * @returns {String} HTML
 */
function status(record) {
    const [cls, label] = record.new ? ['new', t('New')] : record.can_connect ? ['enabled', t('Enabled')] : ['disabled', t('Disabled')];
    return `<span class="go-zpa-status go-zpa-${cls}">${escapeHtml(label)}</span>`
}

/**
 * deviceErrors is nl2br() of the raw Z-Push text (DeviceController::afterDisplay()): back to plain text
 * @param {String|null} value
 * @returns {String}
 */
function brToText(value) {
    return String(value ?? '').replace(/<br\s*\/?>/gi, '')
}

/**
 * The store and display actions send formatted attributes (HTML entities): plain text
 * @param {Object} data
 * @returns {Object}
 */
function decodeRecord(data) {
    return Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, typeof value === 'string' && key !== 'deviceErrors' ? decodeEntities(value) : value]))
}

/**
 * ActiveSync management (GO.zpushadmin.MainPanel, administrators): the devices that
 * synchronize with Z-Push (zpushadmin/device/store) with search and delete, the selected
 * device's details from Z-Push in the east (zpushadmin/device/display), edit (may connect,
 * comment) and resync (zpushadmin/admin/resyncDevice).
 */
class DevicesMain extends Container {
    static config = {
        className : 'GO.zpushadmin.view.DevicesMain',
        baseCls   : ['go-zpushadmin', 'neo-container'],
        layout    : {ntype: 'hbox', align: 'stretch'},
        /**
         * Route prefix, set by the shell
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    /**
     * Search text
     * @member {String} query=''
     */
    query = ''

    /**
     * zpushadmin/device/display data of the shown device
     * @member {Object|null} device=null
     */
    device = null

    /**
     * Number of the last load(): an older response doesn't replace a newer one
     * @member {Number} loadCounter=0
     */
    loadCounter = 0

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype : 'container',
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                cls   : ['go-bg-mid', 'go-border-bottom'],
                items : [{
                    ntype: 'component',
                    cls  : ['go-zpa-title'],
                    text : t('ActiveSync management')
                }, '->', {
                    module   : Button,
                    reference: 'deleteButton',
                    icon     : 'delete',
                    tooltip  : coreT('Delete'),
                    disabled : true,
                    handler  : () => me.deleteSelected()
                }, {
                    module   : SearchButton,
                    listeners: {search: ({text}) => me.search(text || '')}
                }, {
                    module : Button,
                    icon   : 'refresh',
                    tooltip: coreT('Refresh'),
                    handler: () => me.load()
                }]
            }, {
                module     : Grid,
                reference  : 'grid',
                flex       : 1,
                multiSelect: true,
                stateId    : 'zpushadmin-devices',
                store      : {
                    module     : Store,
                    keyProperty: 'id',
                    sorters    : [{property: 'mtime', direction: 'DESC'}],
                    model      : {fields: ['id', 'device_id', 'device_type', 'remote_addr', 'can_connect', 'ctime', 'mtime',
                        'new', 'username', 'comment', 'as_version'].map(name => ({name}))}
                },
                columns: [
                    {dataField: 'can_connect', text: coreT('Status'), width: 100, renderer: ({record}) => status(record)},
                    {dataField: 'username', text: coreT('User'), width: 160, renderer: text},
                    {dataField: 'device_id', text: t('Device ID'), width: 200, renderer: text},
                    {dataField: 'device_type', text: t('Device Type'), width: 140, renderer: text},
                    {dataField: 'as_version', text: t('Activesync version'), width: 120, renderer: text},
                    {dataField: 'remote_addr', text: t('Ip-Address'), width: 130, renderer: text},
                    {dataField: 'ctime', text: t('First synchronisation attempt'), width: 160, renderer: text},
                    {dataField: 'mtime', text: t('Last synchronisation attempt'), width: 160, renderer: text},
                    {dataField: 'comment', text: coreT('Comments'), flex: 1, renderer: text}
                ]
            }]
        }, {
            module : Splitter,
            stateId: 'zpushadmin-east-splitter'
        }, {
            ntype    : 'container',
            reference: 'east',
            cls      : ['go-zpa-detail'],
            flex     : 'none',
            width    : '40rem',
            minWidth : '20rem',
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : [{
                module: Toolbar,
                flex  : 'none',
                cls   : ['go-bg-mid', 'go-border-bottom'],
                items : ['->', {
                    module   : Button,
                    reference: 'resyncButton',
                    icon     : 'sync',
                    text     : t('Resync'),
                    disabled : true,
                    handler  : () => me.resync()
                }, {
                    module   : Button,
                    reference: 'editButton',
                    icon     : 'edit',
                    tooltip  : coreT('Edit'),
                    disabled : true,
                    handler  : () => me.edit(me.device?.id)
                }, {
                    module   : Button,
                    reference: 'reloadButton',
                    icon     : 'refresh',
                    tooltip  : coreT('Refresh'),
                    disabled : true,
                    handler  : () => me.showDevice(me.device?.id)
                }]
            }, {
                ntype    : 'component',
                reference: 'empty',
                cls      : ['go-empty'],
                flex     : 1,
                text     : coreT('No items to display')
            }, {
                ntype    : 'container',
                reference: 'details',
                cls      : ['go-zpa-details'],
                flex     : 1,
                hidden   : true,
                layout   : {ntype: 'vbox', align: 'stretch'},
                items    : [{
                    ntype    : 'component',
                    tag      : 'h3',
                    reference: 'heading',
                    flex     : 'none'
                }, {
                    module   : DescriptionList,
                    reference: 'list',
                    flex     : 'none'
                }]
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            grid = me.getReference('grid');

        grid.view.selectionModel.on('selectionChange', () => me.onSelectionChange());
        grid.on('rowDoubleClick', ({record}) => record && me.edit(record.id));

        me.load()
    }

    /**
     * Loads all devices (a server has few): the grid sorts them itself
     * @returns {Promise<void>}
     */
    async load() {
        let me      = this,
            counter = ++me.loadCounter;

        try {
            // limit 0: all devices (the store's default is the user's max_rows_list)
            const {results = []} = await client.legacy('zpushadmin/device/store', {limit: 0, ...me.query ? {query: me.query} : {}});

            if (!me.isDestroyed && counter === me.loadCounter) {
                const {store} = me.getReference('grid');

                store.data = results.map(decodeRecord);
                // neo fires no load for empty data (the old rows and the empty text would not follow)
                results.length || store.fire('load', {items: store.items});
                me.onSelectionChange()
            }
        } catch (e) {
            me.isDestroyed || counter !== me.loadCounter || notifyError(me, e)
        }
    }

    /**
     * @param {String} query
     */
    search(query) {
        this.query = query;
        this.load()
    }

    /**
     * @returns {Object[]} selected records
     */
    getSelected() {
        return this.getReference('grid').getSelectedRecords()
    }

    onSelectionChange() {
        let me       = this,
            selected = me.getSelected();

        me.getReference('deleteButton').disabled = !selected.length;

        const id = selected.length === 1 ? selected[0].id : null;
        String(id) !== String(me.device?.id) && me.showDevice(id)
    }

    /**
     * The device's details from Z-Push in the east panel
     * @param {String|Number|null} id
     */
    async showDevice(id) {
        let me = this;

        me.device = id ? {id} : null;
        me.setDetailsShown(false);

        if (!id) {
            return
        }

        try {
            const data = decodeRecord((await client.legacy('zpushadmin/device/display', {id})).data);

            if (me.isDestroyed || String(me.device?.id) !== String(id)) {
                return
            }

            me.device = data;
            me.getReference('heading').text = t('Device') + ': ' + (data.device_id || '');
            me.getReference('list').records = [
                [t('Name'), data.deviceName],
                [t('Device Type'), data.device_type],
                [t('Model'), data.deviceModel],
                [t('Imei'), data.deviceImei],
                [t('Operating system'), data.deviceOS],
                [t('Language'), data.deviceOSLanguage],
                [t('Operator'), data.deviceOperator],
                [t('Phone number'), data.devicePhoneNumber],
                [t('Ip-Address'), data.remote_addr],
                [t('Activesync version'), data.deviceASVersion || data.as_version],
                [coreT('Comments'), data.comment],
                [t('Errors'), {vdom: {tag: 'pre', cls: ['go-zpa-errors'], text: brToText(data.deviceErrors)}}]
            ].filter(([, value]) => !(value?.vdom && !value.vdom.text));
            me.setDetailsShown(true)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {Boolean} shown
     * @protected
     */
    setDetailsShown(shown) {
        let me = this;

        me.getReference('details').hidden = !shown;
        me.getReference('empty').hidden   = shown;

        ['resyncButton', 'editButton', 'reloadButton'].forEach(ref => me.getReference(ref).disabled = !shown)
    }

    /**
     * @param {String|Number} id
     */
    async edit(id) {
        let me = this;

        if (!id) {
            return
        }

        try {
            const dialog = await DeviceDialog.open({appName: me.appName, windowId: me.windowId, id});

            dialog.on('save', async () => {
                await me.load();
                me.isDestroyed || me.showDevice(id)
            })
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * Z-Push sends all data to the device again
     */
    async resync() {
        let me     = this,
            device = me.device;

        if (!device?.device_id) {
            return
        }

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Resync Device'),
            message : t('Do you really want to resynchronize ALL data on the device?')
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            await client.legacy('zpushadmin/admin/resyncDevice', {deviceId: device.device_id, username: device.username});
            notify(me, t('Resync Device') + ': ' + device.device_id)
        } catch (e) {
            notifyError(me, e)
        }
    }

    async deleteSelected() {
        let me       = this,
            selected = me.getSelected();

        if (!selected.length) {
            return
        }

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : coreT('Confirm delete'),
            message : selected.length === 1
                ? fmt(coreT("Are you sure you want to delete '{item}'?"), {item: selected[0].device_id})
                : fmt(coreT('Are you sure you want to delete the {count} selected items?'), {count: selected.length})
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            // GO.grid.GridPanel deleteSelected(): the store deletes before it lists
            await client.legacy('zpushadmin/device/store', {delete_keys: JSON.stringify(selected.map(r => r.id)), limit: 1});
            me.load()
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(DevicesMain);
