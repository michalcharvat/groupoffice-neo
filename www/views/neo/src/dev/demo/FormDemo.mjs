import Button        from '../../button/Button.mjs';
import Container     from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import FormContainer from '../../../node_modules/neo.mjs/src/form/Container.mjs';
import TextArea      from '../../../node_modules/neo.mjs/src/form/field/TextArea.mjs';
import '../../form/nestedFields.mjs';
import {escapeHtml}  from '../../Format.mjs';

/**
 * Dev demo base for form fields: a form with the demo's `fields`, a JSON box for
 * setValues() (prefilled with `sample`) and buttons for getValues(), setValues(),
 * reset(), validate(). The output shows the result and every change event.
 *
 *     class MyDemo extends FormDemo {
 *         static config = {className: 'GO.dev.demo.My', fields: [...], sample: {...}}
 *     }
 */
class FormDemo extends Container {
    static config = {
        className: 'GO.dev.demo.FormDemo',
        cls      : ['go-dev-formdemo'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {padding: '16px', gap: '16px', overflow: 'auto'},
        // a vbox shrinks its items to fit: let the page scroll instead
        itemDefaults: {flex: 'none'},
        /**
         * Intro text (static, HTML)
         * @member {String} intro=''
         */
        intro: '',
        /**
         * Field configs of the form
         * @member {Object[]} fields=[]
         */
        fields: [],
        /**
         * Values for "setValues()"
         * @member {Object} sample={}
         */
        sample: {},
        /**
         * Items below the buttons (more demos)
         * @member {Object[]} extra=[]
         */
        extra: []
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [
            me.intro && {ntype: 'component', cls: ['go-dev-intro'], html: me.intro},
            {
                module   : FormContainer,
                reference: 'form',
                layout   : {ntype: 'vbox', align: 'stretch'},
                style    : {gap: '20px', maxWidth: '640px', paddingTop: '8px'},
                items    : me.fields
            }, {
                module   : TextArea,
                reference: 'json',
                labelText: 'setValues() JSON',
                labelPosition: 'inline',
                height   : 120,
                style    : {maxWidth: '640px'},
                value    : JSON.stringify(me.sample, null, 1)
            }, {
                ntype : 'container',
                layout: {ntype: 'hbox', wrap: 'wrap'},
                style : {gap: '8px'},
                items : [
                    ['getValues()', 'onGetValues'],
                    ['setValues()', 'onSetValues'],
                    ['reset()', 'onReset'],
                    ['validate()', 'onValidate']
                ].map(([text, fn]) => ({module: Button, ui: 'secondary', text, handler: () => me[fn]().catch(e => me.log(String(e)))}))
            },
            ...me.extra,
            {
                ntype    : 'component',
                reference: 'output',
                tag      : 'pre',
                cls      : ['go-dev-output'],
                html     : ''
            }
        ].filter(Boolean)
    }

    onConstructed() {
        super.onConstructed();

        this.getReference('form').on('fieldChange', ({component, value}) => {
            this.log(`change ${component.name || component.id}: ${JSON.stringify(value)}`)
        })
    }

    /**
     * Prepends a line to the output
     * @param {String} text
     */
    log(text) {
        const output = this.getReference('output');
        output.html = escapeHtml(text) + '\n' + output.html.split('\n').slice(0, 30).join('\n')
    }

    async onGetValues() {
        this.log('getValues(): ' + JSON.stringify(await this.getReference('form').getValues()))
    }

    async onSetValues() {
        await this.getReference('form').setValues(JSON.parse(this.getReference('json').value || '{}'));
        this.log('setValues() done')
    }

    async onReset() {
        await this.getReference('form').reset({});
        this.log('reset() done')
    }

    async onValidate() {
        this.log('validate(): ' + await this.getReference('form').validate())
    }
}

export default Neo.setupClass(FormDemo);
