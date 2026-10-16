import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import client         from '../../../../../../views/neo/src/jmap/Client.mjs';
import {translator}   from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'dokuwiki');

const module = {
    package   : 'community',
    name      : 'dokuwiki',
    title     : t('title'),
    iconCls   : 'fa fa-book',
    capability: 'go:community:dokuwiki',
    icon      : 'menu_book',
    mainView  : () => import('./view/DokuwikiMain.mjs'),
    systemSettings: {
        title  : t('Dokuwiki'),
        iconCls: 'fa fa-book',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    }
};

// ExtJS: the configured title names the module
client.on('login', async () => {
    if (!client.hasCapability(module.capability)) {
        return
    }

    try {
        const {list} = await client.queryGet('Module', {filter: {package: 'community', name: 'dokuwiki'}, properties: ['id', 'settings']});
        module.title = list[0]?.settings?.title || t('title')
    } catch (e) {
        console.warn('dokuwiki settings', e)
    }
});

ModuleRegistry.register(module);
