import Button         from '../../button/Button.mjs';
import DataSourceForm from '../../form/DataSourceForm.mjs';
import DateField      from '../../form/field/DateField.mjs';
import FormContainer  from '../../../node_modules/neo.mjs/src/form/Container.mjs';
import HtmlField      from '../../form/field/HtmlField.mjs';
import JmapComboBox   from '../../form/field/JmapComboBox.mjs';
import TextField      from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar        from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import client         from '../../jmap/Client.mjs';
import Page, {h3, output, p} from './Page.mjs';
import {notifyError}  from '../../Notify.mjs';
import {t}            from '../../Translate.mjs';

const inline = {labelPosition: 'inline'};

/**
 * Row of fields of equal width
 * @param {Object[]} items
 * @returns {Object}
 */
function row(items) {
    return {ntype: 'container', layout: {ntype: 'hbox', align: 'start'}, style: {gap: '16px'}, itemDefaults: {flex: 1}, items}
}

/**
 * Dev demo: GOUI Form (goui-docs Form.ts). A neo form container with validation
 * (required, e-mail, a field validator, passwords that must match, an error set after
 * submit), entity combos and dates; then GO.form.DataSourceForm, which loads and saves
 * one JMAP entity and sends only the modified properties.
 */
class Form extends Page {
    static config = {
        className: 'GO.dev.demo.Form',
        heading  : t('Form')
    }

    pageItems() {
        const me = this;

        return [
            p(t('This form demonstrates some validation principles: the passwords must match, the e-mail must be valid and the middle name is only valid after submit when it is "van".')),
            {
                module   : FormContainer,
                reference: 'form',
                layout   : {ntype: 'vbox', align: 'stretch'},
                style    : {gap: '16px', maxWidth: '720px'},
                items    : [
                    row([
                        {module: TextField, name: 'firstName', labelText: t('First name'), ...inline, required: true},
                        {module: TextField, name: 'middleName', labelText: t('Middle name'), ...inline},
                        {module: TextField, name: 'lastName', labelText: t('Last name'), ...inline, required: true}
                    ]),
                    {module: TextField, name: 'email', labelText: t('E-mail'), ...inline, inputType: 'email',
                        validator: field => !field.value || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(field.value) ? true : t('Please enter a valid e-mail address')},
                    client.hasCapability('go:community:addressbook') && {
                        module    : JmapComboBox,
                        entity    : 'Contact',
                        name      : 'contactId',
                        labelText : t('Contact'),
                        ...inline,
                        width     : null,
                        properties: ['id', 'name']
                    },
                    row([
                        {module: TextField, inputType: 'password', name: 'password', labelText: t('Password'), ...inline, required: true, autoComplete: 'new-password'},
                        {module: TextField, inputType: 'password', name: 'confirmPassword', labelText: t('Confirm password'), ...inline, required: true, autoComplete: 'new-password',
                            validator: field => field.value === me.passwordValue() ? true : t("Passwords don't match")}
                    ]),
                    row([
                        {module: DateField, name: 'startsAt', labelText: t('Starts at'), ...inline},
                        {module: DateField, name: 'dueAt', labelText: t('Due at'), ...inline}
                    ]),
                    {module: HtmlField, name: 'remark', labelText: t('Remark'), height: 160}
                ].filter(Boolean)
            },
            {
                module: Toolbar,
                style : {padding: 0, maxWidth: '720px'},
                items : ['->', {
                    module : Button,
                    ui     : 'primary',
                    text   : t('Submit'),
                    handler: () => me.onSubmit().catch(e => notifyError(me, e))
                }]
            },
            p(t('Forms handle object structures with container and array fields (see ContainerField and ArrayField): getValues() returns a JavaScript object, sent with JMAP, not a classic form post.')),
            h3('DataSourceForm'),
            p(t('GO.form.DataSourceForm loads one JMAP entity (load(id)), creates one (create(values)) and saves with Entity/set (submit()): an update sends only the modified properties, server validation errors show on the fields. Here: the newest note; nothing is saved until you press Save.')),
            client.hasCapability('go:community:notes') ? {
                module    : DataSourceForm,
                reference : 'dsForm',
                entity    : 'Note',
                // the name only: content may be encrypted (the notes dialog decrypts it)
                properties: ['id', 'name'],
                layout    : {ntype: 'vbox', align: 'stretch'},
                style     : {gap: '16px', maxWidth: '720px'},
                items     : [
                    {module: TextField, name: 'name', labelText: t('Name'), ...inline, required: true}
                ]
            } : p(t('The notes module is not available.')),
            client.hasCapability('go:community:notes') && {
                module: Toolbar,
                style : {padding: 0, gap: '8px', maxWidth: '720px'},
                items : [
                    {module: Button, ui: 'secondary', text: t('Load newest note'), handler: () => me.loadNote().catch(e => notifyError(me, e))},
                    {module: Button, ui: 'secondary', text: 'isModified()', handler: () => me.logModified().catch(e => notifyError(me, e))},
                    '->',
                    {module: Button, ui: 'primary', text: t('Save'), handler: () => me.saveNote().catch(e => notifyError(me, e))}
                ]
            },
            output()
        ].filter(Boolean)
    }

    /**
     * @returns {String|null} value of the password field
     */
    passwordValue() {
        const form = this.getReference('form');
        return form?.items.flatMap(item => item.items || [item]).find(field => field.name === 'password')?.value ?? null
    }

    async onSubmit() {
        let me   = this,
            form = me.getReference('form');

        if (!await form.validate()) {
            me.log('validate(): false');
            return
        }

        const values = await form.getValues();

        if (values.middleName !== 'van') {
            // an error set after submit, like a server validation error
            await form.setErrors({middleName: t("Middle name must be 'van'")});
            me.log('setErrors(): middleName');
            return
        }

        delete values.password;
        delete values.confirmPassword;
        me.log('submit: ' + JSON.stringify(values))
    }

    async loadNote() {
        const {list} = await client.queryGet('Note', {sort: [{property: 'modifiedAt', isAscending: false}], limit: 1, properties: ['id']});

        if (!list[0]) {
            this.log(t('You have no notes'));
            return
        }

        const data = await this.getReference('dsForm').load(list[0].id);
        this.log(data ? `load(${list[0].id}) done` : `load(${list[0].id}) failed`)
    }

    async logModified() {
        const form = this.getReference('dsForm');
        this.log(`isModified(): ${await form.isModified()} ${JSON.stringify(await form.getModified())}`)
    }

    async saveNote() {
        await this.getReference('dsForm').submit()
    }

    onConstructed() {
        super.onConstructed();

        this.getReference('dsForm')?.on({
            save     : ({data, isNew}) => this.log(`save: ${isNew ? 'created' : 'updated'} ${data.name}`),
            saveerror: ({error}) => this.log(`saveerror: ${error?.message || error}`),
            invalid  : () => this.log('invalid')
        })
    }
}

export default Neo.setupClass(Form);
