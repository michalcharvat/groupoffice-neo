import EntityCheckList from '../../../../../views/neo/src/form/field/EntityCheckList.mjs';
import {t}             from '../../../../../views/neo/src/Translate.mjs';

/**
 * The books of one entity a user synchronizes, with one default (ExtJS go.form.multiselect.Field
 * with a RadioColumn "Default"): a checkbox list over the entity whose value is
 * [{<idField>: id, isDefault}] (sync UserNoteBook / UserAddressBook). Checking the first book
 * makes it the default; the star of a checked book makes it the default.
 *
 *     {module: SyncBooksField, name: 'syncSettings.noteBooks', entity: 'NoteBook', idField: 'noteBookId'}
 */
class SyncBooksField extends EntityCheckList {
    static config = {
        className: 'GO.sync.view.SyncBooksField',
        cls      : ['go-sync-books'],
        /**
         * Property of a value item that holds the book id
         * @member {String|null} idField=null
         */
        idField: null
    }

    /**
     * The default book
     * @member {String|null} defaultId=null
     */
    defaultId = null

    /**
     * Keeps ids as EntityCheckList values; the default is kept apart
     * @param {Object[]|null} value [{<idField>: id, isDefault}] or ids
     * @returns {String[]}
     */
    beforeSetValue(value) {
        let me = this;

        if (!Array.isArray(value)) {
            return []
        }

        if (value.some(item => item && typeof item === 'object')) {
            const def = value.find(item => item?.isDefault);
            me.defaultId = def ? String(def[me.idField]) : null;
            value = value.map(item => item?.[me.idField])
        }

        return super.beforeSetValue(value.filter(id => id != null))
    }

    afterSetValue(value, oldValue) {
        let me = this;

        // the default is always one of the checked books
        if (value.length && !value.includes(me.defaultId)) {
            me.defaultId = value[0]
        } else if (!value.length) {
            me.defaultId = null
        }

        super.afterSetValue(value, oldValue)
    }

    /**
     * @returns {Object[]} [{<idField>: id, isDefault}]
     */
    getSubmitValue() {
        return (this.value || []).map(id => ({[this.idField]: id, isDefault: id === this.defaultId}))
    }

    createRow(record, checked) {
        const row = super.createRow(record, checked),
              id  = String(record.id),
              def = checked && id === this.defaultId;

        // the default star before the checkbox, on checked rows only
        row.cn.splice(row.cn.length - 1, 0, {
            tag         : 'span',
            cls         : ['go-icon', 'go-sync-default', ...def ? ['go-sync-default-on'] : []],
            role        : 'radio',
            'aria-checked': String(def),
            'aria-label': t('Default'),
            title       : t('Default'),
            'data-default': id,
            removeDom   : !checked,
            text        : def ? 'star' : 'star_outline'
        });

        return row
    }

    onRowClick(data) {
        let me  = this,
            def = data.path?.find(node => node.data?.default)?.data.default;

        if (def) {
            if (!me.readOnly && !me.disabled && def !== me.defaultId) {
                const oldValue = me.getSubmitValue();

                me.defaultId = def;
                me.renderList();
                me.fireUserChangeEvent(me.value, oldValue)
            }
            return
        }

        super.onRowClick(data)
    }
}

export default Neo.setupClass(SyncBooksField);
