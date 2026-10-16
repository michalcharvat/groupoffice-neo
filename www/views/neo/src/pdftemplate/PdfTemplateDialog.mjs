import Container      from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Hidden         from '../../node_modules/neo.mjs/src/form/field/Hidden.mjs';
import NumberField    from '../../node_modules/neo.mjs/src/form/field/Number.mjs';
import TextArea       from '../../node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField      from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Button         from '../button/Button.mjs';
import ArrayField     from '../form/field/ArrayField.mjs';
import BlobField      from '../form/field/BlobField.mjs';
import BoolCheckBox   from '../form/field/BoolCheckBox.mjs';
import ContainerField from '../form/field/ContainerField.mjs';
import LocalCombo     from '../form/field/LocalCombo.mjs';
import {fieldset}     from '../form/fieldset.mjs';
import TextList       from '../list/TextList.mjs';
import {notify}       from '../Notify.mjs';
import {t}            from '../Translate.mjs';
import FormWindow     from '../view/FormWindow.mjs';
import {defaultTemplateLanguage} from '../emailtemplate/templateItems.mjs';

const combo = (name, labelText, options, config = {}) => ({
    module       : LocalCombo,
    name,
    labelText,
    labelPosition: 'inline',
    flex         : 'none',
    width        : null,
    displayField : 'name',
    valueField   : 'id',
    editable     : false,
    listConfig   : {module: TextList},
    store        : {keyProperty: 'id', data: options.map(([id, name]) => ({id, name}))},
    ...config
});

const number = (name, labelText, config = {}) => ({
    module        : NumberField,
    name,
    labelText,
    labelPosition : 'inline',
    flex          : 'none',
    // neo clamps to maxValue (default 100) and minValue on blur
    maxValue      : Number.MAX_SAFE_INTEGER,
    minValue      : -Number.MAX_SAFE_INTEGER,
    stepSize      : 0.01,
    useSpinButtons: false,
    ...config
});

const textArea = (name, labelText, config = {}) => ({module: TextArea, name, labelText, labelPosition: 'inline', flex: 'none', height: 100, ...config});

/**
 * Creates or edits a PDF template of a module (go.pdftemplate.TemplateDialog): name,
 * language, page (orientation, size, unit, font, stationary PDF, logo), margins, header
 * and footer; the content blocks on their own tab. Stays open after saving, like ExtJS.
 *
 *     Neo.create(PdfTemplateDialog, {appName, windowId, values: {module: {package: 'business', name: 'finance'}, key: '3'}})
 */
class PdfTemplateDialog extends FormWindow {
    static config = {
        className   : 'GO.pdftemplate.PdfTemplateDialog',
        cls         : ['go-form-window', 'go-pdftemplate-dialog'],
        entityName  : 'PdfTemplate',
        title       : t('PDF template'),
        modal       : false,
        closeOnSave : false,
        wrapperStyle: {height: '86vh', left: 'max(0px, calc(50vw - 500px))', top: '7vh', width: 'min(1000px, 100vw)'}
    }

    construct(config) {
        // ExtJS field values of a new template
        config.values = {
            language   : defaultTemplateLanguage(),
            landscape  : false,
            pageSize   : 'A4',
            measureUnit: 'mm',
            fontFamily : 'dejavusans',
            fontSize   : 10,
            marginTop  : 10, marginRight: 10, marginBottom: 10, marginLeft: 10,
            headerX    : 10, headerY: 10,
            footerX    : 10, footerY: -10,
            blocks     : [],
            ...config.values || {}
        };

        super.construct(config)
    }

    addCustomFields() {
        // templates have no custom fields
    }

