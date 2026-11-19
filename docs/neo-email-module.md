# neo e-mail client (legacy module `www/modules/email`)

The neo port of the legacy e-mail client (ExtJS `www/modules/email/*.js`, plus sieve, smime and
emailfavorites). The backend stays the legacy GO\Base controllers (`email/account/*`,
`email/folder/*`, `email/message/*`, …), called with `client.legacy(route, params)`
(`www/views/neo/src/jmap/Client.mjs`). The chain of cards, parent 20261119-011401-neo-ui-email-module:

| Card | Scope |
|---|---|
| 1 | module shell, account/folder tree, message grid, stubs |
| 2 | message view (`view/message/*`) |
| 3 | composer (`view/composer/*`, core `src/Mail.mjs` showComposer) |
| 4 | accounts, aliases, filters, labels, folders dialogs, IMAP ACL (`view/account/*`) |
| 5 | user and system settings, templates (`view/settings/*`) |
| 6 | emailfavorites |
| 7 | sieve |
| 8 | S/MIME |
| 9 | other modules that open the composer or show mail |
| 10 | integration: translations, docs, CHANGELOG, e2e |

**Threads:** GO 26 has no thread view (an e-mail threading branch exists in another repository
but is not merged). The neo client has none either; no card of this chain adds one.

## File layout

All paths below `www/modules/email/views/neo/` (found by `go/core/webclient/Neo.php` moduleFiles()).
Styles: `www/views/neo/resources/scss/src/apps/go/email/<path of the className>.scss`, then
`npm run build-themes` in `www/views/neo`.

