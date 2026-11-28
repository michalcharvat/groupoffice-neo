# neo: amd/dms port, analysis and card split (2026-11-28)

The owner decided on 2026-11-28 to port amd/dms to neo after amd/crew, together with amd/portcall and amd/diary
("tak si tam prihod i dms"). This page holds the analysis. The work itself is in the board cards listed in
section 4. The model is `docs/neo-crew-port.md`. Module code goes to the amd-mono branch `neo`
(`~/Projects/groupoffice26-neo-amd`, see `docs/neo-upstream-sync.md`). Core neo pieces go to `neo-ui` in this
repository. Coordinator rule (2026-11-28): shared libraries and generic pieces move into neo core. The PDF viewer
is already moving there (`GO.pdf.PdfViewer`, card `20261128-014349-neo-ui-pdf-viewer-in-neo-core-from-amd-l`),
and dms plans on it.

Sources read:

- `amd/dms/views/extjs3`: 75 files, 11,530 lines (`MainPanel.js` 1,039, `DocumentDetail.js` 898, `Module.js` 724,
  `FolderTree.js` 624)
- `getDependencies()` in `dms/Module.php`, `dms/controller/Folder.php` (upload queue), `dms/docs/frontend.md`,
  `dms/docs/form-documents.md`
- from GO.neo: `ModuleRegistry.mjs`, `tree/Tree.mjs`, `component/dragDrop.mjs`, `component/UploadPanel.mjs`,
  `alerts/NotificationCenter.mjs`, `Badges.mjs`, `Markdown.mjs`, `form/field/*`, `apps/go/view/MainView.mjs` (routing);
  files neo (`modules/files/views/neo`, `docs/neo-files-module.md`); email `AccountTree.mjs`; summary neo
  `StartPage.mjs`; community/syncfusion neo `EditorWindow.mjs`
- the neo ports that already exist: amd/crew, amd/formbuilder and amd/libs `views/neo` and their `PORTING.md`

A Codex review (gpt-6.2-astra) checked this page against those sources. Its findings are worked in, apart from the
one noted in section 2. Nothing was run in a browser. Each point marked "unverified" is something a card has to
prove first.

## 1. Inventory by behaviour

