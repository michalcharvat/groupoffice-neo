import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import client        from '../jmap/Client.mjs';
import {notifyError} from '../Notify.mjs';
import {fmt, t}      from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';
import ModuleRightsDialog from './ModuleRightsDialog.mjs';
import ModuleTiles   from './ModuleTiles.mjs';

/** filter buttons: [isInstalled param, label] */
const FILTERS = () => [[null, t('All')], ['true', t('Installed')], ['false', t('Available')]];

/** core rights the "System permissions" button edits (go.modules.SystemSettingsModuleGrid) */
const CORE_RIGHTS = ['mayChangeUsers', 'mayChangeGroups', 'mayChangeCustomFields'];

/**
 * "Modules" card of System settings (go.modules.SystemSettingsModuleGrid): all modules
 * of the installation as tiles, install / enable / disable / uninstall and the
 * permissions per module. Changes apply right away (no Save); the windows reload when
 * the dialog closes, so the header shows the changed modules.
 */
class ModulesPanel extends Container {
    static config = {
        className: 'GO.systemsettings.ModulesPanel',
        baseCls  : ['go-systemsettings-modules', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * Modules were installed, enabled, ...: the dialog reloads the windows on close
     * @member {Boolean} needsReload=false
     */
    needsReload = false

    /**
     * isInstalled filter: null all, 'true', 'false'
     * @member {String|null} installedFilter=null
     */
    installedFilter = null

    /**
     * @member {Number} loadCounter=0
     */
    loadCounter = 0

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-systemsettings-modules-tbar'],
            flex  : 'none',
            items : [{
                module : Button,
                icon   : 'refresh',
                tooltip: t('Refresh'),
                handler: () => me.load()
            }, {
                module : Button,
                icon   : 'group',
                text   : t('System') + ' ' + t('Permissions'),
                handler: () => me.showCoreRights()
            }, {
                ntype : 'container',
                cls   : ['go-segments'],
                flex  : 'none',
                layout: {ntype: 'hbox'},
                items : FILTERS().map(([value, text]) => ({
                    module   : Button,
                    reference: 'filter-' + value,
                    cls      : ['go-segment', ...value === null ? ['pressed'] : []],
                    text,
                    handler  : () => me.setInstalledFilter(value)
                }))
            }, '->', {
                module         : TextField,
                reference      : 'search',
                cls            : ['go-systemsettings-modules-search'],
                hideLabel      : true,
                placeholderText: t('Search'),
                width          : 240,
                listeners      : {change: () => me.onSearchChange()}
            }]
        }, {
            module   : ModuleTiles,
            reference: 'tiles',
            flex     : 1,
            listeners: {action: ({action, record}) => me.onTileAction(action, record)}
        }]
    }

    /**
     * Called by the System settings dialog when it opens
     */
    async load() {
        let me      = this,
            counter = ++me.loadCounter,
            params  = {};

        me.installedFilter !== null && (params.isInstalled = me.installedFilter);

        const query = me.getReference('search')?.value;
        query && (params.query = query);

        me.isLoading = t('Loading...');

        try {
            const {results = []} = await client.legacy('modules/module/store', params);

            if (me.isDestroyed || counter !== me.loadCounter) {
                return
            }

            me.getReference('tiles').records = results.sort((a, b) =>
                String(a.localizedPackage).localeCompare(String(b.localizedPackage)) || String(a.name).localeCompare(String(b.name)))
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        } finally {
            me.isDestroyed || counter !== me.loadCounter || (me.isLoading = false)
        }
    }

    /**
     * @param {String|null} value
     * @protected
     */
    setInstalledFilter(value) {
        let me = this;

        me.installedFilter = value;
        FILTERS().forEach(([v]) => me.getReference('filter-' + v)[v === value ? 'addCls' : 'removeCls']('pressed'));
        me.load()
    }

    /**
     * @protected
     */
    async onSearchChange() {
        let me      = this,
            counter = ++me.loadCounter;

        await me.timeout(300);
        // typing on: the newer change loads
        me.isDestroyed || counter !== me.loadCounter || me.load()
    }

    /**
     * @param {String} action 'toggle', 'rights' or 'delete'
     * @param {Object} record
     * @protected
     */
    onTileAction(action, record) {
        let me = this;

        action === 'toggle' && me.toggle(record);
        action === 'rights' && me.showRights(record.id, record.rights || []);
        action === 'delete' && me.uninstall(record)
    }

    /**
     * Runs a request for one module with its buttons disabled
     * @param {Object} record
     * @param {Function} fn async
     * @protected
     */
    async busy(record, fn) {
        let me    = this,
            tiles = me.getReference('tiles'),
            key   = ModuleTiles.key(record);

        tiles.busy = [...tiles.busy, key];

        try {
            await fn();
            me.needsReload = true
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        } finally {
            if (!me.isDestroyed) {
                tiles.busy = tiles.busy.filter(k => k !== key);
                await me.load()
            }
        }
    }

    /**
     * Install, enable or disable; a module that becomes usable shows its permissions
     * @param {Object} record
     * @protected
     */
    toggle(record) {
        let me     = this,
            enable = !record.enabled;

        me.busy(record, async () => {
            let id;

            if (record.isRefactored) {
                if (record.id != null) {
                    await client.set('Module', {update: {[record.id]: {enabled: enable, sort_order: parseInt(record.sort_order) || 0}}});
                    id = record.id
                } else {
                    const response = await client.call('Module/install', {name: record.name, package: record.package});
                    id = response.list?.[0]?.id
                }
            } else {
                const result = await client.legacy('modules/module/update', {id: record.name, enabled: enable ? 'true' : 'false'});
                id = result.id ?? record.id
            }

            enable && id != null && !me.isDestroyed && me.showRights(id, record.rights || [])
        })
    }

    /**
     * @param {Object} record
     * @protected
     */
    async uninstall(record) {
        let me = this;

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Delete'),
            message : fmt(t("All data will be lost! Are you sure you want to delete module '{item}'?"), {item: record.name})
        });

        if (!yes || me.isDestroyed) {
            return
        }

        me.busy(record, () => record.isRefactored
            ? client.call('Module/uninstall', {name: record.name, package: record.package})
            : client.legacy('modules/module/delete', {id: record.id}))
    }

    /**
     * @param {String|Number} moduleId
     * @param {String[]} rights
     * @protected
     */
    showRights(moduleId, rights) {
        let me     = this,
            dialog = Neo.create(ModuleRightsDialog, {appName: me.appName, windowId: me.windowId, moduleId, rights});

        dialog.on('save', () => me.needsReload = true)
    }

    /**
     * Permissions of the core module: managing users, groups, custom fields
     * @protected
     */
    async showCoreRights() {
        let me = this;

        try {
            const {ids} = await client.queryGet('Module', {filter: {package: 'core', name: 'core'}, properties: ['id']});
            ids.length && !me.isDestroyed && me.showRights(ids[0], CORE_RIGHTS)
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(ModulesPanel);
