import Container     from '../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import EmailField    from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Email.mjs';
import NumberField   from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Number.mjs';
import PasswordField from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Password.mjs';
import TextArea      from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField     from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {LEVEL_CREATE, LEVEL_MANAGE, LEVEL_READ, LEVEL_WRITE} from '../../../../../../views/neo/src/Acl.mjs';
import Button        from '../../../../../../views/neo/src/button/Button.mjs';
import BoolCheckBox  from '../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import JmapComboBox  from '../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import LocalCombo    from '../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import {fieldset}    from '../../../../../../views/neo/src/form/fieldset.mjs';
import client        from '../../../../../../views/neo/src/jmap/Client.mjs';
import TextList      from '../../../../../../views/neo/src/list/TextList.mjs';
import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {notify}      from '../../../../../../views/neo/src/Notify.mjs';
import SharePanel    from '../../../../../../views/neo/src/permissions/SharePanel.mjs';
import {t as coreT}  from '../../../../../../views/neo/src/Translate.mjs';
import {LEVEL_DELEGATED, t} from '../../util.mjs';
import * as accountApi from './accountApi.mjs';
import AliasDialog   from './AliasDialog.mjs';
import FilterDialog, {filterFields} from './FilterDialog.mjs';
import LabelDialog   from './LabelDialog.mjs';
import LegacyFormWindow from './LegacyFormWindow.mjs';
import RecordsPanel  from './RecordsPanel.mjs';
import {centered, field} from './RecordDialog.mjs';

/** Check boxes of email/account/load|submit (sent as 1 / 0) */
const BOOLEANS = ['imap_allow_self_signed', 'smtp_allow_self_signed', 'force_smtp_login', 'smtp_auth', 'save_sent',
    'ignore_sent_folder', 'do_not_mark_as_read', 'full_reply_headers', 'signature_below_reply'];

/** The special folders of the account */
const FOLDERS = ['sent', 'drafts', 'trash', 'spam'];

/** Position of the core cards; extension cards (emailAccountDialogCards) sort in by `order` */
const CARD_ORDER = {properties: 10, server: 20, aliases: 30, filters: 40, labels: 50, permissions: 90};

/**
 * E-mail account (ExtJS GO.email.AccountDialog over email/account/load|submit).
 *
 * Cards: Properties (owner for admins, name, e-mail, signature, default template, special
 * folders, extra options), Server (IMAP / SMTP; only with write permission on the e-mail
 * module, like ExtJS), Aliases, Filters (legacy client side filters), Labels (config
 * email_enable_labels), Permissions (the account ACL; for managers of the account) and the
 * cards other modules register as `emailAccountDialogCards` (see docs/neo-email-module.md).
 *
 * A new account stays open after its first save and becomes an existing one (aliases, filters,
 * labels and permissions need its id); the `save` event fires after every save.
 *
 *     const dialog = await AccountDialog.open({appName, windowId, accountId}); // accountId null: new
 */
class AccountDialog extends LegacyFormWindow {
    static config = {
        className    : 'GO.email.account.AccountDialog',
        cls          : ['go-form-window', 'go-email-account-dialog'],
        title        : t('E-mail Account'),
        wrapperStyle : centered(760, 760),
        generalHeader: {text: coreT('Properties')},
        closeOnSave  : true,
        /**
         * email/account/load data, null for a new account
         * @member {Object|null} account=null
         */
        account: null,
        /**
         * email/account/clientSettings
         * @member {Object} settings={}
         */
        settings: {},
        /**
         * Folder names of the account (special folder combos)
         * @member {String[]} folders=[]
         */
        folders: [],
        /**
         * Templates for "Default e-mail template" [{id, name}]
         * @member {Object[]} templates=[]
         */
        templates: [],
        /**
         * The account ACL {value: {groupId: level}, manage}, null for a new account
         * @member {Object|null} acl=null
         */
        acl: null
    }

    /**
     * The registered emailAccountDialogCards with their card component (`card`)
     * @member {Object[]} cardPlugins=[]
     */
    cardPlugins = []

