import {translator} from '../../../../views/neo/src/Translate.mjs';

/**
 * Translations of the legacy sieve module (www/modules/sieve/language)
 */
export const t = translator('legacy', 'sieve');

/**
 * Translations of the legacy e-mail module ("Filters" is the e-mail module's tab title)
 */
export const emailT = translator('legacy', 'email');

/**
 * The name of the rule that the "Out of office" card edits. sieve/sieve/rules leaves it out
 * and the server keeps it at the end of the script (Sieve::save()).
 */
export const OUT_OF_OFFICE = 'Out of office';

/**
 * The fields a condition tests (ExtJS GO.sieve.cmbFieldStore)
 * @returns {Object[]} [{id, name}]
 */
export function criteriumFields() {
    return [
        {id: 'Subject',          name: t('subject')},
        {id: 'From',             name: t('sender')},
        {id: 'To',               name: t('recipient')},
        {id: 'size',             name: t('size')},
        {id: 'body',             name: t('Body')},
        {id: 'X-Spam-Flag',      name: t('Spam flag')},
        {id: 'List-Unsubscribe', name: t('Mailing list')},
        {id: 'currentdate',      name: t('Current Date')},
        {id: 'custom',           name: t('Custom')}
    ]
}

/**
 * Header operators (GO.sieve.cmbOperatorStore)
 * @returns {Object[]}
 */
export function headerOperators() {
    return [
        {id: 'contains',    name: t('contains')},
        {id: 'notcontains', name: t("doesn't contain")},
        {id: 'is',          name: t('is')},
        {id: 'notis',       name: t("doesn't equal")},
        {id: 'matches',     name: t('matches')},
        {id: 'notmatches',  name: t("doesn't match")},
        {id: 'exists',      name: t('exists')},
        {id: 'notexists',   name: t("doesn't exist")}
    ]
}

/**
 * Body operators (GO.sieve.cmbBodyOperatorStore)
 * @returns {Object[]}
 */
export function bodyOperators() {
    return [
        {id: 'contains',    name: t('contains')},
        {id: 'notcontains', name: t("doesn't contain")},
        {id: 'matches',     name: t('matches')},
        {id: 'notmatches',  name: t("doesn't match")}
    ]
}

/**
 * Current date operators (GO.sieve.cmbDateOperatorStore)
 * @returns {Object[]}
 */
export function dateOperators() {
    return [
        {id: 'value-le', name: t('before')},
        {id: 'is',       name: t('is')},
        {id: 'value-ge', name: t('after')}
    ]
}

/**
 * Size operators (GO.sieve.cmbUnderOverStore)
 * @returns {Object[]}
 */
export function sizeOperators() {
    return [
        {id: 'under', name: t('Under')},
        {id: 'over',  name: t('Over')}
    ]
}

/**
 * Size units: B is no suffix in the script
 * @returns {Object[]}
 */
export function sizeUnits() {
    return [
        {id: 'B', name: 'B'},
        {id: 'K', name: 'KB'},
        {id: 'M', name: 'MB'},
        {id: 'G', name: 'GB'}
    ]
}

/**
 * The actions (GO.sieve.cmbActionStore). The ids are the dialog's choices: the stored
 * action of "Mark message as read" is {type: 'addflag', target: '\\Seen'}.
 * @returns {Object[]}
 */
export function actionTypes() {
    return [
        {id: 'set_read',      name: t('Mark message as read')},
        {id: 'fileinto',      name: t('Move email to selected folder')},
        {id: 'fileinto_copy', name: t('Copy email to selected folder')},
        {id: 'redirect_copy', name: t('Copy to e-mail')},
        {id: 'redirect',      name: t('Redirect to')},
        {id: 'vacation',      name: t('Reply to message')},
        {id: 'reject',        name: t('Reject with message')},
        {id: 'discard',       name: t('Discard')},
        {id: 'stop',          name: t('Stop')}
    ]
}


/**
 * The text of a condition in the rule dialog (ExtJS CriteriumGrid renderer)
 * @param {Object} c {test, not, type, arg, arg1, arg2}
 * @returns {String}
 */
export function criteriumText(c) {
    const not = !!c.not && c.not !== '0' && c.not !== 'false';

    switch (c.test) {
        case 'currentdate': {
            const op = dateOperators().find(o => o.id === c.type);
            return t('Current Date') + ' ' + (op ? op.name : c.type) + ' ' + (c.arg || '')
        }

        case 'body':
            if (c.type === 'contains') {
                return (not ? t("Body doesn't contain") : t('Body contains')) + ' ' + (c.arg || '')
            }
            return (not ? t("Body doesn't match") : t('Body matches')) + ' ' + (c.arg || '')

        case 'header':
            return headerText(c, not);

        case 'exists': {
            const texts = {
                Subject: [t('Subject exists'), t("Subject doesn't exist")],
                From   : [t('Sender exists'), t("Sender doesn't exist")],
                To     : [t('Recipient exists'), t("Recipient doesn't exist")]
            }[c.arg];

            if (c.arg === 'List-Unsubscribe' && !not) {
                return t('Is from mailing list')
            }

            if (texts) {
                return texts[not ? 1 : 0]
            }

            return t('Mailheader:') + ' ' + c.arg + ' ' + (not ? t("doesn't exist") : t('exist'))
        }

        case 'true':
            return t('all incoming emails');

        case 'size':
            return (c.type === 'under' ? t('Size is smaller than') : t('Size is bigger than')) + ' ' + (c.arg || '');

        default:
            return t('Error while displaying test line')
    }
}

