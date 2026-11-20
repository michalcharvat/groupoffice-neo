import {classicEntityRoute} from '../classicApps.mjs';
import client from '../jmap/Client.mjs';
import ModuleRegistry from '../ModuleRegistry.mjs';
import {t} from '../Translate.mjs';

/**
 * Title and Material icon per linkable entity, the neo counterpart of the link
 * configs ExtJS modules register (go.Entities.getLinkConfigs(), "links" in
 * Module.js). Unknown entities show their name and a generic icon.
 *
 * Contacts are split by the Search `filter` (isContact / isOrganization) like GO.
 * `capability`: the module of a type the "Has links to..." filter offers.
 */
const TYPES = {
    Note           : {title: 'Note',         icon: 'sticky_note_2', capability: 'go:community:notes'},
    Contact        : {title: 'Contact',      icon: 'person', capability: 'go:community:addressbook'},
    'Contact,isOrganization': {title: 'Organization', icon: 'business'},
    Task           : {title: 'Task',         icon: 'check_circle', capability: 'go:community:tasks'},
    CalendarEvent  : {title: 'Event',        icon: 'event', capability: 'go:community:calendar'},
    Event          : {title: 'Event',        icon: 'event'},
    File           : {title: 'File',         icon: 'description', capability: 'go:legacy:files'},
    Folder         : {title: 'Folder',       icon: 'folder'},
    Comment        : {title: 'Comment',      icon: 'chat'},
    LinkedEmail    : {title: 'E-mail',       icon: 'email', capability: 'go:legacy:savemailas'},
    Project        : {title: 'Project',      icon: 'folder_special'},
    Project3       : {title: 'Project',      icon: 'folder_special'},
    Ticket         : {title: 'Ticket',       icon: 'confirmation_number'},
    Order          : {title: 'Order',        icon: 'receipt_long'}
};

/**
 * @param {String} entity e.g. "Contact"
 * @param {String|null} [filter] Search filter, e.g. "isOrganization"
 * @returns {{title: String, icon: String}} title translated
 */
export function linkType(entity, filter=null) {
    const type = TYPES[entity + ',' + filter] || TYPES[entity];

    return type
        ? {title: t(type.title), icon: type.icon}
        : {title: t(entity), icon: 'link'}
}

/**
 * Group key of a link target: entity plus the filters that change the type
 * @param {String} entity
 * @param {String|null} filter
 * @returns {String}
 */
export function linkGroup(entity, filter=null) {
    return TYPES[entity + ',' + filter] ? entity + ',' + filter : entity
}

/**
 * Hash of an entity: the neo module that shows it (ModuleRegistry `routes`, entity name
 * matched case-insensitively, so Entity::url()'s "contact/5" finds `Contact`), else
 * "classic/<hash>" when only the classic client has its module (src/classicApps.mjs;
 * MainView opens it there). Used by the header search, links, alerts, reminders and hashes.
 * @param {String} entity
 * @param {String|Number} entityId
 * @returns {String|null} e.g. "notes/note/5", "classic/sftourstour/5", null when no client shows it
 */
export function resolveRoute(entity, entityId) {
    const lower = String(entity || '').toLowerCase();
    let key;
    const module = lower && ModuleRegistry.getAvailable().find(m =>
        (key = Object.keys(m.routes || {}).find(k => k.toLowerCase() === lower)));

    if (module) {
        return `${module.name}/${module.routes[key](entityId)}`
    }

    const classic = classicEntityRoute(entity, entityId);
    return classic ? 'classic/' + classic : null
}

/**
 * Entities the "Has links to..." filter offers (ExtJS go.links.EntityCombo): the link
 * types of the modules the user has, sorted by title
 * @returns {Object[]} [{entity, title}] title translated
 */
export function linkFilterEntities() {
    return Object.entries(TYPES)
        .filter(([, type]) => type.capability && client.hasCapability(type.capability))
        .map(([entity, type]) => ({entity, title: t(type.title)}))
        .sort((a, b) => a.title.localeCompare(b.title))
}
