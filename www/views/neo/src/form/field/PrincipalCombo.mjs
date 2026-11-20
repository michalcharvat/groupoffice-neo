import Trigger       from '../../../node_modules/neo.mjs/src/form/field/trigger/Base.mjs';
import JmapComboBox  from './JmapComboBox.mjs';
import PrincipalList, {principalAvatarHtml} from './PrincipalList.mjs';
import {t}           from '../../Translate.mjs';

/**
 * Avatar of the selected principal left of the text (GOUI PrincipalCombo). Clicking it
 * focuses the input like any trigger.
 */
class AvatarTrigger extends Trigger {
    static config = {
        // not below 'GO.form.field.PrincipalCombo': setupClass() would find that
        // namespace taken and return this object instead of the combo class
        className: 'GO.form.field.PrincipalComboAvatarTrigger',
        align    : 'start',
        baseCls  : ['neo-field-trigger', 'go-principal-combo-avatar'],
        hidden   : true,
        type     : 'avatar',
        weight   : 0
    }

    /**
     * A principal to show: set by setPrincipal()
     * @member {Boolean} hasPrincipal=false
     */
    hasPrincipal = false

    /**
     * Text.afterSetReadOnly(false) shows the triggers again: not this one without a principal
     * @returns {Boolean}
     */
    getHiddenState() {
        return !this.hasPrincipal
    }

    /**
     * @param {Object|null} principal {name, avatarId}, null hides the avatar
     */
    setPrincipal(principal) {
        let me   = this,
            name = String(principal?.name ?? '');

        me.hasPrincipal = Boolean(name || principal?.avatarId);
        me.hasPrincipal && (me.html = principalAvatarHtml(principal));
        // a read-only field hides its triggers (Text.afterSetReadOnly)
        me.hidden = !me.hasPrincipal || Boolean(me.field?.readOnly)
    }
}

Neo.setupClass(AvatarTrigger);

/**
 * Pick a user, group or contact (core Principal), like GOUI PrincipalCombo.
 * The value is the principal id; for users that is the user id. The selected
 * principal shows its avatar like the items of the list.
 *
 *     {module: PrincipalCombo, principalEntity: 'User', name: 'userId'}
 */
class PrincipalCombo extends JmapComboBox {
    static config = {
        className   : 'GO.form.field.PrincipalCombo',
        baseCls     : ['go-principal-combo', 'go-jmapcombo', 'neo-combobox', 'neo-pickerfield', 'neo-textfield'],
        entity      : 'Principal',
        name        : 'userId',
        displayField: 'name',
        properties  : ['id', 'name', 'description', 'avatarId', 'type', 'email'],
        jmapSort    : [{property: 'name', isAscending: true}],
        listConfig  : {module: PrincipalList},
        // the avatar trigger is styled in PrincipalList.scss, which neo loads only with the list:
        // without it the avatar keeps the generic trigger chevron (::before), peeking out at its left
        additionalThemeFiles: ['GO.form.field.PrincipalList'],
        /**
         * Only principals of this entity, e.g. "User" (Principal filter "entity")
         * @member {String|null} principalEntity=null
         */
        principalEntity: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.triggers = [...me.triggers, AvatarTrigger];
        me.getTrigger('avatar')?.setPrincipal(me.value);

        if (me.principalEntity) {
            me.setJmapFilter({entity: me.principalEntity});
            // GOUI: a user picker is labelled "User"
            me.principalEntity === 'User' && !config.labelText && (me.labelText = t('User'))
        }
    }

    /**
     * The avatar follows the text: a picked record, a loaded entity or nothing
     * @param {Object|null} value
     * @protected
     */
    updateInputValueFromValue(value) {
        super.updateInputValueFromValue(value);
        this.getTrigger('avatar')?.setPrincipal(value)
    }

    /**
     * Typing drops the selection silently (ComboBox: `_value = null`): the avatar goes too
     * @param {String} inputValue
     * @protected
     */
    updateValueFromInputValue(inputValue) {
        super.updateValueFromInputValue(inputValue);
        this.getTrigger('avatar')?.setPrincipal(this._value)
    }
}

export default Neo.setupClass(PrincipalCombo);
