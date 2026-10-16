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
        }, {
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
                buttonText: t('Import'),
                listeners : {files: ({files}) => me.onFile(files[0])}
            }]
        }]
    }

    async onFile(file) {
        let me     = this,
            upload = me.getReference('upload');

        if (!file) {
            return
        }

        upload.disabled = true;
        me.getReference('status').text = t('Uploading...');

        try {
            const {mapping} = await importFile(me, file, me.entity, me.values, me.options);

            if (!mapping) {
                notify(me, t('Importing is in progress in the background. You will be kept informed about progress via notifications.'), {title: t('Success')})
            }

            me.isDestroyed || me.close()
        } catch (e) {
            notifyError(me, e);
            me.isDestroyed || (me.getReference('status').text = '')
        } finally {
            me.isDestroyed || (upload.disabled = false)
        }
    }
}

export default Neo.setupClass(ImportFileDialog);
