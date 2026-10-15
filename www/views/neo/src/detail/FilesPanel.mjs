import UploadButton from '../component/UploadButton.mjs';
import client       from '../jmap/Client.mjs';
import {escapeHtml, formatUserDateTime, smartDateTime} from '../Format.mjs';
import Card         from './Card.mjs';
import {t} from '../Translate.mjs';

/**
 * "Files" of an entity (legacy files module, go.modules.files.FilesDetailPanel): the
 * files in the entity's folder and an upload button. Goes through the legacy controllers
 * (files/folder/list, checkModelFolder, processUploadQueue) like the classic UI; uploads
 * are JMAP blobs first.
 *
 * Needs the record's `filesFolderId`; a folder is created on the first upload.
 */
class FilesPanel extends Card {
    static config = {
        className: 'GO.detail.FilesPanel',
        cls      : ['go-files-panel'],
        title    : t('Files'),
        stateId  : 'files-detail'
    }

    /**
     * Folder of the shown entity, null when it has none yet
     * @member {String|Number|null} folderId=null
     */
    folderId = null

    createBody() {
        return [{
            ntype    : 'component',
            reference: 'list',
            cls      : ['go-files'],
            html     : ''
        }, {
            ntype : 'container',
            cls   : ['go-detail-card-buttons'],
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : UploadButton,
                reference: 'uploadButton',
                listeners: {files: ({files}) => this.upload(files)}
            }, {
                ntype    : 'component',
                reference: 'error',
                cls      : ['go-form-error'],
                flex     : 1
            }]
        }]
    }

    async loadData(entity, entityId, record) {
        this.folderId = record?.filesFolderId || null;

        if (!this.folderId) {
            return {results: []}
        }

        return client.legacy('files/folder/list', {folder_id: this.folderId, limit: 50})
    }

    showData({results=[]}) {
        let me = this;

        me.getReference('error').text = '';

        me.getReference('list').html = results.length
            ? results.map(f => {
                const isFolder = f.extension === 'folder',
                      href     = isFolder ? null : client.legacyUrl('files/file/download', {id: f.id, inline: 1});

                return `<a class="go-file" ${href ? `href="${escapeHtml(href)}" target="_blank" rel="noopener"` : ''}>
                    <i class="go-icon">${isFolder ? 'folder' : 'description'}</i>
                    <span class="go-file-text"><span>${escapeHtml(f.name)}</span>
                    <small title="${formatUserDateTime(f.mtime)}">${escapeHtml(f.musername || '')} at ${escapeHtml(isNaN(Date.parse(f.mtime)) ? (f.mtime || '') : smartDateTime(f.mtime))}</small></span>
                </a>`
            }).join('')
            : '<div class="go-dropzone">No files yet</div>'
    }

    clearData() {
        this.folderId = null;
        this.getReference('list').html  = '';
        this.getReference('error').text = ''
    }

    showError(e) {
        this.getReference('error').text = e.message || String(e)
    }

    /**
     * @param {File[]} files
     */
    async upload(files) {
        let me      = this,
            current = me.current,
            button  = me.getReference('uploadButton');

        if (!current || !files.length) {
            return
        }

        button.disabled = true;
        me.getReference('error').text = t('Uploading...');

        // the destination is fixed now: another note may be selected while this uploads
        let folderId = me.folderId;

        try {
            if (!folderId) {
                const {files_folder_id} = await client.legacy('files/folder/checkModelFolder', {
                    mustExist: 1,
                    model    : current.entity,
                    id       : current.entityId
                });

                folderId = files_folder_id;
                current.record && (current.record.filesFolderId = files_folder_id);
                me.current === current && (me.folderId = files_folder_id)
            }

            const blobs    = await Promise.all(files.map(file => client.upload(file))),
                  response = await client.legacy('files/folder/processUploadQueue', {
                      upload               : 1,
                      command              : 'ask',
                      overwrite            : 'ask',
                      destination_folder_id: folderId,
                      blobs                : JSON.stringify(blobs)
                  });

            if (me.isDestroyed || me.current !== current) {
                return
            }

            me.reload();

            me.getReference('error').text = response.fileExists
                ? `"${response.fileExists}" exists already and was not replaced.`
                : ''
        } catch (e) {
            me.showError(e)
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }
}

export default Neo.setupClass(FilesPanel);
