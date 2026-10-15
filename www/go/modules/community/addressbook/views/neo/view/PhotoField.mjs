import Field  from '../../../../../../../views/neo/src/form/field/Field.mjs';
import client from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {t, thumbUrl} from '../util.mjs';

/**
 * go.form.ImageField: the contact's photo (photoBlobId). Click the picture to upload
 * one (JMAP blob), "clear" removes it.
 */
class PhotoField extends Field {
    static config = {
        className: 'GO.addressbook.view.PhotoField',
        ntype    : 'go-ab-photofield',
        baseCls  : ['go-field', 'go-ab-photofield'],
        /**
         * Material icon without a photo
         * @member {String} placeholderIcon_='person'
         */
        placeholderIcon_: 'person'
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {change: me.onFileChange,  delegate: '.go-ab-photo-input', scope: me},
            {click : me.onClearClick,  delegate: '.go-ab-photo-clear', scope: me}
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
            cls  : ['go-ab-photo'],
            title: t('Upload'),
            cn   : [
                me.value
                    ? {tag: 'img', alt: '', src: thumbUrl(me.value, 240)}
                    : {tag: 'i', cls: ['go-icon'], text: escapeHtml(me.placeholderIcon)},
                {tag: 'input', type: 'file', accept: 'image/*', cls: ['go-ab-photo-input'], removeDom: locked}
            ]
        }, {
            tag      : 'i',
            cls      : ['go-icon', 'go-ab-photo-clear'],
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

export default Neo.setupClass(PhotoField);
