import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import client         from '../../../../../../views/neo/src/jmap/Client.mjs';
import {translator}   from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'davclient');

ModuleRegistry.register({
    package   : 'community',
    name      : 'davclient',
    title     : t('DAV Accounts'),
    iconCls   : 'fa fa-calendar-plus',
    capability: 'go:community:davclient',
    // GOUI: a My account card for users of davclient and calendar
    get userSettings() {
        return client.hasCapability('go:community:calendar') ? {
            title  : t('DAV Accounts'),
            iconCls: 'fa fa-calendar-plus',
            panel  : () => import('./view/AccountsPanel.mjs')
        } : null
    }
});
