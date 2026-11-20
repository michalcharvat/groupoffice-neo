import PasswordField from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Password.mjs';
import {fieldset}    from '../../../../../../../views/neo/src/form/fieldset.mjs';
import SettingsPanel from '../../../../../../../views/neo/src/systemsettings/SettingsPanel.mjs';
import {hint, selectField, textField} from '../../../../../../../views/neo/src/systemsettings/fields.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import {DEFAULT_CDN_URL} from './EditorWindow.mjs';

const t = translator('community', 'syncfusion');

/**
 * Syncfusion card of System settings (GOUI SystemSettings.ts): license, library source and the Docker
 * service URLs. The CDN URL is hidden for the local library source, which shows where to put the files.
 */
class SystemSettingsPanel extends SettingsPanel {
    static config = {
        className    : 'GO.syncfusion.view.SystemSettingsPanel',
        modulePackage: 'community',
        moduleName   : 'syncfusion'
    }

    createFields() {
        let me = this;

        return [
            fieldset(t('License'), [
                textField('licenseKey', t('License Key'))
            ]),
            fieldset(t('Library'), [
                selectField('librarySource', t('Library Source'), [
                    ['cdn', t('CDN (recommended)')],
                    ['local', t('Local (lib/ directory)')]
                ], {
                    listeners: {change: ({value}) => me.syncLibrarySource(value?.id ?? value)}
                }),
                textField('cdnUrl', t('CDN URL'), {reference: 'cdnUrl', placeholderText: DEFAULT_CDN_URL}),
                {...hint(t('Place ej2.min.js and ej2.min.css in go/modules/community/syncfusion/lib/')), reference: 'localHint', hidden: true}
            ]),
            fieldset(t('Service URLs'), [
                textField('documentServiceUrl', t('Document Service URL'), {placeholderText: 'http://localhost:6002/api/documenteditor'}),
                textField('spreadsheetServiceUrl', t('Spreadsheet Service URL'), {placeholderText: 'http://localhost:6003/api/spreadsheet'}),
                textField('serviceSecret', t('Service Secret'), {
                    module         : PasswordField,
                    autoComplete   : 'new-password',
                    placeholderText: t('Shared JWT secret for Docker services')
                })
            ]),
            fieldset(t('Setup Instructions'), [{
                ntype: 'component',
                cls  : ['go-syncfusion-setup'],
                html : '<p><b>' + t('Docker services') + ':</b></p>' +
                       '<code>docker run -d -p 6002:80 syncfusion/word-processor-server</code><br>' +
                       '<code>docker run -d -p 6003:8080 syncfusion/spreadsheet-server</code>'
            }])
        ]
    }

    /**
     * @param {String} source 'cdn' or 'local'
     */
    syncLibrarySource(source) {
        const local = source === 'local';

        this.getReference('cdnUrl')    && (this.getReference('cdnUrl').hidden = local);
        this.getReference('localHint') && (this.getReference('localHint').hidden = !local)
    }
}

export default Neo.setupClass(SystemSettingsPanel);
