import Container     from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import TextField     from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../views/neo/src/button/Button.mjs';
import {enableDragDrop} from '../../../../../views/neo/src/component/dragDrop.mjs';
import MarkdownField from '../../../../../views/neo/src/form/field/MarkdownField.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import ModuleRegistry from '../../../../../views/neo/src/ModuleRegistry.mjs';
import {notify, notifyError} from '../../../../../views/neo/src/Notify.mjs';
import {t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'site');

/**
 * The content's Markdown, without image uploads: GO's blob links would not show on the public
 * site. Files of the site's folder are linked with "Insert file" (file://).
 */
class ContentField extends MarkdownField {
    static config = {
        className: 'GO.site.view.ContentField',
        toolbar  : ['bold', 'italic', 'strikethrough', 'heading', '-', 'quote', 'unordered-list', 'ordered-list', '-', 'code', 'link', 'table', '-', 'preview']
    }

    async uploadImages() {
        // pasted or dropped images are not uploaded
    }

    setStatus(text=null) {
        super.setStatus(text ?? '')
    }
}

Neo.setupClass(ContentField);

/**
 * GO.site.ContentPanel.formatSlug(): lower case, runs of other characters become "-"
 * @param {String} text
 * @returns {String}
 */
export function formatSlug(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * The content editor of the Website Manager (GO.site.ContentPanel): title, slug (the parent's
 * slug, read-only, and the item's own part, set from the title) and the Markdown text;
 * Save, Advanced options, View, Browse files (the site's folder) and Insert file. A content
 * item dragged from the tree onto the text inserts a link to it ([title](slug://slug)).
 *
 * site/content/update loads (GET) and saves (POST) an item, site/content/create gives the
 * defaults of a new one (GET) and creates it (POST).
 *
 * Events: saved {id, siteId}, advanced {id}
 */
class ContentPanel extends Container {
    static config = {
        className: 'GO.site.view.ContentPanel',
        baseCls  : ['go-site-content', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * Toolbar items before the buttons (the main panel's show-sidebar button)
         * @member {Object[]} startItems=[]
         */
        startItems: [],
        /**
         * Toolbar items after the buttons
         * @member {Object[]} endItems=[]
         */
        endItems: []
    }

    /**
     * Shown item: {id, siteId, parentId, slug}; id null for a new item, null for none
     * @member {Object|null} current=null
     */
    current = null

    /**
     * Values as loaded or saved, to tell changes
     * @member {Object} loaded={}
     */
    loaded = {}

    /**
     * Number of the last load: an older response doesn't replace a newer one
     * @member {Number} loadCounter=0
     */
    loadCounter = 0

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            cls   : ['go-border-bottom'],
            items : [...me.startItems, {
                module   : Button,
                reference: 'saveButton',
                icon     : 'save',
                text     : coreT('Save'),
                disabled : true,
                handler  : () => me.save()
            }, {
                module   : Button,
                reference: 'advancedButton',
                icon     : 'settings',
                text     : t('Advanced options'),
                disabled : true,
                handler  : () => me.current?.id && me.fire('advanced', {id: me.current.id})
            }, {
                module   : Button,
                reference: 'viewButton',
                icon     : 'open_in_new',
                text     : coreT('View'),
                disabled : true,
                handler  : () => me.view()
            }, '->', {
                module   : Button,
                reference: 'insertFileButton',
                icon     : 'attach_file',
                text     : t('Insert file'),
                disabled : true,
                handler  : () => me.insertFile()
            }, {
                module   : Button,
                reference: 'browseButton',
                icon     : 'folder_open',
                tooltip  : t('Browse files'),
                disabled : true,
                handler  : () => me.browseFiles()
            }, ...me.endItems]
        }, {
            ntype    : 'component',
            reference: 'empty',
            cls      : ['go-empty'],
            flex     : 'none',
            text     : t('Select a content item in the tree, or add one with its menu.')
        }, {
            // never hidden: the Markdown editor attaches to its DOM when it mounts
            module   : Container,
            reference: 'form',
            cls      : ['go-pad'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : [{
                module       : TextField,
                reference    : 'title',
                labelText    : t('Title'),
                labelPosition: 'inline',
                flex         : 'none',
                required     : true,
                maxLength    : 100,
                listeners    : {userChange: ({value}) => me.onTitleChange(value)}
            }, {
                module: Container,
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'stretch'},
                items : [{
                    module       : TextField,
                    reference    : 'parentslug',
                    labelText    : t('Slug'),
                    labelPosition: 'inline',
                    flex         : 2,
                    readOnly     : true,
                    clearable    : false
                }, {
                    module       : TextField,
                    reference    : 'baseslug',
                    labelText    : ' ',
                    labelPosition: 'inline',
                    flex         : 1,
                    maxLength    : 100,
                    style        : {marginLeft: '8px'},
                    listeners    : {userChange: () => me.syncButtons()}
                }]
            }, {
                module   : ContentField,
                reference: 'editor',
                flex     : 1,
                listeners: {change: () => me.syncButtons()}
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        // a content item from the tree (group of SiteTree) becomes a link at the cursor
        enableDragDrop(me.getReference('editor'), {
            drop  : '',
            group : 'go-site-tree',
            onDrop: ({source}) => me.onTreeNodeDrop(source)
        }).catch(e => console.error('ContentPanel drag and drop', e))
    }

    /**
     * (siteId) => may the user change the site's content, set by the main panel
     * @member {Function} mayWrite
     */
    mayWrite = () => true

    /**
     * @param {Function} fn (siteId) => Boolean
     */
    setMayWrite(fn) {
        this.mayWrite = fn;
        this.syncButtons()
    }

    /**
     * The tree that content items are dragged from, set by the main panel
     * @member {Object|null} tree=null
     */
    tree = null

    /**
     * @param {Object|null} source {itemId} of WS/DragDrop
     */
    onTreeNodeDrop(source) {
        let me   = this,
            id   = source?.itemId && me.tree?.nodeIdOf(source.itemId),
            node = id && me.tree.getNode(id);

        if (node?.site.type === 'content' && node.site.modelId && node.slug && me.current) {
            me.getReference('editor').insertText(`[${node.text}](slug://${node.slug})`)
        }
    }

    /**
     * Shows a content item
     * @param {String|Number} id
     * @returns {Promise<void>}
     */
    async load(id) {
        let me      = this,
            counter = ++me.loadCounter;

        try {
            const {data} = await client.legacy('site/content/update', {id}, {method: 'GET'});

            if (!me.isDestroyed && counter === me.loadCounter) {
                me.current = {id: String(id), siteId: String(data.site_id), parentId: data.parent_id, slug: data.slug};
                me.setValues(data)
            }
        } catch (e) {
            me.isDestroyed || counter !== me.loadCounter || notifyError(me, e)
        }
    }

    /**
     * Shows an empty item to add (GO.site.ContentPanel.create())
     * @param {String|Number} siteId
     * @param {String|Number|null} parentId
     * @returns {Promise<void>}
     */
    async create(siteId, parentId=null) {
        let me      = this,
            counter = ++me.loadCounter,
            params  = {site_id: siteId};

        parentId && (params.parent_id = parentId);

        try {
            const {data} = await client.legacy('site/content/create', params, {method: 'GET'});

            if (!me.isDestroyed && counter === me.loadCounter) {
                me.current = {id: null, siteId: String(siteId), parentId, slug: null};
                me.setValues({...data, title: '', baseslug: '', content: ''});
                me.getReference('title').focus()
            }
        } catch (e) {
            me.isDestroyed || counter !== me.loadCounter || notifyError(me, e)
        }
    }

    /**
     * Shows nothing (the item was deleted)
     */
    clear() {
        let me = this;

        ++me.loadCounter;
        me.current = null;
        me.setValues({});
        me.setEditable(false)
    }

    /**
     * @param {Object} data
     * @protected
     */
    setValues(data) {
        let me = this;

        me.loaded = {
            title   : data.title || '',
            baseslug: data.baseslug || '',
            content : data.content || ''
        };

        me.getReference('title').value      = me.loaded.title;
        me.getReference('parentslug').value = data.parentslug || '';
        me.getReference('baseslug').value   = me.loaded.baseslug;
        me.getReference('editor').value    = me.loaded.content;

        me.setEditable(true)
    }

    /**
     * @param {Boolean} editable an item is shown
     * @protected
     */
    setEditable(editable) {
        let me = this;

        // not readOnly: neo keeps the input's readonly attribute when a field that started
        // read-only becomes editable; Save stays disabled without an item
        me.getReference('empty').hidden = editable;
        me.syncButtons()
    }

    /**
     * The slug follows the title (ExtJS on the title's change)
     * @param {String} title
     */
    onTitleChange(title) {
        this.getReference('baseslug').value = formatSlug(title);
        this.syncButtons()
    }

    /**
     * @returns {Object} the fields' values
     */
    getValues() {
        let me = this;

        return {
            title   : me.getReference('title').value || '',
            baseslug: me.getReference('baseslug').value || '',
            content : me.getReference('editor').value || ''
        }
    }

    /**
     * @returns {Boolean} a field differs from what was loaded or saved
     */
    isDirty() {
        const values = this.getValues();
        return Object.keys(values).some(key => values[key] !== this.loaded[key])
    }

    syncButtons() {
        let me       = this,
            current  = me.current,
            existing = !!current?.id,
            write    = !!current && me.mayWrite(current.siteId);

        me.getReference('saveButton').disabled       = !write || (existing && !me.isDirty());
        me.getReference('advancedButton').disabled   = !existing || !write;
        me.getReference('viewButton').disabled       = !existing;
        me.getReference('insertFileButton').disabled = !write || !me.filesModule;
        me.getReference('browseButton').disabled     = !current || !me.filesModule
    }

    /**
     * @returns {Object|null}
     */
    get filesModule() {
        return ModuleRegistry.getAvailable().find(m => m.name === 'files') || null
    }

    /**
     * Saves the shown item (site/content/update or create)
     * @returns {Promise<Boolean>}
     */
    async save() {
        let me      = this,
            current = me.current,
            values  = me.getValues(),
            button  = me.getReference('saveButton');

        if (!current) {
            return false
        }

        if (!values.title.trim()) {
            notifyError(me, new Error(coreT('You have errors in your form. The invalid fields are marked.')));
            me.getReference('title').focus();
            return false
        }

        // the editor sends its text after a short delay
        await me.getReference('editor').flush?.();
        Object.assign(values, me.getValues());

        button.disabled = true;

        try {
            let response;

            if (current.id) {
                response = await client.legacy('site/content/update', {id: current.id, ...values})
            } else {
                const params = {site_id: current.siteId, ...values};
                current.parentId && (params.parent_id = current.parentId);
                response = await client.legacy('site/content/create', params)
            }

            if (me.isDestroyed) {
                return false
            }

            if (me.current === current) {
                current.id = String(response.id || current.id);
                me.loaded  = values
            }

            notify(me, coreT('Saved'));
            me.fire('saved', {id: current.id, siteId: current.siteId});
            return true
        } catch (e) {
            me.isDestroyed || notifyError(me, e);
            return false
        } finally {
            me.isDestroyed || me.syncButtons()
        }
    }

    /**
     * Opens the item on the site (site/content/redirect)
     */
    view() {
        let me = this;

        me.current?.id && Neo.Main.windowOpen({
            url       : client.legacyUrl('site/content/redirect', {content_id: me.current.id}),
            windowId  : me.windowId,
            windowName: '_blank'
        })
    }

    /**
     * The site's files folder (files/folder/checkModelFolder creates it)
     * @returns {Promise<Number|null>}
     */
    async siteFolderId() {
        const {files_folder_id} = await client.legacy('files/folder/checkModelFolder', {
            mustExist: 1,
            model    : 'Site',
            id       : this.current.siteId
        });

        return files_folder_id || null
    }

    /**
     * Opens the site's folder in the Files module (ExtJS FileBrowserButton)
     */
    async browseFiles() {
        let me = this;

        try {
            const folderId = me.current && await me.siteFolderId();
            folderId && Neo.Main.setRoute({value: `files/folder/${folderId}`, windowId: me.windowId})
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * Links files of the site's folder at the cursor as [name](file://path), the path below
     * the folder "files/" (ExtJS: a file dropped from the file browser)
     */
    async insertFile() {
        let me = this;

        try {
            const folderId = me.current && await me.siteFolderId();

            if (!folderId) {
                return
            }

            const {default: SelectFilesDialog} = await import('../../../../files/views/neo/view/SelectFilesDialog.mjs'),
                  files = await SelectFilesDialog.ask({appName: me.appName, windowId: me.windowId, folderId});

            if (!files?.length || me.isDestroyed) {
                return
            }

            const links = files.map(file => {
                const path = String(file.path || file.name),
                      pos  = path.indexOf('files/');

                return `[${file.name}](file://${pos > -1 ? path.substring(pos + 6) : file.name})`
            });

            await me.getReference('editor').insertText(links.join('\n'))
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(ContentPanel);
