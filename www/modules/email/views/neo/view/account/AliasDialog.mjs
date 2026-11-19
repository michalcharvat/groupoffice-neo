import EmailField from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Email.mjs';
import TextArea   from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField  from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {t as coreT} from '../../../../../../views/neo/src/Translate.mjs';
import {t}          from '../../util.mjs';
import RecordDialog, {centered, field} from './RecordDialog.mjs';

/**
 * An alias of an account (ExtJS GO.email.AliasDialog, email/alias/load|submit): name, e-mail,
 * signature (plain text, like ExtJS). Saving needs write permission on the account.
 */
class AliasDialog extends RecordDialog {
    static legacyController = 'alias'

    static config = {
        className   : 'GO.email.account.AliasDialog',
        title       : t('Alias'),
        wrapperStyle: centered(560, 480)
    }

    static toValues(data) {
        return {name: data?.name || '', email: data?.email || '', signature: data?.signature || ''}
    }

    createFormItems() {
        return [
            field(TextField, 'name', coreT('Name'), {required: true}),
            field(EmailField, 'email', t('Email'), {required: true}),
            field(TextArea, 'signature', t('Signature'), {flex: 1, minHeight: 120})
        ]
    }
}

export default Neo.setupClass(AliasDialog);
