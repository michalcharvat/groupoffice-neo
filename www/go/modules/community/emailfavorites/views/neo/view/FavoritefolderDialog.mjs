import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import PromptDialog from '../../../../../../../modules/email/views/neo/view/PromptDialog.mjs';

const t = translator('community', 'emailfavorites');

/**
 * The favourite's name (ExtJS go.emailfavorites.FavoritefolderDialog: a form with one
 * required "Name" field). The e-mail client's PromptDialog is that form.
 * @param {Object} config appName, windowId, value (the current name)
 * @returns {Promise<String|null>} the new name, null when cancelled
 */
export function renameFavorite({appName, windowId, value}) {
    return PromptDialog.ask({appName, windowId, title: t('E-mail favorite'), labelText: t('Name'), value})
}
