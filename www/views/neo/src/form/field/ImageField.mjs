import Field         from './Field.mjs';
import client        from '../../jmap/Client.mjs';
import uploader      from '../../jmap/Uploader.mjs';
import {notifyError} from '../../Notify.mjs';
import {escapeHtml}  from '../../Format.mjs';
import {t}           from '../../Translate.mjs';

/**
 * go.form.ImageField: an image as a blob id, e.g. a contact's photoBlobId. Click the
 * picture to upload one (JMAP blob), "delete" removes it. A failed upload makes the field
 * invalid with the error until another upload or delete.
 *
 *     {module: ImageField, name: 'photoBlobId', placeholderIcon: 'business'}
 */
class ImageField extends Field {
    /** uploads running (flush() waits for them) */
    uploads = new Set()
    /** message of the last failed upload, null for none */
    uploadError = null
    /** number of the latest upload: an older one that settles later is ignored */
    uploadSeq = 0

    static config = {
        className: 'GO.form.field.ImageField',
        ntype    : 'go-imagefield',
        baseCls  : ['go-field', 'go-imagefield'],
        /**
         * Material icon without an image
         * @member {String} placeholderIcon_='person'
         */
        placeholderIcon_: 'person'
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {change: me.onFileChange,  delegate: '.go-imagefield-input', scope: me},
            {click : me.onClearClick,  delegate: '.go-imagefield-clear', scope: me}
        ])
    }

    afterSetPlaceholderIcon(value, oldValue) {
        oldValue !== undefined && this.renderControl()
    }

    getSubmitValue() {
        return this.value || null
    }

    createControl() {
        let me     = this,
            locked = me.readOnly || me.disabled;

        return [{
            tag  : 'label',
            cls  : ['go-imagefield-image'],
            title: t('Upload'),
            cn   : [
                me.value
                    ? {tag: 'img', alt: '', src: client.baseUrl + 'api/thumb.php?blob=' + encodeURIComponent(me.value) + '&w=240&h=240&zc=1'}
                    : {tag: 'i', cls: ['go-icon'], text: escapeHtml(me.placeholderIcon)},
                {tag: 'input', type: 'file', accept: 'image/*', cls: ['go-imagefield-input'], removeDom: locked}
            ]
        }, {
            tag      : 'i',
            cls      : ['go-icon', 'go-imagefield-clear'],
            text     : 'delete',
            title    : t('Delete'),
            // also after a failed first upload: Delete discards it
            removeDom: (!me.value && !me.uploadError) || locked
        }]
    }

    async onFileChange({files}) {
        let me   = this,
            file = files?.[0];

        if (!file) {
            return
        }

        const seq = ++me.uploadSeq;

        // flush() waits for the outcome, so a failure is marked before the form validates
        const upload = uploader.upload(file, {component: me}).then(blob => {
            if (!me.isDestroyed && seq === me.uploadSeq) {
                me.uploadError = null;
                me.userChange(blob.blobId || blob.id)
            }
        }, e => {
            // an upload the user aborted keeps the old file without an error
            if (!me.isDestroyed && seq === me.uploadSeq && !uploader.constructor.isAbort(e)) {
                me.uploadError = e?.message || String(e);
                me.renderControl();
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

    getError() {
        return this.uploadError || super.getError()
    }

    reset(value = null) {
        this.uploadSeq++;
        this.uploadError = null;
        super.reset(value);
        this.renderControl()
    }

    onClearClick() {
        this.uploadSeq++;
        this.uploadError = null;
        this.userChange(null);
        this.renderControl()
    }
}

export default Neo.setupClass(ImageField);
