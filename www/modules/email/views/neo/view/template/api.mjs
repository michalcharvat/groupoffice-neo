import client from '../../../../../../views/neo/src/jmap/Client.mjs';
import {decodeEntities} from '../../../../../../views/neo/src/Format.mjs';
import {t} from '../../util.mjs';

/**
 * Legacy routes of the e-mail templates (GO\Base\Model\Template, type 0) and their groups
 * (GO\Base\Model\TemplateGroup): email/template/*, email/templateGroup/*.
 */

/**
 * The legacy stores send names HTML encoded: plain text, the views escape what they show
 * @param {Object} record
 * @returns {Object}
 */
function decodeRecord(record) {
    return Object.fromEntries(Object.entries(record || {}).map(([key, value]) => [key, typeof value === 'string' ? decodeEntities(value) : value]))
}

/**
 * Deletes records of a legacy store (GO.grid.GridPanel deleteSelected())
 * @param {String} route
 * @param {Number[]} ids
 * @returns {Promise<void>}
 */
async function deleteFromStore(route, ids) {
    const response = await client.legacy(route, {delete_keys: JSON.stringify(ids), limit: 1});

    if (response.deleteSuccess === false) {
        throw new Error(response.deleteFeedback || t('Failed to delete'))
    }
}

/**
 * E-mail templates the user may see (email/template/store, sorted by name)
 * @param {Number} [permissionLevel] minimum level, e.g. 30 for the ones the user may change
 * @returns {Promise<Object[]>} {id, name, group_id, group_name, user_id, user_name, acl_id, permissionLevel}
 */
export async function templateStore(permissionLevel) {
    const {results = []} = await client.legacy('email/template/store', {
        limit: 0,
        sort : 'name',
        dir  : 'ASC',
        ...permissionLevel ? {permissionLevel} : {}
    });

    return results.map(decodeRecord)
}

/**
 * One template with its message (email/template/load, needs write permission): name,
 * group_id, acl_id, permission_level and of the stored MIME message subject, htmlbody,
 * attachments and inlineAttachments (temporary files of the parsed message)
 * @param {Number} id
 * @returns {Promise<Object>}
 */
export async function loadTemplate(id) {
    const {data} = await client.legacy('email/template/load', {id, content_type: 'html'});

    return {
        ...data,
        // getAttributes() gives the name raw, Message::toOutputArray() escapes the subject
        name   : data.name || '',
        subject: decodeEntities(data.subject || '')
    }
}

/**
 * Saves a template (email/template/submit): the server builds the MIME message from
 * subject, htmlbody and the attachments (TemplateController::beforeSubmit())
 * @param {Object} params id (0: new), name, group_id, subject, htmlbody, attachments,
 * inlineAttachments (arrays, sent as JSON)
 * @returns {Promise<{id: Number, acl_id: Number}>}
 */
export async function submitTemplate({attachments = [], inlineAttachments = [], ...params}) {
    const response = await client.legacy('email/template/submit', {
        ...params,
        content_type     : 'html',
        attachments      : JSON.stringify(attachments),
        inlineAttachments: JSON.stringify(inlineAttachments)
    });

    return {id: +response.id, acl_id: +response.acl_id || null}
}

/**
 * @param {Number[]} ids
 * @returns {Promise<void>}
 */
export function deleteTemplates(ids) {
    return deleteFromStore('email/template/store', ids)
}

/**
 * Template groups (email/templateGroup/store, sorted by name)
 * @returns {Promise<Object[]>} {id, name}
 */
export async function groupStore() {
    const {results = []} = await client.legacy('email/templateGroup/store', {limit: 0, sort: 'name', dir: 'ASC'});

    return results.map(decodeRecord)
}

/**
 * Creates (no id) or renames a template group
 * @param {Object} group {id, name}
 * @returns {Promise<Number>} id
 */
export async function submitGroup({id, name}) {
    const response = await client.legacy('email/templateGroup/submit', {...id ? {id} : {}, name});

    return +response.id
}

/**
 * @param {Number[]} ids
 * @returns {Promise<void>}
 */
export function deleteGroups(ids) {
    return deleteFromStore('email/templateGroup/store', ids)
}

/**
 * Default template of an account, else of the user (email/template/defaultTemplateId);
 * 0: none
 * @param {Number} [accountId]
 * @returns {Promise<Number>}
 */
export async function defaultTemplateId(accountId) {
    const {data} = await client.legacy('email/template/defaultTemplateId', {account_id: accountId || 0});

    return +data?.template_id || 0
}

/**
 * Stores the default template of the user, or of an account (email/template/emailSelection
 * with default_template_id, like the composer's template menu)
 * @param {Number} templateId 0: none
 * @param {Number} [accountId] the account's default instead of the user's
 * @returns {Promise<void>}
 */
export async function setDefaultTemplate(templateId, accountId) {
    await client.legacy('email/template/emailSelection', {
        default_template_id: templateId || 0,
        ...accountId ? {account_id: accountId, type: 'default_for_account'} : {type: 'default'},
        limit: 1
    })
}