/**
 * @param {Object} c header test
 * @param {Boolean} not
 * @returns {String}
 */
function headerText(c, not) {
    const value = c.arg2 || '';

    if (c.arg1 === 'X-Spam-Flag' && !not) {
        return t('Marked as spam')
    }

    // the ExtJS texts per header and operator
    const texts = {
        contains: {
            Subject: [t('Subject contains'), t("Subject doesn't contain")],
            From   : [t('Sender contains'), t("Sender doesn't contain")],
            To     : [t('Recipient contains'), t("Recipient doesn't contain")],
            other  : [t('contains'), t("doesn't contain")]
        },
        is: {
            Subject: [t('Subject equals'), t('Subject is not equal to')],
            From   : [t('From equals'), t('From is not equal to')],
            To     : [t('To equals'), t('To is not equal to')],
            other  : [t('is'), t("doesn't equal")]
        },
        matches: {
            Subject: [t('Subject matches'), t("Subject doesn't match")],
            From   : [t('From matches'), t("From doesn't match")],
            To     : [t('To matches'), t("To doesn't match")],
            other  : [t('matches'), t("doesn't match")]
        }
    }[c.type];

    if (!texts) {
        return t('Error while displaying test line')
    }

    if (texts[c.arg1]) {
        return texts[c.arg1][not ? 1 : 0] + ' ' + value
    }

    return t('Mailheader:') + ' ' + c.arg1 + ' ' + texts.other[not ? 1 : 0] + ' ' + value
}

/**
 * The text of an action in the rule dialog (ExtJS ActionCreatorDialog / SieveController::actionRule)
 * @param {Object} a {type, target, days, addresses, reason}
 * @returns {String}
 */
export function actionText(a) {
    switch (a.type) {
        case 'addflag':
        case 'set_read':
            return t('Mark message as read');
        case 'fileinto':
            return t('Move email to the folder') + ': ' + a.target;
        case 'fileinto_copy':
            return t('Copy email to the folder') + ': ' + a.target;
        case 'redirect':
            return t('Redirect to') + ': ' + a.target;
        case 'redirect_copy':
            return t('Send a copy to') + ': ' + a.target;
        case 'reject':
            return t('Reject with message') + ': "' + a.target + '"';
        case 'vacation': {
            const addresses = Array.isArray(a.addresses) ? a.addresses.join(', ') : (a.addresses || ''),
                  forText   = addresses ? t('Autoreply is active for') + ': ' + addresses + '. ' : '';

            return t('Reply every') + ' ' + (a.days || 7) + ' ' + t('day(s)') + '. ' + forText + t('Message:') + ' "' + (a.reason || '') + '"'
        }
        case 'discard':
            return t('Discard');
        case 'stop':
            return t('Stop');
        default:
            return t('Error while displaying test line')
    }
}

/**
 * A spam rule (header X-Spam-Flag, or Subject contains "spam") gets a "stop" at the end
 * (ExtJS SieveDialog.checkIsSpamRule)
 * @param {Object[]} criteria
 * @returns {Boolean}
 */
export function isSpamRule(criteria) {
    return criteria.some(c => c.test === 'header' && c.type === 'contains' &&
        (c.arg1 === 'X-Spam-Flag' || (c.arg1 === 'Subject' && c.arg2 === 'spam')))
}

/**
 * wrapperStyle of a dialog in the middle of the window (as the e-mail module's dialogs)
 * @param {Number} width px
 * @param {Number} height px
 * @returns {Object}
 */
export function centered(width, height) {
    return {
        height   : `min(${height}px, 90vh)`,
        left     : `max(0px, calc(50vw - ${width / 2}px))`,
        maxHeight: '90vh',
        top      : `max(5vh, calc(50vh - ${height / 2}px))`,
        width    : `min(${width}px, 100vw)`
    }
}

/**
 * Field config with the label above the input
 * @param {Object} module
 * @param {String} name
 * @param {String} labelText
 * @param {Object} [config]
 * @returns {Object}
 */
export function field(module, name, labelText, config={}) {
    return {module, name, labelText, labelPosition: 'inline', flex: 'none', ...config}
}

/**
 * A condition from sieve/sieve/rule with every key: submitRules reads arg1 of every test
 * @param {Object} c
 * @returns {Object}
 */
export function fullCriterium(c) {
    return {test: '', not: false, type: '', arg: '', arg1: '', arg2: '', part: '', ...c}
}

/**
 * An action from sieve/sieve/rule with every key: submitRules reads `subject` of a vacation
 * action with addresses, and the parser leaves out what the script doesn't have
 * @param {Object} a
 * @returns {Object}
 */
export function fullAction(a) {
    return {target: '', days: '', reason: '', addresses: '', subject: null, ...a}
}
