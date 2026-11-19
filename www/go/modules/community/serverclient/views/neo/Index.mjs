import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}   from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'serverclient');

/**
 * Serverclient: a new user gets mailboxes on the mail server of another GroupOffice
 * (postfixadmin) in the domains of the "serverclient_domains" config option
 * (views/extjs3/UserOverride.js). No app of its own.
 */
ModuleRegistry.register({
    package           : 'community',
    name              : 'serverclient',
    title             : t('Serverclient'),
    iconCls           : 'fa fa-server',
    capability        : 'go:community:serverclient',
    onCreateUserDialog: dialog => import('./mailboxes.mjs').then(({addMailboxesCard}) => addMailboxesCard(dialog))
});
