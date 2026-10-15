import Button    from '../../button/Button.mjs';
import Container from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import HtmlField from '../../form/field/HtmlField.mjs';
import Toolbar   from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';

const escape = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);

/**
 * Dev tab: GO.form.field.HtmlField with get / set value
 */
class HtmlFieldDemo extends Container {
    static config = {
        className: 'GO.dev.demo.HtmlField',
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {padding: '16px', gap: '12px'}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module     : HtmlField,
            reference  : 'field',
            name       : 'content',
            labelText  : 'Content',
            placeholder: 'Type something…',
            flex       : 1,
            value      : '<p>Hello <b>world</b></p><ul><li>one</li><li>two</li></ul>'
        }, {
            module: Toolbar,
            flex  : 'none',
            items : [{
                module : Button,
                text   : 'Get value',
                handler: () => me.onGetValue()
            }, {
                module : Button,
                text   : 'Set value',
                handler: () => me.onSetValue()
            }, {
                module : Button,
                text   : 'Read only',
                handler: () => me.onReadOnly()
            }]
        }, {
            ntype    : 'component',
            reference: 'output',
            flex     : 'none',
            style    : {fontFamily: 'monospace', whiteSpace: 'pre-wrap', minHeight: '3em'},
            html     : ''
        }]
    }

    async onGetValue() {
        const value = await this.getReference('field').flush();
        this.getReference('output').html = escape(value) || '<i>(empty)</i>'
    }

    onSetValue() {
        this.getReference('field').value = '<h3>Set from the worker</h3><p>at ' + new Date().toLocaleTimeString() + ' <img src="x" onerror="console.warn(\'HTMLFIELD-XSS\')"></p>'
    }

    onReadOnly() {
        const field = this.getReference('field');
        field.readOnly = !field.readOnly
    }
}

export default Neo.setupClass(HtmlFieldDemo);
