import EmailField       from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Email.mjs';
import NumberField      from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Number.mjs';
import TextArea         from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField        from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import LocalCombo       from '../../../../../views/neo/src/form/field/LocalCombo.mjs';
import TextList         from '../../../../../views/neo/src/list/TextList.mjs';
import {t as coreT}     from '../../../../../views/neo/src/Translate.mjs';
import LegacyFormWindow from '../../../../../views/neo/src/view/LegacyFormWindow.mjs';
import {actionText, actionTypes, centered, field, t} from '../util.mjs';

/**
 * Which inputs an action shows (ExtJS ActionCreatorDialog._transForm)
 * @param {String|null} type actionTypes() id
 * @returns {Object} reference → visible
 */
function visibleInputs(type) {
    return {
        folderField   : type === 'fileinto' || type === 'fileinto_copy',
        emailField    : type === 'redirect' || type === 'redirect_copy',
        daysField     : type === 'vacation',
        subjectField  : type === 'vacation',
        messageField  : type === 'vacation' || type === 'reject',
        addressesField: type === 'vacation'
    }
}

/**
 * One action of a sieve rule (ExtJS GO.sieve.ActionCreatorDialog). Nothing is saved on the
 * server: `save` fires with the action as sieve/sieve/submitRules expects it
 * ({type, target, days, reason, subject, addresses, text}).
 *
 *     const dialog = Neo.create(ActionDialog, {appName, windowId, action: {...} | null, folders, aliases});
 *     dialog.on('save', ({data}) => …)
 */
class ActionDialog extends LegacyFormWindow {
    static config = {
        className   : 'GO.sieve.ActionDialog',
        cls         : ['go-form-window', 'go-sieve-action-dialog'],
        title       : t('Set action'),
        wrapperStyle: centered(560, 640),
        /**
         * The action to edit, null for a new one
         * @member {Object|null} action=null
         */
        action: null,
        /**
         * Folder names of the account ("Move email to selected folder")
         * @member {String[]} folders=[]
         */
        folders: [],
        /**
         * The account's alias addresses, comma separated: the default of a new vacation action
         * @member {String} aliases=''
         */
        aliases: ''
    }

    construct(config) {
        config.values = ActionDialog.toValues(config.action, config.aliases || '');
        super.construct(config)
    }

    /**
     * A stored action → field values (ExtJS show())
     * @param {Object|null} a
     * @param {String} aliases
     * @returns {Object}
     */
    static toValues(a, aliases) {
        const values = {type: null, folder: 'INBOX', email: '', days: 7, subject: '', message: '', addresses: aliases};

        if (!a) {
            return values
        }

        const addresses = Array.isArray(a.addresses) ? a.addresses.join(', ') : (a.addresses || '');

        switch (a.type) {
            case 'addflag':
            case 'set_read':
                return {...values, type: 'set_read'};
            case 'fileinto':
            case 'fileinto_copy':
                return {...values, type: a.type, folder: a.target || 'INBOX'};
            case 'redirect':
            case 'redirect_copy':
                return {...values, type: a.type, email: a.target || ''};
            case 'reject':
                return {...values, type: 'reject', message: a.target || ''};
            case 'vacation':
                return {...values, type: 'vacation', days: +a.days || 7, subject: a.subject || '', message: a.reason || '', addresses};
            default:
                return {...values, type: a.type}
        }
    }

    createFormItems() {
        let me      = this,
            combo   = (name, label, data, config={}) => field(LocalCombo, name, label, {
                width       : null,
                displayField: 'name',
                valueField  : 'id',
                editable    : false,
                clearable   : false,
                listConfig  : {module: TextList},
                store       : {keyProperty: 'id', data},
                ...config
            }),
            current = me.values?.folder,
            folders = [...me.folders];

        // a rule may point to a folder that is gone or not subscribed
        current && !folders.includes(current) && folders.push(current);
        folders.includes('INBOX') || folders.unshift('INBOX');

        return [
            combo('type', t('Action'), actionTypes(), {required: true}),
            combo('folder', t('To folder'), folders.map(name => ({id: name, name})), {reference: 'folderField', hidden: true}),
            field(EmailField, 'email', coreT('E-mail'), {reference: 'emailField', hidden: true}),
            field(NumberField, 'days', t('Reply every x days'), {reference: 'daysField', hidden: true, minValue: 1, stepSize: 1}),
            field(TextField, 'subject', coreT('Subject'), {reference: 'subjectField', hidden: true}),
            field(TextArea, 'message', t('Message'), {reference: 'messageField', hidden: true, cls: ['go-sieve-message']}),
            field(TextArea, 'addresses', t('Activate also for these aliases (separated by comma)'), {reference: 'addressesField', hidden: true})
        ]
    }

    async onConstructed() {
        await super.onConstructed();

        let me = this;

        me.form.on('fieldChange', ({component}) => {
            component?.name === 'type' && me.syncInputs()
        });

        await me.readyPromise;
        me.isDestroyed || me.syncInputs()
    }

    /**
     * Shows the inputs of the chosen action; visible ones are required (except the subject
     * and the aliases)
     * @protected
     */
    async syncInputs() {
        let me   = this,
            type = (await me.form.getField('type'))?.getSubmitValue();

        if (me.isDestroyed) {
            return
        }

        Object.entries(visibleInputs(type)).forEach(([ref, visible]) => {
            const cmp = me.getReference(ref);

            if (cmp) {
                cmp.hidden   = !visible;
                cmp.required = visible && ref !== 'subjectField' && ref !== 'addressesField'
            }
        })
    }

    /**
     * Field values → the action (ExtJS _prepareValuesForStorage)
     */
    async save(modified, values) {
        const base = {type: values.type, target: '', days: '', reason: '', subject: null, addresses: ''};

        let a;

        switch (values.type) {
            case 'set_read':
                a = {...base, type: 'addflag', target: '\\Seen'};
                break;
            case 'fileinto':
            case 'fileinto_copy':
                a = {...base, target: values.folder};
                break;
            case 'redirect':
            case 'redirect_copy':
                a = {...base, target: String(values.email || '').trim()};
                break;
            case 'reject':
                a = {...base, target: values.message};
                break;
            case 'vacation':
                a = {...base, days: String(values.days || 7), reason: values.message, subject: values.subject || null,
                    addresses: String(values.addresses || '').trim()};
                break;
            default:
                a = base
        }

        return {...a, text: actionText(a)}
    }
}

export default Neo.setupClass(ActionDialog);