| # | Area | Behaviour (ExtJS source) | GO.neo | Class |
|---|---|---|---|---|
| 1 | Registration | `go.Modules.register('amd','dms')`: 10 entities. `AmdDmsDocument` has 13 filters (status, language, author, document type with 7 values, extension, created / modified at and by). `AmdDmsDocument` and `AmdDmsFolder` have a `linkWindow` and a `linkDetail`. `systemSettingsPanels` (`Module.js` 382-688) | `ModuleRegistry.register({package:'amd', name:'dms', capability, mainView, routes, linkWindows, systemSettings, portlets, badge, onLogin})` | port |
| 2 | Routes | The entity hashes from `getRouterPath(id)`. `#amddmsfolder/<id>` comes from `go.Router.add`: it opens the module, asks `amd/dms/Folder/getPath` and opens that path in the tree | Registry `routes` for `AmdDmsDocument` and `AmdDmsFolder`. The shell resolves an entity name in the first segment case-insensitively before the classic fallback (`MainView.mjs` about line 961, `link/linkTypes.mjs`), so `#amddmsfolder/<id>` reaches the folder route; `mainView.route()` opens the path | port |
| 3 | Badge | `amd/dms/Document/unseen` → `GO.mainLayout.setNotification('dms', count, 'orange')`, counted again on every `AmdDmsDocument` change | registry `badge: {entities: ['AmdDmsDocument'], count: () => client.call('amd/dms/Document/unseen')}` (`Badges.mjs`) | port |
| 4 | Layout | West = a responsive panel: the document **grid** next to a side panel. The side panel holds the folder tree (north) and the filter panel. Center = the document detail. Narrow mode: a menu button shows the side panel, and a back button returns from the detail (`MainPanel.js` 1-112). A document type tree exists, but its use is commented out | `MainThreeColumnPanel` subclass: west = tree + filters, center = grid, east = detail. The type tree is not ported (dead code) | port |
| 5 | Folder tree | `FolderTree` + `FolderTreeLoader`: lazy JMAP tree over `AmdDmsFolder` with a hidden root and a trash node (`type: 'trash'`). Unread count badge per folder. Paging: a "Show more..." bar (`hasMore`). Changes are applied in place; a moved folder or a newly seen one reloads its parent or the root. Expanded and selected state is saved, and on first open the first folder is selected. Add folder needs manage on the parent folder. Row ⋮ menu (row 6). A selection sets the grid's `folderId` filter to `{parentId: id}`, which **includes the descendants** (`Document.php` 284, 316), and enables New with create permission | core `GO.tree.Tree` (`nodeProvider`, `reload()` keeps expanded nodes, `drop`). **Missing:** a badge per node, a row ⋮ / context menu, `openPath(ids)`, "load more". email's `AccountTree` builds its badges and row menu in a subclass | build (core D1) + port |
| 6 | Folder menu | Edit, Create envelope from folder (`Folder/createEnvelopeFromFolder`, then the envelope dialog), Download as ZIP (a `FolderJob`, delivered by row 13), Rescan (background, reported through rtm), Delete (`FolderTree.js` 400-590). Mark as read / unread are commented out | Tree row menu (D1) + module handlers | port |
| 7 | Folder dialog and detail | `FolderDialog`: parent folder (`FolderCombo`), name, `isKnowledgeBase`. Permissions tab with `aclOverwritten` / `aclApplyToChildren` and `go.permissions.SharePanel`. Read Tracking tab: `trackReadStatus`, user and group chips, and a read status list (`Folder/getTrackingStatus`). `FolderDetail`: Go to DMS, Edit, Add link, link browser, print, links, history | `FormWindow` + `addSharePanel()`, `AutocompleteChips` / `PrincipalCombo`, core `detail/Panel` | port |
| 8 | Document list | `DocumentGrid`: 17 columns (name in bold when unread, folder name, status, languages, file type, document type, size, version …). Unread toggle (`unread` filter). `tbsearch` with `text`, `name`, `modified`, `created`. Filter panel (`filteraddbutton`, `filtergrid`, `variablefilterpanel`). ⋮ with Settings and Delete (`writeAndDelete` on every selected row). Row context menu: Mark as read / unread, Restore (one trashed document, write). Double click or Enter opens the dialog of the document type with write permission. Opening a document routes to it and marks it as read after 2 s (`Document/markAsSeen`) | `GO.grid.Grid` `entityActions` + `GO.grid.ListToolbar`, `SearchButton`, `FilterPanel` + `filterTypes`, `rowMenuColumn()` | port |
| 9 | Multi select | Merge (`Document/merge` into the current folder), Convert to File Template / Document (`ConvertDocumentTypeDialog`; it counts pms links first with `Document/countPmsLinks` and reads `AmdPmsJob`) | `GO.grid.MultiSelectToolbar` | port |
| 10 | Move by drag | Grid rows dragged onto a tree folder with write permission, confirmed, then `AmdDmsDocument/set` with `folderId` (`MainPanel.js` 175-230) | `GO.tree.Tree` `dropOn` + `dragGroup` shared with the grid (`dragDrop.mjs`: rows carry `data-record-id`) | port (unverified: a drop from a `GO.grid.Grid` onto a `GO.tree.Tree`) |
| 11 | Upload | New → Files / Folders (`go.util.openFileDialog`, `directory: true` for folders). Desktop drag and drop onto the grid (`DnDFileUpload.js`, subfolder paths). Then `Folder/processUploadQueue` with `blobs` as a **JSON string** of `[{id, name, subfolder}]` and `documentFolderId`. A Yes / Yes to all / No / No to all / Cancel window and a list of files that were not stored exist (`sendOverwrite`, `MainPanel.js` 880-1000), **but** classic sends `command: 'ask'` while PHP reads `overwrite` and defaults it to `yestoall` (`Folder.php` 209-211): a collision adds a version without asking when the user may add one; otherwise the file is listed as failed and the batch goes on (`Folder.php` 295-324). See section 5 | `jmap/Uploader`, `UploadButton`, `enableDragDrop(…, {files: true})`. files neo asks per file (`OverwriteDialog.mjs`, `FilesMain.mjs` about line 1735). **Missing:** folder upload (a directory picker, folders dropped from the desktop, subfolder paths); files neo lists it as "not ported" | build (core D2) + port |
| 12 | New menu | Envelope, Content, Content from docx (mammoth converts the file to HTML, the content dialog turns it into EditorJS), Content from Markdown (`MarkdownImportDialog`, `Document/convertMarkdownToHtml`), Step By Step, Risk Assessment, Form (formbuilder `FormPickerDialog`, only while formbuilder is available), File Template, Download from URL (`Folder/downloadFromUrl`) | Menu of the New button; dialogs from rows 15-21 | port |
| 13 | Job notifications | At login and on every `AmdDmsDocumentJob` / `AmdDmsFolderJob` change: one message per job, keyed by job, also for pending jobs. Ready: "Document is ready to download" opens the blob and destroys the job; a ready document job without a blob refreshes the documents. Failed: the error from `libs.jobErrorText`. Closing a message destroys its job. Newly finished jobs open the notification area; the backlog at login does not (`Module.js` 160-380) | `notificationCenter.add({id, title, html, handler, onDismiss})`, registry `onLogin`, `jobErrorText.mjs` of amd/libs neo | port |
| 14 | Real-time handlers | sf/rtm calls `onRescanComplete` (Rescan of a folder), `onKnowledgeBaseReindexComplete` (Qdrant reindex), `aiSaveDocument` / `aiSaveVersion` (the AI assistant's create and new-version tools open a prefilled content dialog) | neo has no sf/rtm client | build (core D8); gap until then (data still changes through JMAP push, only the message and the AI prefill are missing) |
| 15 | Document dialog (file) | `DocumentDialog`: name + extension, number, location, type (`DocumentTypeCombo`), status, language chips, title, issue date, author chips, upload of a new file. Tabs: **Editor** (sf/codemirror `CodeMirrorEditor` on `fileContent`; only for an existing document with a text extension, while sf/codemirror is available), **Versions**, **Merge with** (`DocumentMergePanel`: ordered documents, without the document itself and deleted ones), **Read Status**, **Indexed content**. No Linked Jobs tab | `FormWindow` + `addCard()`; `JmapComboBox` / `AutocompleteChips`; Editor: `GO.form.field.CodeField` (card `20261128-014608-neo-ui-go-form-field-codefield-codemirro`); Merge with: sortable `ArrayField` (D3) | port |
| 16 | Versions | `DocumentVersionGrid`: version, size, created at / by; the row menu offers Download, or Restore version (`Document/restoreVersion`) when `enableRestore` is set, and Delete. `DocumentEnvelopeVersionGrid` adds remarks, a search and Edit / Delete | `GO.grid.Grid` in a FormWindow card, `rowMenuColumn()` | port (dms-only: versions are `AmdDmsDocumentVersion`, files' versions are a legacy API, so nothing generic to share) |
| 17 | Read status, indexed content, linked jobs | `DocumentReadStatusGrid` (users from `User`, read at). `DocumentIndexedContentPanel` (`AmdDmsDocument/indexedContent`, Rescan text; tells never indexed, empty extraction, knowledge base inclusion, reprocessing and truncation apart). `DocumentLinkedJobsGrid` (step by step, risk assessment, file template only): pms jobs that point at the document, Go to Job, only while pms is available | Grids / a `LinesCard` in FormWindow cards; the pms jobs: a `Grid` over `AmdPmsJob` while pms is available, Go to Job → classic (pms has no neo UI) | port |
| 18 | Content documents | `DocumentContentDialog`: EditorJS (`editorjsfield`, sf/editorjs) on `content`, folder, template (`TemplateCombo`) and the general fields. `setHtmlContent()` (from docx: the field's `setValueFromHtml`) and `setEditorContent()` (from Markdown and the AI tools) prefill it | EditorJS field: today in amd/formbuilder neo (`view/EditorJsField.mjs`, `addon/EditorJs.mjs`); it takes EditorJS JSON only. dms is its second user and needs HTML → blocks | build (core D4) + port |
| 19 | Step by step | `DocumentStepByStepDialog`: its own EditorJS description, `DocumentStepField` = a sortable `FormGroup` of steps (name + EditorJS description). Versions, Read Status, Indexed content, Linked Jobs | sortable `ArrayField` (D3), EditorJS field (D4), FormWindow | build (core D3) + port |
| 20 | Risk assessment | `DocumentRiskAssessmentDialog`: its own EditorJS description; `DocumentRiskHazardGrid`, 22 data columns, ratings in three colour bands (red, yellow 5-11, green), drag and drop order on `sortOrder`; `DocumentRiskHazardDialog` recalculates the four probability × impact scores before and after the measures. Versions, Read Status, Indexed content, Linked Jobs | `GO.grid.Grid` + `enableDragDrop` sortable (as crew's `RankListPanel`), FormWindow | port |
| 21 | Envelopes | `DocumentEnvelopeDialog`: `isActive`, template, general fields. **Structure** (`DocumentLinkedPanel`): a sortable `FormGroup` of chapters, each with a sortable `FormGroup` of documents (`DocumentCombo`). Envelope versions with remarks. Download prepares the PDF as a `DocumentJob` (`Document/prepareDocument`, row 13). Create envelope from folder (row 6) opens this dialog | Nested sortable `ArrayField` (D3), `JmapComboBox` | port |
| 22 | Form documents | `DocumentFormDialog`: the formbuilder form of the document (`formId`, the snapshot in `formBuilder`). Saves incomplete answers: required questions are relaxed, document fields and answer formats are still checked. Asks before it drops changed answers on close or on a structure update. Checks for a newer form on its own, offers "Update to the new form version" (`AmdDmsDocument/updateFormStructure`) and shows the dropped values in a window. Edit needs only write. "Print blank form" (`DocumentFormDialog.js` 163-296) | formbuilder neo runtime: `AmdDmsDocument` is in `FORM_ENTITIES`, and the runtime already loads `formStructureHash` and sends `expectedFormStructureHash` (`formRules.mjs` 45, `formRuntime.mjs` 83, 128) | port |
| 23 | Form picker | formbuilder's `FormPickerDialog`: a folder tree of forms and a search over all readable forms, also while a folder is selected | Not in formbuilder neo (its designer stays classic) | build (amd/formbuilder neo) |
| 24 | File templates | `DocumentFileTemplateDialog`: a file plus a version upload (`Document/uploadVersion`), Versions, Read Status, Indexed content, Linked Jobs | FormWindow, `UploadButton` | port |
| 25 | Document detail | `DocumentDetail`: a template with name, title, number, version, size, file type, type path (walks `parentId`), folder, status, languages, author, issue date; for an envelope its chapters and documents. Previews by extension: PDF (`libs.PdfViewPanel`), text, sheet (xls and xlsx with SheetJS: first sheet, at most 1,000 rows), docx (mammoth), image, Markdown (server-rendered HTML, `Module.php` 446-507, with protected images), audio / video. Content / SBS / RA / form documents show the server-rendered PDF. Links, history | core `detail/Panel` + `LinesCard`, `GO.pdf.PdfViewer` (card `20261128-014349`; it already previews images with zoom). **Missing:** the other previews | build (core D5, D5b) + port |
| 26 | Detail toolbar | Download (an envelope prepares a job first), Download PDF, Print blank form, Download archive, Edit with Syncfusion (doc, docx, xlsx … while community/syncfusion is available: the file goes to a blob, `syncfusion.openBlob()`, and a save becomes `Document/uploadVersion`), Edit (the dialog per document type; write for forms, manage otherwise), Add link | `createToolbarItems()`; Syncfusion: `EditorWindow.open({blobId, fileName})` with its `save` event `{blobId}` | port |
| 27 | Detail print and page export | Print: an uploaded PDF document goes to `libs.PdfPageExportDialog` once its preview has loaded: a page range (empty = all) with thumbnails; print, download the pages, save them as a document (`SavePagesDialog`, `AmdDmsDocument/savePages`), e-mail them (`AmdDmsDocument/preparePagesEmail` + `GO.email.showComposer`). Other types, or a PDF still loading, print the panel | page export: **missing** in neo (amd/libs `PORTING.md`: "open: no neo consumer yet (dms, invoices)"); `print.mjs`, `Mail.showComposer()` | build (core D6) + port |
| 28 | Detail Markdown items | Save as Markdown (a name collision: overwrite as a new version, save under another name, or cancel), Download as Markdown, Import from Markdown, Save as Content (from a PDF by extraction or from a Markdown file) | `createMoreMenu()`, `TextPrompt` / `ConfirmDialog`, the content dialog (row 18) | port |
| 29 | Detail record actions | Copy (`FolderParentSelectorDialog`, `AmdDmsDocument/copyTo`), Add to envelope (`EnvelopeSelectorDialog`), Rescan text, Convert type, Restore from trash (`DocumentRestoreDialog`, `restoreTarget`), Delete (shows `notDestroyed` reasons) | `createMoreMenu()` | port |
| 30 | Selector dialogs | `FolderParentSelectorDialog`: one folder combo. `EnvelopeSelectorDialog`: an envelope combo (active, not deleted) and an optional chapter combo. `DocumentSelectorDialog`: a folder tree and a grid (starts with all readable documents), returns several documents | `view/Dialog` with `JmapComboBox`es, or with a `GO.tree.Tree` and a `Grid` | port |
| 31 | Link browser | The classic link browser shows a linked document or folder inside the browser (`linkDetail`) | neo's link browser opens the record (`link/LinkBrowser.mjs`); the registry has no `linkDetail` key (go:neo-port) | gap (owner), the same as for every module |
| 32 | Lookups (Settings dialog) | `SettingsDialog`: Document Type (with a parent, shown as a path), Document Status, Document Author, Document Language, Template, and a Maintenance tab: Rebuild folder tree, Rebuild document type tree, Rebuild envelope links | crew built the same dialog in its module (`crew/views/neo/view/SettingsDialog.mjs`, `LookupListPanel.mjs`, `LookupDialog.mjs` over core `systemsettings/EntityListPanel`). dms is the second user, so it moves to core | build (core D7) + port |
| 33 | Templates | `TemplateGrid` + `TemplateDialog`: SharePanel, title page blocks (`TemplateBlocksField`, a sortable `FormGroup` with position and size), font, font size, logo (`FileButtonField`), the page flags (title, TOC, revision, summary, chapter pages, watermark), watermark text and alpha, creator, author, print header and print footer switches with editable HTML each | Lookup panel (D7), `FormWindow` + `addSharePanel()`, sortable `ArrayField` (D3), `BlobField`, `HtmlField` | port |
| 34 | System settings | `SystemSettingsPanel`: AI image description with the AI Router account and a model combo that depends on it (`sf.airouter.AccountComboReset`, `ModelCombo`; a new account clears the model). Without sf/airouter: a numeric account id and a model text field (dms does not depend on airouter on purpose). `visionEnabled`, limits (PDF pages, image edge, JPEG quality) | `systemSettings` registry key + core `SettingsPanel`. crew has the same two combos in its module (`crew/views/neo/view/AiModelCombo.mjs`); they belong to sf/airouter | port + build (sf/airouter neo combos) |
| 35 | Portlet | "Newest files" (`DocumentPortlet`: the 20 newest by modification, without trash, in the chosen folders and their descendants, all readable folders when none is chosen; a click opens the document). Settings dialog per user: the folders, stored in `User.amdDmsPortletFolderIds` (an unreadable one can still be removed); only while legacy summary is available | `portlets` registry key: summary neo reads it (`StartPage.mjs` 92-112), email registers one | port |
| 36 | Custom combos | `FolderCombo` (shows `parent / name`), `DocumentCombo` / `DocumentChips` (the full folder path from `getFolderPath()`), `DocumentTypeCombo` / `Chips`, `DocumentStatusCombo`, `DocumentLanguageCombo` / `Chips`, `DocumentAuthorCombo` / `Chips`, `TemplateCombo`. `DocumentChipsOverride.js` adds `clickable` (a chip opens its entity) to every `go.form.Chips` | `JmapComboBox` / `AutocompleteChips` configs. **Missing:** a chip that opens its entity | port + build (core D3) |
| 37 | Tours | `tourId: 'amd-dms-new-menu'` and the folder menu tour (sf/tours) | neo has no tours | gap (owner) |

## 2. Dependencies: what dms needs in neo

`getDependencies()` lists amd/libs, amd/pdfparser, sf/editorjs and amd/formbuilder. `dms/CLAUDE.md` also names
sf/mpdf, sf/jobqueue and business/fileconverter (backend only). The views also use amd/pms, sf/codemirror,
sf/airouter, community/syncfusion, legacy/email and legacy/summary without declaring them.

dms's views do not use portcall or diary, and their views don't use dms, so the dms cards don't wait for those two.
portcall's backend calls dms conversion code (`portcall/Module.php` 380, `portcall/model/CrewChange.php` 399), which
does not touch the frontend port. amd/pms's views use dms (`DocumentChips`, `DocumentDetail`, `DocumentGrid`,
`FolderCombo`, `getFolderPath`): the pms port imports them from dms neo once they exist.

| Module | What dms's views use | In neo | Must be ported first? |
|---|---|---|---|
| amd/libs | `PdfViewPanel`, `PdfPageExportDialog`, `jobErrorText`; the mammoth and SheetJS script tags (`libs/views/extjs3/Module.js`, vendored in `lib/`) | The PDF viewer moves to core (`20261128-014349`). `jobErrorText.mjs` exists. Page export, mammoth and SheetJS are missing | The viewer and the previews go to core (D5, D5b, D6). `jobErrorText` stays in amd/libs: it translates amd/libs's own `JobError` codes for amd modules only (Codex proposed moving it; rejected for that reason) |
| amd/formbuilder | Form documents (row 22), `FormPickerDialog` (row 23) | The runtime is done (crew cards 16-18), with the dms structure hash. `EditorJsField` lives there | No for the runtime. The EditorJS field moves to core (D4) because dms is its second user. The form picker is an amd/formbuilder card (14) |
| sf/editorjs | The `editorjsfield` and its tools (content, SBS, RA, steps) | Only through formbuilder's neo addon, which loads sf/editorjs's library | Through D4 |
| sf/codemirror (undeclared, guarded) | The Editor tab of file documents | Card `20261128-014608` (CodeField, planned for diary) | Only for the Editor tab of card 5 |
| sf/airouter (undeclared, guarded) | Account and model combos in the system settings | crew has its own copy | A small sf card moves the combos to sf/airouter `views/neo` (S1); crew switches to it |
| amd/pms (undeclared, guarded) | Linked jobs grid, the pms link count before Convert, `AmdPmsJob` | JMAP entity; pms has no neo UI | No: a `Grid` over the entity while pms is available, links to classic |
| community/syncfusion (guarded) | Edit with Syncfusion | Neo UI exists; `EditorWindow` takes a `blobId` and fires `save {blobId}` | No |
| legacy/email, legacy/summary | E-mail pages, start page portlet | `Mail.showComposer()`, summary neo with `portlets` | No |
| sf/rtm (undeclared) | Rescan / reindex results, AI prefill (row 14) | No neo client | D8 (core); a gap until then |
| amd/pdfparser, sf/mpdf, sf/jobqueue, business/fileconverter | Backend only | — | No |

**Data rule for every card.** The upstream schema of dms, formbuilder and pms stays as it is. Business edits go
only through the existing JMAP API, the same calls the classic client makes. Cards don't rewrite data directly. New
persistence that only neo needs goes to `neo_*` tables (`docs/neo-workspace.md`, neo_* section; a module's own in
`views/neo/install/updates.php`, `docs/neo-core-components.md` "neo tables of modules"). Nothing found so far needs
one: the tree's expanded and selected state and the unread toggle are per-user UI state (`State`); the portlet's
folders are already a user property.

## 3. Pieces for neo core

These are generic. Each has a second user besides dms, so it belongs in core (owner rule 2026-11-27, coordinator
rule 2026-11-28). The PDF viewer (`20261128-014349`, running) and CodeField (`20261128-014608`, from the diary
analysis) are already planned.

| Card | What | Other users |
|---|---|---|
| D1 | `GO.tree.Tree`: a badge per node, a row ⋮ and a context menu (`menu` event), `openPath(ids)` (expand and select down a path, loading on the way), a "Show more" for providers that page | email `AccountTree` (badge and menu now in a subclass), files, addressbook; pms component tree |
| D2 | Folder upload: `UploadButton` with a directory picker; `enableDragDrop(…, {files: true})` takes folders dropped from the desktop; each blob gets its `subfolder` path. files' `OverwriteDialog` moves to core and can list the files that were not stored | files neo (folder upload not ported), dms |
| D3 | `ArrayField` with sortable rows (a drag handle, nested ArrayFields too, the order is the value), and chips that open their entity (`AutocompleteChips` / `ChipsField` `clickable`, the route from the registry) | formbuilder (Group rows), dms steps / chapters / merge list / title blocks; chips: every module that shows entities in chips |
| D4 | `GO.form.field.EditorJsField` and the read-only HTML of an EditorJS document in core, moved from amd/formbuilder neo; it loads the library from sf/editorjs and falls back to read-only text when sf/editorjs is missing; it also takes HTML (`setValueFromHtml`, classic sf/editorjs does the HTML → blocks conversion). formbuilder imports it from core | formbuilder, dms; later the other sf/editorjs users |
| D5 | `GO.preview.FilePreview`: one preview component for a URL and an extension or type: PDF and image (`GO.pdf.PdfViewer`), text, Markdown (HTML from a host URL or `Markdown.mjs`), audio / video, and a fallback | files `FileDetail` (preview head), dms, crew certificates |
| D5b | Sheet (xls / xlsx, SheetJS: first sheet, row limit) and docx (mammoth) previews as main-thread addons in `FilePreview`, plus docx → HTML for importers. The card picks a library copy that a release serves without amd/libs | files, dms |
| D6 | PDF page export: a page range with thumbnails; print, download, and save / e-mail as host callbacks (amd/libs `PdfPageExportDialog.js`) | dms, invoices |
| D7 | The module settings dialog with lookup lists (crew's `SettingsDialog`, `LookupListPanel`, `LookupDialog`, `lookups.mjs`) in core, configured by a list of lookups and extra tabs; crew switches to it in an amd commit | crew, dms; most amd modules have one (go:neo-port "Missing in GO.neo": `SettingsDialog`) |
| D8 | A real-time channel client (sf/rtm, Pusher protocol) in the App worker with a registry key for module handlers (`rtm: {onRescanComplete: data => …}`); authenticates through `sf/rtm/auth.php` as classic | dms, sf chat, aiassistant, amd links and sync (`docs/neo-external-modules-audit.md`: "Real-time channel", S–M) |

Considered and left in dms: version grids (row 16: dms versions are an entity of their own, files' versions are a
legacy controller), the read status grid and the folder read tracking (dms data).

## 4. Cards

Every card stays at M size or below. A card's browser check compares its screens with `?webclient=classic`, as a
non-admin user with dms rights and once as admin. Until the dialog card of a document type is done, its Edit /
double click opens that document in classic (`classicApps.mjs`), as cards 2 and 6 say.

**Core** (project groupoffice26-neo, base `neo-ui`): D1-D8 and D5b from section 3. D5b comes after D5, D6 after
`20261128-014349`, D5 after `20261128-014349`.

**sf** (project `~/Projects/groupoffice26-neo-sf`, base `neo`): S1 `sf/airouter: neo account and model combos`
(S): `JmapComboBox` over `SfAirouterAccount` and crew's `AiModelCombo` moved to sf/airouter `views/neo`; crew
imports them from there (amd commit).

**amd** (project `~/Projects/groupoffice26-neo-amd`, base `neo`). Dialogs come before the screens that open them:

| # | Card | Size | Rows | After |
|---|---|---|---|---|
| 1 | `amd/dms: neo skeleton` | M | 1-5, 36: registration, main view (west tree + filters, center grid, east detail, all minimal), routes, badge, folder tree with selection and unread badges (Add folder: card 4), narrow mode, the dms combos and chips, `views/neo/PORTING.md` from section 1 | D1, D3 (clickable chips) |
| 2 | `amd/dms: neo document list` | M | 8, 9, 10: columns, unread toggle, search, filters, delete, row context menu, Merge, Convert (with the pms link count), move by drag onto a folder, mark as read; double click / Enter opens the dialog per type, or classic; the ⋮ Settings item comes with card 17 | 1 |
| 3 | `amd/dms: neo upload and job notifications` | M | 11, 12 (Files, Folders, Download from URL), 13: upload with the overwrite question (section 5), desktop drop on the grid, job messages at login and on change | 2, D2 |
| 4 | `amd/dms: neo folders` | M | 6 (without Create envelope), 7, 30 (folder selector): folder dialog with permissions and read tracking, folder detail, Add folder, the folder `linkWindows` entry, the tree row menu (edit, ZIP, rescan, delete), trash node | 1, 3 (ZIP job) |
| 5 | `amd/dms: neo file document dialog` | M | 15, 16, 17 (without Linked Jobs: cards 11, 12, 16): general fields, new file, versions, merge with, read status, indexed content, the document `linkWindows` entry; Editor tab when CodeField exists | 1, D3 (`20261128-014608` for the Editor tab) |
| 6 | `amd/dms: neo document detail and previews` | M | 25, 26: sections, type path, envelope chapters, previews, Download (envelope job) / Download PDF / archive, Edit per type (classic for types without a card), Syncfusion, links, history | 3, 5, D5, D5b, `20261128-014349` |
| 7 | `amd/dms: neo document print and page export` | M | 27: page export with print, download, save as a document, e-mail | 6, D6 |
| 8 | `amd/dms: neo document record actions` | M | 29, 30 (envelope and document selectors): copy, add to envelope, rescan, convert, restore, delete | 4, 6 |
| 9 | `amd/dms: neo content documents` | M | 18, 12 (Content, from docx, from Markdown) | 5, D4, D5b |
| 10 | `amd/dms: neo document Markdown actions` | S | 28 | 6, 9 |
| 11 | `amd/dms: neo step by step documents` | M | 19, 12 (Step By Step) | 9, D3 |
| 12 | `amd/dms: neo risk assessment documents` | M | 20, 12 (Risk Assessment) | 9 |
| 13 | `amd/dms: neo envelopes` | M | 21, 12 (Envelope), 6 (Create envelope from folder): structure, envelope versions with remarks (the prepared download is card 6) | 3, 4, 5, D3 |
| 14 | `amd/formbuilder: neo form picker` | S | 23: folder tree of forms + search, returns the form id and record (dms prefills the name); for dms and later hosts | — |
| 15 | `amd/dms: neo form documents` | M | 22, 12 (Form): the runtime in the dms dialog, partial save, dirty prompts, update to the new form version, dropped values (Print blank form is card 6); browser check of a stale save: change the form structure after opening, save, the refusal is shown and the stored answers stay | 5, 14 |
| 16 | `amd/dms: neo file templates` | S | 24, 12 (File Template) | 5 |
| 17 | `amd/dms: neo lookups and maintenance` | M | 32 | 1, D7 |
| 18 | `amd/dms: neo templates` | M | 33 | 17, D3 |
| 19 | `amd/dms: neo system settings` | S | 34, with the fallback without sf/airouter | 1, S1 |
| 20 | `amd/dms: neo portlet` | S | 35 | 1 |
| 21 | `amd/dms: neo real-time handlers` | S | 14: the four handlers on D8's registry key | 9, D8 |

Board card ids are in section 7.

## 5. Open points for the owner and the coordinator

- **Classic never asks before it overwrites an upload** (row 11): it sends `command: 'ask'`, the server reads
  `overwrite` and defaults to `yestoall`, so a name collision silently adds a version (where the user may add one). Card 3 asks the owner whether
  neo keeps that behaviour or asks per file (files neo sends `overwrite`). A fix in classic would be a 26.0.x
  change.
- **Tours** (row 37): neo has no sf/tours runtime. The dms tours stay classic-only unless decided otherwise.
- **Link browser** (row 31): classic shows a linked record's detail inside the link browser; neo opens it. This is a
  core question for every module, not a dms card.
- **D8 scope**: the real-time client is wider than dms (chat, aiassistant, sync). The coordinator may want it
  planned from the sf side instead.
- **D5b library source**: core must not load mammoth and SheetJS from amd/libs. The card checks whether
  `www/node_modules` has them in a release build, or vendors one copy in core. Classic keeps the amd/libs copies.
  Decided: vendored in `www/views/neo/lib/` (a neo-only release drops `www/node_modules`; see
  `docs/neo-core-components.md` "GO.preview.FilePreview").

## 6. Additions for go:neo-port

These go into the skill (`~/Projects/go-skills/skills/neo-port/SKILL.md`). This task doesn't edit the skill.

- **Inventory:** check whether another module **uses this one** (pms embeds dms's grid, detail, chips and folder
  combo). Those classes become the porting module's public neo API; note them, so the consumer imports them later.
- **Inventory:** list the sf/rtm handlers in `Module.js` (`onXxx` functions on the registered module that rtm calls
  by name). neo has no rtm client yet: they are a gap or wait for the core real-time card.
- **Inventory:** a module that builds something a second module needs (crew's lookup settings dialog, AI model combo;
  formbuilder's EditorJS field) → plan a card that moves it to core or to the owning module, instead of a second copy.
- **Inventory:** read the server side of every request the classic view sends. dms's overwrite question never fires,
  because classic sends `command` and the server reads `overwrite`; a port that copies the client would copy the bug.
- **Inventory:** a filter name in the client is not the filter the server gets: dms's local `folderId` filter sends
  `{parentId}`, which includes the subfolders.
- **Inventory:** commented-out menu items and panels (dms's folder Mark as read, the document type tree) are not
  behaviour; say so in the inventory instead of porting them.
- **Mapping row:** a top-level `go.Router.add(/<entity name lowercase>\/…/)` route → nothing extra: the neo shell
  resolves entity names case-insensitively (`#amddmsfolder/5` reaches the `AmdDmsFolder` route). Only a hash that is
  no entity name needs a compat handler (crew's `#crewplanning`).
- **Mapping row:** `go.tree.TreePanel` over a JMAP entity with badges, a row menu and paging → `GO.tree.Tree`
  (`nodeProvider`) plus core card D1 until it has badges, menus, `openPath()` and "load more".
- **Mapping row:** `go.util.openFileDialog({directory: true})` and a dropped folder → folder upload in core (D2);
  the overwrite question → core `OverwriteDialog` (from files neo).
- **Mapping row:** `go.form.FormGroup` with `sortable: true` → `ArrayField` with sortable rows (D3).
- **Mapping row:** preview panels by extension (PDF, sheet, docx, image, text, media) → `GO.preview.FilePreview` (D5, D5b).
- **Mapping row:** `go.Notifier.msg({…}, key)` with a handler → `notificationCenter.add({id, handler, onDismiss})`
  (`alerts/NotificationCenter.mjs`); `GO.mainLayout.setNotification(module, n)` → registry `badge`.
- **Mapping row:** the `portlets` registry key is proven: summary neo reads it, email registers one.

## 7. Board cards

Created 2026-11-28, all `--no-auto`. Core and sf: by their letter; amd: by their number in section 4.

- D1 `20261128-015920-neo-ui-go-tree-tree-badges-row-menu-open`
- D2 `20261128-020110-neo-ui-folder-upload-and-the-overwrite-q`
- D3 `20261128-020110-neo-ui-sortable-arrayfield-rows-and-clic`
- D4 `20261128-020112-neo-ui-go-form-field-editorjsfield-in-co`
- D5 `20261128-020113-neo-ui-go-preview-filepreview-pdf-image`
- D5b `20261128-020113-neo-ui-sheet-and-docx-previews-sheetjs-m`
- D6 `20261128-020114-neo-ui-pdf-page-export-dialog-print-down`
- D7 `20261128-020115-neo-ui-module-settings-dialog-with-looku`
- D8 `20261128-020117-neo-ui-real-time-channel-client-sf-rtm-w`
- S1 `20261128-020117-sf-airouter-neo-account-and-model-combos`
- 1 `20261128-020118-amd-dms-neo-skeleton`
- 2 `20261128-020118-amd-dms-neo-document-list`
- 3 `20261128-020119-amd-dms-neo-upload-and-job-notifications`
- 4 `20261128-020119-amd-dms-neo-folders`
- 5 `20261128-020121-amd-dms-neo-file-document-dialog`
- 6 `20261128-020122-amd-dms-neo-document-detail-and-previews`
- 7 `20261128-020123-amd-dms-neo-document-print-and-page-expo`
- 8 `20261128-020125-amd-dms-neo-document-record-actions`
- 9 `20261128-020127-amd-dms-neo-content-documents`
- 10 `20261128-020128-amd-dms-neo-document-markdown-actions`
- 11 `20261128-020130-amd-dms-neo-step-by-step-documents`
- 12 `20261128-020130-amd-dms-neo-risk-assessment-documents`
- 13 `20261128-020131-amd-dms-neo-envelopes`
- 14 `20261128-020132-amd-formbuilder-neo-form-picker`
- 15 `20261128-020134-amd-dms-neo-form-documents`
- 16 `20261128-020135-amd-dms-neo-file-templates`
- 17 `20261128-020135-amd-dms-neo-lookups-and-maintenance`
- 18 `20261128-020136-amd-dms-neo-templates`
- 19 `20261128-020137-amd-dms-neo-system-settings`
- 20 `20261128-020137-amd-dms-neo-portlet`
- 21 `20261128-020138-amd-dms-neo-real-time-handlers`
