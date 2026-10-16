import FormWindow from '../view/FormWindow.mjs';
import {t}        from '../Translate.mjs';
import {defaultTemplateLanguage, emailTemplateItems} from './templateItems.mjs';

/**
 * Creates or edits an e-mail template of a module (go.emailtemplate.TemplateDialog).
 * A new template needs the module ({package, name}) and its key in `values`.
 *
 *     Neo.create(EmailTemplateDialog, {appName, windowId, values: {module: {package: 'business', name: 'support'}, key: null}})
 *     Neo.create(EmailTemplateDialog, {appName, windowId, entityId: 4})
 */
class EmailTemplateDialog extends FormWindow {
    static config = {
        className   : 'GO.emailtemplate.EmailTemplateDialog',
        cls         : ['go-form-window', 'go-emailtemplate-dialog'],
        entityName  : 'EmailTemplate',
        title       : t('E-mail template'),
        modal       : false,
        wrapperStyle: {height: '80vh', left: 'max(0px, calc(50vw - 450px))', top: '10vh', width: 'min(900px, 100vw)'}
    }

    construct(config) {
        config.values = {language: defaultTemplateLanguage(), ...config.values || {}};
        super.construct(config)
    }

    addCustomFields() {
        // templates have no custom fields
    }

    createFormItems() {
        return emailTemplateItems()
    }
}

export default Neo.setupClass(EmailTemplateDialog);
