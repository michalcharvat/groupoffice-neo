import client         from '../jmap/Client.mjs';
import ModuleRegistry from '../ModuleRegistry.mjs';
import {t}            from '../Translate.mjs';

/**
 * @summary The core System settings cards.
 *
 * Core cards: [itemId (route "#systemsettings/<itemId>"), title, Font Awesome icon, panel, may the user see it]
 * @returns {Array[]}
 */
export const CORE_CARDS = () => [
    ['general',        t('General'),         'fa fa-file-lines',   () => import('./GeneralPanel.mjs'),        () => client.isAdmin],
    ['appearance',     t('Appearance'),      'fa fa-palette',      () => import('./AppearancePanel.mjs'),     () => client.isAdmin],
    ['notifications',  t('Notifications'),   'fa fa-bell',         () => import('./NotificationsPanel.mjs'),  () => client.isAdmin],
    ['authentication', t('Authentication'),  'fa fa-lock',         () => import('./AuthenticationPanel.mjs'), () => client.isAdmin],
    ['users',          t('Users'),           'fa fa-user',         () => import('../users/UsersPanel.mjs'),   () => client.mayChangeUsers],
    ['groups',         t('Groups'),          'fa fa-users',        () => import('../groups/GroupsPanel.mjs'), () => client.mayChangeGroups],
    ['customfields',   t('Custom fields'),   'fa fa-database',     () => import('../customfields/admin/CustomFieldsPanel.mjs'), () => client.isAdmin || client.mayChangeCustomFields],
    ['defaultpermissions', t('Default permissions'), 'fa fa-share-nodes', () => import('../defaultpermissions/DefaultPermissionsPanel.mjs'), () => client.isAdmin],
    ['modules',        t('Modules'),         'fa fa-puzzle-piece', () => import('./ModulesPanel.mjs'),        () => client.isAdmin],
    ['tools',          t('Tools'),           'fa fa-screwdriver-wrench', () => import('./ToolsPanel.mjs'),    () => client.isAdmin],
    ['oauth2',         t('Oauth 2.0'),       'fa fa-key',          () => import('./OauthClientsPanel.mjs'),   () => client.isAdmin],
    ['cron',           t('Manage system tasks'), 'fa fa-clock',    () => import('./CronPanel.mjs'),           () => client.isAdmin]
];

/**
 * @summary May the user see the module's System settings cards?
 *
 * A module's cards: administrators, or users with the module's "mayManage" right (classic: a
 * module's systemSettingsPanels show to its managers)
 * @param {Object} module registry entry
 * @returns {Boolean}
 */
export function mayManage(module) {
    return client.isAdmin || !!client.session?.capabilities?.[module.capability]?.mayManage
}

/**
 * @summary May the user see at least one System settings card?
 *
 * The user may see at least one card: System settings shows in the menu and opens by route.
 * The server still guards every card's load and save.
 * @returns {Boolean}
 */
export function maySeeSystemSettings() {
    return CORE_CARDS().some(card => card[4]()) || ModuleRegistry.hasSettingsPanels('systemSettings', mayManage)
}
