import BoolCheckBox from '../../form/field/BoolCheckBox.mjs';
import JmapComboBox from '../../form/field/JmapComboBox.mjs';
import {fieldset}   from '../../form/fieldset.mjs';
import SharePanel   from '../../permissions/SharePanel.mjs';
import FormWindow   from '../../view/FormWindow.mjs';
import {t}          from '../../Translate.mjs';
import {note, number, text, textArea} from './fieldTypes.mjs';

const extensions = {};

/**
 * Extra items of the field set dialog of one entity (ExtJS entity
 * `customFields.fieldSetDialog`, e.g. the address book's "Enable for" and address books):
 *
 *     registerFieldSetExtension('Contact', {
 *         items     : dialog => [...],             // below the common fields
 *         beforeLoad: (data, dialog) => {},        // the loaded (or new) field set, before the fields get it:
 *                                                  // add values of helper fields (taken as unmodified)
 *         beforeSave: (data, dialog) => {}         // FieldSet/set data: build data.filter, drop helper fields
 *     })
 *
 * @param {String} entity
 * @param {Object} extension
 */
export function registerFieldSetExtension(entity, extension) {
    extensions[entity] = extension
}

/**
 * Creates or edits a custom field set (go.customfields.FieldSetDialog): name, show as tab
 * or on a tab, collapse when empty, description, columns; who may see and edit it on
 * the "Permissions" tab.
 *
 *     Neo.create(FieldSetDialog, {appName, windowId, forEntity: 'Note', values: {entity: 'Note'}}) // new
 *     Neo.create(FieldSetDialog, {appName, windowId, forEntity: 'Note', entityId: 3})              // edit
 */
class FieldSetDialog extends FormWindow {
    static config = {
        className   : 'GO.customfields.admin.FieldSetDialog',
        cls         : ['go-form-window', 'go-cf-fieldset-dialog'],
        entityName  : 'FieldSet',
        title       : t('Field set'),
        wrapperStyle: {height: '80vh', left: 'max(0px, calc(50vw - 330px))', top: '10vh', width: 'min(660px, 100vw)'},
        /**
         * Entity the field set belongs to, e.g. 'Contact'
         * @member {String|null} forEntity=null
         */
        forEntity: null
    }

    construct(config) {
        config.values = {columns: 2, isTab: false, collapseIfEmpty: false, ...config.values || {}, entity: config.forEntity};

        super.construct(config)
    }

    /**
     * @returns {Object|null}
     */
    get extension() {
        return extensions[this.forEntity] || null
    }

    addCustomFields() {
        // a FieldSet has no custom fields
    }

    createFormItems() {
        let me = this;

        return [fieldset(t('General'), [
            text('name', t('Name'), {required: true}),
            {
                module    : BoolCheckBox,
                name      : 'isTab',
                valueLabel: t('Show as tab'),
                flex      : 'none',
                listeners : {change: ({component}) => me.onIsTabChange(component.checked)}
            }, {
                module    : BoolCheckBox,
                name      : 'collapseIfEmpty',
                valueLabel: t('Collapse when empty'),
                flex      : 'none'
            },
            note(t('Show this fieldset collapsed when all of its field have the initial value')),
            {
                module         : JmapComboBox,
                reference      : 'parentFieldSet',
                name           : 'parentFieldSetId',
                entity         : 'FieldSet',
                properties     : ['id', 'name'],
                jmapFilter     : {entities: [me.forEntity], isTab: true, ...me.entityId ? {exclude: [me.entityId]} : {}},
                labelText      : t('Show on tab'),
                labelPosition  : 'inline',
                placeholderText: t('Default'),
                flex           : 'none'
            },
            textArea('description', t('Description'), {subLabelText: t('This description will show in the edit form')}),
            number('columns', t('Columns'), {minValue: 1, maxValue: 4, stepSize: 1}),
            ...me.extension?.items?.(me) || []
        ])]
    }

    onConstructed() {
        const result = super.onConstructed();

        let me = this;

        // the form loads after a timeout (FormWindow.onConstructed())
        me.form.on({
            beforeload: ({data}) => me.extension?.beforeLoad?.(data, me),
            beforesave: event    => me.extension?.beforeSave?.(event.data, me)
        });

        me.addCard({
            header: {text: t('Permissions')},
            items : [{module: SharePanel, reference: 'sharePanel', flex: 1}]
        });

        me.on('formReady', async ({currentId}) => {
            const panel = me.getReference('sharePanel');

            await panel?.setEntity('FieldSet', currentId || null).catch(e => console.error('SharePanel', e));
            // a new field set's default ACL arrives after the form took its unmodified state
            !currentId && panel && !me.isDestroyed && me.form.setOriginalValue('acl', panel.getSubmitValue())
        });

        return result
    }

    /**
     * A tab can't be on another tab
     * @param {Boolean} isTab
     */
    onIsTabChange(isTab) {
        const combo = this.getReference('parentFieldSet');

        if (combo) {
            combo.disabled = isTab;
            isTab && (combo.value = null)
        }
    }
}

export default Neo.setupClass(FieldSetDialog);
