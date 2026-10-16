import HtmlField     from '../form/field/HtmlField.mjs';
import {fieldset}    from '../form/fieldset.mjs';
import {t}           from '../Translate.mjs';
import SettingsPanel from './SettingsPanel.mjs';
import {checkField, hint, selectField, textField} from './fields.mjs';

/**
 * "General" card of System settings (go.systemsettings.GeneralPanel): title, default
 * language, URL, maintenance mode and the login message.
 */
class GeneralPanel extends SettingsPanel {
    static config = {
        className   : 'GO.systemsettings.GeneralPanel',
        reloadOnSave: true
    }

    createItems() {
        let me = this;

        return [
            fieldset(t('General'), [
                textField('title', t('Title')),
                hint(t('Used as page title and sender name for notifications')),
                selectField('language', t('Language'), Neo.config.goLanguages || [], {editable: true}),
                hint(t('The language is automatically detected from the browser. If the language is not available then this language will be used.')),
                textField('URL', t('URL')),
                hint(t('The full URL to GroupOffice.'))
            ]),
            fieldset(t('Login'), [
                checkField('maintenanceMode', t('Enable maintenance mode')),
                hint(t('When maintenance mode is enabled only administrators can login')),
                checkField('loginMessageEnabled', t('Enable login message'), {
                    listeners: {change: () => me.syncLoginMessage()}
                }),
                {
                    module   : HtmlField,
                    name     : 'settings.loginMessage',
                    reference: 'loginMessage',
                    labelText: t('Login message'),
                    height   : 200,
                    flex     : 'none'
                },
                hint(t('This message will show on the login screen'))
            ])
        ]
    }

    async onSettingsLoad(module) {
        await super.onSettingsLoad(module);
        this.syncLoginMessage()
    }

    /**
     * The message is edited while it is enabled
     * @protected
     */
    async syncLoginMessage() {
        const enabled = await this.getSetting('loginMessageEnabled');

        this.isDestroyed || (this.getReference('loginMessage').readOnly = !enabled)
    }
}

export default Neo.setupClass(GeneralPanel);
