import BoolCheckBox  from '../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import client        from '../../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {t as coreT, translator} from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'serverclient');

/**
 * "Mailboxes" card of the Create user dialog (GO.serverclient UserOverride.js): a checkbox
 * per domain, the first checked. The e-mail and recovery e-mail follow the username in the
 * first checked domain; after the user is saved, Serverclient/setMailbox creates the
 * mailboxes with the new password. Nothing is added without configured domains.
 * @param {GO.users.CreateUserDialog} dialog
 * @returns {Promise<void>}
 */
export async function addMailboxesCard(dialog) {
    let domains;

    try {
        ({domains = []} = await client.call('community/serverclient/Serverclient/domains', {}));
    } catch (e) {
        dialog.isDestroyed || notifyError(dialog, e);
        return
    }

    if (dialog.isDestroyed || !domains.length) {
        return
    }

    const card = dialog.addCard({
        header: {text: coreT('Mailboxes')},
        items : [{
            ntype : 'container',
            cls   : ['go-fieldset'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            // no name: not part of the User
            items : domains.map((domain, i) => ({
                module    : BoolCheckBox,
                reference : 'serverclient-' + i,
                valueLabel: domain,
                listeners : {change: () => setDefaultEmail()}
            }))
        }]
    });

    const checked = () => domains.filter((domain, i) => card.getReference('serverclient-' + i)?.checked);

    /**
     * username@<first checked domain> as e-mail and recovery e-mail (a username with @ as is)
     */
    function setDefaultEmail() {
        const username = dialog.getReference('username')?.value || '',
              [domain] = checked();

        if (!username || !domain) {
            return
        }

        const email = username.includes('@') ? username : username + '@' + domain;

        dialog.getReference('email').value         = email;
        dialog.getReference('recoveryEmail').value = email
    }

    dialog.getReference('username')?.on('change', setDefaultEmail);

    // the form resets its fields when it is ready and after saving: domains and password as sent
    let request = null;

    dialog.form.on('beforesave', ({data}) => {
        request = {domains: checked(), password: data.password || ''}
    });

    dialog.on('save', ({id}) => {
        // the dialog is destroyed when the request ends
        const target = {appName: dialog.appName, windowId: dialog.windowId};

        request?.domains.length && client.call('community/serverclient/Serverclient/setMailbox', {userId: id, ...request})
            .catch(e => notifyError(target, new Error(t("The mailbox couldn't be created") + ': ' + (e.message || e))));
        request = null
    });

    // the first domain, as the form's starting state (no discard question for it)
    await dialog.readyPromise;
    dialog.isDestroyed || card.getReference('serverclient-0')?.reset(true)
}
