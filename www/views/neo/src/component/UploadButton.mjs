import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';
import uploader from '../jmap/Uploader.mjs';
import {t} from '../Translate.mjs';

/**
 * @summary A button that opens the browser's file chooser.
 *
 * A button that opens the browser's file chooser: a <label> around a hidden
 * <input type="file">. neo's DOM events carry the chosen File objects into the
 * App worker; the component fires `files` with them. With `autoUpload` it uploads them
 * through GO.jmap.Uploader (progress panel, abort) and fires `upload` with the blobs.
 *
 *     {module: UploadButton, buttonText: 'Upload', accept: '.json', listeners: {files: ({files}) => ...}}
 *     {module: UploadButton, autoUpload: true, listeners: {upload: ({blobs}) => ...}}
 *     {module: UploadButton, icon: 'upload'} // the glyph of the classic button, none by default (classic core is text only)
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
         * Upload the chosen files and fire `upload` with their blobs (failures are notified)
         * @member {Boolean} autoUpload=false
         */
        autoUpload: false,
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
        /**
         * Material Symbols ligature before the text, e.g. 'upload'
         * @member {String|null} icon_=null
         */
        icon_: null,
        _vdom: {tag: 'label', cn: [
            {tag: 'input', type: 'file', multiple: true, cls: ['go-upload-input'], tabIndex: -1},
            {tag: 'span', cls: ['neo-button-glyph', 'go-icon'], text: '', removeDom: true, 'aria-hidden': true},
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

    /**
     * A disabled label still opens the chooser: disable the input too
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetDisabled(value, oldValue) {
        super.afterSetDisabled(value, oldValue);

        this.vdom.cn[0].disabled = value || null;
        this.update()
    }

    /**
     * @summary Shows the label text.
     * @param {String} value
     */
    afterSetButtonText(value) {
        this.vdom.cn[2].text = value;
        this.update()
    }

    /**
     * @summary Shows the Material icon before the text, or none.
     * @param {String|null} value
     */
    afterSetIcon(value) {
        Object.assign(this.vdom.cn[1], {text: value || '', removeDom: !value});
        this.update()
    }

    async onInputChange({files}) {
        let me = this;

        if (!files?.length) {
            return
        }

        files = [...files];
        me.fire('files', {files});

        if (me.autoUpload) {
            const blobs = await uploader.uploadMany(files, {component: me});
            blobs.length && !me.isDestroyed && me.fire('upload', {blobs})
        }
    }
}

export default Neo.setupClass(UploadButton);
