import Field        from '../../../../../../../../views/neo/src/form/field/Field.mjs';
import client       from '../../../../../../../../views/neo/src/jmap/Client.mjs';
import {translator} from '../../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'calendar');

/**
 * Attachments of an event (CalendarEvent.links, GOUI mapfield 'links'): a button per file
 * that downloads it, a delete button. addBlob() adds an uploaded blob.
 *
 * Value: {key: {title, size, contentType, blobId}}
 */
class AttachmentsField extends Field {
    static config = {
        className: 'GO.calendar.field.AttachmentsField',
        baseCls  : ['go-field', 'go-cal-attachments'],
        name     : 'links'
    }

    construct(config) {
        super.construct(config);

        this.addDomListeners([
            {click: this.onDownload, delegate: '.go-cal-attachment-file', scope: this},
            {click: this.onRemove,   delegate: '.go-cal-attachment-remove', scope: this}
        ])
    }

    beforeSetValue(value) {
        return value && Object.keys(value).length ? Neo.clone(value, true) : null
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        // no empty box
        this.hidden = !value
    }

    createControl() {
        return Object.entries(this.value || {}).map(([key, link]) => ({
            cls: ['go-cal-attachment'],
            cn : [
                {tag: 'button', type: 'button', cls: ['go-cal-attachment-file'], 'data-key': key, cn: [{tag: 'i', cls: ['go-icon'], text: 'description'}, {vtype: 'text', text: ' ' + link.title}]},
                this.readOnly ? null : {tag: 'button', type: 'button', cls: ['go-cal-attachment-remove', 'go-icon'], 'data-key': key, title: t('Delete'), text: 'delete'}
            ].filter(Boolean)
        }))
    }

    static keyOf(data) {
        return data.path.find(n => n.data?.key)?.data.key
    }

    onDownload(data) {
        const link = this.value?.[AttachmentsField.keyOf(data)];

        if (link?.blobId) {
            const url = (client.session?.downloadUrl || client.baseUrl + 'api/download.php?blob={blobId}').replace('{blobId}', encodeURIComponent(link.blobId));
            Neo.Main.windowOpen({url, windowName: '_blank', windowId: this.windowId})
        }
    }

    onRemove(data) {
        const value = {...(this.value || {})};

        delete value[AttachmentsField.keyOf(data)];
        this.userChange(Object.keys(value).length ? value : null)
    }

    /**
     * @param {Object} blob upload.php response {blobId, name, size, type}
     */
    addBlob(blob) {
        this.userChange({
            ...(this.value || {}),
            ['n' + Date.now() + Math.floor(Math.random() * 1000)]: {
                blobId     : blob.blobId || blob.id,
                title      : blob.name,
                size       : blob.size,
                contentType: blob.type
            }
        })
    }
}

export default Neo.setupClass(AttachmentsField);
