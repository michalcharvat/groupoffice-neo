import TextField      from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import PrincipalCombo from '../../../../../../../views/neo/src/form/field/PrincipalCombo.mjs';
import FormWindow     from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {translator}   from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'apikeys');

/**
 * New API key (GOUI KeyDialog): a name and the user the key acts as. The server
 * returns the access token only in the create response, so it is shown once after saving.
 */
class KeyDialog extends FormWindow {
    static config = {
        className   : 'GO.apikeys.view.KeyDialog',
        entityName  : 'Key',
        title       : t('API key'),
        wrapperStyle: {height: 'auto', left: 'calc(50vw - 230px)', top: '20vh', width: 'min(460px, 100vw)'}
    }

    createFormItems() {
        return [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true
        }, {
            module         : PrincipalCombo,
            principalEntity: 'User',
            name           : 'userId',
            labelPosition  : 'inline',
            required       : true
        }]
    }

    async afterSave(data) {
        const token = data.isNew && data.created?.accessToken;

        await super.afterSave(data);

        if (token) {
            const {default: TokenDialog} = await import('./TokenDialog.mjs');
            Neo.create(TokenDialog, {appName: this.appName, windowId: this.windowId, token})
        }
    }

    addCustomFields() {
        // Key has no custom fields
    }
}

export default Neo.setupClass(KeyDialog);
