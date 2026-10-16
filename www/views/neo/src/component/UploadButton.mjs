import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';
import {t} from '../Translate.mjs';

/**
 * A button that opens the browser's file chooser: a <label> around a hidden
 * <input type="file">. neo's DOM events carry the chosen File objects into the
 * App worker; the component fires `files` with them.
 *
 *     {module: UploadButton, buttonText: 'Upload', accept: '.json', listeners: {files: ({files}) => ...}}
 */
class UploadButton extends Component {
    static config = {
        className: 'GO.component.UploadButton',
        baseCls  : ['go-upload-button', 'neo-button', 'neo-button-secondary'],
        /**
         * @member {Boolean} multiple=true
         */
        multiple: true,
        /**
         * File types the chooser offers, e.g. '.json' or '.csv,.xlsx'
         * @member {String|null} accept=null
         */
        accept: null,
        /**
         * (Component's `text` would replace the label's content)
         * @member {String} buttonText_='Upload'
         */
        buttonText_: t('Upload'),
        _vdom: {tag: 'label', cn: [
            {tag: 'input', type: 'file', multiple: true, cls: ['go-upload-input'], tabIndex: -1},
            {tag: 'span', cls: ['neo-button-text'], text: ''}
        ]}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        // a false boolean attribute would still be set (multiple="false")
        me.vdom.cn[0].multiple = me.multiple || null;
        me.accept && (me.vdom.cn[0].accept = me.accept);

        me.addDomListeners([{
            change: me.onInputChange,
            scope : me
        }])
    }

    afterSetButtonText(value) {
        this.vdom.cn[1].text = value;
        this.update()
    }

    onInputChange({files}) {
        files?.length && this.fire('files', {files: [...files]})
    }
}

export default Neo.setupClass(UploadButton);
