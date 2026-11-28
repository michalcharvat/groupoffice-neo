import Button    from '../../button/Button.mjs';
import CodeField from '../../form/field/CodeField.mjs';
import Container from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {escapeHtml} from '../../Format.mjs';

/**
 * @summary Dev tab: GO.form.field.CodeField (CodeMirror 5, a textarea when it does not load):
 * value, dirty state, JSON validation, read only, mode.
 * @class GO.dev.demo.CodeField
 * @extends Neo.container.Base
 */
class CodeFieldDemo extends Container {
    static config = {
        className: 'GO.dev.demo.CodeField',
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {padding: '16px', gap: '12px'}
    }

    /**
     * @summary The field, the buttons and the output.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : CodeField,
            reference: 'field',
            name     : 'configuration',
            labelText: 'Configuration (JSON)',
            required : true,
            flex     : 'none',
            value    : '{\n    "fields": [\n        {"name": "depth", "type": "number"}\n    ]\n}'
        }, {
            module: Toolbar,
            flex  : 'none',
            items : [
                {module: Button, text: 'Get value', handler: () => me.onGetValue()},
                {module: Button, text: 'Validate',  handler: () => me.onValidate()},
                {module: Button, text: 'Read only', handler: () => me.onReadOnly()},
                {module: Button, text: 'Mode',      handler: () => me.onMode()}
            ]
        }, {
            ntype    : 'component',
            reference: 'output',
            flex     : 'none',
            style    : {minHeight: '3em'},
            html     : ''
        }]
    }

    /**
     * @summary Shows the value and whether it changed.
     * @returns {Promise<void>}
     */
    async onGetValue() {
        const field = this.getReference('field'),
              value = await field.flush();

        this.getReference('output').html = `<p>dirty: ${field.isDirty}, mode: ${escapeHtml(field.mode)}</p><pre>${escapeHtml(value ?? '(null)')}</pre>`
    }

    /**
     * @summary Shows the error of the value.
     * @returns {Promise<void>}
     */
    async onValidate() {
        const field = this.getReference('field');

        await field.flush();
        this.getReference('output').html = field.validate(false) ? '<p>valid</p>' : `<p>${escapeHtml(field.error)}</p>`
    }

    /**
     * @summary Toggles read only.
     */
    onReadOnly() {
        const field = this.getReference('field');
        field.readOnly = !field.readOnly
    }

    /**
     * @summary Switches between json and javascript.
     */
    onMode() {
        const field = this.getReference('field');
        field.mode = field.mode === 'json' ? 'javascript' : 'json'
    }
}

export default Neo.setupClass(CodeFieldDemo);
