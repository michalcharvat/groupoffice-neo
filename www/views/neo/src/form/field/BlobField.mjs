import Field  from '../../../node_modules/neo.mjs/src/form/field/Base.mjs';
import client from '../../jmap/Client.mjs';
import {notifyError} from '../../Notify.mjs';
import {t}    from '../../Translate.mjs';

/**
 * One uploaded file as a form field (go.form.FileButtonField): the value is the blob as
 * the API gives it ({id, name, …}, e.g. PdfTemplate `logo`), null for none. Shows the file
 * as a link, a button to upload another and one to remove it.
 *
 *     {module: BlobField, name: 'logo', labelText: t('Logo'), accept: 'image/*'}
 */
class BlobField extends Field {
    /** uploads running (flush() waits for them) */
    uploads = new Set()

    static config = {
        className: 'GO.form.field.BlobField',
        ntype    : 'go-blobfield',
        baseCls  : ['go-blobfield'],
        /**
         * @member {String|null} labelText=null
         */
        labelText: null,
        /**
         * File types the chooser offers
         * @member {String|null} accept=null
         */
        accept: null,
        /**
         * @member {Object|null} value=null
         */
        value: null,
        _vdom:
        {cn: [
            {tag: 'span', cls: ['go-blobfield-label']},
            {tag: 'a', cls: ['go-blobfield-link'], target: '_blank', rel: 'noopener'},
            {tag: 'span', cls: ['go-blobfield-empty']},
            {tag: 'label', cls: ['go-blobfield-upload'], cn: [
                {tag: 'input', type: 'file', cls: ['go-blobfield-input'], tabIndex: -1},
                {tag: 'span', cls: ['go-icon'], text: 'upload'}
            ]},
            {tag: 'button', type: 'button', cls: ['go-blobfield-clear'], cn: [
                {tag: 'span', cls: ['go-icon'], text: 'close'}
            ]}
        ]}
    }

    construct(config) {
        super.construct(config);

        let me = this,
            cn = me.vdom.cn;

        cn[0].text  = me.labelText || '';
        cn[2].text  = t('None');
        cn[3].title = t('Upload');
        cn[4].title = t('Remove');
        me.accept && (cn[3].cn[0].accept = me.accept);

        me.addDomListeners([
            {change: me.onInputChange, delegate: '.go-blobfield-input', scope: me},
            {click : me.onClearClick,  delegate: '.go-blobfield-clear', scope: me}
        ]);

        me.renderValue()
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        oldValue !== undefined && this.renderValue()
    }

    /**
     * @param {Object|String|null} value a blob, or a blob id
     * @returns {Object|null}
     */
    beforeSetValue(value) {
        return !value ? null : typeof value === 'object' ? {...value} : {id: String(value)}
    }

    getSubmitValue() {
        return this.value?.id ? this.value : null
    }

    get isDirty() {
        return (this.value?.id || null) !== (this.beforeSetValue(this.originalConfig.value)?.id || null)
    }

    /**
     * @protected
     */
    renderValue() {
        let me    = this,
            [, link, empty, , clear] = me.vdom.cn,
            value = me.value?.id;

        link.href       = value ? client.apiUrl + 'download.php?blob=' + encodeURIComponent(value) + '&inline=1' : null;
        link.text       = me.value?.name || t('Download');
        link.removeDom  = !value;
        empty.removeDom = !!value;
        clear.removeDom = !value;
        me.update()
    }

    async onInputChange({files}) {
        let me   = this,
            file = files?.[0];

        if (!file || me.disabled) {
            return
        }

        const upload = client.upload(file);

        me.uploads.add(upload);

        try {
            const blob     = await upload,
                  oldValue = me.value;

            if (!me.isDestroyed) {
                me.value = {id: blob.blobId, name: blob.name};
                me.fireUserChangeEvent(me.value, oldValue)
            }
        } catch (e) {
            notifyError(me, e)
        } finally {
            me.uploads.delete(upload)
        }
    }

    /**
     * Waits for a running upload (GO.view.FormWindow calls it before saving)
     * @returns {Promise<void>}
     */
    async flush() {
        await Promise.allSettled([...this.uploads])
    }

    onClearClick() {
        let me       = this,
            oldValue = me.value;

        if (me.disabled) {
            return
        }

        me.value = null;
        me.fireUserChangeEvent(null, oldValue)
    }
}

export default Neo.setupClass(BlobField);