    /**
     * Ignore field changes while values are applied (encryption → port)
     * @member {Boolean} applying=true
     */
    applying = true

    /**
     * Loads everything the dialog shows and opens it
     * @param {Object} config appName, windowId, accountId (null: a new account)
     * @returns {Promise<AccountDialog>}
     */
    static async open({accountId=null, ...config}) {
        const state = await AccountDialog.loadState(accountId);
        return Neo.create(AccountDialog, {...config, ...state})
    }

    /**
     * @param {Number|null} accountId
     * @returns {Promise<Object>} {account, settings, folders, templates, acl, values}
     */
    static async loadState(accountId) {
        const [settings, templates] = await Promise.all([
            accountApi.clientSettings(),
            accountApi.accountTemplates().catch(e => {
                console.error('email/template/accountTemplatesStore', e);
                return []
            })
        ]);

        if (!accountId) {
            return {account: null, settings, templates, folders: [], acl: null, values: await AccountDialog.newValues(settings)}
        }

        const response = await accountApi.loadAccount(accountId),
              account  = {...response.data, id: accountId, userText: response.remoteComboTexts?.user_id || ''},
              [folders, acl] = await Promise.all([
                  // the folders need a working IMAP login: the dialog must open to fix it
                  accountApi.folderNames(accountId).catch(() => []),
                  +account.acl_id ? accountApi.loadAcl(account.acl_id).catch(() => null) : null
              ]);

        return {account, settings, templates, folders, acl, values: AccountDialog.toValues(account, acl)}
    }

    /**
     * Defaults of a new account (ExtJS show() without id): the user's name, e-mail and username
     * @param {Object} settings
     * @returns {Promise<Object>}
     */
    static async newValues(settings) {
        let user = {};

        try {
            [user = {}] = await client.get('User', [String(client.user.id)], ['id', 'displayName', 'email', 'username'])
        } catch (e) {
            console.error('User/get', e)
        }

        return {
            name           : user.displayName || '',
            email          : user.email || '',
            username       : user.username || '',
            port           : 143,
            imap_encryption: '',
            smtp_host      : settings.default_smtp_host || '',
            smtp_port      : 25,
            smtp_encryption: '',
            save_sent      : true,
            sent           : 'Sent',
            drafts         : 'Drafts',
            trash          : 'Trash',
            spam           : 'Spam',
            default_account_template_id: 0
        }
    }

    /**
     * email/account/load data → field values. Unknown keys stay: fields of
     * emailAccountDialogCards with the same name pick them up.
     * @param {Object} account
     * @param {Object|null} acl
     * @returns {Object}
     */
    static toValues(account, acl) {
        const values = {...account, password: '', smtp_password: ''};

        BOOLEANS.forEach(name => values[name] = !!+(account[name] ?? 0) || account[name] === true);
        FOLDERS.forEach(name => values[name] = account[name] || null);
        values.default_account_template_id = +account.default_account_template_id || 0;
        values.port      = +account.port || null;
        values.smtp_port = +account.smtp_port || null;
        values.aclLevels = acl?.value || null;
        return values
    }

    /**
     * @returns {Boolean} an existing account
     */
    get accountId() {
        return this.account?.id || null
    }

    /**
     * @returns {Number} the user's level on the account (a new account: the creator manages it)
     */
    get level() {
        return this.account ? +this.account.permission_level || 0 : LEVEL_MANAGE
    }

    /**
     * @returns {Boolean} write permission on the e-mail module (servers, new accounts)
     */
    get moduleWrite() {
        return !!this.settings.module_write
    }

    construct(config) {
        super.construct(config);

        let me = this;

        // copies: `card` is state of this dialog, the registered descriptors are shared
        me.cardPlugins = [].concat(...ModuleRegistry.getConfigs('emailAccountDialogCards').map(c => [].concat(c)))
            .filter(p => p && p.id)
            .map(p => ({...p}))
    }

