import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';
import client    from '../jmap/Client.mjs';
import {t}       from '../Translate.mjs';

/**
 * "Tools" card of System settings (go.tools.SystemSettingsTools), for administrators:
 * maintenance scripts that each open in a new browser tab and print their output there.
 * The controller actions check for an administrator themselves.
 *
 * Not ported: "Clear calendar holiday cache" (calendar/calendar/truncateHolidays). It needs
 * the legacy calendar module, which 26.x no longer registers, so the ExtJS card never shows it.
 */
class ToolsPanel extends Component {
    static config = {
        className: 'GO.systemsettings.ToolsPanel',
        baseCls  : ['go-systemsettings-panel', 'go-tools-panel'],
        _vdom    : {cn: []}
    }

    /**
     * The tools the user can run: [name, URL]
     * @returns {Array[]}
     */
    static tools() {
        const url = (route, params) => client.legacyUrl(route, params);

        return [
            [t('System check'),                           client.baseUrl + 'install/gotest.php'],
            [t('Database check'),                         url('maintenance/checkDatabase')],
            [t('Update search index'),                    url('maintenance/buildSearchCache')],
            [t('Update search index (Complete rebuild)'), url('maintenance/buildSearchCache', {reset: 1})],
            [t('Rebuild principals'),                     url('maintenance/buildPrincipals')],
            [t('Remove duplicate contacts and events'),   url('maintenance/removeDuplicates')],
            ...client.hasCapability('go:legacy:files')      ? [[t('Sync file system'),        url('files/folder/syncFileSystem')]] : [],
            ...client.hasCapability('go:legacy:filesearch') ? [[t('Update filesearch index'), url('filesearch/filesearch/sync')]]  : []
        ]
    }

    construct(config) {
        super.construct(config);

        this.vdom.cn = [
            {tag: 'h3', cls: ['go-tools-title'], text: t('Admin tools')},
            {tag: 'ul', cls: ['go-tools-list'], cn: ToolsPanel.tools().map(([name, href]) => ({
                tag: 'li',
                cn : [{tag: 'a', cls: ['go-tools-link'], href, target: '_blank', rel: 'noopener', text: name}]
            }))}
        ];

        this.update()
    }
}

export default Neo.setupClass(ToolsPanel);
