# neo webclient: parity with GO 26.x (audit 2026-11-19)

What the neo webclient (`www/views/neo`, module `views/neo`) still lacks compared with
the 26.x client (GOUI `views/goui`, ExtJS `views/extjs3`). Only gaps are listed;
features that are present and complete are counted per module.

Status: **fixed** = fixed in this audit (branch
`task/20261119-011401-neo-ui-parity-audit-of-converted-modules`); **card** = larger
gap with a board card (title in the last section); **open** = not fixed, no card of
its own (covered by a shared core card or not worth one).

Paths: module paths are relative to the module's `views/` folder
(`www/go/modules/community/<module>/views/`), core paths start with `www/`.

## Shared core gaps

These show up in several modules; each has one board card.

| Gap | Where it shows | 26.x ref | Status |
|---|---|---|---|
| Print of the detail panel (no print helper in `www/views/neo/src`) | notes, tasks, contacts (detail more menu / context menu) | goui/script/NoteDetail.ts:69, TaskDetail.ts:213; addressbook extjs3/ContactContextMenu.js:66 | fixed (`src/print.mjs`) |
| "New linked item" from another entity's detail (`linkWindow` registry) | notes, tasks, contacts, all detail panels | notes goui/script/Index.ts:96-108; tasks extjs3/Module.js:16; addressbook extjs3/ContactDetail.js:344 | fixed (ModuleRegistry `linkWindows`, `AddLinkButton` menu) |
| Saved filter types other than string/date/number (select, principal, combo, link entity, custom fields, input variables) | contacts (type, gender, address book, groups, has e-mail…), tasks (responsible, list, progress), notes (has links to) | addressbook extjs3/Module.js:98-320; tasks extjs3/Module.js:90-140; notes goui/script/Index.ts:63 | card "neo-ui: FilterDialog select/principal/link/custom field filters" |
| Grid group headers (`groupBy`) | tasks grid per list, task lists by grouping | tasks goui/script/TaskGrid.ts:289; extjs3/TasklistsGrid.js:15 | fixed: `GO.grid.Grid` `groupBy`, `GO.list.TextList` `groupField` (no collapsing) |
| Custom field columns in grids | contacts, tasks, notes | www/go/core/views/extjs3/grid/GridPanel.js:31, data/StoreTrait.js:98 | done: `GO.grid.Grid` `customFieldsEntity` |
| `name:value` search syntax in the toolbar search | multi_instance (adminEmail, isTrial…), any ExtJS tbsearch with `filters` | multi_instance extjs3/Module.js:8-58 | open (core decision, see card "neo-ui: FilterDialog …") |

## addressbook

Present and complete: about 60 (four nav views, tree with checkboxes and menus, saved
filters, toolbar and more menu with vCard/CSV/XLSX/JSON import, export with column
chooser, labels, duplicates, merge, batch edit, star, all ExtJS columns, context menu,
full detail, dialogs, three settings cards, birthdays portlet, quick add, routes).

| Area | 26.x feature | 26.x ref | neo | Status |
|---|---|---|---|---|
| Drag and drop | Drag contacts onto an address book (move) or a group (add) | extjs3/MainPanel.js:265, 701-797 | missing | fixed |
| Move confirm | Confirm a move only when `confirmOnMove` is set | extjs3/MainPanel.js:791 | always asks | fixed |
| Keyboard | Enter opens the edit dialog, Delete / Ctrl+Backspace deletes | extjs3/MainPanel.js:671; www/go/core/views/extjs3/grid/GridTrait.js:307 | missing | fixed |
| Grid | Own column state for the organizations view (`company-grid`) | extjs3/ContactGrid.js:94 | one `contact-grid` state | fixed |
| Saved filters | "Modified by", "Created by" | extjs3/Module.js:82-95 | missing | fixed |
| Saved filters | Type, gender, address book, is user, in group, has e-mail/phone/org, link, custom fields | extjs3/Module.js:98-320 | missing (FilterDialog types) | card "neo-ui: FilterDialog …" |
| Grid | Custom field columns | www/go/core/views/extjs3/grid/GridPanel.js:31 | done (`customFieldsEntity: 'Contact'`) | – |
| Contact dialog | Organizations autocomplete from existing organizations | extjs3/ContactDialog.js:274 | plain ChipsField, exact name only | fixed |
| Contact dialog | Language combo | extjs3/ContactDialog.js:333 | missing | fixed |
| Contact dialog | ICD combo (per country) | extjs3/ContactDialog.js:84, ICDCombo.js | missing | card "neo-ui: addressbook ICD combo and MultiContact custom field" |
| Custom field type | MultiContact | extjs3/customfield/MultiContact.js | missing in `www/views/neo/src/customfields/types.mjs` | card "neo-ui: addressbook ICD combo and MultiContact custom field" |
| Context menu | Print | extjs3/ContactContextMenu.js:66 | missing | fixed |
| Detail | "+" new linked contact/organization | extjs3/ContactDetail.js:344 | done | fixed |

