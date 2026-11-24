import NeoTextField  from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import NumberField   from '../../../node_modules/neo.mjs/src/form/field/Number.mjs';
import PasswordField from '../../../node_modules/neo.mjs/src/form/field/Password.mjs';
import TextArea      from '../../../node_modules/neo.mjs/src/form/field/TextArea.mjs';
import FormDemo, {option, optionRow} from './FormDemo.mjs';
import {t}           from '../../Translate.mjs';

const PATTERN = /^[a-zA-Z0-9_]*$/;

/**
 * Applies a config to the demo's text field and validates it again
 * @param {GO.dev.demo.FormDemo} demo
 * @param {Object} config
 */
function setText(demo, config) {
    const field = demo?.getReference('text');

    // the controls fire change while they are created, before they are in the demo
    if (!field) {
        return
    }

    field.set(config);
    field.validate?.(false)
}

/**
 * Dev demo: GOUI TextField (goui-docs form/TextFieldPage.ts) with neo's Text, TextArea and
 * Password fields in the GO look (labelPosition 'inline'): appearance and validation
 * options toggled live on one field.
 */
class TextFieldDemo extends FormDemo {
    static config = {
        className: 'GO.dev.demo.TextField',
        intro    : `<p>${t('Text fields can have various states and types. Play around with them below. The field only allows letters, digits and _ (inputPattern), and a validator refuses the text "custom".')}</p>`,
        fields   : [{
            module       : NeoTextField,
            reference    : 'text',
            name         : 'text',
            labelText    : t('Text'),
            labelPosition: 'inline',
            inputPattern : PATTERN,
            validator    : field => field.value === 'custom' ? t("You can't use 'custom' as a value") : true
        }, {
            module       : TextArea,
            name         : 'textarea',
            labelText    : t('Text area'),
            labelPosition: 'inline',
            height       : 120
        }, {
            module       : PasswordField,
            name         : 'password',
            labelText    : t('Password'),
            labelPosition: 'inline',
            autoComplete : 'new-password'
        }],
        sample: {text: 'hello_world', textarea: 'Line 1\nLine 2', password: 'secret'},
        extra : [
            optionRow([
                option(t('Disabled'), (demo, checked) => setText(demo, {disabled: checked})),
                option(t('Read only'), (demo, checked) => setText(demo, {readOnly: checked})),
                option(t('Required'), (demo, checked) => setText(demo, {required: checked})),
                option(t('Clear button'), (demo, checked) => setText(demo, {clearable: checked}), {checked: true}),
                option(t('Hint'), (demo, checked) => setText(demo, {subLabelText: checked ? t('Please enter something useful') : null})),
                option(t('Pattern'), (demo, checked) => setText(demo, {inputPattern: checked ? PATTERN : null}), {checked: true})
            ]),
            optionRow([{
                module       : NumberField,
                labelText    : t('Min length'),
                labelPosition: 'inline',
                width        : 140,
                minValue     : 0,
                listeners    : {change: ({component, value}) => setText(component.up({className: 'GO.dev.demo.TextField'}), {minLength: value || null})}
            }, {
                module       : NumberField,
                labelText    : t('Max length'),
                labelPosition: 'inline',
                width        : 140,
                minValue     : 0,
                listeners    : {change: ({component, value}) => setText(component.up({className: 'GO.dev.demo.TextField'}), {maxLength: value || null})}
            }])
        ]
    }
}

export default Neo.setupClass(TextFieldDemo);
