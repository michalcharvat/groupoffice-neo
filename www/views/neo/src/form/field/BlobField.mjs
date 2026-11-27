import Field  from '../../../node_modules/neo.mjs/src/form/field/Base.mjs';
import client from '../../jmap/Client.mjs';
import uploader from '../../jmap/Uploader.mjs';
import {notifyError} from '../../Notify.mjs';
import {t}    from '../../Translate.mjs';

/**
 * One uploaded file as a form field (go.form.FileButtonField): the value is the blob as
 * the API gives it ({id, name, …}, e.g. PdfTemplate `logo`), null for none. Shows the file
 * as a link, a button to upload another and one to remove it. A failed upload makes the
 * field invalid with the error until another upload or remove, so the form does not save
 * the old file as if it were the new one.
 *
 *     {module: BlobField, name: 'logo', labelText: t('Logo'), accept: 'image/*'}
 */
class BlobField extends Field {
    /** uploads running (flush() waits for them) */
    uploads = new Set()
    /** message of the last failed upload, null for none */
    uploadError = null
    /** number of the latest upload: an older one that settles later is ignored */
    uploadSeq = 0

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
            ]},
            {cls: ['go-blobfield-error'], removeDom: true}
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

    /**
     * A failed upload or `required` without a file; shows the error unless silent (a
     * shown error always follows the current one)
     * @param {Boolean} [silent=true]
     * @returns {Boolean}
     */
    validate(silent = true) {
        let me    = this,
            error = me.uploadError || (me.required && !me.value?.id ? t('Required field') : null),
            node  = me.vdom.cn[5];

        if ((!silent || !error || !node.removeDom) && node.text !== (error || '')) {
            node.text      = error || '';
            node.removeDom = !error;
            me.update()
        }

        return !error
    }

    isValid() {
        return this.validate(true)
    }

    reset(value = null) {
        let me = this;

        me.uploadSeq++;
        me.uploadError = null;
        super.reset(value);
        me.renderValue();
        me.validate(true)
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
        // also after a failed first upload: Remove discards it
        clear.removeDom = !value && !me.uploadError;
        me.update()
    }

    async onInputChange({files}) {
        let me   = this,
            file = files?.[0];

        if (!file || me.disabled) {
            return
        }

        const seq = ++me.uploadSeq;

        // flush() waits for the outcome, so a failure is marked before the form validates
        const upload = uploader.upload(file, {component: me}).then(blob => {
            const oldValue = me.value;

            if (!me.isDestroyed && seq === me.uploadSeq) {
                me.uploadError = null;
                me.value = {id: blob.blobId, name: blob.name};
                me.fireUserChangeEvent(me.value, oldValue);
                me.validate(true)
            }
        }, e => {
            // an upload the user aborted keeps the old file without an error
            if (!me.isDestroyed && seq === me.uploadSeq && !uploader.constructor.isAbort(e)) {
                me.uploadError = e?.message || String(e);
                me.renderValue();
                me.validate(false);
                notifyError(me, e)
            }
        }).finally(() => me.uploads?.delete(upload));

        me.uploads.add(upload);
        await upload
    }

    /**
     * Waits for a running upload (GO.view.FormWindow calls it before saving)
     * @returns {Promise<void>}
     */
    async flush() {
        // an upload started while waiting is waited for too
        while (this.uploads?.size) {
            await Promise.allSettled([...this.uploads])
        }
    }

    onClearClick() {
        let me       = this,
            oldValue = me.value;

        if (me.disabled) {
            return
        }

        me.uploadSeq++;
        me.uploadError = null;
        me.value = null;
        me.fireUserChangeEvent(null, oldValue);
        me.renderValue();
        me.validate(true)
    }
}

export default Neo.setupClass(BlobField);
