import FormContainer from '../../../node_modules/neo.mjs/src/form/Container.mjs';
import TextField     from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../button/Button.mjs';
import ColorField    from '../../form/field/ColorField.mjs';
import Dialog        from '../../view/Dialog.mjs';
import {t}           from '../../Translate.mjs';
import {select}      from './fieldTypes.mjs';

/**
 * Edits one select option (go.customfields.type.OptionDialog): text and, for Select
 * fields, colours and where they apply. Without colours there is no render mode.
 *
 *     const option = await OptionDialog.ask({appName, windowId, option, colors: true}) // null: cancelled
 */
class OptionDialog extends Dialog {
    static config = {
        className   : 'GO.customfields.admin.OptionDialog',
        cls         : ['go-cf-option-dialog'],
        modal       : true,
        resizable   : false,
        title       : t('Edit custom select option'),
        wrapperStyle: {left: 'calc(50vw - 220px)', top: '20vh', width: 'min(440px, 100vw)'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /**
         * {text, foregroundColor, backgroundColor, renderMode}
         * @member {Object} option={}
         */
        option: {},
        /**
         * Colours and render mode (Select, not MultiSelect)
         * @member {Boolean} colors=true
         */
        colors: true
    }

    /**
     * The edited option, null when cancelled
     * @member {Object|null} answer=null
     */
    answer = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : FormContainer,
            reference: 'form',
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            keys     : {Enter: 'up.onOk'},
            items    : [{
                module       : TextField,
                name         : 'text',
                reference    : 'text',
                labelText    : t('Text'),
                labelPosition: 'inline',
                required     : true,
                // ":" separates the levels of an option path in imports
                validator    : field => !String(field.value || '').includes(':') || t('Invalid input')
            }, ...me.colors ? [{
                module   : ColorField,
                name     : 'foregroundColor',
                labelText: t('Text color')
            }, {
                module   : ColorField,
                name     : 'backgroundColor',
                labelText: t('Background color')
            }, select('renderMode', t('Render mode'), [['cell', t('Cell')], ['row', t('Row')]], {
                reference: 'renderMode'
            })] : []]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, {
                module : Button,
                ui     : 'primary',
                text   : t('Save'),
                handler: () => me.onOk()
            }]
        }]
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        await me.getReference('form').setValues({
            text           : me.option.text || '',
            foregroundColor: me.option.foregroundColor || null,
            backgroundColor: me.option.backgroundColor || null,
            renderMode     : me.option.renderMode || null
        });

        await me.timeout(100);

        const field = !me.isDestroyed && me.getReference('text');
        field && field.focus(field.getInputElId())
    }

    async onOk() {
        let me   = this,
            form = me.getReference('form');

        if (!await form.validate()) {
            return
        }

        const values = await form.getSubmitValues(),
              blank  = color => !color || String(color).toLowerCase() === 'ffffff',
              plain  = blank(values.foregroundColor) && blank(values.backgroundColor);

        if (me.colors && !plain && !values.renderMode) {
            const combo = me.getReference('renderMode');
            combo.error = t('This field is required');
            return
        }

        me.answer = {
            text           : String(values.text).trim(),
            foregroundColor: values.foregroundColor || null,
            backgroundColor: values.backgroundColor || null,
            renderMode     : plain ? null : values.renderMode || null
        };
        me.close()
    }

    /**
     * @param {Object} config appName, windowId, option, colors
     * @returns {Promise<Object|null>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(OptionDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(OptionDialog);
