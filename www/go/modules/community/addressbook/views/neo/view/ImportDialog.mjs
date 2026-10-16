import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_CREATE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import UploadButton from '../../../../../../../views/neo/src/component/UploadButton.mjs';
import {dismissAlert, runBackgroundJob} from '../../../../../../../views/neo/src/data/backgroundJob.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {notify, notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {escapeHtml}   from '../../../../../../../views/neo/src/Format.mjs';
import Dialog       from '../../../../../../../views/neo/src/view/Dialog.mjs';
import {t}          from '../util.mjs';

/**
 * Import contacts from a vCard or JSON file into an address book (go.util.importFile
 * with Contact/import). The import runs in the background; the dialog waits for its
 * alert and reports the result.
 *
 * CSV and Excel need the column mapping dialog (go.import.CsvMappingDialog), which neo
 * does not have yet.
 */
class ImportDialog extends Dialog {
    static config = {
        className   : 'GO.addressbook.view.ImportDialog',
        cls         : ['go-addressbook-import-dialog'],
        modal       : true,
        title       : t('Import'),
        wrapperStyle: {left: 'calc(50vw - 240px)', top: '25vh', width: '480px'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /**
         * Address book preselected for the imported contacts
         * @member {String|null} addressBookId=null
         */
        addressBookId: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype : 'container',
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            style : {gap: '16px', padding: '8px 16px'},
            items : [{
                module       : JmapComboBox,
                reference    : 'addressBook',
                entity       : 'AddressBook',
                jmapFilter   : {permissionLevel: LEVEL_CREATE},
                jmapSort     : [{property: 'name', isAscending: true}],
                properties   : ['id', 'name'],
                labelText    : t('Address book'),
                labelPosition: 'inline',
                required     : true,
                value        : me.addressBookId
            }, {
                ntype    : 'component',
                reference: 'status',
                cls      : ['go-addressbook-import-status'],
                text     : t('Choose a vCard (.vcf) or JSON file.')
            }]
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
                buttonText: t('Import'),
                listeners : {files: ({files}) => me.onFiles(files)}
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        const upload = this.getReference('upload');

        upload.vdom.cn[0].accept = '.vcf,text/vcard,.json';
        upload.update()
    }

    setStatus(text) {
        this.isDestroyed || (this.getReference('status').text = text)
    }

    async onFiles(files) {
        let me            = this,
            file          = files[0],
            addressBookId = me.getReference('addressBook').getSubmitValue();

        if (!file) {
            return
        }

        if (!addressBookId) {
            me.getReference('addressBook').validate(false);
            return
        }

        if (/\.(csv|xlsx)$/i.test(file.name)) {
            me.setStatus(t('CSV and Excel files need the column mapping of the classic user interface.'));
            return
        }

        me.getReference('upload').disabled = true;

        try {
            me.setStatus(t('Uploading...'));

            const blob = await client.upload(file);

            me.setStatus(t('Importing...'));

            const alert = await runBackgroundJob(() => client.call('Contact/import', {blobId: blob.blobId, values: {addressBookId}}), {
                onProgress: a => a.data?.progress !== undefined && me.setStatus(t('Importing...') + ' ' + a.data.progress + '%')
            });

            const text = escapeHtml(String(alert.data?.body || '').replace(/<[^>]*>/g, ' '));

            dismissAlert(alert);
            notify(me, text, {title: alert.data?.title || t('Import finished')});
            me.isDestroyed || me.close()
        } catch (e) {
            me.setStatus('');
            notifyError(me, e)
        } finally {
            me.isDestroyed || (me.getReference('upload').disabled = false)
        }
    }
}

export default Neo.setupClass(ImportDialog);
