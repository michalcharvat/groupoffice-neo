import Field         from './Field.mjs';
import client        from '../../jmap/Client.mjs';
import {notifyError} from '../../Notify.mjs';
import {escapeHtml}  from '../../Format.mjs';
import {t}           from '../../Translate.mjs';

/**
 * go.form.ImageField: an image as a blob id, e.g. a contact's photoBlobId. Click the
 * picture to upload one (JMAP blob), "delete" removes it.
 *
 *     {module: ImageField, name: 'photoBlobId', placeholderIcon: 'business'}
 */
class ImageField extends Field {
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
            removeDom: !me.value || locked
        }]
    }

    async onFileChange({files}) {
        let me   = this,
            file = files?.[0];

        if (!file) {
            return
        }

        try {
            const blob = await client.upload(file);
            me.isDestroyed || me.userChange(blob.blobId || blob.id)
        } catch (e) {
            notifyError(me, e)
        }
    }

    onClearClick() {
        this.userChange(null)
    }
}

export default Neo.setupClass(ImageField);