    createFormItems() {
        let me       = this,
            settings = me.settings,
            combo    = (name, label, data, config={}) => field(LocalCombo, name, label, {
                width       : null,
                displayField: 'name',
                valueField  : 'id',
                editable    : false,
                listConfig  : {module: TextList},
                store       : {keyProperty: 'id', data},
                ...config
            }),
            folders  = me.folderOptions(),
            noAlias  = !me.moduleWrite && !!settings.disable_aliases,
            check    = (name, valueLabel, config={}) => ({module: BoolCheckBox, name, valueLabel, flex: 'none', ...config});

        return [
            fieldset(coreT('Properties'), [
                ...client.isAdmin ? [field(JmapComboBox, 'user_id', coreT('User'), {
                    entity      : 'User',
                    displayField: 'displayName',
                    properties  : ['id', 'displayName', 'email', 'username'],
                    jmapSort    : [{property: 'displayName', isAscending: true}],
                    listeners   : {select: data => me.onUserSelect(data)}
                })] : [],
                field(TextField, 'name', coreT('Name'), {required: true}),
                field(EmailField, 'email', coreT('E-mail'), {required: true, disabled: noAlias}),
                field(TextArea, 'signature', t('Signature'), {height: 100}),
                combo('default_account_template_id', t('Default e-mail template'), me.templateOptions()),
                {ntype: 'container', reference: 'propertiesExtra', flex: 'none', layout: {ntype: 'vbox', align: 'stretch'}, items: []}
            ]),
            fieldset(t('Folders'), [
                ...FOLDERS.map(name => combo(name, {
                    sent  : t('Sent items folder'),
                    drafts: t('Drafts folder'),
                    trash : t('Trash folder'),
                    spam  : t('Spam folder')
                }[name], folders, {
                    reference      : name + 'Folder',
                    placeholderText: coreT('Disabled'),
                    disabled       : !me.accountId
                })), {
                    module   : Button,
                    reference: 'subscribeButton',
                    cls      : ['go-email-account-subscribe'],
                    ui       : 'secondary',
                    icon     : 'checklist',
                    text     : t('Subscribe to folders'),
                    disabled : !me.accountId || me.level < LEVEL_CREATE,
                    flex     : 'none',
                    handler  : () => me.openFolders()
                }
            ]),
            fieldset(t('Extra options'), [
                check('save_sent', t('Save sent mail to the sent folder')),
                check('ignore_sent_folder', t('Store replies in the same folder as the original message')),
                check('do_not_mark_as_read', t('Do not automatically mark emails as read')),
                check('full_reply_headers', t('Show full reply headers')),
                check('signature_below_reply', t('On reply/forward: Place signature always at the end of the mail.'))
            ])
        ]
    }

