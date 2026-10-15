import FormWindow        from '../view/FormWindow.mjs';
import PasswordPrompt    from '../view/PasswordPrompt.mjs';
import client, {USER_PROPERTIES} from '../jmap/Client.mjs';
import ModuleRegistry    from '../ModuleRegistry.mjs';
import {applyTheme}      from '../Preferences.mjs';
import {notifyError}     from '../Notify.mjs';
import {t}               from '../Translate.mjs';
import AccountPanel      from './AccountPanel.mjs';
import LookAndFeelPanel  from './LookAndFeelPanel.mjs';
import NotificationPanel from './NotificationPanel.mjs';
import VisibleToPanel    from './VisibleToPanel.mjs';

/** changing these asks for the current password (needPasswordForChange) */
const PASSWORD_PROTECTED = ['username', 'email', 'recoveryEmail', 'password'];

/** changing these reloads the windows: views format with them when they render */
const RELOAD = ['timezone', 'dateFormat', 'timeFormat', 'shortDateInList', 'firstWeekday', 'thousandsSeparator',
    'decimalSeparator', 'currency', 'listSeparator', 'textSeparator', 'sort_name', 'max_rows_list'];

/**
 * My account (go.usersettings.UserSettingsDialog): the logged-in user's settings as
 * one User form with a card per section, the cards listed on the left.
 *
 * Cards: Account, Look & feel, Notifications, Visible to (user managers), custom
 * field sets shown as tabs, then the cards modules register:
 *
 *     ModuleRegistry.register({..., userSettings: {
 *         title  : t('Notes'),
 *         iconCls: 'fa fa-sticky-note',
 *         panel  : () => import('./view/SettingsPanel.mjs') // default export: a neo container
 *     }})
 *
 * A card's fields bind to User properties by name, a module's own settings with a
 * dotted name ("notesSettings.defaultNoteBookId"): everything is saved with one
 * User/set. A card may implement onLoad(user), called after every load.
 *
 * After saving: a new language reloads the windows in that language
 * (?SET_LANGUAGE=), formats (RELOAD) reload them, the theme applies to all windows.
 */
class UserSettingsDialog extends FormWindow {
    static config = {
        className    : 'GO.usersettings.UserSettingsDialog',
        cls          : ['go-form-window', 'go-usersettings-dialog'],
        entityName   : 'User',
        title        : t('My account'),
        closeOnSave  : false,
        generalHeader: {text: t('Account'), iconCls: 'fa fa-circle-user'},
        cardsConfig  : {tabBarPosition: 'left'},
        wrapperStyle : {
            height: '80vh',
            left  : 'max(0px, calc(50vw - 500px))',
            top   : '10vh',
            width : 'min(1000px, 100vw)'
        }
    }

    /**
     * Current password for this dialog's saves, asked once
     * @member {String|null} currentPassword=null
     */
    currentPassword = null

    /**
     * Modified values of the running save
     * @member {Object} saving={}
     */
    saving = {}

    /**
     * The user's theme is saved: closing keeps it
     * @member {Boolean} themeSaved=false
     */
    themeSaved = false

    construct(config) {
        config.entityId ??= client.user?.id;

        super.construct(config);

        let me = this;

        me.on('close', () => {
            // the previewed theme goes back to the saved one, in every window: the dialog may
            // have been popped out after previewing
            me.themeSaved || applyTheme({theme: client.user?.theme, colorScheme: client.user?.themeColorScheme})
        })
    }

    onConstructed() {
        let me      = this,
            promise = super.onConstructed();

        // before the form loads: FormWindow.onConstructed() loads after a timeout
        me.form.on({
            beforesave: event => {
                me.currentPassword && (event.data.currentPassword = me.currentPassword)
            },
            // the account panel sits inside the first card
            load: ({data}) => [me.getReference('accountPanel'), ...me.cards.getCardContainer().items].forEach(card => card?.onLoad?.(data))
        });

        return promise
    }

    createFormItems() {
        return [{module: AccountPanel, reference: 'accountPanel', flex: 'none'}]
    }

