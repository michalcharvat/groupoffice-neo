import client from '../../../../views/neo/src/jmap/Client.mjs';

/**
 * The legacy routes of the sieve module (www/modules/sieve/controller/SieveController.php).
 * Every route except accountAliases connects to the account's ManageSieve server and needs
 * manage permission on the account.
 */

/**
 * A legacy call whose failure may come without `success: false` (submitRules answers only
 * {feedback} when it throws)
 * @param {String} route
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function call(route, params) {
    const response = await client.legacy(route, params);

    if (!response.success) {
        throw new Error(response.feedback || `${route} failed`)
    }

    return response
}

/**
 * sieve/sieve/isSupported: whether the account's server speaks ManageSieve
 * @param {Number} accountId
 * @returns {Promise<Object>} {supported, server_extensions: String[], error}
 */
export async function isSupported(accountId) {
    const response = await client.legacy('sieve/sieve/isSupported', {account_id: accountId});

    return {
        supported        : !!response.supported,
        server_extensions: (response.server_extensions || []).map(e => String(e).toLowerCase()),
        error            : response.error || null
    }
}

/**
 * sieve/sieve/scripts: the filter sets (scripts) of the account
 * @param {Number} accountId
 * @param {String|null} activate a script to make the active one first
 * @returns {Promise<Object>} {active: String, scripts: [{id, name, active}]}
 */
export async function scripts(accountId, activate=null) {
    const params   = {account_id: accountId},
          response = await call('sieve/sieve/scripts', activate ? {...params, set_active_script_name: activate} : params);

    return {
        active : response.active || '',
        scripts: (response.results || []).map(r => ({id: r.value, name: r.name || r.value, active: !!r.active}))
    }
}

/**
 * sieve/sieve/rules: the rules of a script without the "Out of office" rule
 * @param {Number} accountId
 * @param {String} scriptName
 * @returns {Promise<Object[]>} [{id: index, index, name, script_name, active}]
 */
export async function rules(accountId, scriptName) {
    const response = await call('sieve/sieve/rules', {account_id: accountId, script_name: scriptName});
    return (response.results || []).map(r => ({...r, id: r.index, active: !!r.active}))
}

/**
 * sieve/sieve/rules with delete_keys: deletes rules by script index
 * @param {Number} accountId
 * @param {String} scriptName
 * @param {Number[]} indexes
 */
export async function deleteRules(accountId, scriptName, indexes) {
    const response = await call('sieve/sieve/rules', {account_id: accountId, script_name: scriptName, delete_keys: JSON.stringify(indexes)});

    if (response.deleteSuccess === false) {
        throw new Error(response.deleteFeedback || 'Delete failed')
    }
}

/**
 * sieve/sieve/rule: one rule
 * @param {Number} accountId
 * @param {String} scriptName
 * @param {Number} index
 * @returns {Promise<Object>} {data: {join, active, rule_name}, criteria, actions}
 */
export async function rule(accountId, scriptName, index) {
    const response = await call('sieve/sieve/rule', {account_id: accountId, script_name: scriptName, script_index: index});
    return {data: response.data || {}, criteria: response.criteria || [], actions: response.actions || []}
}

/**
 * sieve/sieve/submitRules: creates (index -1) or replaces a rule
 * @param {Object} params accountId, scriptName, index, name, active, join ('allof' | 'anyof' | 'any'),
 * criteria, actions
 */
export function submitRule({accountId, scriptName, index, name, active, join, criteria, actions}) {
    const params = {
        account_id  : accountId,
        script_name : scriptName,
        script_index: index,
        rule_name   : name,
        join,
        criteria    : JSON.stringify(criteria),
        actions     : JSON.stringify(actions)
    };

    // the controller disables a rule when `active` is missing (an unchecked ExtJS checkbox)
    active && (params.active = 'on');

    return call('sieve/sieve/submitRules', params)
}

/**
 * sieve/sieve/saveScriptsSortOrder: the new order of the rules of the ACTIVE script
 * @param {Number} accountId
 * @param {Number[]} indexes the old script indexes in their new order
 */
export function saveSortOrder(accountId, indexes) {
    return call('sieve/sieve/saveScriptsSortOrder', {account_id: accountId, sort_order: JSON.stringify(indexes)})
}

/**
 * sieve/sieve/accountAliases: the e-mail addresses of the account's aliases, comma separated
 * @param {Number} accountId
 * @returns {Promise<String>}
 */
export async function accountAliases(accountId) {
    const response = await call('sieve/sieve/accountAliases', {account_id: accountId});
    return response.data?.aliases || ''
}
