import TextField        from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import AttachmentsField from '../form/field/AttachmentsField.mjs';
import HtmlField        from '../form/field/HtmlField.mjs';
import LocalCombo       from '../form/field/LocalCombo.mjs';
import TextList         from '../list/TextList.mjs';
import client           from '../jmap/Client.mjs';
import {t}              from '../Translate.mjs';

/**
 * Language of a new template (the server requires one): the user's
 * @returns {String}
 */
export function defaultTemplateLanguage() {
    return client.user?.language || Neo.config.goLanguage || 'en'
}

/**
 * Fields of an e-mail template (go.emailtemplate.TemplateFieldset): name, language,
 * subject, body and attachments. Modules that keep a template inside their own form
 * use these items with a name prefix (e.g. 'emailTemplate.').
 *
 *     createFormItems() { return emailTemplateItems({noName: true, prefix: 'template.'}) }
 *
 * @param {Object} [options]
 * @param {Boolean} [options.noName=false] no name field
 * @param {Boolean} [options.hideLanguage=false] no language field
 * @param {String} [options.prefix=''] prefix of the field names
 * @returns {Object[]}
 */
export function emailTemplateItems({noName = false, hideLanguage = false, prefix = ''} = {}) {
    return [
        ...noName ? [] : [{
            module       : TextField,
            name         : prefix + 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true,
            flex         : 'none'
        }],
        ...hideLanguage ? [] : [{
            module       : LocalCombo,
            name         : prefix + 'language',
            labelText    : t('Language'),
            labelPosition: 'inline',
            flex         : 'none',
            width        : null,
            displayField : 'name',
            valueField   : 'id',
            editable     : true,
            listConfig   : {module: TextList},
            store        : {keyProperty: 'id', data: (Neo.config.goLanguages || []).map(([id, name]) => ({id, name}))}
        }],
        {
            module       : TextField,
            name         : prefix + 'subject',
            labelText    : t('Subject'),
            labelPosition: 'inline',
            flex         : 'none'
        }, {
            module   : HtmlField,
            name     : prefix + 'body',
            cls      : ['go-emailtemplate-body'],
            flex     : 1
        }, {
            module: AttachmentsField,
            name  : prefix + 'attachments',
            flex  : 'none'
        }
    ]
}