    createFormItems() {
        return [
            {module: TextField, name: 'name', labelText: t('Name'), labelPosition: 'inline', required: true, flex: 'none'},
            combo('language', t('Language'), Neo.config.goLanguages || [], {editable: true}),
            {
                module: Container,
                cls   : ['go-pdftemplate-columns'],
                flex  : 'none',
                layout: 'base',
                items : [fieldset(t('Page'), [
                    {module: BoolCheckBox, name: 'landscape', valueLabel: t('Landscape'), flex: 'none'},
                    combo('pageSize', t('Page size'), [['A4', 'A4'], ['Letter', 'Letter']]),
                    combo('measureUnit', t('Measure unit'), [['mm', 'Milimeters'], ['in', 'Inches'], ['pt', 'Points'], ['cm', 'Centimeters']]),
                    combo('fontFamily', t('Font'), [
                        ['dejavusans', 'DejaVu Sans'], ['freesans', 'Freesans'], ['freemono', 'Free mono'],
                        ['freeserif', 'Free serif'], ['helvetica', 'Helvetica'], ['times', 'Times New Roman']
                    ]),
                    number('fontSize', t('Font size'), {stepSize: 1, minValue: 1}),
                    {module: BlobField, name: 'stationary', labelText: t('Stationary PDF'), accept: '.pdf', flex: 'none'},
                    {module: BlobField, name: 'logo', labelText: t('Logo'), accept: 'image/*', flex: 'none'}
                ]), fieldset(t('Margins'), [
                    number('marginTop', t('Top')),
                    number('marginRight', t('Right')),
                    number('marginBottom', t('Bottom')),
                    number('marginLeft', t('Left'))
                ])]
            },
            fieldset(t('Header'), [
                {module: Container, cls: ['go-pdftemplate-xy'], flex: 'none', layout: {ntype: 'hbox'}, items: [
                    number('headerX', 'x', {flex: 1}),
                    number('headerY', 'y', {flex: 1})
                ]},
                textArea('header', t('Header') + ' (HTML)')
            ]),
            fieldset(t('Footer'), [
                {module: Container, cls: ['go-pdftemplate-xy'], flex: 'none', layout: {ntype: 'hbox'}, items: [
                    number('footerX', 'x', {flex: 1}),
                    number('footerY', 'y', {flex: 1})
                ]},
                textArea('footer', t('Footer') + ' (HTML)', {
                    subLabelText: t('For page numbers use') + ': <div style="text-align: right; width: 100%;">{{pageNumberWithTotal}}</div>'
                })
            ])
        ]
    }

    onConstructed() {
        const result = super.onConstructed();

        let me = this;

        me.addCard({
            header: {text: t('Content blocks')},
            items : [{
                module   : ArrayField,
                reference: 'blocks',
                name     : 'blocks',
                cls      : ['go-pdftemplate-blocks'],
                flex     : 'none',
                buildField: () => ({
                    module: ContainerField,
                    cls   : ['go-pdftemplate-block'],
                    layout: {ntype: 'vbox', align: 'stretch'},
                    items : [
                        {module: Hidden, name: 'id'},
                        {module: Container, cls: ['go-pdftemplate-block-row'], flex: 'none', layout: {ntype: 'hbox', align: 'start'}, items: [
                            number('x', 'x', {flex: 1, stepSize: 1}),
                            number('y', 'y', {flex: 1, stepSize: 1}),
                            number('width', t('Width'), {flex: 1, stepSize: 1}),
                            number('height', t('Height'), {flex: 1, stepSize: 1}),
                            {module: TextField, name: 'align', labelText: t('Align'), labelPosition: 'inline', flex: 1},
                            {module: TextField, name: 'type', labelText: t('Type'), labelPosition: 'inline', flex: 1},
                            ArrayField.removeButton({flex: 'none'})
                        ]},
                        textArea('content', t('Content'), {required: true, height: 240})
                    ]
                })
            }, {
                module : Button,
                icon   : 'add',
                text   : t('Add block'),
                flex   : 'none',
                cls    : ['go-pdftemplate-add-block'],
                handler: () => me.getReference('blocks').addValue({id: null, x: null, y: null, width: null, height: null, align: 'L', type: 'html', content: ''})
            }]
        });

        me.form.on('beforesave', ({data}) => {
            // a new block has no id yet (Hidden gives '')
            data.blocks?.forEach(block => {
                block.id = block.id ? Number(block.id) : null;
                ['x', 'y', 'width', 'height'].forEach(n => (block[n] === '' || block[n] === undefined) && (block[n] = null))
            })
        });

        return result
    }

    onFormSave(data) {
        super.onFormSave(data);
        this.isDestroyed || notify(this, t('Saved successfully'))
    }
}

export default Neo.setupClass(PdfTemplateDialog);
