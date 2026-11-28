import Button        from '../../button/Button.mjs';
import EditorJsField from '../../form/field/EditorJsField.mjs';
import Container     from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {escapeHtml}  from '../../Format.mjs';

/**
 * @summary Dev tab: GO.form.field.EditorJsField (Editor.js of sf/editorjs, read-only text without it):
 * value, dirty state, required, read only, HTML import.
 * @class GO.dev.demo.EditorJsField
 * @extends Neo.container.Base
 */
class EditorJsFieldDemo extends Container {
    static config = {
        className: 'GO.dev.demo.EditorJsField',
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
            module   : EditorJsField,
            reference: 'field',
            name     : 'content',
            labelText: 'Content',
            required : true,
            flex     : 'none',
            value    : {blocks: [
                {type: 'header', data: {text: 'Inspection', level: 2}},
                {type: 'paragraph', data: {text: 'Checked the <b>bilge pumps</b>.'}},
                {type: 'list', data: {style: 'unordered', items: [{content: 'Pump 1', items: []}, {content: 'Pump 2', items: []}]}}
            ]}
        }, {
            module: Toolbar,
            flex  : 'none',
            items : [
                {module: Button, text: 'Get value',   handler: () => me.onGetValue()},
                {module: Button, text: 'Validate',    handler: () => me.onValidate()},
                {module: Button, text: 'Read only',   handler: () => me.onReadOnly()},
                {module: Button, text: 'From HTML',   handler: () => me.onFromHtml()}
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

        this.getReference('output').html = `<p>dirty: ${field.isDirty}, fallback: ${field.fallback}</p><pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`
    }

    /**
     * @summary Shows whether the value is valid.
     * @returns {Promise<void>}
     */
    async onValidate() {
        const field = this.getReference('field');

        await field.flush();
        this.getReference('output').html = field.validate(false) ? '<p>valid</p>' : '<p>invalid: content required</p>'
    }

    /**
     * @summary Toggles read only.
     */
    onReadOnly() {
        const field = this.getReference('field');
        field.readOnly = !field.readOnly
    }

    /**
     * @summary Replaces the content with blocks made from HTML, as dms does with a converted .docx.
     * @returns {Promise<void>}
     */
    async onFromHtml() {
        await this.getReference('field').setValueFromHtml('<h2>Imported</h2><p>From <i>HTML</i>.</p><ul><li>One</li><li>Two</li></ul>');
        await this.onGetValue()
    }
}

export default Neo.setupClass(EditorJsFieldDemo);
