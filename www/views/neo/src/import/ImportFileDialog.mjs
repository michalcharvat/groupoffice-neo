import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import UploadButton  from '../component/UploadButton.mjs';
import {notify, notifyError} from '../Notify.mjs';
import {t}           from '../Translate.mjs';
import Dialog        from '../view/Dialog.mjs';
import {importFile}  from './importFile.mjs';

/**
 * Asks for the file of an import (the file chooser of go.util.importFile(), which neo can't
 * open from a menu item: the browser needs a click on the file input).
 *
 *     Neo.create(ImportFileDialog, {appName, windowId, entity: 'User', accept: '.csv,.xlsx,.json',
 *         values: {}, options: {labels: {username: t('Username')}}})
 */
class ImportFileDialog extends Dialog {
    static config = {
        className   : 'GO.import.ImportFileDialog',
        cls         : ['go-import-file-dialog'],
        modal       : true,
        title       : t('Import'),
        wrapperStyle: {left: 'calc(50vw - 220px)', top: '25vh', width: 'min(440px, 100vw)'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /**
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * File types, e.g. '.csv,.xlsx,.json'
         * @member {String|null} accept=null
         */
        accept: null,
        /**
         * Values of every imported item
         * @member {Object} values={}
         */
        values: {},
        /**
         * Mapping options (fields, labels, aliases, lookupFields)
         * @member {Object} options={}
         */
        options: {},
        /**
         * Text above the buttons
         * @member {String|null} message=null
         */
        message: null
    }

    /**
     * A file is being uploaded or imported: Import stays disabled
     * @member {Boolean} uploading=false
     */
    uploading = false

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype    : 'component',
            tag      : 'p',
            reference: 'status',
            cls      : ['go-import-file-text'],
            flex     : 'none',
            text     : me.message || t('Choose a file to import') + (me.accept ? ' (' + me.accept + ')' : '')
        }, ...me.createExtraItems(), {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                text   : t('Close'),
                handler: () => me.close()
            }, {
                module    : UploadButton,
                reference : 'upload',
                multiple  : false,
                accept    : me.accept,
                disabled  : !me.canUpload(),
                buttonText: t('Import'),
                listeners : {files: ({files}) => me.onFile(files[0])}
            }]
        }]
    }

    /**
     * Items between the text and the buttons, e.g. a container picker of a subclass
     * @returns {Object[]}
     */
    createExtraItems() {
        return []
    }

    /**
     * Values of every imported item; a subclass adds what its extra items chose
     * @returns {Object}
     */
    getImportValues() {
        return this.values
    }

    /**
     * Whether Import may open the file chooser; a subclass checks its extra items
     * (its references may not exist yet while the dialog is constructed)
     * @returns {Boolean}
     */
    canUpload() {
        return true
    }

    /**
     * Enables Import as canUpload() says; a subclass calls it when its extra items change
     */
    syncUpload() {
        const upload = this.getReference('upload');

        upload && (upload.disabled = this.uploading || !this.canUpload())
    }

    async onFile(file) {
        let me     = this,
            upload = me.getReference('upload');

        if (!file) {
            return
        }

        me.uploading    = true;
        upload.disabled = true;
        me.getReference('status').text = t('Uploading...');

        try {
            const {mapping} = await importFile(me, file, me.entity, me.getImportValues(), me.options);

            if (!mapping) {
                notify(me, t('Importing is in progress in the background. You will be kept informed about progress via notifications.'), {title: t('Success')})
            }

            me.isDestroyed || me.close()
        } catch (e) {
            notifyError(me, e);
            me.isDestroyed || (me.getReference('status').text = '')
        } finally {
            me.uploading = false;
            me.isDestroyed || me.syncUpload()
        }
    }
}

export default Neo.setupClass(ImportFileDialog);
