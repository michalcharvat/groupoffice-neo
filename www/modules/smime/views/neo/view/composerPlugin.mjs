import PasswordPrompt from '../../../../../views/neo/src/view/PasswordPrompt.mjs';
import * as api       from '../api.mjs';
import {t}            from '../api.mjs';

const check = on => on ? 'check_box' : 'check_box_outline_blank';

/**
 * S/MIME in the e-mail composer (ExtJS smime PluginEmailComposer), an `emailComposerPlugins`
 * config: "Sign with SMIME" and "Encrypt with SMIME" in the options menu, only for a From
 * whose account has a certificate (email/alias/store `has_smime_cert`). The account's
 * "Always sign messages" checks Sign; a reply to an encrypted message comes with
 * sendParams.encrypt_smime. Before sending a signed or encrypted message the password of the
 * certificate is asked once per account and session (smime/certificate/checkPassword keeps it
 * in the PHP session, where email/message/send takes it).
 */

/**
 * @param {Object} alias email/alias/store record
 * @returns {Boolean}
 */
const hasCert = alias => !!alias?.has_smime_cert;

/**
 * @param {GO.email.composer.ComposerWindow} composer
 * @returns {{sign: Boolean, encrypt: Boolean}}
 */
function state(composer) {
    return composer.smime ??= {sign: false, encrypt: false}
}

/**
 * The From changed or a message loaded: what the alias allows (ExtJS checkSmimeSupport)
 * @param {GO.email.composer.ComposerWindow} composer
 * @param {Object|null} alias
 */
function applyAlias(composer, alias) {
    const s = state(composer);

    s.sign    = hasCert(alias) && !!Number(alias.always_sign);
    s.encrypt = hasCert(alias) && s.encrypt
}

/**
 * Asks the certificate password until it is correct (null: cancelled)
 * @param {GO.email.composer.ComposerWindow} composer
 * @param {Number} accountId
 * @returns {Promise<Boolean>} the server has the password
 */
async function askPassword(composer, accountId) {
    let message = t('Please enter the password of your SMIME certificate.');

    for (;;) {
        const password = await PasswordPrompt.ask({appName: composer.appName, windowId: composer.windowId, title: 'SMIME ' + t('Password'), message});

        if (password === null || composer.isDestroyed) {
            return false
        }

        if (await api.checkPassword(accountId, password)) {
            return true
        }

        message = t('The SMIME password was incorrect.') + ' ' + t('Please enter the password of your SMIME certificate.')
    }
}

export default {
    id: 'smime',

    init(composer) {
        applyAlias(composer, composer.alias)
    },

    onAliasChange(composer, alias) {
        applyAlias(composer, alias)
    },

    afterLoad(composer, response) {
        const s      = state(composer),
              params = response?.sendParams || {};

        // a reply to an encrypted message is encrypted too (MessageController sendParams)
        'encrypt_smime' in params && (s.encrypt = !!Number(params.encrypt_smime));

        // the alias defaults only once: a template switch or HTML toggle loads again and keeps
        // what the user chose
        if (!s.loaded) {
            s.loaded = true;
            applyAlias(composer, composer.alias)
        }
    },

    menuItems(composer) {
        const s   = state(composer),
              off = !hasCert(composer.alias);

        return [
            {text: t('Sign with SMIME'), icon: check(s.sign && !off), disabled: off, handler: () => s.sign = !s.sign},
            {text: t('Encrypt with SMIME'), icon: check(s.encrypt && !off), disabled: off, handler: () => s.encrypt = !s.encrypt}
        ]
    },

    async beforeSend(composer, {draft}) {
        const s = state(composer);

        // drafts are saved as they are; only sending signs and encrypts
        if (draft || !hasCert(composer.alias) || (!s.sign && !s.encrypt) || api.hasPassword(composer.accountId)) {
            return true
        }

        return askPassword(composer, composer.accountId)
    },

    submitParams(composer, params, {draft}) {
        const s  = state(composer),
              on = hasCert(composer.alias) && !draft;

        params.sign_smime    = on && s.sign ? 1 : 0;
        params.encrypt_smime = on && s.encrypt ? 1 : 0
    }
};