## calendar

No `views/extjs3`; compared with GOUI only. Present and complete: about 75 (all 7
views, toolbar, invitations inbox, print submenu, resources, mini date picker with
ranges, saved views, calendar list and menu with ICS import/export, holiday/task/
birthday providers, categories, every event dialog field, RSVP, detail, context menus,
Delete key, drag/resize/create, recurring prompts, iTIP, 10 of 14 preferences,
calendar/category/resource/subscribe/webcal dialogs).

| Area | 26.x feature | 26.x ref | neo | Status |
|---|---|---|---|---|
| Preferences | "Show event in category color" | goui/script/PreferencesPanel.ts:55, CalendarItem.ts:293 | missing | fixed |
| Preferences / print | "Print week and workweek in a grid with hours" | goui/script/PreferencesPanel.ts:57, Main.ts:503 | missing | fixed |
| Preferences | "Mark invitation / updates as read and archive" | goui/script/PreferencesPanel.ts:99-111 | missing | fixed |
| Preferences | Help texts under the fields | goui/script/PreferencesPanel.ts:59,61,100,108 | missing | fixed |
| Context menu | "Paste '{title}' at {date}", "Paste at original time" | goui/script/CalendarView.ts:176-258, CalendarItem.ts:1060 | plain "Paste" | card "neo-ui: calendar event detail, participants and paste" |
| Delete / RSVP | Deleting an invitation declines it; recurring: "Decline this instance / entire series" | goui/script/CalendarItem.ts:1113-1150 | destroys it | fixed |
| Saved views | Opening a view doesn't change `isVisible`; "Close views" bar restores the route | goui/script/Main.ts:414-440, 571 | sets `isVisible` on the server, no close bar | card "neo-ui: calendar event detail, participants and paste" |
| Event detail | Move to another calendar inline | goui/script/EventDetail.ts:121-147 | missing | card "neo-ui: calendar event detail, participants and paste" |
| Event detail | Edit alerts inline | goui/script/EventDetail.ts:60-99 | read-only | card "neo-ui: calendar event detail, participants and paste" |
| Event detail | Change organizer (`mayChangeOrganizer`) | goui/script/EventDetail.ts:198-293 | missing | card "neo-ui: calendar event detail, participants and paste" |
| Event detail | Print | goui/script/EventDetail.ts:246 | missing | fixed |
| Participants | "Add attendees" with RecipientPicker | goui/script/ParticipantField.ts:78-93 | missing | card "neo-ui: calendar event detail, participants and paste" |
| Participants | Booked resource makes the field invalid | goui/script/ParticipantField.ts:207 | red row only, save not blocked | card "neo-ui: calendar event detail, participants and paste" |
| Event dialog | New linked event takes the item's name as title | goui/script/EventWindow.ts:402 | done (calendar `linkWindow.mjs`) | fixed |
| Filter panel | "Calendars" filter | goui/script/Index.ts:302-329 | missing | card "neo-ui: FilterDialog …" |
| Links | New event from another item (contact becomes participant) | goui/script/Index.ts:331-357 | done | fixed |
| Links | "Upcoming / Past appointments" cards in linked details | goui/script/Index.ts:358-384 | done: `GO.link.LinkListCard` via ModuleRegistry `linkDetailCards` | fixed |
| Main menu | Badge with open invitations count | goui/script/Index.ts:403-413 | toolbar inbox only | fixed |
| Views | Rich hover tooltip (`showTooltips`) | goui/script/CalendarView.ts:318 | plain `title` | card "neo-ui: calendar event detail, participants and paste" |
| Views | Swipe to previous/next period | goui/script/Main.ts:327,378 | missing | card "neo-ui: calendar swipe and availability drag" |
| Availability | Drag the event on the timeline | goui/script/AvailabilityWindow.ts:61-96 | click only | card "neo-ui: calendar swipe and availability drag" |
| Participant status | "Invite not sent yet" | goui/script/Index.ts:137 | key misspelled "Invite not send yet" | fixed |

