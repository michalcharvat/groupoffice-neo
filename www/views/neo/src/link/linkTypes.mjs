import ModuleRegistry from '../ModuleRegistry.mjs';
import {t} from '../Translate.mjs';

/**
 * Title and Material icon per linkable entity, the neo counterpart of the link
 * configs ExtJS modules register (go.Entities.getLinkConfigs(), "links" in
 * Module.js). Unknown entities show their name and a generic icon.
 *
 * Contacts are split by the Search `filter` (isContact / isOrganization) like GO.
 */
const TYPES = {
    Note           : {title: 'Note',         icon: 'sticky_note_2'},
    Contact        : {title: 'Contact',      icon: 'person'},
    'Contact,isOrganization': {title: 'Organization', icon: 'business'},
    Task           : {title: 'Task',         icon: 'check_circle'},
    CalendarEvent  : {title: 'Event',        icon: 'event'},
    Event          : {title: 'Event',        icon: 'event'},
    File           : {title: 'File',         icon: 'description'},
    Folder         : {title: 'Folder',       icon: 'folder'},
    Comment        : {title: 'Comment',      icon: 'chat'},
    LinkedEmail    : {title: 'E-mail',       icon: 'email'},
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
 * Hash of an entity in a neo module (ModuleRegistry `routes`), like the header
 * search's resolveRoute in MainView
 * @param {String} entity
 * @param {String|Number} entityId
 * @returns {String|null} e.g. "notes/note/5", null when no neo module shows it
 */
export function resolveRoute(entity, entityId) {
    const module = ModuleRegistry.getAvailable().find(m => m.routes?.[entity]);

    return module ? `${module.name}/${module.routes[entity](entityId)}` : null
}
