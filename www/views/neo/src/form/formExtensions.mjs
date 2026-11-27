/**
 * Form extensions: modules add fields to another module's FormWindow and contribute save data
 * (ModuleRegistry `onFormWindow`, ExtJS: Ext.override of go.form.Dialog, e.g. amd/formbuilder).
 *
 *     onFormWindow: win => win.entityName !== 'Voyage' ? null : {
 *         load: async data => {},          // before the values are set: add fields/cards for data
 *         save: async ({data, isNew}) => {} // before the save is sent: change data
 *     }
 *
 * See docs/neo-core-components.md, "Form extensions".
 */

/**
 * The extensions the modules give a window
 * @param {Function[]} factories the modules' onFormWindow
 * @param {Object} win GO.view.FormWindow
 * @returns {Object[]} {load, save}
 */
export function createFormExtensions(factories, win) {
    return factories.map(factory => {
        try {
            return factory(win)
        } catch (e) {
            console.error('onFormWindow', e);
            return null
        }
    }).filter(Boolean)
}

/**
 * Runs load() of every extension in order. A failing one is logged: it must not keep the form from loading.
 * @param {Object[]} extensions
 * @param {Object} data the entity, or the initial values of a new one
 * @returns {Promise<void>}
 */
export async function loadFormExtensions(extensions, data) {
    for (const extension of extensions) {
        try {
            await extension.load?.(data)
        } catch (e) {
            console.error('Form extension load', e)
        }
    }
}

/**
 * Runs save() of every extension in order. An error stops the save (DataSourceForm fires saveerror).
 * @param {Object[]} extensions
 * @param {Object} event {data, isNew, cancel}, data is mutable
 * @returns {Promise<void>}
 */
export async function saveFormExtensions(extensions, event) {
    for (const extension of extensions) {
        await extension.save?.(event)
    }
}
