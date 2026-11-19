import FormContainer from '../../../../../views/neo/node_modules/neo.mjs/src/form/Container.mjs';
import TextArea      from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../views/neo/src/button/Button.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import {notify, notifyError} from '../../../../../views/neo/src/Notify.mjs';
import {t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'customcss');

/**
 * Custom CSS styles and scripts (GO.customcss.MainPanel): the style sheet and script
 * customcss/customcss/data stores in the file storage. The ExtJS page head includes
 * them (CustomcssModule::head()); they target the ExtJS client, so neo does not load them.
 *
 * Not ported: "Select file" (inserts the download URL of a file in public/customcss),
 * which needs a file chooser of the files module.
 */
class CustomCssMain extends FormContainer {
    static config = {
        className : 'GO.customcss.view.CustomCssMain',
        baseCls   : ['go-customcss', 'neo-container'],
        layout    : {ntype: 'vbox', align: 'stretch'},
        /**
         * Route prefix, set by the shell
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            cls   : ['go-bg-mid', 'go-border-bottom'],
            items : [{
                ntype: 'component',
                cls  : ['go-customcss-title'],
                text : t('name')
            }, '->', {
                module   : Button,
                reference: 'saveButton',
                ui       : 'primary',
                icon     : 'save',
                text     : coreT('Save'),
                disabled : true,
                handler  : () => me.save()
            }]
        }, {
            ntype : 'container',
            cls   : ['go-customcss-fields'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module       : TextArea,
                name         : 'css',
                labelText    : t('CSS'),
                labelPosition: 'inline',
                flex         : 1,
                spellCheck   : false
            }, {
                module       : TextArea,
                name         : 'javascript',
                labelText    : t('JavaScript'),
                labelPosition: 'inline',
                flex         : 1,
                spellCheck   : false
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.load()
    }

    /**
     * Reads both files (a request without css / javascript writes nothing)
     * @protected
     */
    async load() {
        let me = this;

        try {
            const {data = {}} = await client.legacy('customcss/customcss/data');

            if (!me.isDestroyed) {
                await me.setValues({css: data.css || '', javascript: data.javascript || ''});
                me.getReference('saveButton').disabled = false
            }
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * Writes both files
     * @protected
     */
    async save() {
        let me     = this,
            button = me.getReference('saveButton');

        button.disabled = true;

        try {
            const values = await me.getValues(),
                  {data = {}} = await client.legacy('customcss/customcss/data', {css: values.css ?? '', javascript: values.javascript ?? ''});

            if (!me.isDestroyed) {
                await me.setValues({css: data.css ?? values.css, javascript: data.javascript ?? values.javascript});
                notify(me, coreT('Saved successfully'))
            }
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }
}

export default Neo.setupClass(CustomCssMain);
