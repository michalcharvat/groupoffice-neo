# Address book, neo.mjs UI

Port of `views/extjs3` (there is no GOUI address book) to the neo webclient
(`www/views/neo`, see its README). Styles: `views/neo/resources/scss/src/apps/go/addressbook/view/`
(theme-go, one file per class).

| File | ExtJS | What |
|---|---|---|
| `Index.mjs` | `Module.js` | registry: main view, routes `#addressbook/contact/<id>`, quick add, My account and System settings cards |
| `view/AddressBookMain.mjs` | `MainPanel.js`, `ContactGrid.js`, `ContactContextMenu.js` | views (all / starred / organizations / contacts), address books with groups, saved filters, contacts grid (index letter, avatar, all ExtJS columns), detail; right click / more button menus; import, export, labels, duplicates |
| `view/AddressBookTree.mjs`, `NavList.mjs` | `AddressBookTree.js`, `TreeLoader.js`, `go.NavMenu` | `GO.tree.Tree` with a row menu; address books checkable, groups below |
| `view/ContactDetail.mjs` | `ContactDetail.js` | name, e-mail, phone, addresses, dates, company, notes, action date (saved at once), custom fields, comments, files, links, history |
| `view/ContactDialog.mjs`, `fields.mjs`, `ColorField.mjs`, `PhotoField.mjs` | `ContactDialog.js`, `NameField.js`, `*Field.js` | contact / organization form; typed lists shared with the profile card |
| `view/AddressBookDialog.mjs`, `GroupDialog.mjs` | same | name, permissions, salutation template / group name |
| `view/ImportDialog.mjs`, `LabelsDialog.mjs`, `DuplicateDialog.mjs` | `go.util.importFile`, same | vCard/JSON import, PDF labels, duplicates + merge |
| `view/SettingsPanel.mjs`, `ProfilePanel.mjs`, `SystemSettingsPanel.mjs` | `SettingsPanel.js`, `SettingsProfilePanel.js`, `SystemSettingsPanel.js` | My account (addressBookSettings, profile) and System settings (needs `src/systemsettings/` of the "system settings" card) |

## Differences to ExtJS

- **Drag and drop** of contacts onto address books/groups: `GO.tree.Tree` has none; the
  contact menu has "Move to" (address book), "Add to group" and "Remove from group" instead.
- **Name field**: the name parts (first, middle, last, initials, prefix, suffix,
  salutation) are always visible for persons instead of the popup menu; they build the name.
- **Organizations** (chips): an exact name picks the organization, any other text creates
  one in the contact's address book (no autocomplete list yet). The profile card only picks.
- **Import**: vCard and JSON. CSV/Excel need `go.import.CsvMappingDialog` (not in neo yet).
- **Export**: no column chooser for CSV/Excel/HTML (all columns). Exports run in the
  background; `src/data/backgroundJob.mjs` runs them one after the other per worker,
  waits for the job's alert ("Export finished" / "Export error"), downloads the blob or shows
  the error, and removes the alert.
- Not ported: ICD combo (`ICDCombo.js`), language combo, birthday portlet, select dialog
  panel (`SelectDialogPanel.js`), custom field types Contact / MultiContact, custom field
  set dialog override, batch edit, e-mail composer / callto (plain `mailto:` / `tel:` links),
  print.

## Gotchas

- **Contact/get with properties** must include `addressBookId` (an AclItemEntity: the
  permission check reads it), else the server fails with "Typed property …addressBookId
  must not be accessed before initialization".
- **Organizations are links**: `organizationIds` is read and written as a property, stored
  as links between the contacts.
- **Contact/merge** is not pushed to other stores (ExtJS calls `getUpdates()`): reload the
  grids yourself (`DuplicateDialog` fires `merged`).
- **A neo record is not a plain object**: `{...record}` loses its fields; the detail's star
  button keeps its own state until the push reload brings the new record.
- **Material Symbols** draw `star` outlined as well; a starred contact's button is orange.
- **Array of My account cards** (`userSettings: [...]`) needs `ModuleRegistry.loadSettingsPanels()`;
  `Index.mjs` registers only the first card while it is missing.
- **Downloads** go through `Neo.Main.redirectTo()` with an attachment URL: `window.open()`
  after an await is blocked as a popup.