    /**
     * The Server card (ExtJS serverTab): incoming, advanced, outgoing
     * @returns {Object[]}
     */
    createServerItems() {
        let me         = this,
            disabled   = !me.moduleWrite,
            encryption = [{id: '', name: t('No encryption')}, {id: 'tls', name: 'TLS'}, {id: 'ssl', name: 'SSL'}],
            combo      = (name, label) => field(LocalCombo, name, label, {
                width       : null,
                displayField: 'name',
                valueField  : 'id',
                editable    : false,
                disabled,
                listConfig  : {module: TextList},
                store       : {keyProperty: 'id', data: encryption}
            }),
            port       = (name) => field(NumberField, name, t('Port'), {required: true, minValue: 1, maxValue: 65535, stepSize: 1, disabled}),
            check      = (name, valueLabel, config={}) => ({module: BoolCheckBox, name, valueLabel, flex: 'none', disabled, ...config});

        return [
            fieldset(t('Incoming mail'), [
                field(TextField, 'host', 'IMAP ' + t('Host'), {required: true, disabled}),
                port('port'),
                field(TextField, 'username', coreT('Username'), {required: true, disabled, autoComplete: 'off'}),
                field(PasswordField, 'password', coreT('Password'), {
                    disabled,
                    autoComplete   : 'new-password',
                    // a new account needs one, an existing one keeps its password when empty
                    required       : !me.accountId,
                    placeholderText: me.accountId ? t('Unchanged') : ''
                }),
                combo('imap_encryption', t('Encryption')),
                check('imap_allow_self_signed', t('Allow self signed certificate when using SSL or TLS'))
            ], {reference: 'incomingSet'}),
            fieldset(t('Advanced'), [
                field(TextField, 'mbroot', t('Root mailbox'), {disabled}),
                {ntype: 'container', reference: 'serverExtra', flex: 'none', layout: {ntype: 'vbox', align: 'stretch'}, items: []}
            ]),
            fieldset(t('Outgoing mail'), [
                field(TextField, 'smtp_host', 'SMTP ' + t('Host'), {required: true, disabled}),
                port('smtp_port'),
                combo('smtp_encryption', t('Encryption')),
                check('smtp_allow_self_signed', t('Allow self signed certificate when using SSL or TLS')),
                check('force_smtp_login', t('Use IMAP credentials')),
                check('smtp_auth', t('Use authentication'), {reference: 'smtpAuth'}),
                field(TextField, 'smtp_username', coreT('Username'), {reference: 'smtpUsername', disabled: true, autoComplete: 'off'}),
                field(PasswordField, 'smtp_password', coreT('Password'), {
                    reference      : 'smtpPassword',
                    disabled       : true,
                    autoComplete   : 'new-password',
                    placeholderText: me.accountId ? t('Unchanged') : ''
                })
            ], {reference: 'outgoingSet'})
        ]
    }

    /**
     * @returns {Object[]} [{id, name}] of the folder combos
     */
    folderOptions() {
        let me    = this,
            names = [...me.folders];

        // a configured folder that is not in the list (not subscribed, or IMAP failed) stays selectable
        FOLDERS.forEach(name => {
            const value = me.values?.[name];
            value && !names.includes(value) && names.push(value)
        });

        return names.map(name => ({id: name, name}))
    }

    /**
     * @returns {Object[]} [{id, name}]; 0 is the user's default template
     */
    templateOptions() {
        const list = this.templates.map(r => ({id: +r.id || 0, name: r.name}));
        list.some(r => r.id === 0) || list.unshift({id: 0, name: '-- ' + coreT('User default template', 'legacy', 'addressbook') + ' --'});
        return list
    }

    async onConstructed() {
        const result = super.onConstructed();

        let me = this;

        me.form.on('fieldChange', data => me.onFieldChange(data));
        me.addCards();

        await me.readyPromise;

        if (me.isDestroyed) {
            return result
        }

        me.applying = false;
        await me.syncSmtpAuth();
        await me.afterAccountLoad();
        return result
    }

