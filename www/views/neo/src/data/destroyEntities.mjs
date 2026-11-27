import client        from '../jmap/Client.mjs';
import {notifyError} from '../Notify.mjs';
import {fmt, t}      from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';

/**
 * @summary Asks "Confirm delete" and destroys the records of a JMAP entity (Entity/set destroy).
 * A failed delete is shown as an error notification of `owner`.
 *
 *     await destroyEntities(this, 'SmtpAccount', [record]) && this.load()
 *
 * @param {Neo.component.Base} owner the component the dialog and the error belong to
 * @param {String} entity JMAP entity
 * @param {Object[]} records rows with an `id`
 * @param {Object} [options]
 * @param {String} [options.displayField='name'] name of a single record in the question
 * @returns {Promise<Boolean>} true when they were destroyed
 */
export async function destroyEntities(owner, entity, records, {displayField = 'name'} = {}) {
    if (!records?.length) {
        return false
    }

    const name = records.length === 1 ? records[0][displayField] : null;

    const yes = await ConfirmDialog.ask({
        appName : owner.appName,
        windowId: owner.windowId,
        title   : t('Confirm delete'),
        message : records.length > 1
            ? fmt(t('Are you sure you want to delete the {count} items?'), {count: records.length})
            : name ? fmt(t("Are you sure you want to delete '{item}'?"), {item: name}) : t('Are you sure you want to delete the selected item?')
    });

    if (!yes || owner.isDestroyed) {
        return false
    }

    try {
        await client.set(entity, {destroy: records.map(record => record.id)});
        return true
    } catch (e) {
        owner.isDestroyed || notifyError(owner, e);
        return false
    }
}
