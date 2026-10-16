import Field  from '../../../node_modules/neo.mjs/src/form/field/Base.mjs';
import client from '../../jmap/Client.mjs';
import {notifyError} from '../../Notify.mjs';
import {t}    from '../../Translate.mjs';

/**
 * File attachments as one form field (go.form.AttachmentsField): a chip per file with a
 * remove button and an "Attach files" button that uploads the chosen files as blobs.
 * The value is the API's array: [{blobId, name, attachment: true, ...}]; other
 * properties of loaded items (id, inline) are kept.
 *
 *     {module: AttachmentsField, name: 'attachments'}
 */
class AttachmentsField extends Field {
    static config = {
        className: 'GO.form.field.AttachmentsField',
        ntype    : 'go-attachmentsfield',
        baseCls  : ['go-attachmentsfield'],
        /**
         * File types the chooser offers
         * @member {String|null} accept=null
         */
        accept: null,
        /**
         * @member {Object[]|null} value=null
         */
        value: null,
        _vdom:
        {cn: [
            {cls: ['go-attachmentsfield-list'], cn: []},
            {tag: 'label', cls: ['go-attachmentsfield-add'], cn: [
                {tag: 'input', type: 'file', multiple: true, cls: ['go-attachmentsfield-input'], tabIndex: -1},
                {tag: 'span', cls: ['go-icon'], text: 'attach_file'},
                {tag: 'span', cls: ['go-attachmentsfield-add-text']}
            ]}
        ]}
    }

    /** uploads running (flush() waits for them) */
    uploads = new Set()

    get listNode() {return this.vdom.cn[0]}

    construct(config) {
        super.construct(config);

        let me    = this,
            label = me.vdom.cn[1];

        label.cn[2].text = t('Attach files');
        me.accept && (label.cn[0].accept = me.accept);

        me.addDomListeners([
            {change: me.onInputChange, delegate: '.go-attachmentsfield-input',  scope: me},
            {click : me.onRemoveClick, delegate: '.go-attachmentsfield-remove', scope: me}
        ]);

        me.renderList()
    }

    /**
     * @param {Object[]|null} value
     * @returns {Object[]}
     */
    beforeSetValue(value) {
        return Array.isArray(value) ? value.map(a => ({...a})) : []
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        oldValue !== undefined && this.renderList()
    }

    /**
     * @returns {Object[]}
     */
    getSubmitValue() {
        return this.value || []
    }

    get isDirty() {
        const ids = v => (v || []).map(a => a.blobId).join();
        return ids(this.value) !== ids(this.originalConfig.value)
    }

    /**
     * @protected
     */
    renderList() {
        let me = this;

        me.listNode.cn = (me.value || []).map((a, index) => ({
            cls: ['go-attachmentsfield-chip'],
            cn : [
                {tag: 'span', cls: ['go-icon'], text: 'description'},
                {tag: 'a', cls: ['go-attachmentsfield-name'], target: '_blank', rel: 'noopener',
                    href: client.apiUrl + 'download.php?blob=' + encodeURIComponent(a.blobId) + '&inline=1', text: a.name || a.blobId},
                {tag: 'button', type: 'button', cls: ['go-attachmentsfield-remove'], title: t('Remove'),
                    'aria-label': t('Remove'), 'data-index': String(index), text: '×'}
            ]
        }));

        me.update()
    }

    async onInputChange({files}) {
        let me = this;

        if (!files?.length || me.disabled) {
            return
        }

        const upload = Promise.all([...files].map(file => client.upload(file)));

        me.uploads.add(upload);

        try {
            const blobs = await upload;

            if (me.isDestroyed) {
                return
            }

            const oldValue = me.value;

            me.value = [...oldValue || [], ...blobs.map(blob => ({blobId: blob.blobId, name: blob.name, attachment: true}))];
            me.fireUserChangeEvent(me.value, oldValue)
        } catch (e) {
            notifyError(me, e)
        } finally {
            me.uploads.delete(upload)
        }
    }

    /**
     * Waits for running uploads (GO.view.FormWindow calls it before saving)
     * @returns {Promise<void>}
     */
    async flush() {
        await Promise.allSettled([...this.uploads])
    }

    onRemoveClick(data) {
        let me    = this,
            index = Number(data.path?.find(n => n.data?.index !== undefined)?.data.index);

        if (isNaN(index) || me.disabled) {
            return
        }

        const oldValue = me.value;

        me.value = oldValue.filter((a, i) => i !== index);
        me.fireUserChangeEvent(me.value, oldValue)
    }
}

export default Neo.setupClass(AttachmentsField);