    /**
     * Server, Aliases, Filters, Labels, Permissions and the registered cards
     * @protected
     */
    addCards() {
        let me      = this,
            noAlias = !me.moduleWrite && !!me.settings.disable_aliases,
            cards   = [{
                order: CARD_ORDER.server,
                config: {reference: 'serverCard', header: {text: t('Server')}, cls: ['go-form-card', 'go-email-account-server'], items: me.createServerItems()}
            }, ...noAlias ? [] : [{
                order : CARD_ORDER.aliases,
                config: me.recordsCard('aliasesCard', t('Aliases'), {
                    legacyController: 'alias',
                    dialog    : AliasDialog,
                    columns   : [{text: coreT('Name'), field: 'name', flex: true}, {text: coreT('E-mail'), field: 'email', flex: true}]
                })
            }], {
                order : CARD_ORDER.filters,
                config: me.recordsCard('filtersCard', t('Filters'), {
                    legacyController  : 'filter',
                    dialog      : FilterDialog,
                    sortable    : true,
                    hint        : t('Not all features are supported. Check the manual.'),
                    dialogConfig: async () => ({folders: await accountApi.folderNames(me.accountId).catch(() => me.folders)}),
                    columns     : [
                        {text: t('Field'), render: r => filterFields().find(f => f.id === r.field)?.name || r.field},
                        {text: t('Contains'), field: 'keyword', flex: true},
                        {text: t('Move to folder'), field: 'folder', flex: true},
                        {text: t('Mark as read'), render: r => +r.mark_as_read ? coreT('Yes') : coreT('No')}
                    ]
                })
            }, ...me.settings.enable_labels ? [{
                order : CARD_ORDER.labels,
                config: me.recordsCard('labelsCard', t('Labels'), {
                    legacyController: 'label',
                    dialog    : LabelDialog,
                    columns   : [{text: coreT('Name'), field: 'name', flex: true}, {text: coreT('Color'), render: r => r.color ? '#' + r.color : ''}]
                })
            }] : [], {
                order : CARD_ORDER.permissions,
                config: {
                    reference: 'permissionsCard',
                    header   : {text: coreT('Permissions')},
                    items    : [{
                        module   : SharePanel,
                        reference: 'sharePanel',
                        name     : 'aclLevels',
                        flex     : 1,
                        levels   : [
                            {value: '',              name: ''},
                            {value: LEVEL_READ,      name: coreT('Read')},
                            {value: LEVEL_DELEGATED, name: t('Read only and delegated')},
                            {value: LEVEL_CREATE,    name: t('Use account')},
                            {value: LEVEL_MANAGE,    name: coreT('Manage')}
                        ]
                    }]
                }
            }];

        // cards of other modules; `target` puts the items into a core card instead (below,
        // once the core cards exist)
        me.cardPlugins.forEach(plugin => {
            if (plugin.target) {
                return
            }

            const items = plugin.items?.(me) || [];

            cards.push({
                order : plugin.order ?? 60,
                plugin,
                config: {
                    reference: 'pluginCard-' + plugin.id,
                    header   : plugin.header || {text: plugin.id},
                    cls      : ['go-form-card', 'go-email-account-plugin'],
                    items
                }
            })
        });

        cards.sort((a, b) => a.order - b.order).forEach(({config, plugin}) => {
            const card = me.addCard(config);
            plugin && (plugin.card = card)
        });

        me.cardPlugins.filter(plugin => plugin.target).forEach(plugin => {
            const server = plugin.target === 'server',
                  items  = plugin.items?.(me) || [],
                  slot   = me.getReference(server ? 'serverExtra' : 'propertiesExtra');

            slot && items.length && slot.add(items);
            plugin.card = server ? me.getReference('serverCard') : me.generalTab
        })
    }

    /**
     * @param {String} reference
     * @param {String} text tab
     * @param {Object} panel RecordsPanel config
     * @returns {Object} card config
     */
    recordsCard(reference, text, panel) {
        return {
            reference,
            header: {text},
            cls   : ['go-form-card', 'go-email-account-records'],
            items : [{module: RecordsPanel, reference: reference + 'Panel', flex: 1, ...panel}]
        }
    }

    /**
     * Shows or hides a card and its tab
     * @param {String} reference
     * @param {Boolean} visible
     */
    setCardVisible(reference, visible) {
        let me    = this,
            card  = me.getReference(reference),
            items = me.cards.getCardContainer().items,
            index = card ? items.indexOf(card) : -1;

        if (index < 0) {
            return
        }

        const tab = me.cards.getTabAtIndex(index);
        tab && (tab.hidden = !visible);

        if (!visible && me.cards.activeIndex === index) {
            me.cards.activeIndex = 0
        }
    }

    /**
     * After loading (and after the first save of a new account): the record cards, the
     * permissions and the cards of other modules
     * @protected
     */
    async afterAccountLoad() {
        let me       = this,
            id       = me.accountId,
            readOnly = me.level < LEVEL_WRITE;

        ['aliasesCard', 'filtersCard', 'labelsCard'].forEach(ref => me.getReference(ref + 'Panel')?.setAccount(id, readOnly));

        FOLDERS.forEach(name => {
            const combo = me.getReference(name + 'Folder');
            combo && (combo.disabled = !id)
        });

        const subscribe = me.getReference('subscribeButton');
        subscribe && (subscribe.disabled = !id || me.level < LEVEL_CREATE);

        // aliases, filters, labels and permissions need the saved account
        ['aliasesCard', 'filtersCard', 'labelsCard'].forEach(ref => me.setCardVisible(ref, !!id));
        me.setCardVisible('serverCard', true);
        await me.loadPermissions();

        for (const plugin of me.cardPlugins) {
            await me.loadPlugin(plugin)
        }
    }