## tasks

Present and complete: 26 (schedule filters, show completed, mine/unassigned, lists
with create/subscribe/edit/delete, categories, FilterPanel, search, GOUI columns,
complete checkbox, multi-select merge/delete/batch edit, export, TaskDialog with
recurrence, alerts, custom fields and links, detail with progress, assign me,
continue task, comments, files, links, history; settings, portlet, quick add).

| Area | 26.x feature | 26.x ref | neo | Status |
|---|---|---|---|---|
| More menu | Import (choose a list or list id from CSV) | goui/script/Main.ts:387, ImportTaskDialog.ts | only Export | card "neo-ui: tasks import" |
| Grid | Priority and Location columns (hidden by default) | extjs3/TaskGrid.js:206-220, 322 | missing | fixed |
| Drag and drop | Drag tasks onto a list to move them | goui/script/Main.ts:169, 319-336 | missing | fixed |
| List dialog | "Sync to device", "Show in calendar", owner (admin) | extjs3/TasklistDialog.js:43-49 | missing | fixed |
| Grid | Group headers per list | goui/script/TaskGrid.ts:289 | sorted only | fixed (headers can't be collapsed) |
| West | Lists grouped by TaskListGrouping | extjs3/TasklistsGrid.js:15 | flat list | fixed |
| Saved filters | Created by, modified by, responsible, list, progress | extjs3/Module.js:90-140 | missing | card "neo-ui: FilterDialog …" |
| Detail | Print | goui/script/TaskDetail.ts:213 | missing | fixed |
| Links | "Incomplete / Completed tasks" cards with row menu in other details | extjs3/TaskLinkDetail.js | done: `GO.tasks.TaskLinkCard` via ModuleRegistry `linkDetailCards` | fixed |
| Links | New linked task from another entity | extjs3/Module.js:16 | done | fixed |
| Projects | Project column, combo, detail link (business/projects3) | goui/script/TaskGrid.ts:171, TaskDialog.ts:130 | missing; business modules not in this checkout | open (with the projects3 neo port) |

## notes

Present and complete: 17 (notebooks with select-all, search, menus, sharing;
FilterPanel, search, all columns, multi-select delete and batch edit, export,
HTML/Markdown, image zoom, full detail, settings, deep link, quick add).

| Area | 26.x feature | 26.x ref | neo | Status |
|---|---|---|---|---|
| Encryption | Encrypt toggle with password in the dialog, decrypt prompt in detail and dialog | goui/script/NoteDialog.ts:54,87-144, NoteDetail.ts:104, Encrypt.ts | `notes/views/neo/view/Encrypt.mjs` (same format); dialog decrypts on load (last password, else asks; cancel closes), encrypts on save, lock off saves plain text; detail decrypts on click (last password silently); old server-encrypted notes (`password`, {GOCRYPT}) read through Note/decrypt, not editable | fixed |
| More menu | Import CSV/XLSX/JSON | goui/script/Main.ts:244 | only Export | fixed |
| Saved filters | Modified by, Created by | goui/script/Index.ts:79,89 | missing | fixed |
| Keyboard | Delete key deletes the selected notes | goui/script/NoteGrid.ts:75 | missing | fixed |
| Notebook menu | Delete also needs `mayChangeNoteBooks` | goui/script/Main.ts:102 | only MANAGE checked | fixed |
| HTML editor | Pasted images uploaded as blobs | goui/script/NoteDialog.ts:171 | HtmlField `imageUpload`: paste, drop and the image button upload blobs (`data-blob-id` + download URL); `blobImages()` shows GOUI-saved `blob:` images; Note model `content` type Html (neo `String` stripped all tags in the detail) | fixed |
| Saved filters | Has links to… | goui/script/Index.ts:63 | missing | card "neo-ui: FilterDialog …" |
| Detail | Print | goui/script/NoteDetail.ts:69 | missing | fixed |

## bookmarks

Present and complete: 14.

| Area | 26.x feature | 26.x ref | neo | Status |
|---|---|---|---|---|
| Behave as module | Menu icon is the bookmark's logo | extjs3/Module.js:24-30 | Material icon `bookmark` | open |

## Small modules

No gaps: dokuwiki, imapauthenticator, ldapauthenticator, jitsimeet, otp, pwned, wopi
(the generic files handler opens the WOPI URL, `modules/files/views/neo/fileHandlers.mjs:75`).

| Module | Area | 26.x feature | 26.x ref | neo | Status |
|---|---|---|---|---|---|
| apikeys | Key dialog | New key's token is shown once after create, with copy | goui/script/KeyDialog.ts:30-60 | never shown: "View access token" reads `accessToken`, which `Key/get` always nulls (`model/Key.php:59`) | fixed |
| davclient | Accounts | Only the user's own accounts (`owner` filter) | goui/script/SystemSettings.ts:17 | admins see everyone's | fixed |
| davclient | Sync action | Error message on a failed sync | goui/script/SystemSettings.ts:41 | ignored | fixed |
| davclient | Collections | `lastError` as tooltip of the warning | goui/script/AccountWindow.ts:45 | "⚠" only | fixed |
| davclient | Account form | "Every 15 minutes" | goui/script/AccountWindow.ts:31 | key "Every quarter" (translated as a quarter year) | fixed |
| history (core) | Changes dialog | Translated labels Date, Changes, Name, Old, New, No changes | goui/script/HistoryDetailWindow.ts:23,64,102 | hardcoded English | fixed |
| history | Module page | Action and entity type lists in the west panel | goui/script/Main.ts | page stayed empty: the local list stores had string keys without a model, neo gave the records ids -1..-8 and CheckList crashed (`isRecord`) | fixed |
| history, comments, files | Detail cards | Cards only for users with the module | goui/script/*Panel.ts (module check) | shown to everyone, "Forbidden" for users without the module | fixed (`capability` config of `www/views/neo/src/detail/Card.mjs`) |
| maildomains | Domain dialog | Mailbox defaults `defaultFts`, `defaultAutoExpunge` | goui/script/DomainDialog.ts:85-101 | missing | fixed |
| maildomains | Mailbox dialog | Minimum length message `{min}` | goui/script/MailboxDialog.ts:80 | key with `{max}`, never translated | fixed |
| multi_instance | Row menu | Login as administrator (token POSTed in a popup) | extjs3/MainPanel.js:250-295 | missing | card "neo-ui: multi_instance login as administrator" |
| multi_instance | Search | `name:value` field filters | extjs3/Module.js:8-58 | text only | open (core, see shared gaps) |
| oauth2client | Login | "Sign in with {name}" buttons for OpenID clients | Module.php:60-90 | missing | fixed |
| oidc | Client dialog | Redirect URI label translated, copy button | goui/script/OIDConnectClientDialog.ts:45 | hardcoded label, no copy | fixed |

## Core screens

The 26.x reference is ExtJS (`www/go/core/views/extjs3`, "x/" below); GOUI core has no
settings or admin screens. neo paths "n/" = `www/views/neo/src/`.

### My account

Present: look & feel (all formats, theme, start module, shortcuts, reset state),
sounds, "Visible to", groups, custom field tabs, module cards, current-password prompt,
2FA (otp).

| Area | 26.x feature | 26.x ref | neo | Status |
|---|---|---|---|---|
| Account | Avatar upload (`avatarId`) | x/usersettings/AccountSettingsPanel.js:35 | missing | card "neo-ui: My account avatar, space used, password generator, local user, mail notification" |
| Account | "Space used" (`disk_usage`) | x/usersettings/AccountSettingsPanel.js:112 | missing | card "neo-ui: My account avatar, space used, password generator, local user, mail notification" |
| Password | Password generator, `passwordMinLength` | x/usersettings/AccountSettingsPanel.js:133-150 | two plain fields | card "neo-ui: My account avatar, space used, password generator, local user, mail notification" |
| Password | "Convert to local user" for external users | x/usersettings/AccountSettingsPanel.js:158-190 | text only | card "neo-ui: My account avatar, space used, password generator, local user, mail notification" |
| Security | Authorized clients, "Logout all" | x/usersettings/AccountSettingsPanel.js:197-275 | missing | card "neo-ui: My account authorized clients and app passwords" |
| Security | App passwords | x/usersettings/AppPasswordsFieldset.js, AppPasswordDialog.js | missing | card "neo-ui: My account authorized clients and app passwords" |
| Notifications | "Create desktop notification for new e-mails" | x/usersettings/NotificationPanel.js:23 | missing | card "neo-ui: My account avatar, space used, password generator, local user, mail notification" |

### System settings

Present: General, Appearance, Notifications/SMTP with test, Authentication, Users,
Groups, Custom fields, Default permissions, Modules, module cards.

| Area | 26.x feature | 26.x ref | neo | Status |
|---|---|---|---|---|
| Tools | System check, database check, rebuild search index, principals, duplicates, file system / search sync, holiday cache | x/systemsettings/Dialog.js:135; x/tools/SystemSettingsTools.js | systemsettings/ToolsPanel.mjs | done (holiday cache not ported: needs the legacy calendar module, which 26.x no longer registers, so 26.x never shows it either) |
| OAuth | OAuth 2.0 clients | x/oauth/SystemSettingsPanel.js | missing | card "neo-ui: System settings OAuth 2.0 clients and cron tabs" |
| Cron | Task scheduler (grid, dialog with parameters) | x/cron/SystemSettingsCronGrid.js, CronDialog.js | missing | card "neo-ui: System settings OAuth 2.0 clients and cron tabs" |
| Modules | Trial license dialog | x/modules/SystemSettingsModuleGrid.js:69, x/license/LicenseDialog.js | missing | card "neo-ui: System settings modules license and sort order" |
| Modules | Module sort order | x/modules/ModuleSortWindow.js | missing | card "neo-ui: System settings modules license and sort order" |
| Authentication | "Force app passwords" | x/systemsettings/AuthenticationPanel.js:49 | missing | open (with the app passwords card) |

### Users

Present: all columns, show disabled, search, create (generator, default groups,
hook), user defaults, import, export, edit, login as, archive, delete.

| Area | 26.x feature | 26.x ref | neo | Status |
|---|---|---|---|---|
| More menu | Permissions overview (AclOverviewGrid) | x/users/SystemSettingsUserGrid.js:226; x/permissions/AclOverviewGrid.js | `src/permissions/AclOverviewDialog.mjs` (admins) | done (card "neo-ui: users permissions overview") |
| Grid | Delete several users (multi-select, Delete key) | x/grid/GridTrait.js:12,318 | one row only | fixed |

### Groups

| Area | 26.x feature | 26.x ref | neo | Status |
|---|---|---|---|---|
| Grid | Delete several groups | x/grid/GridTrait.js | one row only | fixed |
| Members | Full member list window from a SharePanel group | x/permissions/SharePanel.js:192; x/groups/GroupMemberWindow.js | first 3 names + "and N more" | card "neo-ui: group member list window" |

### Custom fields

All 18 field types and their admin options are present, plus JSON export/import.
(`allowDescription` is commented out in 26.x too: Attachments always have a description.)

| Area | 26.x feature | 26.x ref | neo | Status |
|---|---|---|---|---|
| Conditions | `relatedFieldCondition`, conditionally required/hidden evaluated on the form | x/customfields/type/Text.js:78-103,218-250 | editable in admin only | card "neo-ui: custom field conditions on forms" |
| Field sets | Field set nested in a tab (`parentFieldSetId`) | x/customfields/FormFieldSet.js:27 | below the tab's fields, own filter and conditions | done |
| Attachments | Form editor, download links, `allowDescription` | x/customfields/type/Attachments.js | `AttachmentsField` with description, single/multiple, accept; links or thumbnails | done |
| Data / Template | Readable JSON lines / textarea | x/customfields/type/Data.js:28, TemplateField.js | JSON as lines and lists; template text read-only | done |
| Ordering | Drag and drop of field sets and fields | x/customfields/EntityPanel.js:300 | up/down buttons | open (works; needs sortable lists in core) |

## Board cards

Backlog cards created by this audit (project groupoffice26-neo):

| Card | Id |
|---|---|
| neo-ui: print of detail panels | 20261119-045955-neo-ui-print-of-detail-panels |
| neo-ui: create new linked item from a detail panel | 20261119-045955-neo-ui-create-new-linked-item-from-a-det |
| neo-ui: FilterDialog select/principal/link/custom field filters | 20261119-045955-neo-ui-filterdialog-select-principal-lin |
| neo-ui: grid and list group headers | 20261119-045955-neo-ui-grid-and-list-group-headers |
| neo-ui: custom field grid columns | 20261119-045955-neo-ui-custom-field-grid-columns |
| neo-ui: addressbook ICD combo and MultiContact custom field | 20261119-045955-neo-ui-addressbook-icd-combo-and-multico |
| neo-ui: tasks import | 20261119-045955-neo-ui-tasks-import |
| neo-ui: link detail cards (tasks, appointments) | 20261119-045955-neo-ui-link-detail-cards-tasks-appointme |
| neo-ui: notes encryption | 20261119-045956-neo-ui-notes-encryption |
| neo-ui: HtmlField image paste/upload | 20261119-045956-neo-ui-htmlfield-image-paste-upload |
| neo-ui: main menu badges | 20261119-045956-neo-ui-main-menu-badges |
| neo-ui: email unread badge and mail check | 20261119-045455-neo-ui-email-unread-badge-and-mail-check |
| neo-ui: calendar swipe and availability drag | 20261119-045956-neo-ui-calendar-swipe-and-availability-d |
| neo-ui: calendar event detail, participants and paste | 20261119-045956-neo-ui-calendar-event-detail-participant |
| neo-ui: multi_instance login as administrator | 20261119-045956-neo-ui-multi-instance-login-as-administr |
| neo-ui: My account authorized clients and app passwords | 20261119-045956-neo-ui-my-account-authorized-clients-and |
| neo-ui: My account avatar, space used, password generator, local user, mail notification | 20261119-045956-neo-ui-my-account-avatar-space-used-pass |
| neo-ui: System settings tools tab | 20261119-045956-neo-ui-system-settings-tools-tab |
| neo-ui: System settings OAuth 2.0 clients and cron tabs | 20261119-045956-neo-ui-system-settings-oauth-2-0-clients |
| neo-ui: System settings modules license and sort order | 20261119-045956-neo-ui-system-settings-modules-license-a |
| neo-ui: users permissions overview | 20261119-045956-neo-ui-users-permissions-overview |
| neo-ui: group member list window | 20261119-045956-neo-ui-group-member-list-window |
| neo-ui: custom field conditions on forms | 20261119-045956-neo-ui-custom-field-conditions-on-forms |
| neo-ui: custom fields nested field sets, attachments, data and template types | 20261119-045956-neo-ui-custom-fields-nested-field-sets-a |

## Verification

Browser-tested on an own container as neotest / neoadmin: addressbook (Enter, organizations
view state, organization autocomplete, language, drag onto a group and onto a read-only book),
tasks (list dialog, drag onto a list), notes, history, davclient, maildomains (domain defaults
saved), calendar preferences (archive options follow their option), groups (delete two
selected groups). apikeys, oidc, oauth2client and multi_instance are not installed in the
shared dev database: those changes are checked by code reading and `node --check` only.
