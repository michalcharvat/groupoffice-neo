import Toolbar      from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_CREATE, LEVEL_DELETE, LEVEL_MANAGE, LEVEL_READ, LEVEL_WRITE} from '../Acl.mjs';
import Button       from '../button/Button.mjs';
import GroupCombo   from '../form/field/GroupCombo.mjs';
import LocalCombo   from '../form/field/LocalCombo.mjs';
import Grid         from '../grid/Grid.mjs';
import client       from '../jmap/Client.mjs';
import TextList     from '../list/TextList.mjs';
import {escapeHtml} from '../Format.mjs';
import {notifyError} from '../Notify.mjs';
import {moduleTitle} from '../systemsettings/moduleTitles.mjs';
import {t}          from '../Translate.mjs';
import Dialog, {headerTools} from '../view/Dialog.mjs';

/** Acl/overview returns at most this many rows, without names when it hits it */
const MAX_ROWS = 2000;

/** owner type filter buttons: [Acl/overview "type", label] */
const TYPES = () => [['both', t('All')], ['users', t('Users')], ['groups', t('Groups')]];

/** level → label of go.permissions.AclOverviewGrid */
const LEVELS = () => ({
    [LEVEL_READ]  : t('Read only'),
    [LEVEL_CREATE]: t('Read and Create only'),
    [LEVEL_WRITE] : t('Write'),
    [LEVEL_DELETE]: t('Write and delete'),
    [LEVEL_MANAGE]: t('Manage')
});

const ROW_MODEL = {
    keyProperty: 'key',
    fields     : [
        {name: 'key', type: 'String'},
        {name: 'username', type: 'String'},
        {name: 'userGroup'},
        {name: 'module', type: 'String'},
        {name: 'type', type: 'String'},
        {name: 'entityId', type: 'Int'},
        {name: 'name'},
        {name: 'level', type: 'Int'}
    ]
};

/**
 * "Permissions overview" of the Users card in System settings (ExtJS
 * go.permissions.AclOverviewGrid in a go.Window): which user or group has which level on
 * which item, from Acl/overview (admins only, at most 2000 rows). Filters: group, module
 * and users / groups.
 *
 *     AclOverviewDialog.show({appName, windowId})
 */
