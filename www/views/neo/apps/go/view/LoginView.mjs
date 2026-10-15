import Button        from '../../../node_modules/neo.mjs/src/button/Base.mjs';
import CheckBox      from '../../../node_modules/neo.mjs/src/form/field/CheckBox.mjs';
import FormContainer from '../../../node_modules/neo.mjs/src/form/Container.mjs';
import PasswordField from '../../../node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import client        from '../../../src/jmap/Client.mjs';
import {t} from '../../../src/Translate.mjs';

class LoginView extends FormContainer {
    static config = {
        className: 'GO.view.LoginView',
        cls      : ['go-login'],
        keys     : {Enter: 'onLogin'},
        layout   : {ntype: 'vbox', align: 'center', pack: 'center'},
        items    : [{
            ntype: 'container',
            cls  : ['go-login-box'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items: [{
                ntype: 'component',
                tag  : 'h1',
                text : Neo.config.goTitle || 'Group Office'
            }, {
                ntype: 'component',
                cls  : ['go-login-subtitle'],
                text : 'neo.mjs preview'
            }, {
                module      : TextField,
                name        : 'username',
                labelText   : t('Username'),
                labelPosition: 'inline',
                autoComplete: 'username',
                required    : true
            }, {
                module      : PasswordField,
                name        : 'password',
                labelText   : t('Password'),
                labelPosition: 'inline',
                autoComplete: 'current-password',
                required    : true
            }, {
                module        : CheckBox,
                name          : 'rememberLogin',
                hideLabel     : true,
                valueLabel    : t('Remember me')
            }, {
                ntype    : 'component',
                cls      : ['go-login-error'],
                reference: 'error',
                hidden   : true
            }, {
                module   : Button,
                reference: 'loginButton',
                text     : t('Login'),
                handler  : 'up.onLogin'
            }]
        }]
    }

    async onLogin() {
        let me     = this,
            button = me.getReference('loginButton');

        if (button.disabled || !await me.validate()) {
            return
        }

        const {username, password, rememberLogin} = await me.getValues();

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

    reset(message) {
        super.reset({username: '', password: ''});
        this.showError(message || null)
    }

    showError(message) {
        let error = this.getReference('error');

        error.text   = message || '';
        error.hidden = !message
    }
}

export default Neo.setupClass(LoginView);
