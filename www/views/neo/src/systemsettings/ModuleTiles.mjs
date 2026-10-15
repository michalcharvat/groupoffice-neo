import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';
import client    from '../jmap/Client.mjs';
import {t}       from '../Translate.mjs';

/**
 * Module tiles of System settings → Modules (go.modules.SystemSettingsModuleGrid.draw()):
 * per package a heading and a tile per module with status, icon, name, description and
 * the buttons install / enable / disable, permissions and delete.
 *
 * Records are rows of the legacy modules/module/store. Fires `action` {action, record}
 * with action 'toggle', 'rights' or 'delete'.
 */
class ModuleTiles extends Component {
    static config = {
        className: 'GO.systemsettings.ModuleTiles',
        baseCls  : ['go-module-tiles'],
        /**
         * @member {Object[]} records_=[]
         */
        records_: [],
        /**
         * Module names with a running request: their buttons are disabled
         * @member {String[]} busy_=[]
         */
        busy_: [],
        _vdom: {cn: []}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([{click: me.onButtonClick, delegate: '.go-module-tile-button', scope: me}])
    }

    afterSetRecords() {
        this.render_()
    }

    afterSetBusy() {
        this.render_()
    }

    /**
     * @param {Object} record
     * @returns {String}
     */
    static key(record) {
        return `${record.package || 'legacy'}/${record.name}`
    }

    /**
     * Rebuilds the tiles (render() is taken by Component)
     * @protected
     */
    render_() {
        let me       = this,
            packages = new Map();

        me.records.forEach(record => {
            const name = record.localizedPackage || '';
            packages.has(name) || packages.set(name, []);
            packages.get(name).push(record)
        });

        me.vdom.cn = packages.size ? [...packages].flatMap(([name, records]) => [
            {tag: 'h3', cls: ['go-module-tiles-package'], text: name},
            {cls: ['go-module-tiles-grid'], cn: records.map(record => me.createTile(record))}
        ]) : [{cls: ['go-empty'], cn: [
            {tag: 'h3', text: t('No modules available')},
            {tag: 'small', text: t('Check your installation folder and try running a database check')}
        ]}];

        me.update()
    }

    /**
     * @param {Object} record
     * @returns {Object} vdom
     * @protected
     */
    createTile(record) {
        let me        = this,
            key       = ModuleTiles.key(record),
            installed = record.id != null,
            busy      = me.busy.includes(key) || null,
            icon      = `${client.apiUrl}download.php?blob=${encodeURIComponent(`core/moduleIcon/${record.package || 'legacy'}/${record.name}`)}`,
            tooltip   = String(record.description || '') + (record.author ? `\n\n${t('Author')}: ${record.author}` : '');

        return {
            cls  : ['go-module-tile', ...record.enabled ? ['go-module-tile-enabled'] : []],
            title: tooltip,
            cn   : [
                {cls: ['go-module-tile-status', 'go-module-status-' + String(record.status || '').replace(/[^a-z]/gi, '')], text: t(record.status || '')},
                {cls: ['go-module-tile-icon'], style: {backgroundImage: `url("${icon}")`}},
                {cls: ['go-module-tile-name'], text: record.localizedName || record.name},
                {cls: ['go-module-tile-description'], text: record.description || ''},
                {cls: ['go-module-tile-buttons'], cn: [
                    me.createButton(key, 'toggle', null, record.enabled ? t('Disable') : installed ? t('Enable') : t('Install'),
                        busy || record.not_installable || null, ['go-module-tile-toggle', ...installed ? ['go-module-tile-primary'] : []]),
                    {flex: 1, cls: ['go-module-tile-spacer']},
                    me.createButton(key, 'rights', 'share',  t('Permissions'), busy || !installed || null),
                    me.createButton(key, 'delete', 'delete', t('Delete'),      busy || !installed || null)
                ]}
            ]
        }
    }

    /**
     * @param {String} key
     * @param {String} action
     * @param {String|null} icon Material icon, null: text button
     * @param {String} text
     * @param {Boolean|null} disabled
     * @param {String[]} [cls]
     * @returns {Object} vdom
     * @protected
     */
    createButton(key, action, icon, text, disabled, cls = []) {
        return {
            tag          : 'button',
            type         : 'button',
            cls          : ['go-module-tile-button', ...icon ? ['go-module-tile-icon-button'] : [], ...cls],
            disabled,
            title        : icon ? text : null,
            'aria-label' : text,
            'data-key'   : key,
            'data-action': action,
            cn           : [icon ? {tag: 'span', cls: ['go-icon'], text: icon} : {tag: 'span', text}]
        }
    }

    onButtonClick(data) {
        const dataset = data.path?.find(node => node.data?.action)?.data,
              record  = dataset && this.records.find(r => ModuleTiles.key(r) === dataset.key);

        record && this.fire('action', {action: dataset.action, record})
    }
}

export default Neo.setupClass(ModuleTiles);
