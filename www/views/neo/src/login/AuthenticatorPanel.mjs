import FormContainer from '../../node_modules/neo.mjs/src/form/Container.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import {t}           from '../Translate.mjs';

/**
 * Login step of a secondary authenticator (go.login.BaseLoginPanel), a card of the
 * login window (apps/go/view/LoginView.mjs). A module registers its subclass per
 * authenticator id:
 *
 *     ModuleRegistry.register({..., loginPanels: {otpauthenticator: () => import('./view/OtpLoginPanel.mjs')}})
 *
 *     class OtpLoginPanel extends AuthenticatorPanel {
 *         createFields() { return [{module: TextField, name: 'otp_code', ...}] }
 *         errorText(field, code) { ... }   // server validation error code → text
 *     }
 *
 * The form's values are the authenticator's data for api/auth.php
 * ({authenticators: {<id>: values}}). Events: next {panel}, cancel {panel}.
 */
class AuthenticatorPanel extends FormContainer {
    static config = {
        className: 'GO.login.AuthenticatorPanel',
        baseCls  : ['go-login-authenticator', 'neo-container'],
        keys     : {Enter: 'onNext'},
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * Server id of the authenticator, set by the login view
         * @member {String|null} authenticatorId=null
         */
        authenticatorId: null,
        /**
         * Title of the login window while this step shows
         * @member {String|null} title=null
         */
        title: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype : 'container',
            cls   : ['go-login-fields'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [...me.createFields(), {
                ntype    : 'component',
                cls      : ['go-login-error'],
                reference: 'error',
                hidden   : true
            }]
        }, {
            module: Toolbar,
            cls   : ['go-login-buttons'],
            flex  : 'none',
            items : [{
                module : Button,
                text   : t('Cancel'),
                handler: () => me.fire('cancel', {panel: me})
            }, '->', {
                module   : Button,
                reference: 'nextButton',
                ui       : 'primary',
                text     : t('Next'),
                handler  : () => me.onNext()
            }]
        }]
    }

    /**
     * @returns {Object[]} field configs, named like the authenticator's data
     */
    createFields() {
        return []
    }

    onNext() {
        this.getReference('nextButton').disabled || this.fire('next', {panel: this})
    }

    /**
     * @returns {Promise<Object|null>} the authenticator's data, null when the form is invalid
     */
    async getAuthenticatorData() {
        return await this.validate() ? await this.getValues() : null
    }

    /**
     * @param {Boolean} busy
     */
    setBusy(busy) {
        this.getReference('nextButton').disabled = busy
    }

    /**
     * Empties the fields and errors (another login attempt)
     */
    async clear() {
        let me = this;

        await me.reset();
        (await me.getFields()).forEach(field => field.error = null);
        me.showError(null)
    }

    /**
     * Server validation errors of this authenticator: {field: {code, description}} or [message]
     * @param {Object|Array} errors
     */
    async setErrors(errors) {
        let me     = this,
            others = [];

        for (const [name, error] of Object.entries(errors || {})) {
            const field = await me.getField(name),
                  text  = me.errorText(name, parseInt(error?.code)) || error?.description || (typeof error === 'string' ? error : t('Invalid'));

            field ? field.error = text : others.push(text)
        }

        me.showError(others.join('\n') || null)
    }

    /**
     * Text for a server validation error
     * @param {String} field
     * @param {Number} code GO ErrorCode
     * @returns {String|null}
     */
    errorText(field, code) {
        return null
    }

    /**
     * @param {String|null} message
     */
    showError(message) {
        let error = this.getReference('error');

        error.text   = message || '';
        error.hidden = !message
    }
}

export default Neo.setupClass(AuthenticatorPanel);
