import {alertBlobId, dismissAlert, runBackgroundJob} from '../data/backgroundJob.mjs';
import {download} from '../download.mjs';
import client from '../jmap/Client.mjs';
import {notify, notifyError} from '../Notify.mjs';
import {t} from '../Translate.mjs';

/**
 * Export of a grid's entities (ExtJS go.util.exportToFile, the "Export" submenu of the
 * GOUI module main panels): Entity/export of the grid's query or of chosen ids, in the
 * background. Spreadsheets and HTML first ask for the columns (GO.import.ColumnSelectDialog);
 * the finished alert links the file, which is downloaded.
 *
 *     // the ⋮ menu of a main panel
 *     items: [exportMenuItem(this, {entity: 'Note', store: grid.store, formats: ['xlsx', 'csv', 'html', 'json']})]
 *
 *     // selected rows only
 *     exportEntities(this, {entity: 'Contact', extension: 'vcf', ids})
 *
 * The server only knows the extensions of the entity's converters (Entity::converters():
 * json always, Spreadsheet csv/xlsx/html, VCard vcf, VCalendar ics).
 */

/**
 * Menu text and icon per extension, in menu order
 * @returns {Object} extension → {text, icon}
 */
export function exportFormats() {
    return {
        vcf : {text: t('vCard (Virtual Contact File)'), icon: 'contact_page'},
        ics : {text: t('vCalendar'),                    icon: 'calendar_today'},
        xlsx: {text: t('Microsoft Excel'),              icon: 'table_view'},
        csv : {text: t('Comma Separated Values'),       icon: 'csv'},
        html: {text: t('Web page') + ' (HTML)',         icon: 'html'},
        json: {text: t('JSON'),                         icon: 'data_object'}
    }
}

/** extensions that export chosen columns */
const COLUMN_EXTENSIONS = ['csv', 'xlsx', 'html'];

/**
 * JMAP filter and sort of a GO.data.JmapStore (what the grid shows)
 * @param {GO.data.JmapStore} store
 * @returns {Object} {filter, sort}
 */
export function storeQuery(store) {
    return {filter: store.getJmapFilter(), sort: store.getJmapSort()}
}

/**
 * Exports entities and downloads the file. Errors are shown as notifications.
 * @param {Neo.component.Base} owner the component that asks (appName, windowId; nothing happens once it is destroyed)
 * @param {Object} options
 * @param {String} options.entity e.g. 'Contact'
 * @param {String} options.extension e.g. 'csv'
 * @param {String[]|null} [options.ids] the entities, null for the query
 * @param {Object|null} [options.query] Entity/query params ({filter, sort}) when there are no ids
 * @returns {Promise<Boolean>} true when the file was downloaded
 */
export async function exportEntities(owner, {entity, extension, ids = null, query = null}) {
    try {
        ids ??= (await client.call(entity + '/query', query || {})).ids;

        if (!ids?.length) {
            throw new Error(t("There's nothing to export"))
        }

        let columns = null;

        if (COLUMN_EXTENSIONS.includes(extension)) {
            const {default: ColumnSelectDialog} = await import('../import/ColumnSelectDialog.mjs');

            if (owner.isDestroyed) {
                return false
            }

            columns = await ColumnSelectDialog.ask({appName: owner.appName, windowId: owner.windowId, entity, extension});

            if (!columns || owner.isDestroyed) {
                return false
            }
        }

        const job = runBackgroundJob(() => client.call(entity + '/export', {extension, ids, background: true, ...columns ? {columns} : {}}));

        notify(owner, t('You will be notified when the export is complete. You can close this window now.'), {title: t('Export in progress')});

        const alert  = await job,
              blobId = alertBlobId(alert);

        // the window was closed meanwhile: keep the alert, it links the file
        if (owner.isDestroyed) {
            return false
        }

        // "Export error": the alert says why
        if (!blobId) {
            dismissAlert(alert);
            throw new Error(String(alert.data?.body || alert.data?.title || t('Error')).replace(/<[^>]*>/g, ' '))
        }

        await download(owner.windowId, client.baseUrl + 'api/download.php?blob=' + encodeURIComponent(blobId));
        dismissAlert(alert);

        return true
    } catch (e) {
        owner.isDestroyed || notifyError(owner, e);
        return false
    }
}

/**
 * The "Export" menu item with a submenu of formats, for a GO.menu.List / button menu
 * @param {Neo.component.Base} owner
 * @param {Object} options
 * @param {String} options.entity
 * @param {String[]} options.formats extensions the entity supports, e.g. ['xlsx', 'csv', 'html', 'json']
 * @param {GO.data.JmapStore} [options.store] exports the store's query (filter and sort)
 * @param {Function} [options.query] () => Entity/query params, instead of `store`
 * @param {Function} [options.ids] () => String[]|null: these entities instead of the query
 * @param {Boolean} [options.disabled=false]
 * @param {Object[]} [options.items] more submenu items, after a separator (e.g. address labels)
 * @returns {Object} menu item config
 */
export function exportMenuItem(owner, {entity, formats, store = null, query = null, ids = null, disabled = false, items = []}) {
    const all = exportFormats();

    return {
        text    : t('Export'),
        icon    : 'cloud_download',
        disabled: !!disabled,
        items   : [
            ...formats.filter(extension => all[extension]).map(extension => ({
                ...all[extension],
                handler: () => exportEntities(owner, {
                    entity,
                    extension,
                    ids  : ids?.() || null,
                    query: query ? query() : store ? storeQuery(store) : null
                })
            })),
            ...items.length ? [{separator: true}, ...items] : []
        ]
    }
}
