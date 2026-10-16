import JmapComboBox from '../form/field/JmapComboBox.mjs';
import {t}          from '../Translate.mjs';

/**
 * Pick an SMTP account (go.smtp.AccountCombo), shown by its sender address
 *
 *     {module: SmtpAccountCombo, name: 'smtpAccountId'}
 */
class SmtpAccountCombo extends JmapComboBox {
    static config = {
        className    : 'GO.smtp.SmtpAccountCombo',
        entity       : 'SmtpAccount',
        name         : 'smtpAccountId',
        labelPosition: 'inline',
        displayField : 'fromEmail',
        properties   : ['id', 'fromName', 'fromEmail']
    }

    construct(config) {
        super.construct(config);
        config.labelText || (this.labelText = t('Account (SMTP)'))
    }
}

export default Neo.setupClass(SmtpAccountCombo);
