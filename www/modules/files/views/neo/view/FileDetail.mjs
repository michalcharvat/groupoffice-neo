import Container from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button    from '../../../../../views/neo/src/button/Button.mjs';
import DescriptionList from '../../../../../views/neo/src/component/DescriptionList.mjs';
import CommentsPanel   from '../../../../../views/neo/src/detail/CommentsPanel.mjs';
import HistoryPanel    from '../../../../../views/neo/src/detail/HistoryPanel.mjs';
import DetailFieldsets from '../../../../../views/neo/src/customfields/DetailFieldsets.mjs';
import AddLinkButton    from '../../../../../views/neo/src/link/AddLinkButton.mjs';
import LinkBrowseButton from '../../../../../views/neo/src/link/LinkBrowseButton.mjs';
import LinkCards        from '../../../../../views/neo/src/link/LinkCards.mjs';
import client    from '../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml, fileSize} from '../../../../../views/neo/src/Format.mjs';
import {translator} from '../../../../../views/neo/src/Translate.mjs';
import {decodeEntities as decode, fileIcon, isFolder} from '../util.mjs';

const t = translator('legacy', 'files');

/**
 * East panel of the file browser: the selected file (ExtJS GO.files.FilePanel,
 * `files/file/display`) or folder (GO.files.FolderPanel, `files/folder/display`).
 *
 * Below the properties the detail cards of GO.DisplayPanel, for the legacy entities
 * `File` and `Folder`: custom fields (values from the display response, the entities
 * have no JMAP get), comments, links and history. Virtual folders of the tree (shared,
 * address book roots: no numeric id) get none of them.
 *
 * Events: action {action, record} for the toolbar buttons (download, open, properties, more).
 */
class FileDetail extends Container {
    static config = {
        className: 'GO.files.view.FileDetail',
        cls      : ['go-files-detail'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module   : Toolbar,
            cls      : ['go-border-bottom'],
            flex     : 'none',
            reference: 'toolbar',
            items    : ['->', {
                module   : Button,
                icon     : 'open_in_new',
                reference: 'openButton',
                tooltip  : t('Open'),
                hidden   : true,
                handler  : 'up.onOpen'
            }, {
                module   : Button,
                icon     : 'download',
                reference: 'downloadButton',
                tooltip  : t('Download'),
                hidden   : true,
                handler  : 'up.onDownload'
            }, {
                module   : Button,
                icon     : 'edit',
                reference: 'propertiesButton',
                tooltip  : t('Properties'),
                disabled : true,
                handler  : 'up.onProperties'
            }, {
                module   : AddLinkButton,
                reference: 'addLinkButton'
            }, {
                module   : LinkBrowseButton,
                reference: 'linkBrowseButton'
            }, {
                module   : Button,
                icon     : 'more_vert',
                reference: 'moreButton',
                tooltip  : t('More'),
                disabled : true,
                handler  : 'up.onMore'
            }]
        }, {
            ntype    : 'container',
            cls      : ['go-detail-scroller'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : [{
                // the first card of the detail, like the other modules' (GOUI DetailPanel)
                ntype    : 'container',
                reference: 'card',
                cls      : ['go-files-detail-card'],
                flex     : 'none',
                layout   : {ntype: 'vbox', align: 'stretch'},
                items    : [{
                    ntype    : 'component',
                    reference: 'head',
                    cls      : ['go-files-detail-head'],
                    flex     : 'none',
                    html     : ''
                }, {
                    module   : DescriptionList,
                    reference: 'list',
                    cls      : ['go-files-detail-list'],
                    flex     : 'none'
                }]
            }, {
                // a card per custom field set with values
                module   : DetailFieldsets,
                reference: 'customFields',
                flex     : 'none'
            }, {
                module   : CommentsPanel,
                reference: 'comments',
                flex     : 'none',
                hidden   : true
            }, {
                // shows itself when the item has links
                module   : LinkCards,
                reference: 'links',
                flex     : 'none'
            }, {
                module   : HistoryPanel,
                reference: 'history',
                flex     : 'none',
                hidden   : true
            }]
        }]
    }

    /**
     * Shown grid record ({type_id, id, extension, …}), null for nothing
     * @member {Object|null} fileRecord=null
     */
    fileRecord = null
    /**
     * Response of file/display or folder/display
     * @member {Object|null} fileData=null
     */
    fileData = null

    /**
     * @param {Object|null} record a list record of the grid
     * @returns {Promise<void>}
     */
    async setRecord(record) {
        let me         = this,
            generation = me.generation = (me.generation || 0) + 1;

        me.fileRecord = record;
        me.fileData   = null;

        // a grid record keeps its fields in getters, which a spread does not copy
        const plain = record?.isRecord ? record.toJSON() : record;

        me.setCards(plain);

        if (!record) {
            me.render(null);
            return
        }

        // what the list knows, until the server answers
        me.render({...plain, size: isFolder(plain) ? null : plain.size});

        try {
            const {data} = await client.legacy(isFolder(record) ? 'files/folder/display' : 'files/file/display', {id: record.id});

            if (!me.isDestroyed && generation === me.generation) {
                me.fileData = data;
                me.render({...plain, ...data});
                me.getReference('customFields').setEntity(...me.entityOf(plain), data)
            }
        } catch (e) {
            !me.isDestroyed && generation === me.generation && me.render({...plain, error: e.message})
        }
    }

