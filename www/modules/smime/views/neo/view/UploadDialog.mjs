import PasswordField    from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Password.mjs';
import BlobField        from '../../../../../views/neo/src/form/field/BlobField.mjs';
import LegacyFormWindow from '../../../../../views/neo/src/view/LegacyFormWindow.mjs';
import * as api         from '../api.mjs';
import {t}              from '../api.mjs';

/**
 * Upload of a PKCS#12 certificate with its private key to an e-mail account (ExtJS smime
 * PluginAccountDialog mimeUploadWindow, smime/certificate/upload). The file goes up as a JMAP
 * blob; the server refuses a certificate without a password.
 *
 *     Neo.create(UploadDialog, {appName, windowId, accountId})   // fires save
 */
class UploadDialog extends LegacyFormWindow {
    static config = {
        className    : 'GO.smime.UploadDialog',
        cls          : ['go-form-window', 'go-smime-upload-dialog'],
        title        : t('PKCS12 certificate'),
        generalHeader: {text: t('PKCS12 certificate')},
        wrapperStyle : {
            height   : 'min(380px, 90vh)',
            left     : 'max(0px, calc(50vw - 240px))',
            maxHeight: '90vh',
            top      : 'max(5vh, calc(50vh - 190px))',
            width    : 'min(480px, 100vw)'
        },
        /**
         * @member {Number|null} accountId=null
         */
        accountId: null,
        values   : {cert: null, smime_password: ''}
    }

    createFormItems() {
        return [{
            ntype: 'component',
            cls  : ['go-field-hint'],
            flex : 'none',
            text : t('Select a PKCS12 file (.p12 or .pfx) with your certificate and private key and enter its password. A certificate without a password is not accepted.')
        }, {
            module   : BlobField,
            name     : 'cert',
            labelText: t('Select new PKCS12 Certificate'),
            accept   : '.p12,.pfx,application/x-pkcs12',
            flex     : 'none',
            required : true
        }, {
            module       : PasswordField,
            name         : 'smime_password',
            labelText    : 'SMIME ' + t('Password'),
            labelPosition: 'inline',
            autoComplete : 'new-password',
            flex         : 'none',
            required     : true
        }]
    }

    async save(modified, values) {
        let me = this;

        if (!values.cert?.id) {
            throw new Error(t('Select new PKCS12 Certificate'))
        }

        await api.uploadCertificate({accountId: me.accountId, blobId: values.cert.id, password: values.smime_password});
        return {}
    }
}

export default Neo.setupClass(UploadDialog);
