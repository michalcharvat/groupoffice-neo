import client         from '../jmap/Client.mjs';
import ModuleRegistry from '../ModuleRegistry.mjs';
import {t}            from '../Translate.mjs';

/**
 * @summary The core System settings cards.
 *
 * Core cards: [itemId (route "#systemsettings/<itemId>"), title, Material Symbols icon (classic ic-* glyph), panel,
 * may the user see it]
 * @returns {Array[]}
 */
export const CORE_CARDS = () => [
    ['general',        t('General'),         'description',       () => import('./GeneralPanel.mjs'),        () => client.isAdmin],
    ['appearance',     t('Appearance'),      'palette',           () => import('./AppearancePanel.mjs'),     () => client.isAdmin],
    ['notifications',  t('Notifications'),   'notifications',     () => import('./NotificationsPanel.mjs'),  () => client.isAdmin],
    ['authentication', t('Authentication'),  'lock',              () => import('./AuthenticationPanel.mjs'), () => client.isAdmin],
    ['users',          t('Users'),           'account_box',       () => import('../users/UsersPanel.mjs'),   () => client.mayChangeUsers],
    ['groups',         t('Groups'),          'group',             () => import('../groups/GroupsPanel.mjs'), () => client.mayChangeGroups],
    ['customfields',   t('Custom fields'),   'storage',           () => import('../customfields/admin/CustomFieldsPanel.mjs'), () => client.isAdmin || client.mayChangeCustomFields],
    ['defaultpermissions', t('Default permissions'), 'share', () => import('../defaultpermissions/DefaultPermissionsPanel.mjs'), () => client.isAdmin],
    ['modules',        t('Modules'),         'extension', () => import('./ModulesPanel.mjs'),        () => client.isAdmin],
    ['tools',          t('Tools'),           'build', () => import('./ToolsPanel.mjs'),    () => client.isAdmin],
    ['oauth2',         t('Oauth 2.0'),       'vpn_key',           () => import('./OauthClientsPanel.mjs'),   () => client.isAdmin],
    ['cron',           t('Manage system tasks'), 'schedule',    () => import('./CronPanel.mjs'),           () => client.isAdmin]
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
