import Button        from '../../../../../views/neo/src/button/Button.mjs';
import Dialog, {headerTools} from '../../../../../views/neo/src/view/Dialog.mjs';
import DateField     from '../../../../../views/neo/src/form/field/DateField.mjs';
import SelectField   from '../../../../../views/neo/src/form/field/SelectField.mjs';
import FormContainer from '../../../../../views/neo/node_modules/neo.mjs/src/form/Container.mjs';
import TextField     from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {submitOnEnter} from '../../../../../views/neo/src/form/submitOnEnter.mjs';
import {t as coreT}  from '../../../../../views/neo/src/Translate.mjs';
import {imapDate, imapText, t} from '../util.mjs';

/**
 * Advanced search (ExtJS GO.email.SearchDialog): builds the IMAP SEARCH string that
 * email/message/store takes as `query`.
 *
 *     const search = await SearchDialog.ask({appName, windowId, labels, values})
 *     // {query, searchIn, values} or null; values fill the dialog again next time
 */
class SearchDialog extends Dialog {
    static config = {
        className: 'GO.email.SearchDialog',
        cls      : ['go-email-search-dialog'],
        modal    : true,
        headerConfig: headerTools('close'),
        resizable: true,
        title    : t('Advanced search'),
        wrapperStyle: {left: 'max(0px, calc(50vw - 230px))', maxHeight: '90vh', top: '5vh', width: 'min(460px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * Labels of the account: {name, flag}
         * @member {Object[]} labels=[]
         */
        labels: [],
        /**
         * Field values of the previous search
         * @member {Object} values={}
         */
        values: {}
    }

    /**
     * {query, searchIn, values} or null
     * @member {Object|null} answer=null
     */
    answer = null

    construct(config) {
        super.construct(config);

        let me     = this,
            v      = me.values || {},
            text   = (name, label) => ({module: TextField, name, labelText: label, labelPosition: 'inline', value: v[name] || ''}),
            date   = (name, label) => ({module: DateField, name, labelText: label, labelPosition: 'inline', value: v[name] || null}),
            yesNo  = (name, label, yes, no) => ({
                module: SelectField, name, labelText: label, labelPosition: 'inline', value: v[name] || '',
                options: [{value: '', text: t('N/A')}, {value: yes, text: coreT('Yes')}, {value: no, text: coreT('No')}]
            });

        me.items = [{
            module   : FormContainer,
            reference: 'form',
            cls      : ['go-email-search-form', 'go-scroll'],
            flex     : 1,
            keys     : {Enter: submitOnEnter('up.onSearch')},
            items    : [
                text('subject', t('Subject')),
                text('from', t('Sender')),
                text('to', t('Recipient')),
                text('cc', t('Recipient (CC)')),
                text('body', t('Body')),
                date('before', t('Received before')),
                date('since', t('Received since')),
                yesNo('flagged', t('Flagged'), 'FLAGGED', 'UNFLAGGED'),
                {
                    module: SelectField, name: 'label', labelText: t('Labels'), labelPosition: 'inline', value: v.label || '',
                    options: [{value: '', text: t('N/A')}, ...me.labels.map(label => ({value: label.flag, text: label.name}))]
                },
                yesNo('answered', t('Answered'), 'ANSWERED', 'UNANSWERED'),
                yesNo('seen', t('Read'), 'SEEN', 'UNSEEN'),
                {
                    module: SelectField, name: 'searchIn', labelText: t('Search in'), labelPosition: 'inline', value: v.searchIn || 'current',
                    options: [
                        {value: 'current',   text: t('Current folder')},
                        {value: 'recursive', text: t('Include subfolders')},
                        {value: 'all',       text: t('All folders')}
                    ]
                }
            ]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : ['->', {
                module : Button,
                text   : coreT('Cancel'),
                handler: () => me.close()
            }, {
                module : Button,
                ui     : 'primary',
                text   : coreT('Search'),
                handler: () => me.onSearch()
            }]
        }]
    }

    async onSearch() {
        let me     = this,
            values = await me.getReference('form').getSubmitValues();

        me.answer = {query: SearchDialog.buildQuery(values), searchIn: values.searchIn || 'current', values};
        me.close()
    }

    /**
     * ExtJS SearchDialog.buildQuery()
     * @param {Object} values
     * @returns {String} IMAP SEARCH criteria
     */
    static buildQuery(values) {
        const parts = [];

        [['subject', 'SUBJECT'], ['from', 'FROM'], ['to', 'TO'], ['cc', 'CC'], ['body', 'BODY']].forEach(([name, key]) => {
            const value = imapText(values[name]);
            value && parts.push(`${key} "${value}"`)
        });

        /^\d{4}-\d{2}-\d{2}$/.test(values.before || '') && parts.push('BEFORE ' + imapDate(values.before));
        /^\d{4}-\d{2}-\d{2}$/.test(values.since || '') && parts.push('SINCE ' + imapDate(values.since));

        ['flagged', 'seen', 'answered'].forEach(name => {
            /^(UN)?(FLAGGED|SEEN|ANSWERED)$/.test(values[name] || '') && parts.push(values[name])
        });

        // label keywords like $label1
        /^[\w$]+$/.test(values.label || '') && parts.push('KEYWORD ' + values.label);

        return parts.join(' ')
    }

    /**
     * @param {Object} config appName, windowId, labels, values
     * @returns {Promise<Object|null>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(SearchDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(SearchDialog);
