import Container    from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import {fieldset}   from '../../../../../../../views/neo/src/form/fieldset.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {notify, notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import {isEnforced, loadSettings, saveWithPassword, sentences} from '../otp.mjs';
import EnableDialog from './EnableDialog.mjs';

const t = translator('community', 'otp');

/**
 * "Two Factor Authentication" card of My account (go.modules.community.otp.AuthenticatorSettingsFieldset,
 * which GO puts in the Account tab): enable or disable the OTP authenticator.
 * Both save right away (User/set), not with the dialog's Save.
 */
class OtpSettingsPanel extends Container {
    static config = {
        className: 'GO.otp.view.OtpSettingsPanel',
        baseCls  : ['go-otp-settings', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * The shown user (My account loads the logged-in one)
     * @member {Object|null} user=null
     */
    user = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [fieldset(t('Two Factor Authentication'), [{
            ntype: 'component',
            tag  : 'p',
            text : t('Setup one-time password authentication using an OTP application which generates a unique PIN for each login.')
        }, {
            ntype : 'container',
            flex  : 'none',
            layout: {ntype: 'hbox'},
            items : [{
                module   : Button,
                reference: 'enableButton',
                icon     : 'phonelink_lock',
                text     : t('Enable OTP Authenticator'),
                hidden   : true,
                handler  : () => me.onEnable()
            }, {
                module   : Button,
                reference: 'disableButton',
                icon     : 'phonelink_erase',
                text     : t('Disable OTP Authenticator'),
                hidden   : true,
                handler  : () => me.onDisable()
            }]
        }])]
    }

    /**
     * My account loaded the user
     * @param {Object} user
     */
    onLoad(user) {
        this.user = user;
        this.showState(!!user?.otp?.isEnabled)
    }

    /**
     * @param {Boolean} enabled
     */
    showState(enabled) {
        let me = this;

        me.getReference('enableButton').hidden  = enabled;
        me.getReference('disableButton').hidden = !enabled
    }

    async onEnable() {
        let me = this;

        try {
            const settings = await loadSettings().catch(() => ({})),
                  [user]   = await client.get('User', [me.user.id], ['id', 'groups']),
                  enabled  = await EnableDialog.start({
                      appName : me.appName,
                      windowId: me.windowId,
                      userId  : me.user.id,
                      enforced: isEnforced(user || {}, settings)
                  });

            enabled && !me.isDestroyed && me.showState(true)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    async onDisable() {
        let me   = this,
            self = String(me.user.id) === String(client.user?.id);

        try {
            const updated = await saveWithPassword({
                appName : me.appName,
                windowId: me.windowId,
                userId  : me.user.id,
                data    : {otp: null},
                title   : t('Disable OTP Authenticator'),
                message : sentences(t('When disabling OTP Authenticator this step will be removed from the login process.'),
                          t('Provide your current password to disable OTP Authenticator.')),
                // GO: an administrator changes another user without a password
                askFirst: self || !client.isAdmin
            });

            if (updated && !me.isDestroyed) {
                me.showState(false);
                notify(me, t('OTP Authenticator disabled'))
            }
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }
}

export default Neo.setupClass(OtpSettingsPanel);
