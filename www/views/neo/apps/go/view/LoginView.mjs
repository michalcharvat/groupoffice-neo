import Container     from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import CheckBox      from '../../../node_modules/neo.mjs/src/form/field/CheckBox.mjs';
import FormContainer from '../../../node_modules/neo.mjs/src/form/Container.mjs';
import EmailField    from '../../../node_modules/neo.mjs/src/form/field/Email.mjs';
import PasswordField from '../../../node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../src/button/Button.mjs';
import client        from '../../../src/jmap/Client.mjs';
import {t} from '../../../src/Translate.mjs';

/**
 * GO login screen (go.login.LoginPanel + LoginDialog + UsernamePanel): the logo top left,
 * the language menu top right and "Powered by" at the bottom on the header colour, in the
 * middle a window "Login required" with username / password, "remember my login",
 * "Forgot login credentials?" and Next. The forgot card replaces the login card in the
 * window (GO opens go.login.ForgotDialog over it).
 */
class LoginView extends Container {
    static config = {
        className: 'GO.view.LoginView',
        cls      : ['go-login'],
        layout   : {ntype: 'vbox', align: 'center', pack: 'center'},
        items    : [{
            ntype: 'component',
            cls  : ['go-login-logo'],
            role : 'img',
            title: Neo.config.goTitle || 'Group Office'
        }, {
            // menu: see construct()
            module   : Button,
            cls      : ['go-login-language'],
            icon     : 'language',
            reference: 'languageButton',
            tooltip  : t('Language')
        }, {
            ntype    : 'container',
            cls      : ['go-login-window'],
            reference: 'window',
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : [{
                ntype    : 'component',
                tag      : 'h3',
                cls      : ['go-login-title'],
                flex     : 'none',
                reference: 'title',
                text     : t('Login required')
            }, {
                ntype    : 'container',
                reference: 'cards',
                flex     : 'none',
                layout   : {ntype: 'card', activeIndex: 0, removeInactiveCards: false},
                items    : [{
                    module   : FormContainer,
                    reference: 'loginForm',
                    keys     : {Enter: 'up.onLogin'},
                    layout   : {ntype: 'vbox', align: 'stretch'},
                    items    : [{
                        ntype : 'container',
                        cls   : ['go-login-fields'],
                        flex  : 'none',
                        layout: {ntype: 'vbox', align: 'stretch'},
                        items : [{
                            module       : TextField,
                            name         : 'username',
                            labelText    : t('Username'),
                            labelPosition: 'inline',
                            autoComplete : 'username',
                            required     : true
                        }, {
                            module       : PasswordField,
                            name         : 'password',
                            labelText    : t('Password'),
                            labelPosition: 'inline',
                            autoComplete : 'current-password',
                            required     : true
                        }, {
                            // GO hides it when the session ends after inactivity anyway
                            module    : CheckBox,
                            cls       : ['go-login-remember'],
                            name      : 'rememberLogin',
                            hidden    : Neo.config.goLogoutWhenInactive > 0,
                            hideLabel : true,
                            valueLabel: t('Remember my login on this computer until I press logout')
                        }, {
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
                            cls    : ['go-login-forgot'],
                            text   : t('Forgot login credentials?'),
                            handler: 'up.onForgot'
                        }, '->', {
                            module   : Button,
                            reference: 'loginButton',
                            ui       : 'primary',
                            text     : t('Next'),
                            handler  : 'up.onLogin'
                        }]
                    }]
                }, {
                    // go.login.ForgotDialog
                    module   : FormContainer,
                    reference: 'forgotForm',
                    keys     : {Enter: 'up.onSendForgot'},
                    layout   : {ntype: 'vbox', align: 'stretch'},
                    items    : [{
                        ntype : 'container',
                        cls   : ['go-login-fields'],
                        flex  : 'none',
                        layout: {ntype: 'vbox', align: 'stretch'},
                        items : [{
                            ntype: 'component',
                            text : t('Enter your email address')
                        }, {
                            module       : EmailField,
                            name         : 'email',
                            labelText    : t('E-mail'),
                            labelPosition: 'inline',
                            autoComplete : 'email',
                            required     : true
                        }, {
                            ntype    : 'component',
                            cls      : ['go-login-message'],
                            reference: 'forgotMessage',
                            hidden   : true
                        }]
                    }, {
                        module: Toolbar,
                        cls   : ['go-login-buttons'],
                        flex  : 'none',
                        items : [{
                            module : Button,
                            text   : t('Back'),
                            handler: 'up.showLoginCard'
                        }, '->', {
                            module   : Button,
                            reference: 'forgotButton',
                            ui       : 'primary',
                            text     : t('Send'),
                            handler  : 'up.onSendForgot'
                        }]
                    }]
                }]
            }]
        }, {
            ntype: 'component',
            cls  : ['go-login-powered'],
            html : 'Powered by GroupOffice<br><a target="_blank" rel="noopener" href="https://www.group-office.com">https://www.group-office.com</a>'
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            item = (text, lang) => ({text, handler: () => me.setLanguage(lang)});

        me.getReference('languageButton').menu = {
            align: {edgeAlign: 't100-b100'},
            items: [item(t('My selected language'), ''), {separator: true},
                ...(Neo.config.goLanguages || []).map(([lang, text]) => item(text, lang))]
        }
    }

    async onLogin() {
        let me     = this,
            form   = me.getReference('loginForm'),
            button = me.getReference('loginButton');

        if (button.disabled || !await form.validate()) {
            return
        }

        const {username, password, rememberLogin} = await form.getValues();

        button.disabled = true;
        me.showError(null);

        try {
            const result = await client.login(username, password, !!rememberLogin);
            !result.success && me.showError(result.message)
        } catch (e) {
            me.showError(e.message)
        } finally {
            button.disabled = false
        }
    }

    /**
     * go.login.LoginPanel: reloads GO in the picked language ('' = the user's own)
     * @param {String} lang
     */
    setLanguage(lang) {
        Neo.Main.redirectTo({
            url     : client.baseUrl + 'index.php?SET_LANGUAGE=' + encodeURIComponent(lang),
            windowId: this.windowId
        })
    }

    /**
     * go.login.UsernamePanel.showForgot(): the configured URL or the e-mail form
     */
    onForgot() {
        let me  = this,
            url = Neo.config.goLostPasswordUrl;

        if (url) {
            Neo.Main.windowOpen({url, windowName: '_blank', windowId: me.windowId});
            return
        }

        me.getReference('forgotForm').reset({email: ''});
        me.showForgotMessage(null);
        me.getReference('title').text = t('Forgot login credentials?');
        me.getReference('cards').layout.activeIndex = 1
    }

    showLoginCard() {
        let me = this;

        me.getReference('title').text = t('Login required');
        me.getReference('cards').layout.activeIndex = 0
    }

    /**
     * go.login.ForgotDialog.submit(): api/auth.php {action: 'forgotten'}
     */
    async onSendForgot() {
        let me     = this,
            form   = me.getReference('forgotForm'),
            button = me.getReference('forgotButton');

        if (button.disabled || !await form.validate()) {
            return
        }

        const {email} = await form.getValues();

        button.disabled = true;

        try {
            const response = await fetch(client.apiUrl + 'auth.php', {
                method     : 'POST',
                credentials: 'same-origin',
                headers    : {'Content-Type': 'application/json'},
                body       : JSON.stringify({action: 'forgotten', email})
            });

            if (!response.ok) {
                throw new Error(response.statusText)
            }

            me.showForgotMessage(t('An e-mail with instructions has been sent to your e-mail address.'))
        } catch (e) {
            me.showForgotMessage(t('Sorry, an error occurred') + ': ' + e.message, true)
        } finally {
            button.disabled = false
        }
    }

    reset(message) {
        let me = this;

        me.showLoginCard();
        me.getReference('loginForm').reset({username: '', password: ''});
        me.showError(message || null)
    }

    showError(message) {
        let error = this.getReference('error');

        error.text   = message || '';
        error.hidden = !message
    }

    showForgotMessage(message, isError=false) {
        let el = this.getReference('forgotMessage');

        el.text   = message || '';
        el.hidden = !message;
        el.toggleCls('go-login-error', isError)
    }
}

export default Neo.setupClass(LoginView);