    /**
     * @param {Object|null} record plain list record
     * @returns {Array} [entity, entityId] of the legacy entity, [null, null] for nothing
     *     or a virtual folder
     */
    entityOf(record) {
        return record && /^\d+$/.test(String(record.id)) ? [isFolder(record) ? 'Folder' : 'File', String(record.id)] : [null, null]
    }

    /**
     * Points the toolbar link buttons and the cards to the record. Cards of the same
     * item keep their content while it reloads.
     * @param {Object|null} record plain list record
     * @protected
     */
    setCards(record) {
        let me                 = this,
            [entity, entityId] = me.entityOf(record),
            same               = card => card.current?.entity === entity && card.current?.entityId === entityId;

        me.getReference('addLinkButton').setEntity(entity, entityId, record);

        same({current: me.getReference('linkBrowseButton').target}) || me.getReference('linkBrowseButton').setEntity(entity, entityId);
        same(me.getReference('links')) || me.getReference('links').setEntity(entity, entityId, record);

        // the custom field values come with the display response
        same(me.getReference('customFields')) || me.getReference('customFields').setEntity(null, null);

        ['comments', 'history'].forEach(ref => {
            const card = me.getReference(ref);

            card.hidden = !entity;
            same(card) || card.setEntity(entity, entityId, record)
        })
    }

    /**
     * Shows the record again (after a change)
     */
    refresh() {
        this.fileRecord && this.setRecord(this.fileRecord)
    }

    /**
     * @param {Object|null} data
     * @protected
     */
    render(data) {
        let me     = this,
            folder = data && isFolder(data);

        me.getReference('openButton').hidden       = !data || folder;
        me.getReference('downloadButton').hidden   = !data || folder;
        me.getReference('propertiesButton').disabled = !data || (folder && !/^\d+$/.test(String(data.id)));
        me.getReference('moreButton').disabled     = !data;

        // "Nothing selected" stands without a card
        data ? me.getReference('card').addCls('go-card') : me.getReference('card').removeCls('go-card');

        if (!data) {
            me.getReference('head').html = `<div class="go-empty"><i class="go-icon">folder_open</i><p>${escapeHtml(t('Nothing selected'))}</p></div>`;
            me.getReference('list').records = [];
            return
        }

        const thumb = !folder && data.thumbnail_url
            ? `<img class="go-files-thumb" src="${escapeHtml(data.thumbnail_url)}" alt="">`
            : `<i class="go-icon go-files-detail-icon">${fileIcon(data)}</i>`;

        me.getReference('head').html = `${thumb}<h3>${escapeHtml(data.name)}</h3>` +
            (data.error ? `<p class="go-form-error">${escapeHtml(data.error)}</p>` : '');

        const locked = data.locked_user_name || (data.locked_user_id > 0 ? t('Yes') : '');

        me.getReference('list').records = folder ? [
            [t('Location'), decode(data.path)],
            [t('URL'), data.url ? {html: `<a href="${escapeHtml(data.url)}" target="_blank" rel="noopener">${escapeHtml(data.url)}</a>`} : ''],
            [t('Type'), data.type],
            [t('Comment'), data.comment],
            // ExtJS FolderPanel's CreateModifyPanel
            [t('Created at'), data.ctime],
            [t('Created by'), decode(data.username)],
            [t('Modified at'), data.mtime],
            [t('Modified by'), decode(data.musername)]
        ] : [
            [t('Location'), decode(data.path)],
            [t('Type'), data.type],
            [t('Size'), typeof data.size === 'number' || /^\d+$/.test(String(data.size ?? '')) ? fileSize(+data.size) : data.size],
            [t('Created at'), data.ctime],
            [t('Created by'), decode(data.username)],
            [t('Modified at'), data.mtime],
            [t('Modified by'), decode(data.musername)],
            [t('Locked by'), locked],
            [t('Content expires at'), data.content_expire_date],
            [t('Download link'), data.download_link ? {html: `<a href="${escapeHtml(data.download_link)}" target="_blank" rel="noopener">${escapeHtml(data.download_link)}</a>`} : '']
        ]
    }

    fireAction(action) {
        this.fileRecord && this.fire('action', {action, record: this.fileRecord, data: this.fileData})
    }

    onOpen()       {this.fireAction('open')}
    onDownload()   {this.fireAction('download')}
    onProperties() {this.fireAction('properties')}

    onMore(data) {
        this.fileRecord && this.fire('action', {action: 'more', record: this.fileRecord, data: this.fileData, target: data.component.id})
    }
}

export default Neo.setupClass(FileDetail);
