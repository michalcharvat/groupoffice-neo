import Container    from '../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import BoolCheckBox from '../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import {fieldset}   from '../../../../../../views/neo/src/form/fieldset.mjs';
import client       from '../../../../../../views/neo/src/jmap/Client.mjs';
import {t} from '../../util.mjs';
import TemplateCombo from '../template/TemplateCombo.mjs';
import TemplatesGrid from '../template/TemplatesGrid.mjs';

/**
 * A checkbox of the user's emailSettings (JMAP User property, GO\Email\Model\UserSettings)
 * @param {String} name
 * @param {String} label
 * @param {Object} [config]
 * @returns {Object}
 */
const check = (name, label, config = {}) => ({module: BoolCheckBox, name: 'emailSettings.' + name, valueLabel: label, ...config});

/**
 * E-mail card of My account (ExtJS GO.email.SettingsPanel, Settings.js): the user's
 * emailSettings, saved with the User, and the e-mail templates the user may see.
 *
 * The composer reads these settings from client.user.emailSettings (src/Mail.mjs and the
 * composer): this card keeps that copy current when the logged-in user's settings load or
 * are saved.
 */
class UserSettingsPanel extends Container {
    static config = {
        className: 'GO.email.settings.UserSettingsPanel',
        baseCls  : ['go-email-settings', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * The dialog's save listener is registered
     * @member {Boolean} saveListener=false
     */
    saveListener = false

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [fieldset(t('Options'), [{
            module   : TemplateCombo,
            reference: 'templateCombo',
            name     : 'emailSettings.defaultTemplateId',
            labelText: t('Default template'),
            flex     : 'none'
        }, {
            ntype : 'container',
            cls   : ['go-email-settings-options'],
            flex  : 'none',
            layout: null,
            items : [
                check('use_html_markup', t('Use HTML markup')),
                check('show_from', t('Show from field by default')),
                check('show_cc', t('Show CC field by default')),
                check('show_bcc', t('Show BCC field by default')),
                // linked tasks in the message list: only with the savemailas module
                check('email_show_linked_tasks', t('Display linked tasks in messages list'), {
                    hidden: !client.hasCapability('go:legacy:savemailas')
                }),
                check('use_desktop_composer', t('Use desktop email client to compose')),
                check('skip_unknown_recipients', t("Don't show unknown recipients dialog")),
                check('always_request_notification', t('Always request a read notification')),
                check('always_respond_to_notifications', t('Always respond to a read notification')),
                check('sort_email_addresses_by_time', t('Sort on last contact mail time'))
            ]
        }]), fieldset(t('E-mail templates'), [{
            module   : TemplatesGrid,
            cls      : ['go-email-settings-templates'],
            flex     : 'none',
            listeners: {change: () => me.getReference('templateCombo')?.reload()}
        }])]
    }

    /**
     * Called by the My account dialog after every load
     * @param {Object} user
     */
    onLoad(user) {
        let me = this;

        me.updateClientSettings(user);

        if (!me.saveListener) {
            const dialog = me.findDialog();

            if (dialog) {
                me.saveListener = true;
                dialog.on('save', ({data}) => me.updateClientSettings(data))
            }
        }
    }

    /**
     * Keeps the logged-in user's emailSettings in the client (the composer reads them)
     * @param {Object} user User data
     * @protected
     */
    updateClientSettings(user) {
        if (user?.emailSettings && client.user && String(user.id) === String(client.user.id)) {
            client.user.emailSettings = {...user.emailSettings}
        }
    }

    /**
     * @returns {Neo.component.Base|null} the window with the User form
     * @protected
     */
    findDialog() {
        let component = Neo.getComponent(this.parentId);

        while (component && component.entityName !== 'User') {
            component = Neo.getComponent(component.parentId)
        }

        return component || null
    }
}

export default Neo.setupClass(UserSettingsPanel);
