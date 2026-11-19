import {LEVEL_MANAGE}  from '../../../../views/neo/src/Acl.mjs';
import ModuleRegistry  from '../../../../views/neo/src/ModuleRegistry.mjs';
import * as sieveApi   from './sieveApi.mjs';
import {emailT, t}     from './util.mjs';

/**
 * The sieve module (legacy www/modules/sieve) in neo: two cards of the e-mail account dialog
 * (emailAccountDialogCards, see docs/neo-email-module.md), like ExtJS Overrides.js:
 *
 * - "Filters": the server side (ManageSieve) rules; it replaces the e-mail module's own
 *   filters card when the account's server supports ManageSieve.
 * - "Out of office": the vacation rule, when the server has the "vacation" extension.
 *
 * Both need manage permission on the account (the sieve controller and the out of office
 * listeners check it) and a saved account. The card code loads with the first dialog that
 * shows a card.
 */

/**
 * sieve/sieve/isSupported per dialog and account: both cards ask it
 * @type {WeakMap<Object, {accountId: Number, promise: Promise<Object>}>}
 */
const support = new WeakMap();

/**
 * @param {Object|null} account email/account/load data
 * @param {Object} dialog the account dialog
 * @returns {Promise<Object>} {supported, server_extensions}
 */
function supportOf(account, dialog) {
    if (!account?.id || +account.permission_level < LEVEL_MANAGE) {
        return Promise.resolve({supported: false, server_extensions: []})
    }

    let entry = support.get(dialog);

    if (!entry || entry.accountId !== account.id) {
        entry = {
            accountId: account.id,
            promise  : sieveApi.isSupported(account.id).catch(e => {
                console.error('sieve/sieve/isSupported', e);
                return {supported: false, server_extensions: []}
            })
        };
        support.set(dialog, entry)
    }

    return entry.promise
}

/**
 * Adds the card's content once (lazy import)
 * @param {Object} dialog
 * @param {String} slotRef
 * @param {Function} create async () => item configs
 * @returns {Promise<Boolean>} true when it was added now
 */
async function fillSlot(dialog, slotRef, create) {
    const slot = dialog.getReference(slotRef);

    if (!slot || slot.items.length) {
        return false
    }

    slot.add(await create());
    return true
}

/**
 * The accounts whose out of office card shows (per dialog), for beforeSave
 * @type {WeakMap<Object, Boolean>}
 */
const oooShown = new WeakMap();

/**
 * The rules panels whose activeScriptChange is handled
 * @type {WeakSet<Object>}
 */
const watched = new WeakSet();

/**
 * Another script became active: the out of office card loads the "Out of office" rule of that
 * script (saving it writes into the active script). Unsaved out of office changes are dropped.
 * @param {Object} dialog the account dialog
 */
async function reloadOutOfOffice(dialog) {
    if (!oooShown.get(dialog) || dialog.isDestroyed || !dialog.accountId) {
        return
    }

    try {
        const [{default: client}, ooo] = await Promise.all([
            import('../../../../views/neo/src/jmap/Client.mjs'),
            import('./view/outOfOffice.mjs')
        ]);
        const response = await client.legacy('email/account/load', {id: dialog.accountId});

        dialog.isDestroyed || await ooo.load(dialog, response.data || {})
    } catch (e) {
        console.error('sieve: out of office reload', e)
    }
}

ModuleRegistry.register({
    package   : 'legacy',
    name      : 'sieve',
    capability: 'go:legacy:sieve',
    emailAccountDialogCards: [{
        id      : 'sieveFilters',
        header  : {text: emailT('Filters')},
        order   : 40,
        replaces: 'filters',
        items   : () => [{ntype: 'container', reference: 'sieveFiltersSlot', cls: ['go-sieve-slot'], layout: {ntype: 'vbox', align: 'stretch'}, flex: 1}],
        isAvailable: async (account, dialog) => (await supportOf(account, dialog)).supported,
        load: async ({account, dialog}) => {
            await fillSlot(dialog, 'sieveFiltersSlot', async () => {
                const {default: SieveRulesPanel} = await import('./view/SieveRulesPanel.mjs');
                return [{module: SieveRulesPanel, reference: 'sieveRulesPanel', flex: 1}]
            });

            const panel = dialog.getReference('sieveRulesPanel');

            if (panel && !watched.has(panel)) {
                watched.add(panel);
                panel.on('activeScriptChange', () => reloadOutOfOffice(dialog))
            }

            await panel?.setAccount(account.id)
        }
    }, {
        id    : 'sieveOutOfOffice',
        header: {text: t('Out of office')},
        order : 45,
        items : () => [{ntype: 'container', reference: 'sieveOutOfOfficeSlot', cls: ['go-sieve-slot', 'go-sieve-ooo'], layout: {ntype: 'vbox', align: 'stretch'}, flex: 1}],
        isAvailable: async (account, dialog) => {
            const {supported, server_extensions} = await supportOf(account, dialog),
                  // the ooo_* values: the load listener connected to the server
                  shown = supported && server_extensions.includes('vacation') && account.ooo_rule_name !== undefined;

            oooShown.set(dialog, shown);
            return shown
        },
        load: async ({account, dialog}) => {
            const [ooo, {default: OutOfOfficePanel}] = await Promise.all([
                import('./view/outOfOffice.mjs'),
                import('./view/OutOfOfficePanel.mjs')
            ]);

            await fillSlot(dialog, 'sieveOutOfOfficeSlot', () => [{module: OutOfOfficePanel, flex: 1}]);
            await ooo.load(dialog, account)
        },
        beforeSave: async ({params, dialog, isNew}) => {
            if (!isNew && oooShown.get(dialog)) {
                await (await import('./view/outOfOffice.mjs')).addParams(dialog, params)
            }
        }
    }]
});
