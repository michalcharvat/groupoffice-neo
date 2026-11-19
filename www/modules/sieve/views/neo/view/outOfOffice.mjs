import NumberField  from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Number.mjs';
import TextArea     from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField    from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {userDateToYmd} from '../../../../../views/neo/src/DateUtil.mjs';
import BoolCheckBox from '../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import DateField    from '../../../../../views/neo/src/form/field/DateField.mjs';
import {fieldset}   from '../../../../../views/neo/src/form/fieldset.mjs';
import {decodeEntities, userFormat} from '../../../../../views/neo/src/Format.mjs';
import {field, OUT_OF_OFFICE, t} from '../util.mjs';

/**
 * The "Out of office" card of the account dialog (ExtJS GO.sieve.OutOfOfficePanel). The
 * values come with email/account/load (ooo_* keys, added by SieveModule::loadOutOfOfficeMessage()
 * for account managers) and go back as ooo_* params of email/account/submit
 * (SieveModule::saveOutOfOfficeMessage()), which writes the "Out of office" rule of the
 * active script.
 *
 * The fields are named `sieveOutOfOffice.*`: the account dialog doesn't submit nested values
 * itself, so the params are only sent when this card shows and was changed.
 */

const PREFIX = 'sieveOutOfOffice.';

/**
 * field name → ooo_* param
 */
const PARAMS = {
    active    : 'ooo_script_active',
    activate  : 'ooo_activate',
    deactivate: 'ooo_deactivate',
    message   : 'ooo_message',
    subject   : 'ooo_subject',
    aliases   : 'ooo_aliasses',
    days      : 'ooo_days'
};

/**
 * @returns {Object[]} the card's items
 */
export function outOfOfficeItems() {
    const name = key => PREFIX + key;

    return [{
        ntype : 'container',
        cls   : ['go-sieve-ooo-columns'],
        layout: {ntype: 'hbox', align: 'start'},
        flex  : 'none',
        items : [
            fieldset(t('Schedule'), [
                field(DateField, name('activate'), t('Activate at'), {reference: 'sieveOooActivate'}),
                field(DateField, name('deactivate'), t('Deactivate after'), {reference: 'sieveOooDeactivate'})
            ], {flex: 1}),
            fieldset(t('Activate filterset'), [
                {ntype: 'component', cls: ['go-sieve-hint'], text: t('Activate this filter by checking the checkbox below.')},
                {module: BoolCheckBox, name: name('active'), valueLabel: t('Activate') + ' ' + t('Out of office'), flex: 'none'}
            ], {flex: 1})
        ]
    }, fieldset(t('Message'), [
        {ntype: 'component', cls: ['go-sieve-hint'], text: t('Fill in your message in the field below.')},
        field(TextArea, name('message'), '', {reference: 'sieveOooMessage', cls: ['go-sieve-message']})
    ]), fieldset(t('Advanced options'), [
        field(TextField, name('subject'), t('Set a custom subject')),
        {ntype: 'component', cls: ['go-sieve-hint'], text: t('Fill in the aliasses on which this message also needs to apply to. If you have multiple aliasses, then separate each alias with a comma (,).')},
        field(TextArea, name('aliases'), '', {cls: ['go-sieve-aliases']}),
        {ntype: 'component', cls: ['go-sieve-hint'], text: t('Senders will only be notified periodically. You can set the number of days below.')},
        field(NumberField, name('days'), t('Reply every x days'), {reference: 'sieveOooDays', minValue: 1, stepSize: 1})
    ])]
}

/**
 * email/account/load data → field values
 * @param {Object} account
 * @returns {Object} field key → value
 */
export function toValues(account) {
    const date      = value => userDateToYmd(value, userFormat.dateFormat),
          aliases   = account.ooo_aliasses,
          activate  = date(account.ooo_activate);

    return {
        active    : !!account.ooo_script_active && account.ooo_script_active !== '0',
        activate,
        // ExtJS: deactivation defaults to the activation date
        deactivate: date(account.ooo_deactivate) || activate,
        message   : decodeEntities(account.ooo_message || ''),
        subject   : account.ooo_subject || '',
        aliases   : Array.isArray(aliases) ? aliases.join(', ') : (aliases || ''),
        days      : +account.ooo_days || 3
    }
}

/**
 * Dialogs whose activation date field is watched
 * @type {WeakSet<Object>}
 */
const watched = new WeakSet();

/**
 * ExtJS: the deactivation date can't be before the activation date, and follows it when it
 * would be
 * @param {Object} dialog
 */
async function syncDeactivate(dialog) {
    const form       = dialog.form,
          activate   = (await form.getField(PREFIX + 'activate'))?.getSubmitValue() || null,
          deactivate = await form.getField(PREFIX + 'deactivate');

    if (!deactivate) {
        return
    }

    deactivate.minValue = activate;

    if (activate && (!deactivate.getSubmitValue() || deactivate.getSubmitValue() < activate)) {
        deactivate.value = activate
    }
}

/**
 * Puts the values into the fields and takes them as unmodified; only shown fields are required
 * @param {Object} dialog the account dialog
 * @param {Object|null} account null: the card is hidden
 */
export async function load(dialog, account) {
    const form   = dialog.form,
          values = account ? toValues(account) : {};

    for (const key of Object.keys(PARAMS)) {
        const f = await form.getField(PREFIX + key);

        if (!f) {
            continue
        }

        // reset(): a loaded value (BoolCheckBox only takes one this way)
        f.reset(values[key] ?? null);
        'required' in f && (f.required = !!account && ['activate', 'deactivate', 'message', 'days'].includes(key));
        form.setOriginalValue(PREFIX + key, (await form.collectValues())[PREFIX + key])
    }

    const deactivate = await form.getField(PREFIX + 'deactivate');
    deactivate && (deactivate.minValue = values.activate || null);

    if (!watched.has(dialog)) {
        watched.add(dialog);
        form.on('fieldChange', ({component}) => component?.name === PREFIX + 'activate' && syncDeactivate(dialog))
    }
}

/**
 * Adds the ooo_* params when the card's fields were changed
 * @param {Object} dialog the account dialog
 * @param {Object} params email/account/submit params
 */
export async function addParams(dialog, params) {
    const modified = (await dialog.form.getModified()).sieveOutOfOffice;

    if (!modified || !Object.keys(modified).length) {
        return
    }

    const values = (await dialog.form.getEntityValues()).sieveOutOfOffice || {};

    Object.entries(PARAMS).forEach(([key, param]) => {
        let value = values[key];

        if (key === 'activate' || key === 'deactivate') {
            // a "T" makes GO\Base\Util\Date::to_unixtime() take the date as it is, not in the user's format
            value = value ? value + 'T00:00:00' : ''
        } else if (typeof value === 'boolean') {
            value = value ? 1 : 0
        }

        params[param] = value ?? ''
    });

    params.ooo_rule_name = OUT_OF_OFFICE
}
