import LocalCombo from '../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import TextList   from '../../../../../../views/neo/src/list/TextList.mjs';
import {LEVEL_READ} from '../../../../../../views/neo/src/Acl.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {templateStore} from './api.mjs';

/**
 * E-mail template select (ExtJS GO.email.TemplateCombo): the templates of email/template/store
 * as "Name (owner)", the value is the template id; clearing it means no template.
 *
 * The options load after the field may have got its value (a form load): an id without an
 * option yet is kept as {id, name: ''} so the submit value stays the same, and gets its
 * option once the list arrives.
 *
 *     {module: TemplateCombo, name: 'emailSettings.defaultTemplateId', labelText: t('Default template')}
 */
class TemplateCombo extends LocalCombo {
    static config = {
        className    : 'GO.email.settings.TemplateCombo',
        displayField : 'name',
        valueField   : 'id',
        editable     : false,
        labelPosition: 'inline',
        width        : null,
        listConfig   : {module: TextList},
        store        : {keyProperty: 'id', data: []},
        /**
         * Minimum permission level of the listed templates (ExtJS My account: read)
         * @member {Number} permissionLevel=LEVEL_READ
         */
        permissionLevel: LEVEL_READ
    }

    onConstructed() {
        super.onConstructed();
        this.reload()
    }

    /**
     * (Re)loads the options, e.g. after templates were added or renamed
     * @returns {Promise<void>}
     */
    async reload() {
        let me = this;

        try {
            const templates = await templateStore(me.permissionLevel);

            if (me.isDestroyed) {
                return
            }

            const id = me.getSubmitValue();

            me.store.data = templates.map(({id, name, user_name}) => ({id, name: user_name ? `${name} (${user_name})` : name}));

            // the same id as an option record: the submit value does not change
            id !== null && id !== undefined && (me.value = id)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    beforeSetValue(value, oldValue) {
        // 0 is "no template" (DefaultTemplate::template_id)
        if (value === 0 || value === '0') {
            value = null
        }

        if (value !== null && value !== undefined && typeof value !== 'object') {
            // eslint-disable-next-line eqeqeq
            const record = this.store?.items?.find(r => r.id == value);
            value = record || {id: value, name: ''}
        }

        return super.beforeSetValue(value, oldValue)
    }
}

export default Neo.setupClass(TemplateCombo);