    /**
     * The account ACL: managers only (ExtJS PermissionsPanel)
     * @protected
     */
    async loadPermissions() {
        let me    = this,
            panel = me.getReference('sharePanel'),
            show  = !!(me.accountId && me.acl && me.acl.manage);

        me.setCardVisible('permissionsCard', show);

        if (!show || !panel) {
            return
        }

        await panel.setAclId(me.account.acl_id, me.acl.value).catch(e => console.error('SharePanel', e));
        me.isDestroyed || me.form.setOriginalValue('aclLevels', panel.getSubmitValue())
    }

    /**
     * Calls the load hook of a registered card; `isAvailable` decides whether it shows (and
     * whether the card it `replaces` hides)
     * @param {Object} plugin
     * @protected
     */
    async loadPlugin(plugin) {
        let me = this,
            available = true;

        try {
            available = plugin.isAvailable ? !!await plugin.isAvailable(me.account, me) : true
        } catch (e) {
            console.error('emailAccountDialogCards ' + plugin.id, e);
            available = false
        }

        if (me.isDestroyed) {
            return
        }

        if (!plugin.target) {
            me.setCardVisible('pluginCard-' + plugin.id, available)
        }

        if (plugin.replaces) {
            const ref = {aliases: 'aliasesCard', filters: 'filtersCard', labels: 'labelsCard', server: 'serverCard', permissions: 'permissionsCard'}[plugin.replaces];
            ref && available && me.setCardVisible(ref, false)
        }

        if (available && plugin.load) {
            try {
                await plugin.load({account: me.account, dialog: me, card: plugin.card})
            } catch (e) {
                console.error('emailAccountDialogCards ' + plugin.id, e)
            }
        }
    }

    /**
     * Encryption → default port, "Use authentication" / "Use IMAP credentials" → SMTP login fields
     * @param {Object} data {component, value}
     * @protected
     */
    onFieldChange({component, value}) {
        let me = this;

        if (me.applying || !me.formReady) {
            return
        }

        const name = component?.name,
              id   = value?.id ?? value;

        if (name === 'imap_encryption') {
            me.setFieldValue('port', id === 'ssl' ? 993 : 143)
        } else if (name === 'smtp_encryption') {
            me.setFieldValue('smtp_port', id === 'ssl' ? 465 : 587)
        } else if (name === 'smtp_auth' || name === 'force_smtp_login') {
            me.syncSmtpAuth()
        }
    }

    /**
     * @param {String} name
     * @param {*} value
     */
    async setFieldValue(name, value) {
        const field = await this.form.getField(name);
        field && (field.value = value)
    }

    /**
     * ExtJS: "Use IMAP credentials" hides the SMTP login, "Use authentication" enables it
     * @protected
     */
    async syncSmtpAuth() {
        let me       = this,
            force    = (await me.form.getField('force_smtp_login'))?.getSubmitValue(),
            auth     = (await me.form.getField('smtp_auth'))?.getSubmitValue(),
            disabled = !me.moduleWrite;

        ['smtpAuth', 'smtpUsername', 'smtpPassword'].forEach(ref => {
            const cmp = me.getReference(ref);
            cmp && (cmp.hidden = !!force)
        });

        ['smtpUsername', 'smtpPassword'].forEach(ref => {
            const cmp = me.getReference(ref);
            cmp && (cmp.disabled = disabled || !auth)
        })
    }

    /**
     * Admins pick the owner; a new account takes the owner's name, e-mail and username (ExtJS)
     * @param {Object} data {record}
     * @protected
     */
    onUserSelect({record}) {
        let me = this;

        if (me.accountId || !record) {
            return
        }

        record.email       && me.setFieldValue('email', record.email);
        record.username    && me.setFieldValue('username', record.username);
        record.displayName && me.setFieldValue('name', record.displayName)
    }

