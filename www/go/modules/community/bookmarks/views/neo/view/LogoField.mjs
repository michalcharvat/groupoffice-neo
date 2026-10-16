import Field  from '../../../../../../../views/neo/src/form/field/Field.mjs';
import client from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {logoUrl, t} from '../util.mjs';

/**
 * The bookmark's logo (GOUI BookmarksDialog logo button): the image, a button that
 * uploads another one and one that removes it. The value is the blob id.
 */
class LogoField extends Field {
    static config = {
        className: 'GO.bookmarks.LogoField',
        baseCls  : ['go-field', 'go-bookmark-logofield']
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {change: me.onFileChange, delegate: '.go-bookmark-logo-input',  scope: me},
            {click : me.onClear,      delegate: '.go-bookmark-logo-clear',  scope: me}
        ])
    }

    createControl() {
        let me  = this,
            url = logoUrl(me.value);

        return [
            url
                ? {tag: 'img', cls: ['go-bookmark-logo-preview'], src: url, alt: ''}
                : {tag: 'i', cls: ['go-bookmark-logo-preview', 'go-icon'], text: 'image'},
            {tag: 'label', cls: ['go-bookmark-logo-upload', 'neo-button', 'neo-button-ghost'], title: t('Upload Logo'), cn: [
                {tag: 'input', type: 'file', accept: 'image/*', cls: ['go-bookmark-logo-input'], tabIndex: -1, ...me.inputFlags()},
                {tag: 'i', cls: ['go-icon'], text: 'upload'}
            ]},
            {tag: 'button', type: 'button', cls: ['go-bookmark-logo-clear', 'neo-button', 'neo-button-ghost'], title: t('Clear Logo'),
                removeDom: !me.value, cn: [{tag: 'i', cls: ['go-icon'], text: 'close'}]}
        ]
    }

    async onFileChange({files}) {
        let me   = this,
            file = files?.[0];

        if (!file || me.disabled || me.readOnly) {
            return
        }

        try {
            const blob = await client.upload(file);
            me.isDestroyed || me.userChange(blob.blobId || blob.id)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    onClear() {
        this.disabled || this.readOnly || this.userChange(null)
    }
}

export default Neo.setupClass(LogoField);
