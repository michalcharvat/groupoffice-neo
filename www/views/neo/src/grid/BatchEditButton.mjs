import Button from '../button/Button.mjs';
import {t}    from '../Translate.mjs';

/**
 * "Batch edit" action of a MultiSelectToolbar (ExtJS go.form.BatchEditDialog button):
 * opens GO.form.BatchEditDialog for the selected rows of the toolbar's grid. Hidden while
 * the entity has no custom fields to edit, like in ExtJS.
 *
 *     {module: MultiSelectToolbar, items: [{
 *         module   : BatchEditButton,
 *         entity   : 'Contact',
 *         listeners: {save: ({updated}) => store.load()}
 *     }]}
 *
 * Fires `save` {updated: String[]} with the ids that were saved.
 */
class BatchEditButton extends Button {
    static config = {
        className: 'GO.grid.BatchEditButton',
        icon     : 'edit_note',
        tooltip  : t('Batch edit'),
        hidden   : true,
        /**
         * JMAP entity of the grid's records, e.g. 'Contact'; the button shows when it has custom fields
         * @member {String|null} entity_=null
         * @reactive
         */
        entity_: null,
        /**
         * The ids to edit, by default the selected records of the toolbar's grid
         * @member {Function|null} getIds=null
         */
        getIds: null
    }

    /**
     * @summary Opens the batch edit dialog on a click.
     */
    onConstructed() {
        super.onConstructed();
        this.handler = () => this.openDialog()
    }

    /**
     * @summary Shows the button while the entity has custom fields to edit.
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetEntity(value, oldValue) {
        const me = this;

        me.hidden = true;

        value && import('../form/BatchEditDialog.mjs')
            .then(({default: BatchEditDialog}) => BatchEditDialog.isAvailable(value))
            .then(available => {
                me.isDestroyed || me.entity !== value || (me.hidden = !available)
            })
            .catch(e => console.error('Batch edit', e))
    }

    /**
     * @returns {String[]}
     */
    getSelectedIds() {
        let me = this;

        if (me.getIds) {
            return me.getIds() || []
        }

        const toolbar = me.up({ntype: 'go-multiselect-toolbar'});

        return (toolbar?.grid?.getSelectedRecords() || []).filter(Boolean).map(r => String(r.id))
    }

    /**
     * @summary Opens GO.form.BatchEditDialog for the selected ids of the entity.
     */
    async openDialog() {
        let me     = this,
            ids    = me.getSelectedIds(),
            entity = me.entity;

        if (!ids.length) {
            return
        }

        const {default: BatchEditDialog} = await import('../form/BatchEditDialog.mjs');

        // the ids belong to the entity they were selected in
        me.isDestroyed || me.entity !== entity || Neo.create(BatchEditDialog, {appName: me.appName, windowId: me.windowId, entity, ids})
            .on('save', ({updated}) => me.isDestroyed || me.fire('save', {updated}))
    }
}

export default Neo.setupClass(BatchEditButton);
