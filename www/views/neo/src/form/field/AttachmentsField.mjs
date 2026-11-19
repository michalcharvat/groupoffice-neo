import Field  from '../../../node_modules/neo.mjs/src/form/field/Base.mjs';
import client from '../../jmap/Client.mjs';
import uploader from '../../jmap/Uploader.mjs';
import {notifyError} from '../../Notify.mjs';
import {t}    from '../../Translate.mjs';
import TextPrompt from '../../view/TextPrompt.mjs';

/**
 * File attachments as one form field (go.form.AttachmentsField): a chip per file with a
 * remove button and an "Attach files" button that uploads the chosen files as blobs.
 * The value is the API's array: [{blobId, name, attachment: true, ...}]; other
 * properties of loaded items (id, inline) are kept.
 *
 *     {module: AttachmentsField, name: 'attachments'}
 *
 * The custom field type Attachments stores [{blobId, name, description}]: it sets
 * hasDisposition false (no `attachment` flag) and hasDescription (an edit button per
 * file for its description).
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
         * Each file has a description, edited with the pencil button of its chip
         * @member {Boolean} hasDescription=false
         */
        hasDescription: false,
        /**
         * New files get `attachment: true` (an e-mail attachment, not inline)
         * @member {Boolean} hasDisposition=true
         */
        hasDisposition: true,
        /**
         * Several files; false: a chosen file replaces the current one
         * @member {Boolean} multiple=true
         */
        multiple: true,
        /**
         * Label above the files, none when empty
         * @member {String|null} labelText=null
         */
        labelText: null,
        /**
         * True makes an empty list invalid
         * @member {Boolean} required=false
         */
        required: false,
        /**
         * @member {Object[]|null} value=null
         */
        value: null,
        _vdom:
        {cn: [
            {tag: 'span', cls: ['go-attachmentsfield-label'], removeDom: true},
            {cls: ['go-attachmentsfield-list'], cn: []},
            {tag: 'label', cls: ['go-attachmentsfield-add'], cn: [
                {tag: 'input', type: 'file', multiple: true, cls: ['go-attachmentsfield-input'], tabIndex: -1},
                {tag: 'span', cls: ['go-icon'], text: 'attach_file'},
                {tag: 'span', cls: ['go-attachmentsfield-add-text']}
            ]},
            {cls: ['go-attachmentsfield-error'], removeDom: true}
        ]}
    }

    /** uploads running (flush() waits for them) */
    uploads = new Set()

    get listNode() {return this.vdom.cn[1]}

    construct(config) {
        super.construct(config);

        let me    = this,
            label = me.vdom.cn[2];

        if (me.labelText) {
            me.vdom.cn[0].text      = me.labelText;
            me.vdom.cn[0].removeDom = false
        }

        label.cn[2].text = t('Attach files');
        me.accept && (label.cn[0].accept = me.accept);
        label.cn[0].multiple = me.multiple;
        me.multiple || (label.cn[2].text = t('Attach file'));

        me.addDomListeners([
            {change: me.onInputChange, delegate: '.go-attachmentsfield-input',  scope: me},
            {click : me.onRemoveClick, delegate: '.go-attachmentsfield-remove', scope: me},
            {click : me.onEditClick,   delegate: '.go-attachmentsfield-edit',   scope: me}
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
        const ids = v => JSON.stringify((v || []).map(a => [a.blobId, a.description || '']));
        return ids(this.value) !== ids(this.originalConfig.value)
    }

    /**
     * Checks `required`; shows the error unless silent (an error that went away is always cleared)
     * @param {Boolean} [silent=true]
     * @returns {Boolean}
     */
    validate(silent = true) {
        let me    = this,
            error = me.required && !me.value?.length ? t('Required field') : null,
            node  = me.vdom.cn[3];

        if ((!silent || !error) && node.text !== (error || '')) {
            node.text      = error || '';
            node.removeDom = !error;
            me.update()
        }

        return !error
    }

    isValid() {
        return this.validate(true)
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
                ...me.hasDescription && a.description ? [{tag: 'span', cls: ['go-attachmentsfield-description'], text: a.description}] : [],
                ...me.hasDescription ? [{tag: 'button', type: 'button', cls: ['go-attachmentsfield-edit'], title: t('Edit'),
                    'aria-label': t('Edit'), 'data-index': String(index), cn: [{tag: 'span', cls: ['go-icon'], text: 'edit'}]}] : [],
                {tag: 'button', type: 'button', cls: ['go-attachmentsfield-remove'], title: t('Remove'),
                    'aria-label': t('Remove'), 'data-index': String(index), text: '×'}
            ]
        }));

        me.validate(true);
        me.update()
    }

    async onInputChange({files}) {
        let me = this;

        if (!files?.length || me.disabled) {
            return
        }

        // failed uploads are reported, the others are added
        const upload = uploader.uploadMany(files, {component: me});

        me.uploads.add(upload);

        try {
            const blobs = await upload;

            if (me.isDestroyed || !blobs.length) {
                return
            }

            const oldValue = me.value,
                  added    = blobs.map(blob => ({
                      blobId: blob.blobId,
                      name  : blob.name,
                      ...me.hasDisposition ? {attachment: true} : {},
                      ...me.hasDescription ? {description: ''} : {}
                  }));

            // blobs are content hashes: the same content again keeps the existing entry
            // (the custom field stores one row per blob and would drop its description)
            const current = new Set((oldValue || []).map(a => a.blobId)),
                  fresh   = added.filter((a, i) => !current.has(a.blobId) && added.findIndex(b => b.blobId === a.blobId) === i);

            if (me.multiple && !fresh.length) {
                return
            }

            // single: the chosen file replaces the current one, unless it has the same content
            const last = added[added.length - 1];

            if (!me.multiple && oldValue?.length === 1 && oldValue[0].blobId === last.blobId) {
                return
            }

            me.value = me.multiple ? [...oldValue || [], ...fresh] : [last];
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

    /**
     * @param {Object} data DOM event data
     * @returns {Number} index of the clicked chip, NaN for none
     * @protected
     */
    eventIndex(data) {
        return Number(data.path?.find(n => n.data?.index !== undefined)?.data.index)
    }

    async onEditClick(data) {
        let me    = this,
            index = me.eventIndex(data),
            item  = me.value?.[index];

        if (!item || me.disabled) {
            return
        }

        const description = await TextPrompt.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Description'),
            label   : t('Please enter a description'),
            value     : item.description || '',
            allowEmpty: true
        });

        // cancelled, or the field changed while the prompt was open
        if (description === null || me.isDestroyed || me.value?.[index]?.blobId !== item.blobId) {
            return
        }

        const oldValue = me.value;

        me.value = oldValue.map((a, i) => i === index ? {...a, description} : a);
        me.fireUserChangeEvent(me.value, oldValue)
    }

    onRemoveClick(data) {
        let me    = this,
            index = me.eventIndex(data);

        if (isNaN(index) || me.disabled) {
            return
        }

        const oldValue = me.value;

        me.value = oldValue.filter((a, i) => i !== index);
        me.fireUserChangeEvent(me.value, oldValue)
    }
}

export default Neo.setupClass(AttachmentsField);