    /**
     * Folder subscriptions; the folder combos reload afterwards
     * @protected
     */
    async openFolders() {
        let me = this;

        const {openFoldersDialog} = await import('./accountActions.mjs'),
              changed = await openFoldersDialog(me, me.accountId);

        if (changed && !me.isDestroyed) {
            // already saved on the server: the e-mail tree reloads when this dialog closes
            me.fire('changed');
            me.folders = await accountApi.folderNames(me.accountId).catch(() => me.folders);
            me.updateFolderCombos()
        }
    }

    /**
     * New folder options in the special folder combos, keeping their values
     * @protected
     */
    updateFolderCombos() {
        let me      = this,
            options = me.folderOptions();

        FOLDERS.forEach(name => {
            const combo = me.getReference(name + 'Folder');

            if (combo) {
                const value = combo.getSubmitValue();
                combo.store.data = options;
                value && (combo.value = value)
            }
        })
    }

    /**
     * Field values → email/account/submit params
     * @param {Object} values
     * @returns {Object}
     * @protected
     */
    toParams(values) {
        let me     = this,
            params = {};

        Object.entries(values).forEach(([name, value]) => {
            if (name === 'aclLevels') {
                return
            }

            if (typeof value === 'boolean') {
                value = value ? 1 : 0
            } else if (value === null || value === undefined) {
                value = ''
            } else if (typeof value === 'object') {
                return
            }

            params[name] = value
        });

        // only admins choose the owner (ExtJS SelectUser is disabled for others)
        client.isAdmin || delete params.user_id;
        params.user_id === '' && delete params.user_id;

        // FOLDERS: '' disables the special folder, like the cleared ExtJS combo
        return params
    }

    async save(modified, values) {
        let me     = this,
            isNew  = !me.accountId,
            params = me.toParams(values);

        isNew || (params.id = me.accountId);

        for (const plugin of me.cardPlugins) {
            await plugin.beforeSave?.({params, dialog: me, card: plugin.card, isNew})
        }

        const response = await accountApi.submitAccount(params),
              id       = +(response.id || me.accountId);

        if (!isNew && modified.aclLevels && me.acl?.manage) {
            await accountApi.saveAcl(me.account.acl_id, me.acl.value || {}, values.aclLevels || {})
        }

        for (const plugin of me.cardPlugins) {
            try {
                await plugin.afterSave?.({accountId: id, response, isNew, dialog: me, card: plugin.card})
            } catch (e) {
                console.error('emailAccountDialogCards ' + plugin.id, e)
            }
        }

        me.saved = true;

        if (isNew) {
            // like ExtJS "Apply": the dialog continues with the saved account
            // a failing reload must not make the next save create the account again
            me.account = {...me.account, id};
            me.fire('save', {data: {id}, isNew: true});
            await me.reload(id);
            notify(me, t('The account was created. You can now add aliases, filters and labels.'), {title: coreT('Saved')});
            return false
        }

        return {id}
    }

    /**
     * Loads the account again into the open dialog (after the first save of a new account)
     * @param {Number} id
     * @protected
     */
    async reload(id) {
        let me = this;

        const state = await AccountDialog.loadState(id);

        if (me.isDestroyed) {
            return
        }

        me.applying  = true;
        me.account   = state.account;
        me.folders   = state.folders;
        me.acl       = state.acl;
        me.values    = state.values;
        me.updateFolderCombos();

        // an existing account keeps its passwords when they stay empty
        for (const name of ['password', 'smtp_password']) {
            const field = await me.form.getField(name);

            if (field) {
                field.required        = false;
                field.placeholderText = t('Unchanged')
            }
        }

        await me.form.create(state.values);
        me.applying  = false;
        await me.syncSmtpAuth();
        await me.afterAccountLoad()
    }
}

export default Neo.setupClass(AccountDialog);
