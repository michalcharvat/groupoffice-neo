# Syncfusion in neo

Port of the GOUI frontend (`../goui`, see `../goui/PORTING.md`) to the neo webclient. The classic client keeps
using the GOUI bundle; neo only loads this folder (`Index.mjs`, `style.css`).

| File | What |
|---|---|
| `Index.mjs` | registration: System settings card, `fileHandlers` for `filehandler\Syncfusion` (Files "Open" / "Open with"), `fileMenuItems` "Edit with Syncfusion" for one supported file (GOUI `FilesContextMenu.ts`) |
| `view/EditorWindow.mjs` | App worker side of GOUI `EditorWindow.ts`: dialog, JMAP calls (`community/syncfusion/Editor/*`), upload, save, unsaved-changes question |
| `addon/Syncfusion.mjs` | main thread side (GOUI `Loader.ts` + the DOM half of `EditorWindow.ts`): loads ej2, creates the editor, Ctrl/Cmd+S, export |
| `view/SystemSettingsPanel.mjs` | GOUI `SystemSettings.ts` on `SettingsPanel` |

## Behaviour

- Opens a Files module file from the item menu ("Edit with Syncfusion"), "Open with" → Syncfusion, or "Open" when
  Syncfusion is the user's default handler. A save replaces the file content through `File::replace()`, which keeps
  the old content as a version; doc, dotx and rtf are saved as a new .docx next to the file and the window continues
  on that file. The Files view refreshes after a save.
- Documents render in an iframe with their own ej2 copy; spreadsheets render in the page with ej2 loaded once per
  browser window. The library comes from the same place as in GOUI: the configured CDN URL, or the module's `lib/`
  folder (`ej2.min.js`, `ej2.min.css`) for the local source. Translations of the editor come from the ej2-locale
  package on jsdelivr for the user's language.
- The editor's own "New", "Open" and "Save As" are hidden: they post from the browser straight to the Docker service.
  They are hidden by id (`<container id>_New`, `_Open`, `_Save_As`, `isUniqueId`): hiding by text missed them in
  every language but English (also fixed in the GOUI port).
- The window asks before closing with unsaved changes (X, Escape). Popout is off: the editor lives in the main thread
  of its window.

## License key in the browser

`Editor/openDocument` and `openSpreadsheet` return the settings the editor needs (`Editor::clientSettings()`):
library source, CDN URL, spreadsheet service URL and the license key. The key has to reach the browser: the ej2
library validates its license client-side (`ej.base.registerLicense()`), there is no server-side registration. Only
users who can open a file in the editor get it. The service secret never leaves the server: `Settings::toArray()`
drops it for admins too (write-only; the settings forms send changed fields only).

The settings are not read from `Module/get`: non-admins can't read the Module entity, and a `Module/get` in the same
JMAP request as an `Editor` call made the Editor call fail with "no access to module" (core: `Module::getUserRights()`
caches the rights of a partially loaded Module per request).

## Gotchas

- Module addon name: `WS/../../../../../go/modules/community/syncfusion/views/neo/addon/Syncfusion` (relative to
  `views/neo/src/main/addon/`), see `docs/neo-core-components.md`.
- The document editor takes key input in its own element: a keydown listener on the iframe document never sees
  Ctrl+S. The addon uses the DocumentEditor `keyDown` event and sets `isHandled` (else ej2 downloads the document).
- Focusing a spreadsheet cell lets the browser scroll `.e-sheet-content` while ej2's horizontal scroller and the
  column headers stay put: cells and headers no longer line up. The addon puts the cell area back to the scroller's
  position on every scroll.
- The addon's `exportFile()` clears the dirty flag; the worker calls `setDirty()` when the save failed, and closing
  waits for a running save before it asks about unsaved changes.
- Module CSS files are gitignored (`/**/*.css`): add `style.css` with `git add -f`.

## Verified (2026-11-20, neotest, headless Chromium, own container)

Item menu entry and "Open with" entry; txt opened, edited, saved with Ctrl+S (content written, one new version, grid
shows the new size); xlsx opened, edited, saved (cell written, original cells kept, one new version); unsaved-changes
question (No keeps the window, Yes closes); Czech editor locale. As admin: settings card loads, config.php-locked
values disabled, Local source hides the CDN URL and shows the lib/ hint.

Not verified: doc/dotx/rtf saved as a new .docx, read-only files, the local library source, blobs (`openBlob()` of
the GOUI API has no neo caller yet).
