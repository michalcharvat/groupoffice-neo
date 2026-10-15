import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import FormContainer from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/Container.mjs';
import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import {saveWithPassword, sentences} from '../otp.mjs';

const t = translator('community', 'otp');

/**
 * Enable OTP (go.modules.community.otp.EnableAuthenticatorDialog): the QR code and
 * secret of the new, not yet verified secret; saving checks a code of the app.
 * Use EnableDialog.start(), which requests the secret first.
 */
class EnableDialog extends Dialog {
    static config = {
        className: 'GO.otp.view.EnableDialog',
        cls      : ['go-otp-enable'],
        modal    : true,
        resizable: false,
        title    : t('Enable OTP Authenticator'),
        wrapperStyle: {left: 'calc(50vw - 260px)', top: 'max(2vh, calc(50vh - 340px))', width: 'min(520px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {String|Number|null} userId=null
         */
        userId: null,
        /**
         * New secret (User/set response)
         * @member {String} secret=''
         */
        secret: '',
        /**
         * The administrator requires OTP for this user
         * @member {Boolean} enforced=false
         */
        enforced: false,
        /**
         * No "Setup later"
         * @member {Boolean} block=false
         */
        block: false,
        /**
         * Seconds before "Setup later" can be pressed
         * @member {Number} countDown=0
         */
        countDown: 0
    }

    /**
     * @member {Boolean} enabled=false
     */
    enabled = false

    construct(config) {
        // an enforced setup can't simply be closed
        (config.block || config.countDown) && (config.headerConfig = headerTools());

        super.construct(config);

        let me = this;

        me.items = [{
            module   : FormContainer,
            reference: 'form',
            keys     : {Enter: 'up.onSave'},
            cls      : ['go-otp-enable-form'],
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : [{
                ntype : 'component',
                cls   : ['go-otp-info'],
                hidden: !me.enforced,
                html  : `<i class="go-icon">info</i>${escapeHtml(t('Your system administrator requires you to setup two factor authentication'))}`
            }, {
                ntype: 'component',
                text : t('Scan the QR code below with the OTP Authenticator app on your mobile device, after that fill in the field below with the code generated in the app.')
            }, {
                ntype: 'component',
                cls  : ['go-otp-qr'],
                html : `<img alt="QR" width="200" height="200" src="${escapeHtml(client.baseUrl + 'api/download.php?blob=community/otp/qr&_dc=' + Date.now())}">`
            }, {
                module       : TextField,
                name         : 'secret',
                labelText    : t('Secret'),
                labelPosition: 'inline',
                readOnly     : true,
                clearable    : false,
                value        : me.secret
            }, {
                ntype: 'component',
                cls  : ['go-field-hint'],
                text : t('Secret key for manual input')
            }, {
                module       : TextField,
                name         : 'verify',
                reference    : 'verify',
                labelText    : t('Verify'),
                labelPosition: 'inline',
                autoComplete : 'one-time-code',
                required     : true
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : [{
                module   : Button,
                reference: 'laterButton',
                hidden   : me.block,
                disabled : me.countDown > 0,
                text     : t('Setup later'),
                handler  : () => me.close()
            }, '->', {
                module   : Button,
                reference: 'saveButton',
                ui       : 'primary',
                text     : t('Save'),
                handler  : () => me.onSave()
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.countDown > 0 && !me.block && me.runCountDown(parseInt(me.countDown));

        me.timeout(100).then(() => {
            const field = !me.isDestroyed && me.getReference('verify');
            field && field.focus(field.getInputElId())
        })
    }

    /**
     * An enforced setup can't be escaped: only "Setup later" (after its count down) closes it
     */
    onKeyDownEscape() {
        let me = this;

        if (!me.block && !me.getReference('laterButton')?.disabled) {
            super.onKeyDownEscape()
        }
    }

    /**
     * "Setup later (9)" … "Setup later"
     * @param {Number} seconds
     */
    async runCountDown(seconds) {
        let me     = this,
            button = me.getReference('laterButton');

        for (let i = seconds; i > 0; i--) {
            button.text = `${t('Setup later')} (${i})`;
            await me.timeout(1000);

            if (me.isDestroyed) {
                return
            }
        }

        button.text     = t('Setup later');
        button.disabled = false
    }

    async onSave() {
        let me     = this,
            field  = me.getReference('verify'),
            button = me.getReference('saveButton'),
            code   = String(field.value || '').replace(/\D/g, '');

        if (button.disabled || !code) {
            field.error = t('Code is required');
            return
        }

        button.disabled = true;
        field.error     = null;

        try {
            await saveWithPassword({
                appName : me.appName,
                windowId: me.windowId,
                userId  : me.userId,
                data    : {otp: {secret: me.secret, verify: code}},
                title   : t('Enable OTP Authenticator'),
                message : t('Provide your current password before you can enable OTP Authenticator.')
            });

            me.enabled = true;
            me.close()
        } catch (e) {
            // a wrong code fails the related otp record
            me.isDestroyed || (field.error = e.validationErrors?.otp ? t('Invalid code') : e.message)
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }

    /**
     * Requests a new secret (asks for the password unless the user is an administrator)
     * and shows the dialog.
     * @param {Object} config appName, windowId, userId, enforced, block, countDown
     * @returns {Promise<Boolean>} enabled
     */
    static async start(config) {
        const updated = await saveWithPassword({
            appName : config.appName,
            windowId: config.windowId,
            userId  : config.userId,
            data    : {otp: {requestSecret: true}},
            title   : t('Enable OTP Authenticator'),
            message : sentences(config.enforced ? t('Your system administrator requires you to setup two factor authentication') : '',
                      t('Provide your current password before you can enable OTP Authenticator.')),
            askFirst: !client.isAdmin,
            closable: !config.block && !config.countDown
        });

        if (!updated) {
            return false
        }

        const secret = updated.otp?.secret || (await client.get('User', [config.userId], ['otp']))[0]?.otp?.secret || '';

        return new Promise(resolve => {
            const dialog = Neo.create(EnableDialog, {...config, secret});
            dialog.on('close', () => resolve(dialog.enabled))
        })
    }
}

export default Neo.setupClass(EnableDialog);
