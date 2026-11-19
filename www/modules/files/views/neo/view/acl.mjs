import client from '../../../../../views/neo/src/jmap/Client.mjs';

/**
 * Saves the changes of a SharePanel value to a legacy ACL (ExtJS GO.grid.PermissionsPanel
 * over core/aclGroup): added groups per level, changed levels, removed groups.
 * @param {Number|String} aclId
 * @param {Object} oldValue {groupId: level} as loaded
 * @param {Object} newValue {groupId: level|null} of the SharePanel
 * @returns {Promise<void>}
 */
export async function saveAcl(aclId, oldValue, newValue) {
    const added   = {},
          removed = [],
          changed = [];

    Object.entries(newValue || {}).forEach(([groupId, level]) => {
        const old = oldValue[groupId];

        if (!level) {
            old && removed.push(+groupId)
        } else if (!old) {
            (added[level] ??= []).push(+groupId)
        } else if (+old !== +level) {
            changed.push({id: +groupId, level: +level})
        }
    });

    for (const [level, ids] of Object.entries(added)) {
        await client.legacy('core/aclGroup/selectedStore', {model_id: aclId, add: JSON.stringify(ids), addAttributes: JSON.stringify({level: +level}), limit: 1})
    }

    for (const record of changed) {
        await client.legacy('core/aclGroup/updateRecord', {model_id: aclId, record: JSON.stringify(record)})
    }

    if (removed.length) {
        const response = await client.legacy('core/aclGroup/selectedStore', {model_id: aclId, delete_keys: JSON.stringify(removed), limit: 1});

        if (response.deleteSuccess === false) {
            throw new Error(response.deleteFeedback || 'Delete failed')
        }
    }
}