class AclOverviewDialog extends Dialog {
    static config = {
        className   : 'GO.permissions.AclOverviewDialog',
        cls         : ['go-acloverview-dialog'],
        modal       : true,
        resizable   : true,
        headerConfig: headerTools('maximize', 'close'),
        title       : '',
        wrapperStyle: {
            height   : '600px',
            left     : 'max(0px, calc(50vw - 500px))',
            maxHeight: '90vh',
            maxWidth : '100vw',
            top      : 'max(5vh, calc(50vh - 300px))',
            width    : '1000px'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    /**
     * Acl/overview filter: groupId, moduleId, type
     * @member {Object} filter={type: 'both'}
     */
    filter = {type: 'both'}

    /**
     * @member {Number} loadCounter=0
     */
    loadCounter = 0

    construct(config) {
        super.construct(config);

        let me     = this,
            levels = LEVELS();

        me.title = t('Permissions overview');
        me.items = [{
            module: Toolbar,
            cls   : ['go-acloverview-tbar'],
            flex  : 'none',
            items : [{
                module       : GroupCombo,
                reference    : 'group',
                labelPosition: 'inline',
                width        : 240,
                listeners    : {change: ({value}) => me.setFilter({groupId: value?.id ?? undefined})}
            }, {
                module       : LocalCombo,
                reference    : 'module',
                labelText    : t('Module'),
                labelPosition: 'inline',
                width        : 240,
                displayField : 'name',
                valueField   : 'id',
                editable     : false,
                listConfig   : {module: TextList},
                store        : {keyProperty: 'id', data: []},
                listeners    : {change: ({value}) => me.setFilter({moduleId: value?.id ?? undefined})}
            }, {
                ntype : 'container',
                cls   : ['go-segments'],
                flex  : 'none',
                layout: {ntype: 'hbox'},
                items : TYPES().map(([value, text]) => ({
                    module   : Button,
                    reference: 'type-' + value,
                    cls      : ['go-segment'],
                    pressed  : value === 'both',
                    text,
                    handler  : () => me.setType(value)
                }))
            }, '->', {
                ntype    : 'component',
                reference: 'limitHint',
                cls      : ['go-acloverview-hint'],
                hidden   : true,
                text     : t('2000-row limit reached: use the filters to show the names')
            }]
        }, {
            module   : Grid,
            reference: 'grid',
            flex     : 1,
            stateId  : 'acl-overview-grid',
            store    : {model: ROW_MODEL, keyProperty: 'key', data: []},
            columns  : [{
                dataField: 'username',
                text     : t('User') + ' / ' + t('Group'),
                flex     : 1,
                hideable : false,
                renderer : ({record, value}) =>
                    `<i class="go-icon">${record.userGroup ? 'person' : 'group'}</i> ${escapeHtml(value)}`
            }, {
                dataField: 'module',
                text     : t('Module'),
                width    : 160,
                renderer : ({value}) => escapeHtml(me.moduleTitle(value))
            }, {
                dataField: 'type',
                text     : t('Type'),
                width    : 160,
                renderer : ({value}) => escapeHtml(value)
            }, {
                dataField: 'entityId',
                text     : t('Item ID'),
                width    : 90,
                cellAlign: 'right',
                renderer : ({value}) => escapeHtml(value)
            }, {
                dataField: 'name',
                text     : t('Name'),
                width    : 240,
                renderer : ({value}) => escapeHtml(value ?? '')
            }, {
                dataField: 'level',
                text     : t('Level'),
                width    : 160,
                renderer : ({value}) => escapeHtml(levels[value] ?? value)
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.loadModules();
        me.load()
    }

    /**
     * Module name → module, for the translated titles
     * @member {Object} modules={}
     */
    modules = {}

    /**
     * The module's translated name, like ExtJS t('name', module)
     * @param {String} name
     * @returns {String}
     */
    moduleTitle(name) {
        const module = this.modules[name];
        return module ? moduleTitle(module) : name
    }

    /**
     * Enabled modules for the module filter (ExtJS: the Module entity store)
     */
    async loadModules() {
        let me = this;

        try {
            const {list} = await client.call('Module/get', {properties: ['id', 'package', 'name', 'enabled']});

            if (me.isDestroyed) {
                return
            }

            const modules = list.filter(m => m.enabled);

            modules.forEach(m => {me.modules[m.name] = m});

            me.getReference('module').store.data = modules
                .map(m => ({id: m.id, name: moduleTitle(m)}))
                .sort((a, b) => a.name.localeCompare(b.name));

            // names in the rows that arrived before the modules
            me.getReference('grid').body?.createViewData()
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {Object} values groupId, moduleId, type; undefined removes one
     */
    setFilter(values) {
        let me = this;

        me.filter = {...me.filter, ...values};
        Object.keys(me.filter).forEach(key => me.filter[key] === undefined && delete me.filter[key]);
        me.load()
    }

    /**
     * @param {String} type both, users, groups
     */
    setType(type) {
        let me = this;

        TYPES().forEach(([value]) => {me.getReference('type-' + value).pressed = value === type});
        me.setFilter({type})
    }

    async load() {
        let me      = this,
            counter = ++me.loadCounter,
            grid    = me.getReference('grid');

        grid.isLoading = t('Loading...');

        try {
            const {list = []} = await client.call('Acl/overview', {filter: me.filter});

            if (me.isDestroyed || counter !== me.loadCounter) {
                return
            }

            grid.store.data = list.map((row, i) => ({...row, key: String(i)}));
            me.getReference('limitHint').hidden = list.length < MAX_ROWS
        } catch (e) {
            if (!me.isDestroyed && counter === me.loadCounter) {
                // no rows of the previous filter under the new one
                grid.store.data = [];
                notifyError(me, e)
            }
        } finally {
            me.isDestroyed || counter !== me.loadCounter || (grid.isLoading = false)
        }
    }

    /**
     * @param {Object} config appName, windowId
     * @returns {GO.permissions.AclOverviewDialog}
     */
    static show(config) {
        return Neo.create(AclOverviewDialog, config)
    }
}

export default Neo.setupClass(AclOverviewDialog);
