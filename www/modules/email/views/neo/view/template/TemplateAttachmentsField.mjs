import AttachmentsField from '../../../../../../views/neo/src/form/field/AttachmentsField.mjs';
import {decodeEntities} from '../../../../../../views/neo/src/Format.mjs';
import client from '../../../../../../views/neo/src/jmap/Client.mjs';

/**
 * Key of an attachment: new uploads have a blobId, the attachments of a loaded template
 * are temporary files of its parsed message (tmp_file, url)
 * @param {Object} a
 * @returns {String}
 */
const key = a => a.blobId || a.tmp_file || '';

/**
 * Attachments of a legacy e-mail template: GO.form.field.AttachmentsField for the new
 * uploads (blobs) plus the stored attachments of email/template/load, which are no blobs.
 * submitValue() gives the list email/template/submit expects (Message::handleEmailFormInput()).
 */
class TemplateAttachmentsField extends AttachmentsField {
    static config = {
        className: 'GO.email.settings.TemplateAttachmentsField'
    }

    get isDirty() {
        const keys = v => (v || []).map(key).join();
        return keys(this.value) !== keys(this.originalConfig.value)
    }

    renderList() {
        super.renderList();

        let me = this;

        // stored attachments open their temporary file instead of a blob
        (me.value || []).forEach((a, index) => {
            const link = me.listNode.cn[index]?.cn[1];

            if (!a.blobId && link) {
                // a legacy URL relative to the web root ("index.php?r=core/downloadTempFile…")
                link.href = a.url ? (/^(https?:)?\//.test(a.url) ? '' : client.baseUrl) + decodeEntities(a.url) : null;
                link.text = a.name || a.tmp_file
            }
        });

        me.update()
    }

    /**
     * @returns {Object[]} [{fileName, blobId}] for uploads, [{fileName, tmp_file}] for stored ones
     */
    submitValue() {
        return (this.value || []).map(a => a.blobId
            ? {fileName: a.name, blobId: a.blobId}
            : {fileName: a.name, tmp_file: a.tmp_file})
    }
}

export default Neo.setupClass(TemplateAttachmentsField);
