import TextField        from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BlobField        from '../../../../../views/neo/src/form/field/BlobField.mjs';
import LegacyFormWindow from '../../../../../views/neo/src/view/LegacyFormWindow.mjs';
import * as api         from '../api.mjs';
import {t}              from '../api.mjs';

/**
 * Import of someone's public certificate (ExtJS GO.smime.PublicCertsGrid uploadCert: a file
 * and window.prompt('Email address')), smime/publicCertificate/import. The server only takes
 * PEM ("-----BEGIN CERTIFICATE-----").
 *
 *     Neo.create(ImportDialog, {appName, windowId, values: {cert: null, email: ''}})  // fires save
 */
class ImportDialog extends LegacyFormWindow {
    static config = {
        className    : 'GO.smime.ImportDialog',
        cls          : ['go-form-window', 'go-smime-import-dialog'],
        title        : t('Import'),
        generalHeader: {text: t('Public SMIME certificates')},
        wrapperStyle : {
            height   : 'min(340px, 90vh)',
            left     : 'max(0px, calc(50vw - 240px))',
            maxHeight: '90vh',
            top      : 'max(5vh, calc(50vh - 170px))',
            width    : 'min(480px, 100vw)'
        }
    }

    createFormItems() {
        return [{
            module   : BlobField,
            name     : 'cert',
            labelText: t('Certificate'),
            accept   : '.cer,.pem,.crt',
            flex     : 'none'
        }, {
            module       : TextField,
            name         : 'email',
            inputType    : 'email',
            labelText    : t('E-mail'),
            labelPosition: 'inline',
            flex         : 'none',
            required     : true
        }]
    }

    async save(modified, values) {
        if (!values.cert?.id) {
            throw new Error(t('Select a certificate file'))
        }

        await api.importPublicCertificate(values.cert.id, String(values.email || '').trim().toLowerCase());
        return {}
    }
}

export default Neo.setupClass(ImportDialog);
