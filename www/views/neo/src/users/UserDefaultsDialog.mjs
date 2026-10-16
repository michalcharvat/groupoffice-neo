import Toolbar           from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button            from '../button/Button.mjs';
import AutocompleteChips from '../form/field/AutocompleteChips.mjs';
import JmapComboBox      from '../form/field/JmapComboBox.mjs';
import {fieldset}        from '../form/fieldset.mjs';
import client            from '../jmap/Client.mjs';
import {notifyError}     from '../Notify.mjs';
import SettingsPanel     from '../systemsettings/SettingsPanel.mjs';
import {checkField, hint, selectField, textField} from '../systemsettings/fields.mjs';
import {t}               from '../Translate.mjs';
import {DATE_FORMATS, timeZones} from '../usersettings/LookAndFeelPanel.mjs';
import ConfirmDialog     from '../view/ConfirmDialog.mjs';
import Dialog            from '../view/Dialog.mjs';

/**
 * The core settings new users start with (go.users.UserDefaultsWindow): regional
 * settings, formatting, confirm on move, default groups and the address book of
 * users' contacts.
 */
class UserDefaultsPanel extends SettingsPanel {
    static config = {
        className: 'GO.users.UserDefaultsPanel',
        baseCls  : ['go-systemsettings-panel', 'go-userdefaults-panel', 'neo-container']
    }

    createFields() {
        return [{
            ntype : 'container',
            cls   : ['go-userdefaults-columns'],
            flex  : 'none',
            layout: 'base',
            items : [
                fieldset(t('Regional'), [
                    selectField('defaultTimezone', t('Timezone'), timeZones().map(zone => [zone, zone]), {editable: true}),
                    selectField('defaultDateFormat', t('Date format'), DATE_FORMATS()),
                    selectField('defaultTimeFormat', t('Time format'), [['G:i', t('24 hour format')], ['g:i a', t('12 hour format')]]),
                    checkField('defaultShortDateInList', t('Use short format for date and time in lists')),
                    selectField('defaultFirstWeekday', t('First day of week'), [[0, t('Sunday')], [1, t('Monday')]])
                ]),
                fieldset(t('Formatting'), [
                    textField('defaultListSeparator',     t('List separator')),
                    textField('defaultTextSeparator',     t('Text separator')),
                    textField('defaultThousandSeparator', t('Thousand Separator')),
                    textField('defaultDecimalSeparator',  t('Decimal Separator')),
                    textField('defaultCurrency',          t('Currency'))
                ])
            ]
        }, fieldset(t('Other'), [
            checkField('defaultConfirmOnMove', t('Show confirmation dialog on move')),
            hint(t('When this is on and items are moved by dragging, confirmation is requested')),
            {
                module       : AutocompleteChips,
                name         : 'settings.defaultGroups',
                entity       : 'Group',
                jmapFilter   : {hideUsers: true, excludeEveryone: true},
                jmapSort     : [{property: 'name', isAscending: true}],
                labelText    : t('Groups'),
                labelPosition: 'inline'
            },
            hint(t('Users will automatically be added to these groups')),
            ...client.hasCapability('go:community:addressbook') ? [{
                module       : JmapComboBox,
                name         : 'settings.userAddressBookId',
                entity       : 'AddressBook',
                displayField : 'name',
                properties   : ['id', 'name'],
                jmapSort     : [{property: 'name', isAscending: true}],
                labelText    : t('Address book'),
                labelPosition: 'inline'
            }] : []
        ])]
    }
}

Neo.setupClass(UserDefaultsPanel);

/**
 * Window around UserDefaultsPanel with Cancel / Save (admins, from the users card)
 */
class UserDefaultsDialog extends Dialog {
    static config = {
        className   : 'GO.users.UserDefaultsDialog',
        cls         : ['go-userdefaults-dialog'],
        title       : t('User defaults'),
        modal       : true,
        resizable   : true,
        wrapperStyle: {
            height: 'min(700px, 90vh)',
            left  : 'max(0px, calc(50vw - 400px))',
            top   : 'max(5vh, calc(50vh - 350px))',
            width : 'min(800px, 100vw)'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : UserDefaultsPanel,
            reference: 'panel',
            flex     : 1,
            listeners: {
                loaderror: ({error}) => notifyError(me, error),
                saveerror: ({error}) => notifyError(me, error)
            }
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.requestClose()
            }, {
                module   : Button,
                ui       : 'primary',
                reference: 'saveButton',
                disabled : true,
                text     : t('Save'),
                handler  : () => me.submit()
            }]
        }]
    }

    async onConstructed() {
        super.onConstructed();

        const module = await this.getReference('panel').load();
        module && !this.isDestroyed && (this.getReference('saveButton').disabled = false)
    }

    /**
     * Close by the user (Cancel, X, Escape): asks before discarding changes
     */
    async requestClose() {
        let me = this;

        if (me.isClosing || me.isDestroyed) {
            return
        }

        if (await me.getReference('panel').isModified() && !await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : t('Are you sure you want to close this window and discard your changes?')
        })) {
            return
        }

        me.isDestroyed || me.close()
    }

    closeOrHideAction() {
        this.requestClose()
    }

    onKeyDownEscape() {
        this.requestClose()
    }

    async submit() {
        let me     = this,
            panel  = me.getReference('panel'),
            button = me.getReference('saveButton');

        if (button.disabled) {
            return
        }

        button.disabled = true;

        try {
            if (await panel.validate() && await panel.save()) {
                me.close()
            }
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }
}

export default Neo.setupClass(UserDefaultsDialog);