| File | Class / exports | Card |
|---|---|---|
| `Index.mjs` | ModuleRegistry registration (package `legacy`, name `email`, capability `go:legacy:email`, quickAdd, `showComposer`, `portlets`, settings cards) | 1, 10 |
| `util.mjs` | `t` (= `translator('legacy', 'email')`), `LEVEL_DELEGATED` (15), `unescapeHtml()`, `imapText()`, `imapDate()`, `routePath()`, `parseRoutePath()` | 1 |
| `checker.mjs` | the mail check (singleton): `email/account/checkUnseen` every `checker_interval` also while the module is closed, the module badge (`badge: {count: () => checker.count()}` in `Index.mjs`), the "New email" notification (notification area + desktop + `message-new-email` sound, only with `emailSettings.notify_new_email`, muted by `mute_new_mail_sound`), `check()`, `onStatus(fn)`, `setUnseen(accountId, mailbox, n)` | badge card |
| `api.mjs` | the legacy routes as functions (tree, checkUnseen, saveTreeState, saveSort, messageStore, setFlag, moveToAccount, moveToSpam, moveToInbox, labels, folder create/rename/delete/truncate/markAsRead/move), `serverNodeId()`, `nodeUnseen()` | 1, others add routes |
| `data/MessageStore.mjs` | `GO.email.data.MessageStore`: neo Store over `email/message/store`, infinite scroll (`loadMore()`), `setParams()`, `load({keepCount, extra})`, `response` | 1 |
| `view/EmailMain.mjs` | `GO.email.EmailMain` (MainThreeColumnPanel): tree / grid / message view, actions, search, routes, folder counts from `checker.onStatus()` | 1 |
| `view/AccountTree.mjs` | `GO.email.AccountTree` (GO.tree.Tree): accounts, folders, counts, row menu, `emailTreeSections` | 1 |
| `view/FolderPickerDialog.mjs` | `FolderPickerDialog.ask({accountId, allowRoot, exclude})` → `{accountId, mailbox}` | 1 (card 2 may reuse for "Move/Copy email to…") |
| `view/PromptDialog.mjs` | `PromptDialog.ask({title, labelText, value})` → text or null | 1 |
| `view/SearchDialog.mjs` | `SearchDialog.ask({labels, values})` → `{query, searchIn, values}` | 1 |
| `view/message/MessagePanel.mjs` | `GO.email.message.MessagePanel`: header, warnings, body, attachments, toolbar, `emailMessagePanelPlugins` | 2 |
| `view/message/messageHtml.mjs`, `messageApi.mjs`, `attachments.mjs`, `addressMenu.mjs` | HTML of header/body/attachments; the `email/message/*` routes of the view; attachment open/download/save/zip and their menus (`openIcs`, vcf import); address menu (compose, search sender, add to contacts) | 2 |
| `view/message/openMessageWindow.mjs` | `GO.email.message.MessageDialog`, `openMessageWindow(cfg)`, `openAttachedMessageWindow(cfg)` (an attached .eml) | 2 |
| `view/composer/compose.mjs` | `compose(cfg)`, `loadEmailSettings()` | 3 |
| `view/composer/ComposerWindow.mjs`, `ComposerAttachmentsField.mjs`, `CloseDialog.mjs`, `composerUtil.mjs` | `GO.email.composer.ComposerWindow` (From alias, RecipientsField to/cc/bcc, HtmlField with `pasteImages`, signatures, templates, attachments, auto save to Drafts, `emailComposerPlugins`), save-before-close dialog, address and signature helpers | 3 |
| `view/account/accountActions.mjs`, `accountApi.mjs` | dialog openers (see below), `promptImapPassword()`, `isImapAuthError()`, `openCopyMailToDialog()`; the `email/account|alias|filter|label|folder/*` routes | 4 |
| `view/account/*Dialog.mjs`, `RecordsPanel.mjs`, `LegacyFormWindow.mjs` | `AccountDialog` (cards properties, server, aliases, filters, labels, permissions, `emailAccountDialogCards`), `AccountsDialog`, `AliasDialog`, `FilterDialog`, `LabelDialog`, `FoldersDialog` (subscriptions), `FolderDialog`, `ImapAclDialog` + `ImapAclUserDialog`, `MoveOldMailDialog`; `LegacyFormWindow` = FormWindow over a legacy load/submit route (copy of the files module's) | 4 |
| `view/settings/UserSettingsPanel.mjs`, `SystemSettingsPanel.mjs` | My account → E-mail (JMAP `User.emailSettings`, templates grid); System settings → E-mail (templates and groups, admins and module managers) | 5 |
| `view/template/*` | `TemplatesGrid`, `EmailTemplateDialog` (Autodata menu, attachments, permissions), `TemplateGroupsDialog`, `TemplateCombo`; `api.mjs` (`email/template/*`, `defaultTemplateId()`, `setDefaultTemplate()`) | 5 |
| `view/portlet/EmailPortlet.mjs`, `PortletFoldersDialog.mjs` | start page portlet `portlet-email` (`email/portlet/*`): newest messages of the chosen folders | 5 |

Other modules (each registers in its own `views/neo/Index.mjs`):

| Module | Files | Plugs into |
|---|---|---|
| emailfavorites (`www/go/modules/community/emailfavorites/views/neo`) | `view/favorites.mjs` (section nodes, row menu, folder menu item), `view/FavoritefolderDialog.mjs` (rename) | `emailTreeSections` |
| sieve (`www/modules/sieve/views/neo`) | `sieveApi.mjs` (`sieve/sieve/*`), `util.mjs` (criteria/actions), `view/SieveRulesPanel.mjs`, `RuleDialog`, `CriteriumDialog`, `ActionDialog`, `RulePartsPanel`, `OutOfOfficePanel` + `outOfOffice.mjs` | `emailAccountDialogCards` "Filters" (`replaces: 'filters'`) and "Out of office" |
| smime (`www/modules/smime/views/neo`) | `api.mjs` (`smime/certificate/*`, `smime/publicCertificate/*`), `view/CertificatesPanel`, `UploadDialog`, `composerPlugin.mjs`, `messagePlugin.mjs` + `SmimeBar`, `CertificateDetailWindow`, `PublicCertsDialog`, `ImportDialog` | `emailAccountDialogCards`, `emailComposerPlugins`, `emailMessagePanelPlugins`, `emailMenuItems` |
| calendar (`www/go/modules/community/calendar/views/neo`) | `view/ItipPanel.mjs`, `ui.mjs` `windowUi()` | `emailMessagePanelPlugins` (`itip`), `openIcs` |
| oauth2client (`www/go/modules/community/oauth2client/views/neo/emailAccount.mjs`) | OAuth2 client combo + "Refresh token" | `emailAccountDialogCards` (`target: 'properties'`, hides the Server card) |
| addressbook, other modules | "Send e-mail" (contact menu), e-mail values in `DescriptionList` (`{email, name, …}`), `AddLinkButton` "E-mail" | core `showComposer()` (`www/views/neo/src/Mail.mjs`) |

## Public APIs of the e-mail client

- **`MessagePanel`**: `load({accountId, mailbox, uid})` → Promise of the `email/message/view`
  response (null when a newer load replaced it), `reset()`, `message` ({accountId, mailbox, uid} shown),
  reference `toolbar` (EmailMain inserts the phone's close button at 0), events
  `load {message}` (EmailMain marks the message as read unless `message.seen` or
  `message.do_not_mark_as_read`) and `loadError {error}`.
- **`openMessageWindow(cfg)`**: returns the dialog; its reference `messagePanel` fires `load`.
- **`compose(cfg)`** (`view/composer/compose.mjs`, the docblock lists every key):
  `{appName, windowId}` (required), `accountId` / `from`, `values: {to, cc, bcc, subject, body}`
  (address strings, arrays of them or of `{name, email}`), `loadUrl` + `loadParams` (a legacy route
  that fills the composer: `email/message/reply|forward|openDraft|template`, `files/file/emailDownloadLink`,
  …) or ExtJS style `task` (reply | reply_all | forward | opendraft | template) + `uid`, `mailbox`,
  `template_id`, `contact_id` / `company_id` (template tags), `addEmailAsAttachmentList` (forward
  as attachment), `blobs` (attach JMAP blobs), `links: [{entity, entityId}]`, `isHtml`, `afterLoad(composer)`.
  EmailMain calls it for the compose button, the header "+" (quickAdd), reply/forward and a double
  click in drafts / sent items (`loadUrl: 'email/message/openDraft'`).
- **`showComposer`** registration key: `ModuleRegistry.getConfigs('showComposer')[0](cfg)` imports
  compose.mjs and calls `compose(cfg)`. Other modules call core `showComposer(cfg)` from
  `www/views/neo/src/Mail.mjs` instead: it uses the e-mail composer when the module is available and
  `emailSettings.use_desktop_composer` is off, else a `mailto:` link opened with
  `Neo.Main.windowOpen` (a hidden iframe is blocked by GO's CSP, `location` fires `beforeunload`).
  It also takes `to` / `name` (string or array of addresses) like ExtJS `go.showComposer`.
- **`accountActions`**: every function takes the component that opens the dialog
  (`owner`, for appName/windowId) and resolves `true` when something was saved; EmailMain then
  reloads the tree. `openAccountDialog(owner, accountId?)` (no id: new account),
  `openAccountsDialog(owner)`, `openFoldersDialog(owner, accountId)` (subscriptions),
  `openImapAclDialog(owner, accountId, mailbox)` (shown only when the INBOX node has
  `acl_supported` and the user manages the account), `openFolderDialog(owner, accountId, mailbox)`
  (ExtJS FolderDialog "Properties"), `openMoveOldMailDialog(owner, accountId, mailbox)`
  (`email/message/moveOld`), `openCopyMailToDialog(owner, messages, {move})` (FolderPickerDialog, then
  `email/account/copyMailTo`; no button uses it yet), `promptImapPassword()` when
  `email/account/tree` answers `imapAuthFailed`.
- **Settings panels**: default-export a class; registered as `userSettings` /
  `systemSettings` in Index.mjs. `UserSettingsPanel` keeps `client.user.emailSettings` current after a save.

## Extension points

All are ModuleRegistry keys a module sets in its own `views/neo/Index.mjs`; `getConfigs()` only
returns them when the user has that module's capability. The descriptor keys (`emailTreeSections`,
`emailMessagePanelPlugins`, `emailComposerPlugins`, `emailAccountDialogCards`, `emailMenuItems`,
`portlets`) take one object or an array. `showComposer` and `openIcs` are a single function: the host
calls `getConfigs(key)[0](…)`, so register a function, not an array.

Error handling differs per hook: composer hooks are try/catch guarded, but only synchronous throws
(a rejected Promise is not caught); `emailMenuItems` and the account dialog's `isAvailable`, `load` and
`afterSave` log errors; an error in `beforeSave` aborts the account save; the tree section callbacks
(`nodes`, `onSelect`, `rowMenu`, `folderMenuItems`) are not guarded. Catch your own errors where a
failure should not break the e-mail client.

| Key | Host | Used by |
|---|---|---|
| `emailTreeSections` | `AccountTree` / `EmailMain` | emailfavorites |
| `emailMessagePanelPlugins` | `MessagePanel` | smime, calendar (ITIP) |
| `openIcs` | `message/attachments.mjs` (click on an .ics attachment) | calendar |
| `emailComposerPlugins` | `ComposerWindow` | smime |
| `emailAccountDialogCards` | `AccountDialog` | sieve (2 cards), smime, oauth2client |
| `emailMenuItems` | `EmailMain` ⋮ menu without a selection | smime ("Public SMIME certificates") |
| `showComposer` | Index.mjs of the e-mail module | core `src/Mail.mjs` |
| `portlets` | start page (`modules/summary/views/neo`) | e-mail (`portlet-email`) |

### `emailTreeSections`

A module adds nodes to the account tree by registering (in its own `views/neo/Index.mjs`)
`emailTreeSections: {…}` or an array of them; `ModuleRegistry.getConfigs()` only returns them when
the user has that module's capability.

```js
ModuleRegistry.register({
    package: 'community', name: 'emailfavorites', capability: 'go:community:emailfavorites',
    emailTreeSections: {
        id   : 'favorites',          // required, unique
        text : t('Favorites'),       // header node; without text the nodes are root nodes
        icon : 'star',
        order: 10,                   // < 100: above the accounts, >= 100: below (default 50)
        watch: ['Favoritefolder'],   // JMAP entities: a change reloads this section
        // required: the section's nodes (sync or async); tree = GO.email.AccountTree
        nodes: async tree => (await client.queryGet('Favoritefolder', {})).list.map(f => ({
            id: f.id, text: f.name, icon: 'star', accountId: f.account_id, mailbox: f.mailbox
        })),
        // a node with accountId + mailbox opens that folder and shows its unread count;
        // other nodes call onSelect(node, emailMain)
        onSelect: (node, emailMain) => {},
        // row menu (more_vert / right click) of the section's nodes
        rowMenu : (node, emailMain) => [{text: t('Rename'), icon: 'edit', handler: () => …}],
        // extra items at the end of every folder's menu (ExtJS GO.email.extraTreeContextMenuItems)
        folderMenuItems: (folderNode, emailMain) => [{text: t('Add to favorites'), icon: 'star', handler: () => …}]
    }
});
```

Tree node ids: `s:<sectionId>` (header), `s:<sectionId>:<node.id>` (nodes); a node keeps its own id
as `nodeId`. `tree.reloadSection(id)` reloads one section; `tree.setUnseen(accountId, mailbox, n)`
updates every node of that folder, section nodes included. Folder nodes (`folderMenuItems`) have
`accountId`, `mailbox`, `special` ('inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | null), `unseen`
and `data` (the `email/account/tree` node: `permission_level`, `noselect`, `noinferiors`, …).

Known limit: a section **without** header that had no nodes is appended at the end of the roots
when it gets its first node through a push (`reloadSection()`), below the accounts, until the next
tree reload. emailfavorites works around it with `tree.reload()` for its first favourite.

### `emailMessagePanelPlugins`

```js
emailMessagePanelPlugins: {
    id: 'itip',
    // optional: extra email/message/view params (or a Promise of them), e.g. smime's password
    beforeLoad: (params, panel) => ({}),
    // optional, after every load; parts and buttons are replaced on every load
    onLoad: async (message, panel) => ({
        parts       : [/* neo configs shown above the body */],
        toolbarItems: [/* buttons inserted after Forward */],
        menuItems   : [/* items of the "more" menu */]
    }),
    // optional: extra items of an attachment's menu (smime "Add to SMIME certificates")
    attachmentMenuItems: (attachment, message, panel) => []
}
```

`message` is the `email/message/view` response; `panel` the `GO.email.message.MessagePanel`
(`panel.message` = `{accountId, mailbox, uid}`, `panel.reload(extra)` reloads it, also an attached message; `load()` needs `{accountId, mailbox, uid}`). Users: calendar (`itip`:
`view/ItipPanel.mjs` as a part with Accept / Maybe / Decline / Import), smime (password before view,
`SmimeBar` part with verify and certificate details, decrypt).

### `openIcs`

`openIcs: ({accountId, mailbox, uid, partId, encoding, blobId}, panel) => void` — a click on an
`.ics` attachment calls the first registered one (calendar: `CalendarEvent/loadICS` → event
dialog); without it the file downloads. Not for attachments of an attached message.

### `emailComposerPlugins`

```js
emailComposerPlugins: {
    id: 'smime',
    init         : composer => {},                     // once, after the window is built
    menuItems    : composer => [],                     // GO.menu.List items appended to "Extra options"
                                                       // (more_vert); rebuilt on every open, so return
                                                       // the current check state; escape user text
    onAliasChange: (composer, alias) => {},            // From changed, also on load; alias = email/alias/store
                                                       // record (smime adds has_smime_cert, always_sign)
    afterLoad    : (composer, response) => {},         // after every load (new, reply, forward, draft,
                                                       // template switch); response.sendParams is merged
                                                       // into composer.sendParams already
    beforeSend   : (composer, {draft}) => {},          // false | Promise<false> cancels Send / manual Save
                                                       // (not the auto save), after the recipient checks
    submitParams : (composer, params, {draft, autoSave}) => {} // mutate the POST params of
                                                       // email/message/send|save (booleans become 1/0)
}
```

All hooks are optional. Composer state for plugins: `composer.sendParams` (extra keys are posted,
e.g. `sign_smime` / `encrypt_smime`), `composer.alias`, `composer.accountId`, `composer.isHtml`.
Events: `load {response}`, `save {response}`, `send {response}`.

### `emailAccountDialogCards`

| Key | Meaning |
|---|---|
| `id` | required |
| `header` | `{text}` of the card's tab |
| `order` | core cards: properties 10, server 20, aliases 30, filters 40, labels 50, permissions 90; default 60 |
| `target` | `'properties'` or `'server'`: the items go into that core card instead of a new tab |
| `replaces` | `'filters'`, `'aliases'`, `'labels'`, `'server'` or `'permissions'`: that core card hides while this card is available (sieve hides the client-side filters) |
| `items(dialog)` | neo item configs of the card |
| `isAvailable(account, dialog)` | false (or a Promise of false) hides the card and keeps `replaces` from hiding the core card; `account` is `null` for a new account. It does not hide items placed with `target`, and `beforeSave` / `afterSave` still run: such plugins handle their own visibility and check availability in their save hooks |
| `load({account, dialog, card})` | after every account load (also after each save) |
| `beforeSave({params, dialog, card, isNew})` | may add params to `email/account/submit` |
| `afterSave({accountId, response, isNew, dialog, card})` | errors are logged and don't block the save |

Every dialog works on copies of the descriptors, so `card` belongs to one dialog. `dialog.level`
is the user's permission level on the account.

### `emailMenuItems`

`emailMenuItems: emailMain => [/* GO.menu.List items */]` — appended after a separator to the
e-mail ⋮ menu that shows without a selection (Refresh, Accounts, …); ExtJS MessagesGrid `settingsMenu`.

## Status: left and different from ExtJS (2026-11-19)

Ported: accounts/folders tree with unread counts, message grid (search, labels, flags, infinite
scroll, multi select, move to a folder picked in a dialog), message view (attachments, blocked images,
spam bar, read receipts, labels, links), composer (aliases, templates, signatures, inline pasted
images, drafts with auto save, attachments from disk / blobs / forwarded messages),
accounts / aliases / filters / labels / subscriptions / folder properties / IMAP ACL / move old mail,
user and system settings, templates, start page portlet, emailfavorites, sieve filters and out of
office, S/MIME (sign, encrypt, decrypt, verify, certificates), ITIP, OAuth2 accounts, compose from
other modules.

Left (board backlog cards, parent 20261119-011401-neo-ui-email-module):

- **Files ↔ e-mail**: "E-mail files" and "E-mail download link" in the neo files module
  (`showComposer()` with `afterLoad` / `loadUrl: 'files/file/emailDownloadLink'`), and "Save (all) to
  personal folder" in the attachment menus (waits for a neo files folder picker).
- **savemailas / LinkedEmail** is not in this repository: no "Save as" menu, message links stay
  empty; `AddLinkButton` "E-mail" only shows with capability `go:legacy:savemailas`.
- **Attached e-mails** (eml in eml): zip, save to item and vcf/ics import are hidden (the routes would
  use the parent uid).
- **HTML layout of mails**: `Format.sanitizeHtml()` strips `style` attributes, HTML mails lose their
  layout; an e-mail specific sanitizer option is open.
- **Empty folder keeps the previous count**: opening an empty folder after a full one leaves the
  subtitle at the old folder's count (MessageStore fires no `load` for an empty result on an empty store).
- **Unknown recipients dialog** (ExtJS UnknownRecipientsDialog: add the recipients of a sent mail to
  the address book): the composer imports `view/message/UnknownRecipientsDialog.mjs` and calls
  `default.show({appName, windowId, recipients})`, but the file does not exist yet, so nothing shows.
- **Drag and drop** of messages onto tree folders / favourites and of accounts (ExtJS): neo moves
  through "Move email to…" and the account menu's Move up / down.
- Copy/move all results of a search (`openCopyMailToDialog`) has no button yet.
- No message threads (GO 26 has none either), no favourites ordering (`em_folders_favorites` has no
  sort column), no "print verifies the signature first" (the S/MIME bar's Verify does it).
- Address lists (business/newsletters "Add senders to address list") are not ported.
- `LegacyFormWindow` and `saveAcl` / `loadAcl` in `view/account/accountApi.mjs` are copies of the files
  module's versions: candidates for `www/views/neo/src`.

Pre-existing backend issues found by the cards (not changed, see the board notes): sieve
`accountAliases` has no permission check and `isSupported` returns the exception text; emailfavorites
`Favoritefolder/query` applies no user filter; smime `checkPassword` throws instead of answering
`passwordCorrect: false`.

## Routes

`#email/<accountId>/<mailbox>[/<uid>]`, the mailbox `encodeURIComponent()`-ed (IMAP names contain
`/` or `.`); see `util.mjs` routePath()/parseRoutePath(). `#email` alone opens the first account's
INBOX when no folder is open yet (ExtJS); later it keeps the open folder. A uid that is not on the first page is loaded into the message view directly.

## Card 1: shell, account/folder tree, message grid (ExtJS inventory)

ExtJS files: `EmailClient.js` (module panel, store, toolbar, checker), `AccountsTree.js`,
`AccountContextMenu.js`, `MailboxContextMenu.js`, `MessagesGrid.js`, `SearchDialog.js`
(`MessageContextMenu.js` is shared with card 2).

### Account tree — `email/account/tree`

- Param `node`: `root` (accounts) or the base64 node id: `account_<id>` (root folders) or
  `f_<accountId>_<mailbox>` (children). Accounts are ordered by `em_accounts_sort` of the user
  (`saveSort`), only accounts with a default alias are listed.
- Account node: `account_id`, `name`/`text` (alias e-mail), `permission_level`, `expanded`, `mailbox`
  (mbroot), `noinferiors`.
- Folder node: `mailbox` (IMAP name), `name` (display name, **translated** for INBOX, Sent, Trash,
  Drafts), `text` (**HTML**: the unread count in `<div class="em-folder-status">N</div>` — the only
  place the tree sends it; `api.nodeUnseen()` parses it), `iconCls` (tells the special folder:
  `ic-inbox`, `ic-send`, `ic-drafts`, `ic-delete` = trash, `ic-new-releases` = spam), `children`
  (`[]` = leaf, `null` = load on expand, an array = sent along because the folder is expanded),
  `noselect`, `noinferiors`, `permission_level` (of the account), `permittedFlags`; INBOX also
  `usage` (quota, HTML span) and `acl_supported` (IMAP ACL capability).
- Only subscribed folders show (`isVisible()`); subscriptions are card 4 (FoldersDialog,
  `email/account/subscribtionsTree` [sic], `email/folder/subscribe|unsubscribe` with param `mailboxs` [sic]).
- Expanded state: `email/account/saveTreeState` `expandedNodes` = JSON array of node ids
  (setting `email_accounts_tree`). Without a saved state accounts and INBOX are expanded; once
  saved, only the listed nodes.
- Account order: ExtJS drags accounts; neo has account menu "Move up/down" → `email/account/saveSort`
  `sort_order` = JSON account ids, first = top.
- Unread counts: `email/account/checkUnseen` (ExtJS `GO.checker`, every `checker_interval`, default
  120 s) → `email_status: {total_unseen, has_new, unseen: [{account_id, mailbox, unseen}]}` for each
  account's `check_mailboxes` (INBOX by default). `has_new` → ExtJS desktop notification
  "You have %d unread email(s)" and the module tab badge. neo: `checker.mjs` checks from login on
  (first `Badges` count, then every `checker_interval` through `badges.refresh('email')`, and after a
  push reconnect only when the last check is older than the interval — the push connection
  reconnects regularly), sets the badge to `total_unseen` and tells the open EmailMain
  (`onStatus()`: folder counts, grid reload). EmailMain passes the counts it learns (read, flags,
  folder load) to `checker.setUnseen()`, so the badge follows without another IMAP check. The
  notification follows ExtJS `countEmailShown`: on `has_new` (or the first check) when the total
  went up, with a new id each time (the notification center notifies once per id).
- Counts also come with `email/message/store` (`unseen: {mailbox: n}`, also for the target of a move)
  and `email/message/setFlag` (`unseen`).
- Account menu (AccountContextMenu): Add folder (disabled with `noinferiors`), Subscribe to folders,
  Properties (manage). neo adds Refresh and Move up/down.
- Folder menu (MailboxContextMenu): Add folder (`email/folder/create` account_id, parent, name;
  disabled with `noinferiors`), Rename (`email/folder/rename` account_id, mailbox, name; not INBOX),
  Mark as read (`email/folder/markAsRead`, needs delegated), Move old mails (card 4 dialog,
  `email/message/moveOld`), Empty folder (`email/folder/truncate`: messages to the trash, in the trash
  deleted; needs CREATE), Delete (`email/folder/delete` account_id, mailbox, trashable: moved into the
  trash, deleted when already in the trash or when the trash has `noinferiors` (then `trashable=0`
  and a confirmation); special folders refused by the server), Share (IMAP ACL, card 4; only with
  `acl_supported` and manage), Subscribe to folders (card 4), Properties (FolderDialog, card 4),
  then `GO.email.extraTreeContextMenuItems` (emailfavorites "Add to favorites"). ExtJS moves folders
  by drag and drop (`email/folder/move` account_id, sourceMailbox, targetMailbox); neo: "Move folder"
  with FolderPickerDialog (same account, "top level" = the account).
- Permissions: the folder controllers only load the account (READ); `GO\Email\Model\ImapMailbox`
  (createChild, rename, delete, move, truncate, …) requires CREATE itself. The neo menus disable
  these below CREATE, mark as read below delegated, Share/Properties of the account below manage.

### Message grid — `email/message/store`

- Params: `account_id`, `mailbox`, `start`, `limit` (default user max_rows_list), `sort`
  (`from` | `arrival`/`internal_udate` | `date`/`udate` | `subject` | `size`; `from` sorts by To in
  sent items), `dir`, `query` (IMAP SEARCH string built **by the client**), `unread=1`, `flagged=1`,
  `searchIn` (`current` | `recursive` | `all`; `all` uses the server's virtual "All" folder when it
  exists), `action=move` + `messages` (JSON uids) + `to_mailbox` (moves first, needs CREATE),
  `delete_keys` (JSON uids: moved to the trash and marked seen, or deleted in the trash / without
  trash; `deleteSuccess` / `deleteFeedback`).
- Response: `results`, `total`, `unseen`, `permission_level`, `sent` / `drafts` / `trash` (the mailbox
  is that special folder or below it), `deleteConfirm` (no trash or in the trash: ask before
  deleting), `allUids` (with a query: for "move all / delete all" of a search), `multipleFolders`
  (search over folders: rows have their own `mailbox`/`mailboxname`, ExtJS then is read-only).
  No `success` key. With CREATE the store first runs the account's filters on unseen mail and
  expunges.
- Row: `uid` (string), `from`, `to`, `subject` (**HTML-escaped** by the server; in sent/drafts the
  server swaps from and to), `sender` (address), `seen` (bool), `flagged`, `answered`, `forwarded`,
  `deleted`, `has_attachments` (ints), `x_priority`, `size`, `udate` (sent), `internal_udate`
  (arrival), `labels` [{name, color, flag}], `mailbox`, `mailboxname`, `account_id`.
- Columns (MessagesGrid): status icons (unseen dot, answered, forwarded, attachment, priority,
  flag), labels (hidden; colours: neo shows names only, no inline styles), From + Subject in one
  two-line column ("To" in sent items), Date (arrival), Date sent (hidden), Size (hidden). Unseen
  rows bold. Spoofed sender warning (`isSpoofed`: name looks like another address) not ported yet.
- Toolbar: Compose, Refresh, Delete, Show unread, Show flagged, search with type menu
  (`GO.email.search_type`, localStorage `email_search_type`: any/from/subject/to/cc; neo adds body;
  `any` = `TEXT "q"`, server falls back to `OR OR OR FROM SUBJECT TO CC` without FTS), Current /
  All folders, Advanced (SearchDialog: subject, from, to, cc, body, before/since (`BEFORE 5-Nov-2026`),
  flagged, label (`KEYWORD $labelN`), answered, seen, search in current / recursive / all). Quotes
  are stripped from search text (the query is IMAP syntax). Search toolbar "Move all" / "Delete all"
  (via `allUids`) not ported yet.
- Selection actions (MessageContextMenu, card 1 part): Mark as read (`email/message/setFlag`
  flag `Seen`, needs delegated), Mark as unread (clear=1, needs CREATE), Add/Remove flag (`Flagged`,
  delegated), Labels (flag = label keyword `$label1…`, labels from `email/label/store`; editing labels
  is card 4), Move email to… (same account: store `action=move`; other account: `email/message/move`
  from_account_id, to_account_id, from_mailbox, to_mailbox, messages, total — answers the uids still
  to move, call again), Move to spam (`email/message/moveToSpam` account_id, from_mailbox_name,
  mail_uid JSON; creates the folder) / Not spam in the spam folder (`email/message/moveToInbox`
  account_id, mail_uid — one uid, from config `spam_folder` or "Spam"), Delete. Copy to…, View
  source, Print, Forward as attachment, Save as, address book items are card 2.
- Double click: drafts/sent → composer `opendraft`, else MessageDialog. Opening a message marks it
  read (ExtJS after 2 s, unless `do_not_mark_as_read`); neo marks at once after the view loaded.
- Drag rows onto tree folders: neo has no wired drag and drop → "Move email to…" (menu and
  multi-select toolbar). Ctrl+drag copies in ExtJS (`email/account/copyMailTo`, card 2 "Copy to").

### Dev mail server

The dev DB's neotest account (id 4) uses the GreenMail container `greenmail-neo` (network
`groupoffice26_go26`, IMAP 3143, SMTP 3025, delimiter `.`, auth disabled, **in memory**). GreenMail
answers `UNSUBSCRIBE` of a renamed folder with NO, so `email/folder/rename`, `move` and `delete`
report an error after the folder was renamed/moved (the folder then is unsubscribed and hidden).
Real servers (Dovecot) accept it; test those three against Dovecot when it matters.



Cards 2-10 (inventory). Paths are relative to `www/`. Routes are `module/controller/action` (PHP `actionXxx` in `modules/<module>/controller/<Name>Controller.php`), called by ExtJS as `GO.request({url: 'email/message/view', params})` / `GO.url(...)` (POST/GET to `index.php?r=...`). Responses are JSON `{success: bool, feedback?: string, ...}`; a thrown exception gives `success:false` + `feedback`.

## Common: permission model (applies to every card)

- Account ACL levels (`em_accounts.acl_id`, `GO\Base\Model\Acl`): READ=10, **DELEGATED=15** (`Account::ACL_DELEGATED_PERMISSION`, `modules/email/model/Account.php:65`; JS `GO.email.permissionLevels.delegated`, set in `scripts.inc.php:47`), CREATE=20 (UI label "Use account"), WRITE=30, DELETE=40, MANAGE=50. AccountDialog's permission panel only offers read / delegated ("Read only and delegated") / create ("Use account") / manage (`AccountDialog.js:501-508`).
- `Account::model()->findByPk($id)` throws AccessDenied without READ (`go/base/db/ActiveRecord.php:1949`), so every route that loads an account by `account_id` needs at least READ. Other checks: `$account->requirePermissionLevel()` / `checkPermissionLevel()`.
- Saving any legacy ActiveRecord needs WRITE (CREATE for new records, `ActiveRecord.php:3032`). A new Account has no ACL yet, so the **module** permission level counts (`ActiveRecord.php:930-936`): legacy module level is 50 with `mayManage` or admin, else 10 (`go/base/model/Module.php:52-82`). Result: **only admins / users with "manage" on the e-mail module can create accounts**. JS mirrors this with `GO.settings.modules.email.write_permission` (= module level >= 30, `go/base/view/Extjs3.php:171`).
- Aliases, filters and labels inherit the account ACL (`aclField() = 'account.acl_id'`: `model/Alias.php:63`, `model/Filter.php:70`, `model/Label.php:54`).
- Message-level rules used across cards: see the table in Card 2.

## Card 2: Message view

### Files
- `modules/email/MessagePanel.js` (`GO.email.MessagePanel`, XTemplate body view), `MessageDialog.js` (popup window, `GO.email.showMessageDialog(uid, mailbox, account_id, no_max_body_size)`), `LinkedMessagePanel.js` (view of a saved/linked/attached .eml), `MessageContextMenu.js` (grid row menu, also the "more" button in the message toolbar), `AttachmentContextMenu.js`, `AllAttachmentContextMenu.js`, `AddressContextMenu.js`, `LinkAttachmentDialog.js`, `CopyMailToDialog.js`.
- Message toolbar + attachment/compose helpers live in `EmailClient.js` (`messageTbar` 333-466, `GO.email.saveAllAttachments/deleteAllAttachments/saveAttachment/openAttachment` 1108-1320, `GO.email.showMessageAttachment` 1605, `moveToSpam/moveToInbox` 1640-1718).

### Features
- Header: From (mailto link with address menu), Subject, Date, To/CC/BCC lists, avatar from matched contact (`contact` object, `contact_thumb_url`), labels (name + colour), linked items list (open `go.links.LinkDetailWindow`, delete link via `GO.email.unlink` -> JMAP `Link/set destroy`).
- Warnings: "{blocked_images} external images were blocked" + "Click here to unblock" (reloads with `unblock=true`); XSS warning "view the filtered message anyway" (reloads with `filterXSS=true&unblock=true`); "message is larger than can be shown" link -> `showMessageDialog(..., no_max_body_size=true)`.
- Spam bar: in spam folder "Click here if NOT spam" -> `GO.email.moveToInbox`; else "Click here if spam" -> `GO.email.moveToSpam`.
- Attachments row: click opens (`openAttachment`), "more" icon and right-click open AttachmentContextMenu; header "more" icon opens AllAttachmentContextMenu. Right-click on inline image -> AttachmentContextMenu with "Copy image".
- `ul.actions` slot under the header for calendar ITIP buttons.
- Body: `htmlbody` rendered raw, then `Autolinker.link()` client side (`MessagePanel.js:296-303`).
- Toolbar (`EmailClient.js`): back (narrow), Edit (drafts only), Reply, Reply all, Forward, Save as (menu `GO.email.saveAsItems`, from savemailas, hidden when empty), Delete, more-menu (= MessageContextMenu).
- Read receipt: on load, if message unseen, `data.notification` set and account level >= CREATE: auto (`GO.email.alwaysRespondToNotifications`) or `confirm()` -> `email/message/notification` (`EmailClient.js:519-536`).
- Mark as read after 2 s (`markAsRead.defer(2000)`, only if level > READ and account not `do_not_mark_as_read`; `EmailClient.js:631-668`).
- Double-click row: drafts/sent folder -> composer `task:'opendraft'`, otherwise popup MessageDialog (`EmailClient.js:618-629`).
- MessageDialog / LinkedMessagePanel toolbars: Reply, Reply all, Forward, Print (+ LinkedMessagePanel: Add/link button `go.detail.addButton`).
- MessageContextMenu: Edit (draft), Mark as read / unread, Add flag / Remove flag, Labels (checkable sub-menu from `email/label/store` with `forContextMenu=1`), View source, Print, Copy email to..., Move email to..., Forward as attachment, Delete, Move to spam folder, Add senders to... (To/CC/BCC; adds to the open composer or opens a new one), Address list add/delete senders (only with business/newsletters), Save as (savemailas).
- AttachmentContextMenu: Download, Open with (files), Save to personal folder (only if files `mayAccessMainPanel`), Save to item (LinkAttachmentDialog), Copy image (inline img only), smime "Add to SMIME certificates" for `.cer` (Card 8).
- AllAttachmentContextMenu: Download all as zipfile (only >1 attachment and `zip_of_attachments_url`), Delete all attachments (if `delete_all_attachments_url`), Save all to personal folder, Save all to item (files module only, >1 attachment).
- AddressContextMenu (global: any click on a `mailto:` link in the page, `EmailClient.js:1406-1445`): Compose (honours `use_desktop_composer` -> `go.util.mailto`; query string `?subject=&body=` is parsed), Search through GroupOffice (`go.util.search`), Show messages in current folder (`GO.email.searchSender`), Create contact / Add to contact (community addressbook), and "Open: <name>" items for contacts found by e-mail.
- Attachment open (`GO.email.openAttachment`, `EmailClient.js:1209`): `message/rfc822`/`.eml` -> `showMessageAttachment` (LinkedMessagePanel via `email/message/messageAttachment`); `.ics` -> `go.openIcs` (calendar, JMAP `CalendarEvent/loadICS`); `.vcf` -> confirm + JMAP `Contact/loadVCF` then ContactDialog; images -> `GO.files.ImageViewer` with all images; else `GO.files.openEmailAttachment` or `go.util.viewFile(url)`; winmail.dat -> TNEF zip.
- Print: `this.body.print({title: date - sender - subject})` (`MessagePanel.js:225`).
- There is **no "redirect/bounce"** feature in the legacy client (grep finds none). `delegated_cc_enabled` is passed to the composer by Reply/Forward when the account is delegated (`EmailClient.js:377,424`) but EmailComposer never reads it.

### Routes
| Route | Params | Response / notes | Permission |
|---|---|---|---|
| `email/message/view` | `account_id, mailbox, uid`, opt. `password` (smime), `no_max_body_size`, `unblock`, `filterXSS`, `plaintext`, `customHeaders` (csv), `create_blobs`, `create_temporary_attachments` | `Message::toOutputArray` (`model/Message.php:341-487`): `from, sender, to[]/cc[]/bcc[] {email, personal}, reply_to, message_id, to_string, full_from, priority, udate, date, size, seen, flagged, answered, forwarded, notification, labels[{name,color}], attachments[], inlineAttachments[], htmlbody (or plainbody), subject (htmlspecialchars), body_truncated, smime_signed, zip_of_attachments_url, delete_all_attachments_url`; then `uid, mailbox, isDraft, account_id, do_not_mark_as_read, sender_contact_id, sender_company_id, contact_name, contact (Contact array), contact_thumb_url, allow_quicklink, contact_linked_message_id/company_linked_message_id (savemailas), xssDetected, blocked_images, itip {method, event, feedback, recurrenceId}, isInSpamFolder, links[{...link attrs, entity}]`; smime adds `smime_encrypted`, `askPassword`, `path` (`MessageController.php:1326-1407`) | READ via findByPk |
| `email/message/source` | `account_id, mailbox, uid`, `download` | raw RFC822 (`.txt` inline, `.eml` when `download`) via `window.open` | READ |
| `email/message/attachment` | `account_id, mailbox, uid, number, encoding, filename, inline=0/1, token` | binary stream; winmail.dat -> TNEF zip. URL comes ready in `attachment.url` | READ |
| `email/message/zipAllAttachments` | from `zip_of_attachments_url` | zip download | READ |
| `email/message/deleteAllAttachments` | `account_id, mailbox, uid` | `{uid: newUid}`; rewrites the message (delete + append) | CREATE (`MessageController.php:1976`) |
| `email/message/saveAttachment` | `uid, mailbox, number, encoding, type, subtype, account_id, uuencoded_partnumber, folder_id, filename, tmp_file, charset, sender, filepath` | `{success, feedback}` | files folder WRITE (`:1663`); account READ |
| `email/message/saveAllAttachments` | `folder_id, account_id, mailbox, uid, filepath` | | files folder WRITE (`:1768`) |
| `email/message/saveToBlob` | `account_id, mailbox, uid, number, encoding` | `{blob:{id,name,size,type}}` (used by composer drag&drop) | READ |
| `email/message/messageAttachment` | `account_id, mailbox, uid, number, encoding` (+ `filterXSS`) | SavedMessage `toOutputArray` + `path, is_tmp_file` | READ |
| `email/message/setFlag` | `account_id, mailbox, flag (Seen/Flagged/$label), clear 0/1, messages (JSON uids)` | `{success, unseen}` | clear Seen (mark unread) = CREATE, everything else = DELEGATED (`:448`) |
| `email/message/notification` | `account_id, message_to, notification_to, subject` | sends "Read: subject" from matched alias | CREATE (`:76`) |
| `email/message/moveToSpam` | `account_id, from_mailbox_name, mail_uid (JSON)` | echoes JSON itself; creates spam folder if missing; `config.spam_folder` overrides | CREATE (`:2024`) |
| `email/message/moveToInbox` | `account_id, mail_uid` | moves from `config.spam_folder` or 'Spam' to INBOX | CREATE (`:2054`) |
| `email/account/copyMailTo` | `move 0/1, srcMessages JSON [{accountId, mailboxPath, mailUid, seen}], targetAccountId, targetMailboxPath` | `{success}` | target CREATE; source CREATE when move (`AccountController.php:572-579`) |
| `email/account/tree` (CopyMailToDialog) | `permissionLevel=20` + tree `node` | tree nodes | READ |
| `email/message/store` with `delete_keys` (Delete) | JSON uids | `deleteSuccess/deleteFeedback`; moves to trash unless in trash (`MessageController.php:287-310`) | CREATE else `deleteFeedback` |
| `savemailas/linkedEmail/loadLink`, `loadPath`, `loadFile`, `linkContact`, `linkCompany` | | LinkedMessagePanel + "Link e-mail conversation to contact" checkbox | savemailas module is **not in this repo** (unverified) |

### Server side processing in `message/view` (verified)
- HTML sanitising: `StringHelper::convertLinks()` + `sanitizeHtml()` on HTML parts (`model/ImapMessage.php:467-468`, `model/Message.php:425-427`).
- XSS: only when the sender is not a matched contact and folder is not Sent/Drafts: `detectXSS` replaces the body with "Message hidden for security reasons" and `xssDetected=true`; `filterXSS=1` returns `filterXSS()`-ed body (`MessageController.php:1485-1496`).
- External images: unless `unblock`, every `http(s):` URL inside any tag except `<a>` is replaced by `about:blank`, count in `blocked_images` (`:1522-1548`). Not tied to the address book any more (commented out).
- `cid:` references are rewritten to attachment URLs; inline parts go to `inlineAttachments` (`Message.php:450-466`); `smime.p7s` is hidden and sets `smime_signed`.
- ITIP: if community/calendar is installed, `Scheduler::handleIMIP()` fills `itip` (`:1498-1513`). UI: `GO.email.handleITIP(ul.actions, data)` is defined by the GOUI calendar (`go/modules/community/calendar/views/goui/script/Index.ts:186-266`): Accept/Maybe/Decline (or Import when the user is not a participant), "Open Calendar", text per method REQUEST/CANCEL/REPLY/NONE. Default stub in `EmailClient.js:17`.
- `view` event (`$this->fireEvent('view', ...)`) and `ImapMessage 'tooutputarray'` event are the plugin hooks (smime uses the latter).
- Contact match: contact with WRITE permission by sender e-mail (or first To in Sent folder) (`:1429-1483`).

### Gotchas
- `message/view` **writes**: `$imapMessage->autoLink()` creates links to contacts (address book setting `autoLink` on/incl/excl) and `[link:...]` tags, even for READ-only users (`MessageController.php:1349`, `model/ImapMessage.php:154-215`).
- `actionView` only needs READ; the client decides edit/reply visibility from the grid store's `permission_level` (`EmailClient.js:47,526-530`). Reply/Reply all are disabled for read-only unless delegated.
- Spam links in the template use inline `onclick` with `{values.uid}`/`{values.account_id}` and `addSlashes(mailbox)` (`MessagePanel.js:141-148`); do not copy this pattern.
- Attachment list is keyed by DOM ids `attachmentsId_<index>` and `_more_<index>`; inline image lookup matches `token` from the `src` URL (`MessagePanel.js:536-552`).
- `zip_of_attachments_url` is a ready-made URL; `delete_all_attachments_url` is only used as a visibility flag, the action is `email/message/deleteAllAttachments`. After delete-all the message gets a new UID (`result.uid`), the panel reloads that.
- `subject` is HTML-escaped by the server, `from`/`personal` are not (template uses `htmlEncode`).
- `moveToSpam`/`moveToInbox` echo JSON and return nothing; `moveToInbox` hardcodes `config.spam_folder` or 'Spam' as source, ignoring the account spam folder (`MessageController.php:2048-2066`).
- Read receipt confirm uses `window.confirm` (`EmailClient.js:530`).
- Legacy addressbook routes still referenced but the legacy addressbook module does not exist in `www/modules`: `addressbook/contact/handleAttachedVCard` (`LinkedMessagePanel.js:161`, commented), so dead.

## Card 3: Composer

### Files
- `modules/email/EmailComposer.js` (`GO.email.EmailComposer`, a window; instances pooled in `GO.email.composers`), `RecipientCombo.js` (just `go.form.RecipientCombo` with label "To"; store = JMAP `Search/email`, `go/core/views/extjs3/form/RecipientCombo.js:14-15`), `TemplateCombo.js` (`email/template/store`, `permissionLevel` write), `UnknownRecipientsDialog.js`, `FindContactDialog.js` + `ContactsGrid.js` (legacy addressbook routes, dead), `views/Extjs3/TemplateSelectionDialog.js` (used when >10 templates).
- Editor: `views/Extjs3/javascript/base/email/EmailEditorPanel.js` + `EmailEditorAttachmentsView.js` (hidden fields `htmlbody`, `plainbody`, `content_type`, `attachments`, `inlineAttachments`).
- Entry points: `GO.email.showComposer(config)` (`EmailClient.js:1346`), `go.showComposer(cfg)` (`go/core/views/extjs3/Mail.js:11`), `go.util.mailto(cfg)` (`go/core/views/extjs3/util.js:229`), `?mail_to=` URL handled in `scripts.inc.php:51-79`, guest route `email/message/mailto` redirects to `showComposer` (`MessageController.php:47-70`).

### Features
- Fields: To (recipient combo + "+" button opening `go.util.SelectDialog` for Contact/User; JMAP `Contact/get`, `Principal/get`), CC, BCC (same), Subject, From (alias combo, hidden name `alias_id`, store `GO.email.aliasesStore` = `email/alias/store?limit=0`).
- Toolbar: Send (Ctrl+Enter), Save (draft), link button (`go.links.CreateLinkButton`), attach (Upload via `go.util.openFileDialog` -> JMAP blobs; with files module also "Add from personal folder" and "Add from item"), Add recipients menu (show From / CC / BCC), Template button (grouped menu or TemplateSelectionDialog; "Set current template as default for myself / for this email account"), Extra options menu: Request read notification, Priority High/Normal/Low (1/3/5), Use HTML markup (switching reloads content), smime Sign/Encrypt (Card 8).
- Drag & drop: e-mails from the grid -> `email/message/saveToBlob` then attach; files -> `go.Jmap.upload`; pasted images -> data URIs embedded server-side (`go/base/mail/Message.php:422-433`).
- Signature: from alias record `html_signature`/`plain_signature`, inserted above or below (`signature_below_reply`), wrapped in `<div id="EmailSignature">`; swapped by string replace when the From changes (`EmailComposer.js:686-738`).
- Autosave every 120 s to drafts when the body changed (`autoSave`, interval 120000, `EmailComposer.js:740-768`); not for mailings (`addresslist_id`).
- After send: callback, UnknownRecipientsDialog when `unknown_recipients` returned (Add -> ContactDialog prefilled; Edit -> pick contact and append e-mail; "Don't show this window next time" saves `emailSettings.skip_unknown_recipients` via JMAP `User/set`), events `send`/`save`, marks grid record answered/forwarded, `go.Db.store("Link").getUpdates()` when links were added.
- No subject -> `confirm()`; attachments size checked against `GO.settings.config.max_attachment_size`.

### Loading the composer (`show()`, `EmailComposer.js:891-1140`)
- First show: `core/multiRequest` with `requests={aliases:{r:'email/alias/store',limit:0}, templates:{r:'email/template/emailSelection', groupBy:'group_id', account_id?}}`. No alias -> "You didn't configure an e-mail account yet".
- Load URL: `config.loadUrl`, or `email/message/<task>` with task `reply` (`reply_all` = `reply` + `replyAll=true`), `forward`, `opendraft`, `template` (default). Params: `uid, mailbox, account_id, alias_id, template_id, content_type (html|plain), to, cc, bcc, subject, body`, opt. `contact_id`/`company_id` (template tags), `addEmailAsAttachmentList` (JSON [{uid,mailbox}], forward as attachment), `includeAttachments`, `addresslist_id`, `keepHeaders` (template switch), `loadParams` `{is_tmp_file, path}` for saved messages.
- Response: `data {to, cc, bcc, subject, htmlbody|plainbody, attachments[], inlineAttachments[], alias_id, account_id, template_id}` + `sendParams {reply_uid, reply_mailbox, reply_account_id, in_reply_to, forward_uid, forward_mailbox, forward_account_id, references, draft_uid, encrypt_smime}` (`MessageController.php:993-1300`). Reply quoting: `<blockquote>` / `> ` text, header per `full_reply_headers` account option; reply picks the alias that matches the recipients (`_findAliasFromRecipients`, `:1180`).
- Config keys used by callers: `values{to,cc,bcc,subject,body}`, `account_id`, `from`, `uid`, `mailbox`, `task`, `template_id`, `loadUrl`, `loadParams`, `entity`/`entityId`, `contact_id`, `company_id`, `addresslist_id`/`campaign_id`, `addEmailAsAttachmentList`, `includeAttachments`, `blobs[]`, `afterLoad`, `keepLinks`, `move`, `callback`/`scope`.
- Event `dialog_ready` fires 100 ms after load; callers wait for it to add attachments/links (`GO.email.emailFiles`, `EmailClient.js:1488-1524`).

### Send / save
| Route | Params | Response | Permission |
|---|---|---|---|
| `email/message/send` | form: `to, cc, bcc, subject, alias_id, content_type, htmlbody, plainbody, attachments (JSON [{tmp_file\|blobId, fileName, from_file_storage}]), inlineAttachments (JSON [{tmp_file, token, from_file_storage}])` + sendParams: `priority, notification, draft_uid, reply_uid, reply_mailbox, reply_account_id, in_reply_to, references, forward_uid, forward_mailbox, forward_account_id, links (JSON [{toEntity,toId}]), sign_smime, encrypt_smime`, opt. `customHeaders` (only `X-` headers) | `{success, feedback, unknown_recipients[{first_name,middle_name,last_name,email,name}]}` | alias's account CREATE (`MessageController.php:594`); Answered/$Forwarded flag only with DELEGATED on the source account |
| `email/message/save` | same form | `{success, sendParams{draft_uid}}` | CREATE (`:479`); error if account has no Drafts folder |
| `addressbook/sentMailing/send` | when `addresslist_id` (mailings) | | legacy addressbook not in repo: dead |

- Links: `links` param becomes a hidden `[link:base64(server,account,model,id)]` tag in the body; linking happens when saving to Sent (`MessageController.php:521-538, 600-610`).
- Sent copy: `$account->saveToSentItems()`; `ignore_sent_folder` saves into the reply mailbox instead (`:705-716`). Draft `draft_uid` is deleted from Drafts after send (`:719-723`). Last-mailed time stored in `em_contacts_last_mail_times` (`:662-684`).
- Attachments from file storage are read with `File::findReadableByPath` (ACL), temp files from `GO::config()->tmpdir` (`go/base/mail/Message.php:589-614`).

### Settings that drive the composer (`scripts.inc.php`, user settings Card 5)
`GO.email.useHtmlMarkup`, `skipUnknownRecipients`, `alwaysRequestNotification`, `alwaysRespondToNotifications`, `showCCfield`, `showBCCfield`, `showFromField`, `disableAliases` (`config.email_disable_aliases`), `defaultSmtpHost`; plus `go.User.emailSettings.*` (JMAP).

### use_desktop_composer
- `go.showComposer` checks `go.User.emailSettings.use_desktop_composer`; when set (or no email module) it builds a `mailto:` via `go.util.mailto({to, name, body, subject})`; with `loadUrl` it first loads it with `content_type:'plain', template_id:0` and mails `data.to/plainbody/subject` (`Mail.js:13-55`). AddressContextMenu checks the same flag; `GO.email.showComposer` itself does **not**.

### Gotchas
- `config.template_id!='undefined'` compares with the string, so the form load always runs (`EmailComposer.js:1039`).
- `setLinkEntity` is a no-op (`EmailComposer.js:1240-1242`): `entity/entityId` in the config only feed `contact_id` for templates; callers must call `composer.createLinkButton.addLink()` themselves (Reply/Forward and `emailFiles` do).
- Opening a message from the **Sent** folder with double-click uses `task:'opendraft'` (`EmailClient.js:618-627`), which returns `sendParams.draft_uid = uid` (`MessageController.php:948`); send/save then deletes that UID **in the Drafts folder** (`:719-723`, `:503-507`). Avoid carrying `draft_uid` for non-draft folders.
- `addSendersTo` and `fillSingleRecipient` build `"name" <email>` strings by concatenation; recipients are plain comma separated strings, parsed server side (`AddressList`).
- Composer windows are reused (hidden ones), so state (sendParams, attachments) must be reset (`reset()`), and `delegated_cc_enabled` is ignored.
- `go.showComposer({to: [...]})` from the GOUI calendar passes an array as `to` (`CalendarView.ts:79`); behaviour of the combo with an array is (unverified).
- `UnknownRecipientsDialog` "Edit" path is a JMAP contact pick; the old `FindContactDialog`/`ContactsGrid` (routes `addressbook/contact/store`, `addressbook/contact/searchEmail`, `addressbook/contact/mergeEmailWithContact`) and `addressbook/addresslist/addContactsToAddresslist` target the removed legacy addressbook: dead code.
- Form timeout is set to 3000 (seconds) for big attachments (`EmailComposer.js:368`).

## Card 4: Accounts

### Files
`AccountsDialog.js` (window around AccountsGrid), `AccountsGrid.js`, `AccountDialog.js` (tabs), `AliasesDialog.js`/`AliasesGrid.js`/`AliasDialog.js`, `FilterGrid.js`/`FilterDialog.js`, `FoldersDialog.js`, `FolderDialog.js`, `ImapAclDialog.js`/`ImapAclUserDialog.js`, `LabelsGrid.js` + `views/Extjs3/LabelDialog.js`, `MoveOldMailDialog.js`, `SelectAccount.js` (combo xtype `emailaccountcombo`). FolderDialog, ImapAclDialog and MoveOldMailDialog are opened from MailboxContextMenu (card 1).

### AccountsGrid / AccountsDialog
- `email/account/store` with `permissionLevel=30` (WRITE): columns E-mail, Username, Owner (`user_name`), Host, SMTP; search on alias email/name, host, username, smtp_host (`AccountController.php:31-61`). Add and Delete disabled unless `GO.settings.modules.email.write_permission` (`AccountsGrid.js:74,154`). Delete = `email/account/delete` (standard store `delete_keys`, (unverified)).

### AccountDialog tabs and fields
- Properties: User (owner; `GO.form.SelectUser`, **admin only**, `AccountDialog.js:221`), Name, E-mail (disabled when not module-write and `disableAliases`), Signature (textarea), default template (`default_account_template_id`, store `email/template/accountTemplatesStore`), OAuth2 connection (if oauth2client), Extra options: `save_sent`, `ignore_sent_folder`, `do_not_mark_as_read`, `full_reply_headers`, `signature_below_reply`.
- Server tab (disabled without module write): Incoming `host, port, username, store_password, password, imap_encryption (ssl/tls/none -> port 993/143), imap_allow_self_signed, mbroot`; sieve `sieve_port, sieve_usetls` (if sieve); Outgoing `smtp_host, smtp_port, smtp_encryption (port 465/587), smtp_allow_self_signed, force_smtp_login, smtp_auth, smtp_username, store_smtp_password, smtp_password`.
- Folders tab: `sent, trash, drafts, spam` (combos on `email/folder/store` = subscribed folders).
- Filters tab (FilterGrid; replaced by sieve when supported, Card 7), Labels tab (only when `config.email_enable_labels`), Permissions tab (`GO.grid.PermissionsPanel` on `acl_id`).
- Buttons: Aliases (hidden when not module-write and `disableAliases`), Folders (FoldersDialog), Apply, Ok.
- Routes: `email/account/load {id}` -> `data` + `email, name, signature` from the default alias, `smtp_auth`, passwords blanked, `default_account_template_id`, `email_enable_labels`, `acl_id`, `remoteComboTexts.user_id`; plugins add `oauth2_client_id`, smime `cert/always_sign`, sieve `ooo_*`. `email/account/submit {id,...}` -> `{success, id, needs_refresh_token?}`; empty password keeps the old one (`AccountController.php:103-125`); new account creates the default alias, existing one updates alias name/email/signature (`:127-158`).
- New account defaults to the user's name/email/username (`AccountDialog.js:733-737`). Saving with changed IMAP settings tests the connection (`Account::beforeSave`, `model/Account.php:177-200`); passwords are stored encrypted.

### OAuth2 (community/oauth2client)
- `go.modules.community.oauth2client.ClientCombo` (`hiddenName: oauth2_client_id`): on select hides the Incoming/Outgoing tabs, copies IMAP/SMTP host/port/encryption from JMAP `DefaultClient`, password not required. "Refresh token" button opens `go/modules/community/oauth2client/gauth.php/authenticate/<account_id>` in a new window (`AccountDialog.js:43-93`).
- Backend: listeners on AccountController `load`/`submit` and MessageController `beforesend` (`go/modules/community/oauth2client/Module.php:50-58`); stores `oauth2client_account(accountId, oauth2ClientId)`. Submit with oauth2 and no password sets a random password and skips the IMAP check; new accounts return `needs_refresh_token` and `EmailOverrides.js` then shows a "Get a refresh token" alert and clicks the button (`views/extjs3/EmailOverrides.js:38-60`).

### Aliases
- `email/alias/store {account_id}` lists non-default aliases of the account; without `account_id` it lists all aliases of accounts with CREATE (composer From). Record: `id, account_id, from ("name" <email>), name, email, html_signature, plain_signature, signature_below_reply, template_id` (+ smime `has_smime_cert, always_sign`) (`AliasController.php`). AliasDialog = `GO.dialog.TabbedFormDialog` on `email/alias` (load/submit/delete): `name, email, signature`. Permission: account ACL (WRITE to save).

### Filters (non-sieve, client-side IMAP filtering)
- `email/filter/store {account_id}` sorted by priority; FilterDialog on `email/filter`: `field` (from/subject/to/cc), `keyword`, `folder` (target), `mark_as_read`. Drag sort -> `email/filter/saveSort {filters: JSON {id: priority}}`. Filters run when the inbox is listed (`_filterMessages`, only with CREATE, `MessageController.php:240`).
- `saveSort` loads each filter with `findByPk` (READ) and saves (WRITE check on save).

### Folders (FoldersDialog / FolderDialog)
- `email/account/subscribtionsTree {account_id, node}` (all folders with subscribed checkbox). Check/uncheck -> `email/folder/subscribe|unsubscribe {account_id, mailboxs: JSON[]}` (CREATE). Select all / Deselect all. Add -> `email/folder/create {account_id, parent, name}`; inline rename -> `email/folder/rename`; Delete -> `email/folder/delete {account_id, mailbox}` (moves to trash unless `trashable=0`; special folders refused). Mailbox operations need CREATE (`model/ImapMailbox.php:217-325`).
- FolderDialog: `email/folder/load|submit {accountId, mailboxPath, checkUnseen}` toggles the folder in `check_mailboxes` (auto-check for new mail) (`FolderController.php:320-366`); submit saves the account, so needs WRITE.
- MoveOldMailDialog: `email/message/moveOld {account_id, mailbox, target_mailbox, until_date}` moves all mail with arrival before the date (CREATE, `MessageController.php:1854-1899`); target combo `email/folder/store`.

### IMAP ACL (ImapAclDialog / ImapAclUserDialog)
- `email/folder/aclStore {account_id, mailbox, delete_keys?}` -> `results` from `get_acl`; `email/folder/setAcl {account_id, mailbox, identifier, read, write, delete, createmailbox, deletemailbox, admin}`; username combo `email/account/usernames` (usernames of all accounts joined to users). Both need **MANAGE** on the account (`FolderController.php:249-318`).

### Labels
- `email/label/store {account_id}`; LabelDialog on `email/label`: `name, color`. Shown only when `config.email_enable_labels`. Labels are IMAP keywords (`$label1`... `flag` field); set via `email/message/setFlag`.

### SelectAccount
- Combo on `email/account/store`; `setValue` resolves the text via `email/account/display {id}` -> `{data:{username}}`. Used by `modules/sync/Settings.js:76` (`hiddenName:'syncSettings.account_id'`).

### JMAP alternative
- `go/modules/community/email` has a JMAP `Account` entity (`AclOwnerEntity` on `em_accounts`, filters incl. `username`, password setters) and controller, used by oauth2client (`model/Account.php`, `controller/Account.php`). Name of the JMAP entity and its use by clients: (unverified).

### Gotchas
- FoldersDialog rename posts `mailboxs` (JSON array) but `actionRename` reads `$params['mailbox']` (`FoldersDialog.js:101-106` vs `FolderController.php:26-31`): rename from this dialog looks broken (unverified at runtime).
- AccountsGrid only lists accounts with WRITE; a user with only "Use account" does not see the account in the accounts dialog.
- Server tab, Add account, Delete account are gated on the **module** write flag, not on the account ACL; the backend gate for creating is the module level 50 (manage) explained above.
- `email/account/usernames` lists usernames of all users with accounts, any module user can call it (`AccountController.php:518-541`).
- `email/account/savePassword {id, password}` exists (`AccountController.php:543-550`); save needs WRITE.
- Changing IMAP host/username clears and re-tests the connection; oauth2 accounts skip that.

## Card 5: Settings and templates

### User settings (`Settings.js`, `GO.email.SettingsPanel`, registered as `userSettingsPanels` in `EmailClient.js:1404-1408`)
- JMAP `User` property `emailSettings` (`EmailModule::onMap`, model `modules/email/model/UserSettings.php`, values stored in legacy `go_settings` as `email_*`): `defaultTemplateId` (TemplateCombo), `use_html_markup`, `show_from`, `show_cc`, `show_bcc`, `email_show_linked_tasks` (only with savemailas), `use_desktop_composer`, `skip_unknown_recipients`, `always_request_notification`, `always_respond_to_notifications`, `sort_email_addresses_by_time`, plus `font_size`, `notify_new_email` (no UI in this panel).
- Panel also embeds `GO.email.TemplatesGrid`. `onSubmitComplete` refreshes the `GO.email.*` globals.

### Templates
- `TemplatesGrid.js`: `email/template/store` (`permissionLevel` read; columns #, Name, Group, Owner, lock icon when < WRITE), Add (`EmailTemplateDialog`), Delete, Groups (window with `TemplateGroupGrid`). Rows with < WRITE do not open.
- `EmailTemplateDialog.js`: `email/template/load {id, content_type}` / `email/template/submit` (fields `name, subject, group_id` + editor `htmlbody`/attachments; server builds a MIME message and stores it in `content`, `TemplateController.php beforeSubmit/afterLoad`); Permissions tab (`acl_id`); Autodata side panel inserts tags (contact, company, user, custom fields) into the editor.
- `TemplateGroupGrid.js` / `TemplateGroupDialog.js`: `email/templateGroup/store`, form controller `email/templateGroup` (name).
- Composer: `email/template/emailSelection {account_id?, default_template_id?, type: default|default_for_account}` returns templates + a "None" entry with `checked` for the default; setting `default_template_id` stores the user or account default (`TemplateController.php actionEmailSelection`). `email/template/defaultTemplateId {account_id}`, `email/template/accountTemplatesStore` (AccountDialog).
- Models: `GO\Base\Model\Template` (type 0 = e-mail, own ACL), `GO\Base\Model\TemplateGroup`, `DefaultTemplate` (per user), `DefaultTemplateForAccount`.
- Gotchas: `TemplateController::getStoreParams` forces `$params['type']=0` (only e-mail templates). `actionEmailSelection` creates default-template rows on read. `loadTemplate` silently uses an empty template on AccessDenied (`MessageController.php:770-774`). `controller/EmailTemplate.php` is a JMAP controller for a model class that does not exist (comment at line 56): dead.

### System settings
- `SystemSettingsPanel.js` uses `GO.email.TemplateGrid`, which is not defined, and the file is not in `scripts.txt`: dead code. No e-mail system settings panel is active. Server-wide options come from `config.php` (`email_enable_labels`, `email_disable_aliases`, `spam_folder`, `allow_quicklink`, `max_attachment_size`, `sieve_port`, `sieve_usetls`, `cmd_tnef`).

### Address lists (`AddressListDialog.js`, `AddressListGrid.js`)
- Only with business/newsletters (`MessageContextMenu.js:26-45`): checkbox grid of JMAP `AddressList`; finds contact by sender e-mail with JMAP `Contact/query`, creates or updates its `addressLists` (`go.Db.store("Contact").save`). "Delete senders from..." removes it.

### Portlet (summary/start page; `Portlet.js`, `PortletPanel.js`, `PortletSettingsDialog.js`)
- Only when legacy `summary` and `email` are available. Shows message grids for chosen folders: `email/portlet/portletFoldersByUser`, messages via `email/message/store`, settings tree `email/portlet/portletTree`, toggle `email/portlet/enablePortletFolder|disablePortletFolder {account_id, mailbox}` (per user rows in `em_portlet_folders`).

## Card 6: emailfavorites (`go/modules/community/emailfavorites`)

- Backend: JMAP entity `Favoritefolder` (`model/Favoritefolder.php`, table `em_folders_favorites (id, userId, name, account_id, mailbox)`), controller with default `query/get/set/changes`. Filter `userId`. Permission: MANAGE for the owner, 0 for others (`internalGetPermissionLevel`), `canCreate()` always true. Module has no `autoInstall`.
- Frontend (`views/extjs3`, registered `entities:['Favoritefolder']`):
  - `MailboxContextMenuOverride.js`: pushes "Add to favorites" into `GO.email.extraTreeContextMenuItems`; saves `{account_id, userId: go.User.id, mailbox, name}` unless it already exists in the store.
  - `EmailClientOverride.js`: after `GO.email.EmailClient.initComponent`, inserts a sticky `go.grid.GridPanel` (`favoritesGrid`) at index 0 of the accounts tree panel; store filter `{userId: go.User.id}`; hidden when empty. Row click selects the tree node `btoa('f_' + account_id + '_' + mailbox)`, expanding parents. Row menu: Rename (`FavoritefolderDialog`, `go.form.Dialog` with `name`), Delete (`Favoritefolder/set destroy`). Rows are drop targets for messages (`ddGroup 'EmailDD'`): fakes a `beforenodedrop` on the tree node.
  - Both overrides run on `GO.mainLayout 'authenticated'` and require community/emailfavorites and legacy/email.
- Gotchas:
  - `scripts.txt` lists `AccountsTreeOverride.js`, which does not exist in the folder (`views/extjs3/scripts.txt`).
  - `userId` is sent by the client and the model does not force it to the current user; `canCreate()` is `true` (unverified whether set with another userId succeeds).
  - Tree node ids depend on `btoa()` of the raw mailbox name; `btoa` throws on non-Latin1 characters (unverified for UTF-7 IMAP names, which are ASCII).
  - Favorites point to `account_id + mailbox`; rename/delete of the IMAP folder does not update them.

## Card 7: sieve (`www/modules/sieve`)

- Load order (`scripts.txt`): `Overrides.js, SieveDialog.js, OutOfOfficePanel.js, SieveGrid.js, CriteriumGrid.js, CriteriumCreatorDialog.js, Stores.js, ActionGrid.js, ActionCreatorDialog.js`. `ConditionPanel.js` and `VacationDialog.js` are not loaded (dead).
- Plug-in (`Overrides.js`): adds `sieveGrid` ("Filters") and `outOfOfficePanel` tabs to `GO.email.AccountDialog` before the normal FilterGrid, hidden by default. `setAccountId` calls `sieve/sieve/isSupported {account_id}` -> `{supported, server_extensions[], error}`; supported: hide FilterGrid, show sieve tab; Out of office tab only when `vacation` extension. New account: sieve tabs hidden.
- SieveGrid: script combo `sieve/sieve/scripts {account_id, set_active_script_name?}` -> `{active, results[{value,name,active}]}`; "Activate" sets the active script; rules `sieve/sieve/rules {account_id, script_name, delete_keys?}` -> `results[{name, index, script_name, active}]` (the "Out of office" rule is hidden); drag sort -> `sieve/sieve/saveScriptsSortOrder {account_id, sort_order: JSON[old indexes]}`; Add/Delete.
- SieveDialog (rule editor): `sieve/sieve/rule {account_id, script_name, script_index}` -> `data {rule_name, active, join: allof|anyof|any}, criteria[], actions[]`; save `sieve/sieve/submitRules {account_id, script_name, script_index, rule_name, active, join, criteria: JSON, actions: JSON}`; `sieve/sieve/accountAliases {account_id}` -> `data.aliases` (csv) for vacation actions.
- Criteria (`Stores.js`): fields Subject, From, To, size (under/over), body, X-Spam-Flag, List-Unsubscribe, currentdate (before/is/after), custom header; operators contains, notcontains, is, notis, matches, notmatches, exists, notexists. Actions: set_read, fileinto, fileinto_copy, redirect_copy, redirect, vacation, reject, discard, stop. Folder list from `GO.email.subscribedFoldersStore` (`email/folder/store`).
- Out of office (vacation) panel fields: `ooo_activate`, `ooo_deactivate` (dates), `ooo_script_active`, `ooo_message`, `ooo_subject`, `ooo_aliasses` (csv), `ooo_days` (default 3), hidden `ooo_script_name, ooo_rule_name ('Out of office'), ooo_script_index`. Not a separate route: posted with `email/account/submit` and handled by the AccountController `submit` listener `SieveModule::saveOutOfOfficeMessage`; loaded by the `load` listener (`SieveModule.php:24-28, 41-160`).
- Permissions: every sieve route needs **MANAGE** on the account (`SieveController.php:15-22`); OOO load only fills data with MANAGE (`SieveModule.php:43`). OOO save has no own check: it runs after the account submit, which needs WRITE (unverified whether a WRITE-only user can change OOO).
- Gotchas: `isSupported` returns `(string) $e` (full exception text) as `error` to the client (`SieveController.php:52`). Criterion `arg1` must match `[a-z_\-0-9]` (`:166`). Sort-order save re-adds and deletes rules by index, so concurrent edits break order. `account/setSieve` is a CLI-only maintenance action.

## Card 8: smime (`www/modules/smime`)

- Load order: `PluginMessagePanel.js, PluginAccountDialog.js, PluginEmailComposer.js, PublicCertsGrid.js, CertificateDetailWindow.js, AttachmentContextMenuOverride.js`.
- Backend hooks (`SmimeModule::initListeners`): AccountController `load` (adds `cert`, `always_sign` when a valid cert exists) and `submit` (saves `always_sign` in `AccountSettings`); AliasController `store` (adds `has_smime_cert`, `always_sign` per alias); MessageController `beforesend` (sign/encrypt); `ImapMessage 'tooutputarray'` (verify/decrypt) (`EventHandlers.php`).
- Account dialog (`PluginAccountDialog.js`): "SMIME settings" tab: "Always sign messages" (`always_sign`), Upload certificate (PKCS12 + password -> `smime/certificate/upload {account_id, smime_password, cert file}`; empty password refused), grid `smime/certificate/store {account_id}` with Download (`smime/certificate/download {id}`, .p12) and Delete (`smime/certificate/delete {id}`).
- Composer (`PluginEmailComposer.js`): options "Sign with SMIME" / "Encrypt with SMIME" set `sendParams.sign_smime` / `encrypt_smime` ("0"/"1"); enabled only when the From alias `has_smime_cert`; `always_sign` pre-checks Sign; reply to an encrypted message returns `sendParams.encrypt_smime`. `beforesendmail` asks the certificate password (`GO.dialog.PasswordDialog`) unless `GO.smime.passwordsInSession[account_id]`; checked with `smime/certificate/checkPassword {account_id, password}` -> `{passwordCorrect}`, which stores it in the PHP session (`model/Certificate.php:123-130`).
- Send: sign with the latest cert + session password; encrypt needs a public cert for every recipient from `smime_public_certs` of the current user, else error naming the missing addresses (`EventHandlers.php:229-281`).
- Message view (`PluginMessagePanel.js`): encrypted message -> server returns `askPassword:true` until the session has the password; MessagePanel shows the PasswordDialog and reloads `email/message/view` with `password` (`MessagePanel.js:305-337`; server stores it, `EventHandlers.php:129-138`). Shows "This message is encrypted." and, for signed messages, a clickable "digitally signed" bar -> `smime/publicCertificate/verify {uid, account_id, mailbox, filepath, email, cert_id?}` -> `data {valid, emails[], oscp?, ...}`, rendered by `CertificateDetailWindow`; verify also imports the sender's public cert. Print from the context menu verifies first.
- Public certificates: messages-grid settings menu "Public SMIME certificates" (`PublicCertsGrid.js:154-169`): `smime/publicCertificate/store` (current user's), Import (upload -> `smime/publicCertificate/import {blobId, email}`), Delete, double-click verify. Attachment menu "Add to SMIME certificates" for `.cer` -> `smime/publicCertificate/importAttachment {account_id, mailbox, uid, number, encoding, sender}`.
- Permissions: certificates follow the account ACL: READ to read/use, WRITE to change (`model/Certificate.php:51-68`); `store`/`checkPassword` load the account first (READ). Public certs are per user (`user_id = GO::user()->id`).
- Gotchas: the password lives in the server session per account (`GO::session()->values['smime']['passwords']`) and the client only tracks a boolean; decrypted messages are cached as temp files and later calls must pass `filepath`/`path` (save attachment, verify). `smime_signed` is also set when a `smime.p7s` part is present (`Message.php:457-459`).

## Card 9: Cross-module callers

| Caller (file:line) | Calls | Config |
|---|---|---|
| `go/core/views/extjs3/Mail.js:11` | `go.showComposer(cfg)` -> `GO.email.showComposer` or `go.util.mailto` | `{to, name, body, subject}` or `{loadUrl, loadParams}`; `values` built from them |
| `go/core/views/extjs3/util.js:229` | `go.util.mailto({to,name,body,subject})` | `window.open("mailto:...", "_self")` |
| `go/modules/community/addressbook/views/extjs3/ContactDetail.js:87` | `go.showComposer` on e-mail address click | `{to, name, entity:"Contact", entityId}` |
| `go/modules/community/addressbook/views/extjs3/ContactDetail.js:379` | `getEmailComposerConfig()` used by `GO.email.emailFiles` | resolves `{entity:"Contact", entityId, values:{to:'"name" <email>'}}` |
| `go/modules/community/addressbook/views/extjs3/ContactContextMenu.js:91` | `GO.email.showComposer` after JMAP `Contact/export` (vcf) | `{blobs:[blob]}` |
| `go/modules/community/calendar/views/goui/script/ParticipantField.ts:71` | `go.showComposer` "Write email" | `{to: email}` |
| `go/modules/community/calendar/views/goui/script/CalendarView.ts:79` | `go.showComposer` mail participants | `{to: [emails]}` (array) |
| `go/modules/community/calendar/views/goui/script/Index.ts:150-266` | defines `go.openIcs`, `go.openEventWindow`, `GO.email.handleITIP` | ITIP buttons in message view; `.ics` attachments |
| `go/modules/community/oauth2client/views/extjs3/EmailOverrides.js` | overrides `GO.email.AccountDialog.loadAccount/save` | `email/account/load|submit`, refresh token flow |
| `go/core/views/extjs3/detail/AddButton.js:181` | skips `show()` for `GO.email.EmailComposer` link windows | link "add new e-mail" (linkWindow from another module, savemailas (unverified)) |
| `go/core/views/extjs3/detail/AddButton.js:250-258` | "E-mail files" item when a link config titled "E-mail" exists | `GO.email.openFolderTree(filesFolderId, filesFolderId, detailView)` |
| `views/goui/groupoffice-core/script/components/links/AddButton.ts:126` | same composer check for GOUI detail add button | |
| `views/Extjs3/javascript/common.js:234` / `EmailClient.js:1450-1486` | `GO.newMenuItems` "Email files" on legacy detail panels | file -> `files/file/display` then `GO.email.emailFiles(data, panel)`; other model -> `files/folder/checkModelFolder` then `openFolderTree` |
| `views/Extjs3/javascript/Export.js:66` | `GO.email.showComposer` "E-mail" export | `{loadUrl: BaseHref+'json.php', loadParams}` |
| `views/Extjs3/javascript/MainLayout.js:843` | Help menu when support link is an e-mail and module read permission | `{values:{to: support_link}}` |
| `views/Extjs3/javascript/base/email/EmailEditorPanel.js:494,567` | composer helpers | `GO.email.LinkAttachmentDialog` ("Add from item"), `email/message/saveToBlob` |
| `modules/files/FileBrowser.js:1719-1735` | `GO.email.emailFiles(files)` / `GO.email.openFolderTree(id)` for folders | file records `{name, path, size, type, extension}` |
| `modules/files/FilePanel.js:95` | `GO.email.emailFiles([this.data])` | |
| `modules/files/ContextMenu.js:297` | fires `email_files` -> FileBrowser.emailFiles | |
| `modules/files/ExpireDateDialog.js:55` | `go.showComposer` e-mail download link | `{loadUrl: 'files/file/emailDownloadLink', loadParams:{ids, expire_time, delete_when_expired}}` |
| `modules/summary/AnnouncementsViewGrid.js:88` | `GO.email.addressContextMenu.showAt(xy, email)` | |
| `modules/sync/Settings.js:76` | `new GO.email.SelectAccount` | `hiddenName:'syncSettings.account_id'`, hidden without module read |
| `modules/sieve/ActionCreatorDialog.js:248,324` | `GO.email.subscribedFoldersStore` | needs AccountDialog loaded first |
| `modules/smime/*.js` | overrides `GO.email.MessagePanel`, `MessageContextMenu`, `AttachmentContextMenu`, `AccountDialog`, `EmailComposer`, `MessagesGrid` | Card 8 |
| `go/modules/community/emailfavorites/views/extjs3/*` | overrides `GO.email.EmailClient`, pushes `GO.email.extraTreeContextMenuItems` | Card 6 |

- No callers found for tickets, projects or other business modules in this repo (they are not in `www/go/modules` here; (unverified) for external business/pro repos). savemailas (`GO.email.saveAsItems`, `savemailas/linkedEmail/*`, LinkedEmail entity) is also external.
- Global API to keep for other modules: `GO.email.showComposer`, `go.showComposer`, `GO.email.emailFiles`, `GO.email.openFolderTree`, `GO.email.handleITIP`, `GO.email.addressContextMenu`, `GO.email.extraTreeContextMenuItems`, `GO.email.saveAsItems`, `GO.email.composers`, `GO.email.EmailComposer` (instanceof checks), `GO.email.SelectAccount`, `GO.email.subscribedFoldersStore`, `GO.email.showMessageAttachment`, `GO.email.searchSender`.

## Card 10: Integration and leftovers

- `scripts.txt` load order (`modules/email/scripts.txt`): AliasesDialog, AliasDialog, AliasesGrid, FoldersDialog, AccountDialog, SearchDialog, MessagePanel, AccountsDialog, AccountsGrid, MessagesGrid, AccountsTree, UnknownRecipientsDialog, SelectAccount, EmailComposer, AddressContextMenu, AttachmentContextMenu, AllAttachmentContextMenu, Settings, LinkedMessagePanel, LinkAttachmentDialog, TemplateGroupDialog, TemplateGroupGrid, EmailClient, ContactsGrid, FindContactDialog, AddressListDialog, AddressListGrid, MessageDialog, ImapAclDialog, ImapAclUserDialog, MoveOldMailDialog, MailboxContextMenu, AccountContextMenu, FolderDialog, FilterDialog, FilterGrid, LabelsGrid, PortletPanel, PortletSettingsDialog, Portlet, CopyMailToDialog, RecipientCombo, views/Extjs3/LabelDialog, views/Extjs3/TemplateGridPanel, views/Extjs3/TemplateSelectionDialog, TemplatesGrid, EmailTemplateDialog, TemplateCombo, MessageContextMenu. Not loaded: `SystemSettingsPanel.js`.
- `scripts.inc.php` injects globals per user: `GO.email.defaultSmtpHost`, `useHtmlMarkup`, `skipUnknownRecipients`, `alwaysRequestNotification`, `alwaysRespondToNotifications`, `sievePortValue`, `sieveUseTlsValue`, `permissionLevels={delegated:15}`, `showCCfield`, `showBCCfield`, `showFromField`, `disableAliases`; handles `?mail_to=mailto:...` by opening the composer on ready.
- Module registration: `go.Modules.register("legacy", "email", {mainPanel: GO.email.EmailClient, title: "E-mail", userSettingsPanels: ["GO.email.SettingsPanel"]})` (`EmailClient.js:1404`).
- `EmailModule.php`: depends on `community/addressbook`; `autoInstall` true; sort order 10. Listeners: legacy ReminderController `reminderdisplay` ("You have {new} new e-mail(s)"), legacy User `delete` -> delete the user's accounts; new: `User` mapping `emailSettings` (hasOne `UserSettings`), `App::EVENT_USER_MAILER` -> `getUserMailer($email)` (core mail sent "as" a user's account), MCP tool provider when business/mcp is available (`EmailModule.php:37-135`).
- MCP tools (`modules/email/mcp`, `EmailToolProvider`): `email_mailboxes` (accounts + folders + unread), `email_query` (search a folder, `unreadOnly` etc.), `email_get` (headers, text, attachment list), `email_draft` (save a draft, not send). Access: READ on the account, CREATE for drafts (`mcp/EmailTool.php:38`, `EmailToolProvider.php:43`).
- Other controllers: `RegisterController` (`downloadWinXP`/`downloadWin7`: .reg files registering GroupOffice as mailto handler via `email/message/mailto`), `ResponsiveController::actionLoad` (unverified purpose), `MessageController::actionTestSearch`, `actionGet` (view wrapped in `data.message.attributes`), `actionDelete` (no-op returning success).
- Address book integration: auto-link setting lives in the address book module settings (`go/modules/community/addressbook/model/Settings.php`, `autoLink` on/off/incl/excl + book ids), used by `ImapMessage::autoLink()` on every view.
- Language: `modules/email/language/en.php` had only `name` and `description`; the neo strings that were new (no translation in the module or core) were added to `en.php` by card 10, with nl, de and cs. Translations: 34 language files, e.g. nl 366, de 381, cs 367 entries. sieve: 24 language files (`en.php` 3 keys), smime `en.php` 2 keys, emailfavorites `en.php` 2 keys. Many strings use `t("...", "email")`; some core strings (`t("Delete")`).
- Install: `modules/email/install/install.sql`, `updates.inc.php` + `updatescripts/` (legacy update mechanism, no `updates.php`).
- Themes/CSS: `modules/email/themes/Default` (legacy styles for message panel, `em-*`, `message-*` classes); smime and sieve have their own `themes`.
- Dead or external references found: legacy addressbook routes (`addressbook/*`), savemailas routes/entity, `SystemSettingsPanel.js`, `controller/EmailTemplate.php` (JMAP controller for a missing model), sieve `ConditionPanel.js`/`VacationDialog.js`, emailfavorites `AccountsTreeOverride.js` in scripts.txt.
