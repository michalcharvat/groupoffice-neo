import FormWindow from '../../../../../views/neo/src/view/FormWindow.mjs';

/**
 * GO.view.FormWindow over a legacy controller instead of a JMAP entity: the caller loads the
 * record and passes it as `values` (the form takes them as its unmodified state); a
 * subclass implements save(modified, values) with the legacy calls. Discard question,
 * validation, cards and the button bar are FormWindow's.
 */
class LegacyFormWindow extends FormWindow {
    static config = {
        className : 'GO.files.view.LegacyFormWindow',
        entityName: null
    }

    async submit() {
        let me     = this,
            form   = me.form,
            button = me.getReference('saveButton');

        if (!me.formReady || button.disabled) {
            return false
        }

        if (!await form.validate()) {
            await me.focusFirstInvalid();
            return false
        }

        button.disabled = true;
        me.showError('');
        me.isLoading = true;

        try {
            const modified = await form.getModified(),
                  values   = await form.getEntityValues();

            const result = await me.save(modified, values);

            if (me.isDestroyed) {
                return result
            }

            me.fire('save', {data: result || {}, isNew: false});
            me.closeOnSave && me.close();
            return result
        } catch (e) {
            me.isDestroyed || me.showError(e.message || String(e));
            return false
        } finally {
            if (!me.isDestroyed) {
                me.isLoading    = false;
                button.disabled = false
            }
        }
    }

    /**
     * @param {Object} modified changed values
     * @param {Object} values all values
     * @returns {Promise<Object>}
     */
    async save(modified, values) {
        return {}
    }
}

export default Neo.setupClass(LegacyFormWindow);
