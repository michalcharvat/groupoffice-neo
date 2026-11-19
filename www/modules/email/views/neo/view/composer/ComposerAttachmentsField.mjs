import AttachmentsField from '../../../../../../views/neo/src/form/field/AttachmentsField.mjs';
import client           from '../../../../../../views/neo/src/jmap/Client.mjs';
import {t as coreT}     from '../../../../../../views/neo/src/Translate.mjs';
import {unescapeHtml}   from '../../util.mjs';

/**
 * Attachments of the composer: uploads become blobs like in GO.form.field.AttachmentsField,
 * attachments of a loaded message (reply, forward, draft, template) are temporary files of
 * the server ({tmp_file, url}) that email/message/send reads again.
 *
 *     {module: ComposerAttachmentsField, name: 'attachments'}
 */
class ComposerAttachmentsField extends AttachmentsField {
    static config = {
        className: 'GO.email.composer.ComposerAttachmentsField',
        ntype    : 'go-email-composer-attachments',
        baseCls  : ['go-attachmentsfield', 'go-email-composer-attachments']
    }

    /**
     * @param {Object} a attachment
     * @returns {String}
     */
    static key(a) {
        return a.blobId || a.tmp_file || a.name || ''
    }

    /**
     * @param {Object} a attachment
     * @returns {String}
     */
    static href(a) {
        if (a.blobId) {
            return client.apiUrl + 'download.php?blob=' + encodeURIComponent(a.blobId) + '&inline=1'
        }

        // legacy URLs come HTML encoded ("&amp;token=")
        const url = unescapeHtml(a.url || '');

        if (!url) {
            return ''
        }

        return /^(https?:)?\//i.test(url) ? url : client.baseUrl + url
    }

    get isDirty() {
        const keys = v => (v || []).map(ComposerAttachmentsField.key).join();
        return keys(this.value) !== keys(this.originalConfig.value)
    }

    renderList() {
        let me = this;

        me.listNode.cn = (me.value || []).map((a, index) => {
            const href = ComposerAttachmentsField.href(a),
                  name = a.name || a.fileName || ComposerAttachmentsField.key(a);

            return {
                cls: ['go-attachmentsfield-chip'],
                cn : [
                    {tag: 'span', cls: ['go-icon'], text: 'description'},
                    href
                        ? {tag: 'a', cls: ['go-attachmentsfield-name'], target: '_blank', rel: 'noopener', href, text: name}
                        : {tag: 'span', cls: ['go-attachmentsfield-name'], text: name},
                    {tag: 'button', type: 'button', cls: ['go-attachmentsfield-remove'], title: coreT('Remove'),
                        'aria-label': coreT('Remove'), 'data-index': String(index), text: '×'}
                ]
            }
        });

        me.update()
    }
}

export default Neo.setupClass(ComposerAttachmentsField);
