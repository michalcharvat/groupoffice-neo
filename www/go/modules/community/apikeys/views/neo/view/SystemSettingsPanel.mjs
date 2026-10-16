import EntityListPanel from '../../../../../../../views/neo/src/systemsettings/EntityListPanel.mjs';
import {formatUserDateTime} from '../../../../../../../views/neo/src/Format.mjs';
import {translator}    from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'apikeys');

/**
 * API keys card of System settings (GOUI apikeys SystemSettingsPanel + KeyGrid):
 * name, user, created; the row shows the access token
 */
class SystemSettingsPanel extends EntityListPanel {
    static config = {
        className : 'GO.apikeys.view.SystemSettingsPanel',
        entity    : 'Key',
        properties: ['id', 'name', 'userId', 'createdAt', 'accessToken'],
        jmapSort  : [{property: 'createdAt', isAscending: true}],
        intro     : t('API keys can be used for other services to connect to the API. A website feeding contact information for example.'),
        addText   : t('Add key'),
        // GOUI KeyGrid: no edit, the token is set on create
        editable  : false,
        dialog    : () => import('./KeyDialog.mjs'),
        columns   : [
            {text: t('Name'),       field: 'name', flex: true},
            {text: t('User'),       field: 'userName'},
            {text: t('Created at'), render: record => formatUserDateTime(record.createdAt)}
        ],
        actions   : [{action: 'token', icon: 'key', tooltip: t('View access token')}]
    }

    async prepareRecords(list) {
        const names = await EntityListPanel.principalNames(list.map(key => key.userId));
        return list.map(key => ({...key, userName: names[String(key.userId)] || ''}))
    }

    async onAction(action, record) {
        if (action !== 'token') {
            return super.onAction(action, record)
        }

        const {default: TokenDialog} = await import('./TokenDialog.mjs');
        Neo.create(TokenDialog, {appName: this.appName, windowId: this.windowId, token: record.accessToken || ''})
    }
}

export default Neo.setupClass(SystemSettingsPanel);