    /**
     * Fixed cards, custom field tabs and the modules' cards, all before the form loads
     * @returns {Promise<void>}
     */
    async addCustomFields() {
        let me = this;

        me.addCard({module: LookAndFeelPanel,  header: {text: t('Look & feel'),   iconCls: 'fa fa-palette'}});
        me.addCard({module: NotificationPanel, header: {text: t('Notifications'), iconCls: 'fa fa-bell'}});

        client.mayChangeUsers && me.addCard({module: VisibleToPanel, header: {text: t('Visible to'), iconCls: 'fa fa-eye'}});

        await super.addCustomFields();

        const modules = ModuleRegistry.getAvailable().filter(m => m.userSettings),
              classes = await Promise.all(modules.map(m => m.userSettings.panel().then(mod => mod.default).catch(e => {
                  console.error('User settings of', m.name, e);
                  return null
              })));

        if (me.isDestroyed) {
            return
        }

        modules.forEach((m, i) => {
            classes[i] && me.addCard({
                module: classes[i],
                header: {text: m.userSettings.title || m.title, iconCls: m.userSettings.iconCls || m.iconCls}
            })
        })
    }

    async submit() {
        let me = this;

        if (!me.formReady || me.getReference('saveButton').disabled) {
            return false
        }

        // never save a password that was not confirmed (the form validation alone let one through)
        if (!me.getReference('accountPanel').passwordsMatch()) {
            me.cards.activeIndex = 0;
            me.showError(t("The passwords didn't match"));
            await me.form.validate();
            return false
        }

        me.saving = await me.form.getModified();

        if (!me.currentPassword && !client.mayChangeUsers && PASSWORD_PROTECTED.some(name => name in me.saving)) {
            if (!await me.askCurrentPassword()) {
                return false
            }
        }

        return super.submit()
    }

    /**
     * @returns {Promise<Boolean>} false when cancelled
     * @protected
     */
    async askCurrentPassword() {
        let me = this;

        const password = await PasswordPrompt.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Current password required'),
            message : t('Provide your current password to save your user settings.')
        });

        if (!password || me.isDestroyed) {
            return false
        }

        me.currentPassword = password;
        return true
    }

    /**
     * The server wants the current password (missing, or wrong)
     * @param {Object} data {error, validationErrors}
     * @protected
     */
    async onSaveError(data) {
        let me    = this,
            error = data.validationErrors?.currentPassword;

        if (!error) {
            return super.onSaveError(data)
        }

        // 1 = ErrorCode::REQUIRED: ask and save again
        if (!me.currentPassword && error.code === 1) {
            await me.askCurrentPassword() && me.submit();
            return
        }

        me.currentPassword = null;
        me.showError(t('The current password you entered was incorrect'))
    }

    /**
     * @param {Object} data {data, isNew}
     * @protected
     */
    async onFormSave(data) {
        let me      = this,
            changed = me.saving,
            user    = Object.fromEntries(USER_PROPERTIES.filter(key => key in data.data).map(key => [key, data.data[key]]));

        me.fire('save', data);

        if (String(data.data.id) !== String(client.user?.id)) {
            me.close();
            return
        }

        client.setUser(user);
        me.themeSaved = true;

        const windowIds = Object.keys(Neo.apps || {});

        try {
            if ('language' in changed) {
                // the language is part of the page and its worker (Neo.php): new pages, each one
                // with ?SET_LANGUAGE= (a GO_LANGUAGE cookie would otherwise keep the old one)
                const url = client.baseUrl + 'index.php?SET_LANGUAGE=' + encodeURIComponent(user.language);
                windowIds.forEach(windowId => Neo.Main.redirectTo({url, windowId}));
                return
            }

            if (RELOAD.some(name => name in changed)) {
                windowIds.forEach(windowId => Neo.Main.reloadWindow({windowId}));
                return
            }

            ('theme' in changed || 'themeColorScheme' in changed) && await applyTheme({theme: user.theme, colorScheme: user.themeColorScheme})
        } catch (e) {
            notifyError(me, e)
        }

        me.isDestroyed || me.close()
    }
}

export default Neo.setupClass(UserSettingsDialog);
