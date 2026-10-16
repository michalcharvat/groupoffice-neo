import FormContainer from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/Container.mjs';
import NumberField   from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Number.mjs';
import TextArea      from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import Toolbar       from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../../../views/neo/src/button/Button.mjs';
import LocalCombo    from '../../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import {fieldset}    from '../../../../../../../views/neo/src/form/fieldset.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import TextList      from '../../../../../../../views/neo/src/list/TextList.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {getState, setState} from '../../../../../../../views/neo/src/State.mjs';
import Dialog        from '../../../../../../../views/neo/src/view/Dialog.mjs';
import {downloadUrl, t} from '../util.mjs';

const STATE_ID = 'addressbook-labels';

const DEFAULTS = {
    pageFormat: 'A4', rows: 8, columns: 2,
    pageTopMargin: 10, pageRightMargin: 10, pageBottomMargin: 10, pageLeftMargin: 10,
    labelTopMargin: 10, labelRightMargin: 10, labelBottomMargin: 10, labelLeftMargin: 10,
    font: 'dejavusans', fontSize: 9,
    tpl: '{{contact.name}}\n' +
         '[assign address = contact.addresses | filter:type:"postal" | first]\n' +
         '[if !{{address}}]\n' +
         '[assign address = contact.addresses | first]\n' +
         '[/if]\n' +
         '{{address.formatted}}'
};

const number = (name, labelText) => ({module: NumberField, name, labelText, labelPosition: 'inline', minValue: 0, flex: 'none'});

const combo = (name, labelText, options) => ({
    module       : LocalCombo,
    name,
    labelText,
    labelPosition: 'inline',
    width        : null,
    editable     : false,
    clearable    : false,
    displayField : 'name',
    valueField   : 'id',
    listConfig   : {module: TextList},
    store        : {keyProperty: 'id', data: options.map(([id, name]) => ({id, name}))},
    flex         : 'none'
});

/**
 * Address labels as PDF (ExtJS LabelsDialog, Contact/labels) for the contacts of a
 * filter. The settings are remembered (state "addressbook-labels").
 */
class LabelsDialog extends Dialog {
    static config = {
        className   : 'GO.addressbook.view.LabelsDialog',
        cls         : ['go-addressbook-labels-dialog'],
        modal       : true,
        resizable   : true,
        title       : t('Labels'),
        wrapperStyle: {height: '80vh', left: 'calc(50vw - 400px)', top: '10vh', width: '800px'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /**
         * Contact/query filter of the contacts to print
         * @member {Object} filter={}
         */
        filter: {},
        /**
         * Contact/query sort
         * @member {Object[]} sort=[]
         */
        sort: []
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : FormContainer,
            reference: 'form',
            cls      : ['go-scroll'],
            flex     : 1,
            layout   : {ntype: 'hbox', align: 'start'},
            style    : {gap: '16px', overflowY: 'auto', padding: '0 16px'},
            items    : [{
                ntype : 'container',
                flex  : 1,
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [
                    fieldset(t('Page'), [
                        combo('pageFormat', t('Page format'), [['A4', 'A4'], ['Letter', 'Letter']]),
                        number('rows', t('Rows')),
                        number('columns', t('Columns'))
                    ]),
                    fieldset(t('Page margins'), [
                        number('pageTopMargin', t('Top')),
                        number('pageRightMargin', t('Right')),
                        number('pageBottomMargin', t('Bottom')),
                        number('pageLeftMargin', t('Left'))
                    ]),
                    fieldset(t('Font'), [
                        combo('font', t('Family'), [['dejavusans', 'Deja vu Sans'], ['helvetica', 'Helvetica'], ['courier', 'Courier']]),
                        number('fontSize', t('Size'))
                    ])
                ]
            }, {
                ntype : 'container',
                flex  : 1,
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [
                    fieldset(t('Label margins'), [
                        number('labelTopMargin', t('Top')),
                        number('labelRightMargin', t('Right')),
                        number('labelBottomMargin', t('Bottom')),
                        number('labelLeftMargin', t('Left'))
                    ]),
                    fieldset(t('Template'), [
                        {module: TextArea, name: 'tpl', labelText: t('Template'), labelPosition: 'inline', height: 160}
                    ])
                ]
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module   : Button,
                ui       : 'primary',
                reference: 'downloadButton',
                text     : t('Download'),
                handler  : () => me.download()
            }]
        }]
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        const saved = await getState(STATE_ID, me.windowId).catch(() => null);

        me.isDestroyed || await me.getReference('form').setValues({...DEFAULTS, ...(saved || {})})
    }

    async download() {
        let me     = this,
            button = me.getReference('downloadButton');

        button.disabled = true;

        try {
            const values = await me.getReference('form').getSubmitValues();

            setState(STATE_ID, values, me.windowId);

            const {ids}    = await client.call('Contact/query', {filter: me.filter, sort: me.sort}),
                  response = await client.call('Contact/labels', {...values, ids});

            // window.open() after the awaits would be blocked: download the PDF (attachment)
            Neo.Main.redirectTo({url: downloadUrl(response.blobId), windowId: me.windowId})
        } catch (e) {
            notifyError(me, e)
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }
}

export default Neo.setupClass(LabelsDialog);
