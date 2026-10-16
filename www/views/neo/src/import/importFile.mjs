import client from '../jmap/Client.mjs';

/**
 * CSV and Excel files need a column mapping, other formats (vCard, JSON, iCalendar) import directly
 * @param {String} name file name
 * @returns {Boolean}
 */
export function needsMapping(name) {
    return /\.(csv|xlsx)$/i.test(name || '')
}

/**
 * go.util.importFile() for one chosen file: uploads it; a CSV or Excel file opens the column
 * mapping dialog (GO.import.CsvMappingDialog), any other is passed to Entity/import as is.
 * The import itself runs in the background and reports through notifications / alerts.
 *
 *     await importFile(this, file, 'Contact', {addressBookId: 3}, {fields, aliases, lookupFields})
 *
 * @param {Neo.component.Base} component owner (appName, windowId)
 * @param {File} file
 * @param {String} entity e.g. 'Contact'
 * @param {Object} [values] values of every imported item
 * @param {Object} [options] for the mapping: fields, labels, aliases, lookupFields
 * @returns {Promise<Object>} {mapping: the dialog} for CSV / Excel, {response} of Entity/import otherwise
 */
export async function importFile(component, file, entity, values = {}, options = {}) {
    const blob = await client.upload(file);

    if (needsMapping(file.name)) {
        const {default: CsvMappingDialog} = await import('./CsvMappingDialog.mjs');

        return {mapping: Neo.create(CsvMappingDialog, {
            appName : component.appName,
            windowId: component.windowId,
            entity,
            blobId  : blob.blobId,
            fileName: blob.name || file.name,
            values,
            ...options
        })}
    }

    return {response: await client.call(entity + '/import', {blobId: blob.blobId, values})}
}
