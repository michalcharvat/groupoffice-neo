import LinesField    from '../form/field/LinesField.mjs';
import {fieldset}    from '../form/fieldset.mjs';
import client        from '../jmap/Client.mjs';
import {t}           from '../Translate.mjs';
import AuthAllowGroupGrid from './AuthAllowGroupGrid.mjs';
import SettingsPanel from './SettingsPanel.mjs';
import {checkField, hint, numberField, selectField, textField} from './fields.mjs';

/**
 * "Authentication" card of System settings (go.systemsettings.AuthenticationPanel):
 * password rules, default domain, inactivity logout, allowed groups per IP,
 * ActiveSync and API settings.
 */
class AuthenticationPanel extends SettingsPanel {
    static config = {
        className   : 'GO.systemsettings.AuthenticationPanel',
        // the login screen reads the lost password URL and the inactivity logout (Neo.php)
        reloadOnSave: true
    }

    createFields() {
        // authentication domains of the installed authenticators (go.login.DomainCombo)
        const domains = client.session?.auth?.domains || [];

        return [
            fieldset(t('Password'), [
                numberField('passwordMinLength', t('Minimum length'), {minValue: 1}),
                ...domains.length ? [
                    selectField('defaultAuthenticationDomain', t('Default domain'), [['', t('None')], ...domains.map(d => [d, d])]),
                    hint(t('Users can login without this domain behind the username. Note that if the user exists in the Group-Office database it will take precedence.'))
                ] : [],
                numberField('logoutWhenInactive', t('Logout when inactive'), {minValue: 0}),
                hint(t("Logout users when inactive for more than this number of seconds. This will also disable the 'Remember my login' checkbox in the login dialog. 0 disables this setting.")),
                textField('lostPasswordURL', t('Lost password URL')),
                hint(t('You can set an URL to handle lost passwords in an alternative way'))
            ]),
            fieldset(t('Allowed groups'), [
                {
                    ntype: 'component',
                    cls  : ['go-systemsettings-text'],
                    flex : 'none',
                    text : t("Define which groups are allowed to login from which IP addresses. You can use '*' to match any charachters and '?'" +
                        " to match any single character. eg. '192.168.1?.*'. Be careful, You can lock yourself out!")
                },
                {module: AuthAllowGroupGrid, reference: 'allowGroups', flex: 'none'}
            ]),
            fieldset(t('Synchronization'), [
                checkField('activeSyncEnable2FA', t('Enable 2-Factor authentication for ActiveSync devices')),
                checkField('activeSyncCanConnect', t('ActiveSync devices can connect by default.')),
                hint(t('When disabled the administrator has to allow each new device manually'))
            ]),
            fieldset(t('API settings'), [
                {module: LinesField, name: 'settings.corsAllowOrigin', labelText: t('CORS origins'), placeholderText: 'eg. https://example.com', flex: 'none'},
                hint(t('Allow Cross Origin Requests from these origins') + ' (' + t('one per line') + ')'),
                checkField('allowRegistration', t('Allow creation of users through the API')),
                hint(t("When enabled, you should restrict access for the 'Everyone' group as much as possible. Use with caution."))
            ])
        ]
    }

    async load() {
        this.getReference('allowGroups').load();
        return super.load()
    }
}

export default Neo.setupClass(AuthenticationPanel);
