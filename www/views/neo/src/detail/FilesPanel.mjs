import Button       from '../button/Button.mjs';
import UploadButton from '../component/UploadButton.mjs';
import {enableDragDrop} from '../component/dragDrop.mjs';
import ModuleRegistry from '../ModuleRegistry.mjs';
import client       from '../jmap/Client.mjs';
import uploader     from '../jmap/Uploader.mjs';
import {escapeHtml, formatUserDateTime, smartDateTime} from '../Format.mjs';
import Card         from './Card.mjs';
import {fmt, t} from '../Translate.mjs';

/**
 * "Files" of an entity (legacy files module, go.modules.files.FilesDetailPanel): the
 * files in the entity's folder and an upload button. Goes through the legacy controllers
 * (files/folder/list, checkModelFolder, processUploadQueue) like the classic UI; uploads
 * are JMAP blobs first.
 *
 * Needs the record's `filesFolderId`; a folder is created on the first upload. Files can be
 * dropped from the desktop. With the files module's neo UI a file opens with the user's
 * handler (ModuleRegistry `openFile`), a folder and "Browse files" open the Files module.
 */
class FilesPanel extends Card {
    static config = {
        className: 'GO.detail.FilesPanel',
        cls      : ['go-files-panel'],
        title    : t('Files'),
        stateId  : 'files-detail',
        capability: 'go:legacy:files'
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
            // controls are left out of print (src/print.mjs)
            cls   : ['go-detail-card-buttons', 'go-print-hide'],
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : UploadButton,
                reference: 'uploadButton',
                listeners: {files: ({files}) => this.upload(files)}
            }, {
                // ExtJS DetailFileBrowserButton
                module   : Button,
                icon     : 'folder_open',
                reference: 'browseButton',
                text     : t('Browse files'),
                hidden   : true,
                handler  : () => this.browse()
            }, {
                ntype    : 'component',
                reference: 'error',
                cls      : ['go-form-error'],
                flex     : 1
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('list').addDomListeners({click: me.onListClick, delegate: '.go-file', scope: me});

        // ExtJS FilesDetailPanel: files dropped on the panel are uploaded
        enableDragDrop(me, {files: true, onDrop: ({files}) => files?.length && me.upload(files)})
            .catch(e => console.error('FilesPanel drag and drop', e))
    }

    /**
     * The files module's neo UI, when the user has it
     * @returns {Object|null}
     */
    get filesModule() {
        return ModuleRegistry.getAvailable().find(m => m.name === 'files') || null
    }

    /**
     * Opens the entity's folder in the Files module
     * @param {String|Number} [folderId] default: the entity's folder
     */
    browse(folderId=this.folderId) {
        folderId && this.filesModule && Neo.Main.setRoute({value: `files/folder/${folderId}`, windowId: this.windowId})
    }

    onListClick(data) {
        let me   = this,
            item = data.path.find(node => node.cls?.includes('go-file')),
            id   = item?.data?.fileId,
            open = ModuleRegistry.getConfigs('openFile')[0];

        if (!id) {
            return
        }

        if (item.data.folder === 'true') {
            me.browse(id)
        } else if (open) {
            open({id, name: item.data.name || ''}, me)
        }
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

        me.getReference('browseButton').hidden = !me.folderId || !me.filesModule;

        // with the files module a click opens the file with the user's handler (onListClick)
        const handled = !!ModuleRegistry.getConfigs('openFile').length;

        me.getReference('list').html = results.length
            ? results.map(f => {
                const isFolder = f.extension === 'folder',
                      href     = isFolder || handled ? null : client.legacyUrl('files/file/download', {id: f.id, inline: 1});

                return `<a class="go-file" data-file-id="${escapeHtml(f.id)}" data-folder="${isFolder}" data-name="${escapeHtml(f.name)}" ${href ? `href="${escapeHtml(href)}" target="_blank" rel="noopener"` : 'role="button" tabindex="0"'}>
                    <i class="go-icon">${isFolder ? 'folder' : 'description'}</i>
                    <span class="go-file-text"><span>${escapeHtml(f.name)}</span>
                    <small title="${escapeHtml(formatUserDateTime(f.mtime))}">${escapeHtml(fmt(t('{name} at {date}'), {name: f.musername || '', date: isNaN(Date.parse(f.mtime)) ? (f.mtime || '') : smartDateTime(f.mtime)}))}</small></span>
                </a>`
            }).join('')
            : `<div class="go-dropzone go-print-hide">${escapeHtml(t('Drop files here'))}</div>`
    }

    clearData() {
        this.folderId = null;
        this.getReference('browseButton').hidden = true;
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

            // failed uploads are reported, the others are stored
            const blobs = await uploader.uploadMany(files, {component: me});

            if (!blobs.length) {
                return
            }

            const response = await client.legacy('files/folder/processUploadQueue', {
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
                ? fmt(t("'{file}' exists already and was not replaced."), {file: response.fileExists})
                : ''
        } catch (e) {
            me.showError(e)
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }
}

export default Neo.setupClass(FilesPanel);
