import NumberField  from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Number.mjs';
import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import ActionTable  from '../../../../../../../views/neo/src/list/ActionTable.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'multi_instance');

const GB = 1024 * 1024 * 1024;

/**
 * GO instance (multi_instance InstanceDialog + AllowedModulesPanel): host name (fixed once
 * created), trial, storage quota in GB, maximum users and, once it exists, the modules the
 * instance may install. A new instance stays open on its modules after the first save.
 */
class InstanceDialog extends FormWindow {
    static config = {
        className   : 'GO.multi_instance.view.InstanceDialog',
        entityName  : 'Instance',
        title       : t('Instance'),
        closeOnSave : false,
        wrapperStyle: {height: 'min(800px, 90vh)', left: 'calc(50vw - 330px)', top: '5vh', width: 'min(660px, 100vw)'}
    }

    /**
     * Modules of the loaded instance: [{package, module, title, localizedPackage, allowed}]
     * @member {Object[]} modules=[]
     */
    modules = []

    /**
     * A module was (dis)allowed
     * @member {Boolean} modulesChanged=false
     */
    modulesChanged = false

    createFormItems() {
        const field = (module, name, labelText, config = {}) => ({module, name, labelText, labelPosition: 'inline', ...config});

        return [
            field(TextField, 'hostname', t('Hostname'), {required: true, reference: 'hostname'}),
            {module: BoolCheckBox, name: 'isTrial', valueLabel: 'This is a trial (will be deactivated automatically after 30 days)'},
            field(NumberField, 'storageQuota', t('Storage quota'), {minValue: 0}),
            {ntype: 'component', cls: ['go-field-hint'], flex: 'none', text: t('Size in GB')},
            field(NumberField, 'usersMax', t('Maximum number of users'), {minValue: 0, stepSize: 1})
        ]
    }

    addCustomFields() {
        // Instance has no custom fields
    }

    onConstructed() {
        const result = super.onConstructed();

        let me = this;

        me.addCard({
            header: {text: t('Modules')},
            items : [{
                module   : ActionTable,
                reference: 'modules',
                flex     : 'none',
                emptyText: t('Save the instance first'),
                columns  : [
                    {text: t('Allowed'), field: 'allowed', type: 'check'},
                    {text: 'Package', field: 'localizedPackage'},
                    {text: 'Module', field: 'title', flex: true}
                ],
                listeners: {check: () => me.modulesChanged = true}
            }]
        });

        me.form.on({
            // bytes ↔ GB (ExtJS numberfield multiplier)
            beforeload: ({data}) => {
                data.storageQuota = data.storageQuota ? Math.round(data.storageQuota / GB * 100) / 100 : data.storageQuota
            },
            load      : ({data}) => me.showModules(data),
            beforesave: ({data}) => {
                'storageQuota' in data && data.storageQuota !== null && data.storageQuota !== '' &&
                    (data.storageQuota = Math.round(data.storageQuota * GB));

                if (me.modulesChanged) {
                    data.allowedModules = me.modules.filter(m => m.allowed).map(m => m.package + '/' + m.module)
                }
            }
        });

        me.on('save', ({data, isNew}) => me.afterSave(data?.id || me.form.currentId, isNew));

        return result
    }

    /**
     * @param {Object} instance
     */
    showModules(instance) {
        let me = this;

        me.modulesChanged = false;
        me.modules = (instance.allowedModules || []).map(m => ({...m, id: m.package + '/' + m.module}))
            .sort((a, b) => (a.localizedPackage || '').localeCompare(b.localizedPackage || '') || (a.title || '').localeCompare(b.title || ''));

        me.getReference('modules').records = me.modules;
        // the host name names the instance's folders and database
        me.getReference('hostname').disabled = !!instance.id
    }

    /**
     * ExtJS: a new instance shows its modules, an edited one closes
     * @param {String} id
     * @param {Boolean} isNew
     */
    async afterSave(id, isNew) {
        let me = this;

        if (!isNew) {
            me.close();
            return
        }

        await me.form.load(id);
        me.isDestroyed || (me.cards.activeIndex = 1)
    }
}

export default Neo.setupClass(InstanceDialog);
