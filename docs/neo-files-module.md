# Files module in neo (card 20261119-011401-neo-ui-files-module)

The legacy files module (`www/modules/files`, ExtJS only) gets a neo UI in
`www/modules/files/views/neo`. The backend stays the legacy controllers
(`client.legacy('files/...')`); a JMAP rewrite is out of scope.

## ExtJS feature set (what parity means)

Permission levels: read 10, create 20, write 30, writeAndDelete 40, manage 50.

### FileBrowser (`FileBrowser.js`)
- West: folder tree (`files/folder/tree`, roots: Personal (home), Shared (virtual, no drop),
  Address book / Projects (config), Log files (admins), Trash (virtual, drop = move to trash)),
  Favorites grid (`files/bookmark/store|submit|delete`), quota bar (`disk_usage`/`disk_quota` MB
  of every list response; warn > 75 %, error > 99 %).
- Center: grid (name with type icon / shared folder icon / locked, type, path, size, creator,
  modifier, id hidden; mtime, ctime; custom fields), thumbnails view (`thumb_url`, per folder
  `files/folderPreference/submit {folder_id, thumbs}`), trash grid (`folder_id=trash`: name, fullPath,
  deletedAt, deletedByUser; Restore `files/folder/restore {ids}`, Delete permanently
  `files/folder/deleteFromTrash {ids}`; no "empty trash").
- East: FilePanel (`files/file/display`: thumbnail / PDF preview, path, size, dates, users,
  locked by + Unlock, download link + delete link, expire date, custom fields) or FolderPanel
  (`files/folder/display`: path, URL, comment, custom fields).
- Toolbar: cut / copy / paste (`files/folder/paste {ids: [type_id], destination_folder_id,
  paste_mode, overwrite}` — overwrite queue in the PHP session), New (upload files / folder
  upload, folder, templates `files/template/createFile`, manage templates), More (refresh with
  fs sync, move to trash), Up, path, thumbnails toggle, search (`query`: files only, below the
  current folder; disables paste / new / compress).
- Keys: ctrl+c/x/v, Delete = trash, ctrl+Delete = delete permanently (`files/folder/list` with
  `trash_keys` / `delete_keys` = JSON type_ids).
- Double click: folder opens, file runs its handler. Single click: detail in the east.
- Drag and drop: rows / tree nodes onto folders = cut-paste (confirm when `confirmOnMove`),
  OS files onto the grid = upload (blob upload, then `files/folder/processUploadQueue {blobs:
  [{id, name, subfolder}], destination_folder_id, overwrite}`).
- Overwrite question on `fileExists`: Yes / Yes to all / No / No to all resend with
  `overwrite=yes|yestoall|no|notoall`.
- Routes `#file/<id>`, `#folder/<id>`; copy direct link; batch edit; email files.
- Column state per folder (`apply_state`, `cm_state`, `lock_state`).

### Context menu (`ContextMenu.js`)
Open, Open with (`files/file/handlers {id, all:1}`, remember `files/file/saveHandler`), Download,
Save / download as PDF (business/fileconverter), Lock / Unlock (`files/file/submit
locked_user_id`; show by `locked_user_id`, enable by `unlock_allowed`), Properties, Add to
favorites (folders), Cut, Copy, Move to trash, Edit selection, Compress (`files/folder/compress`),
Decompress (zip, tar, tgz, gz; `files/folder/decompress`), Share (direct link, download link
`files/file/createDownloadLink {id, expire_time, delete_when_expired}`, email download link,
email files), Download selected as zip (`files/folder/compressAndDownload`).

### Dialogs
- FilePropertiesDialog (`files/file/load|submit`): name (without extension) + extension, location,
  dates, users, locked by, type, size, Open with (`handlerCls`), content expires at; Comment tab;
  Older versions (`files/version/store {file_id}`, download `files/version/download {id}`; no
  restore); custom fields.
- FolderPropertiesDialog (`files/folder/load|submit`): name, location, URL, dates; Activate
  sharing (`share` 1/0 creates / removes the ACL, manage, not on home / readonly folders), Notify
  me about changes (`notify`, `notifyRecursive`), Apply display settings for everyone
  (`apply_state`); Comment; Permissions (ACL `acl_id`); custom fields.
- NewFolderDialog (`files/folder/submit {parent_id, name}`), CompressDialog, ExpireDateDialog,
  OpenFileWindow, TemplatesWindow, ImageViewer (`files/folder/images`).

### Elsewhere
- FilesDetailPanel (files of an entity): 10 items, ⋮ Open / Download / Properties / Delete,
  Browse N files, upload + drop, `checkModelFolder` for a new folder.
- Portlets: folder browser, expired files (`files/file/expiredList`), recent files
  (`files/file/recent`).

### File handlers ("open")
`handler` in list / display records is JavaScript (`startjs:…:endjs`). Handlers: Inline (pdf,
html, txt, media, images), ImageViewer, Download (fallback), WOPI Collabora / Office 365
(`window.open('/wopi/edit/<serviceId>/<fileId>')`), pdfeditor, calendar Ics, address book VCard.
`files/file/handlers` returns `{name, handler (JS), iconCls, cls, extension}`; neo can't run the
JS, so it maps the handler class `cls` itself.

### Gotchas
- List ids are `type_id` (`d:<id>` folder, `f:<id>` file); folder rows have no `permission_level`
  (use the folder's list `permission_level`).
- List dates are formatted strings in the user's format; `size` is bytes in list / display, a
  formatted string in `file/load`, `-` for folders.
- `locked` is false right after a manual lock (no expiry set): show by `locked_user_id > 0`.
- processUploadQueue keeps no queue: on an overwrite answer all blobs are sent again.

## neo port status

The neo UI is in `www/modules/files/views/neo/` (registered as `legacy/files`, capability
`go:legacy:files`). It talks to the legacy controllers through `client.legacy()`; there is
no JMAP backend for files yet.

| Feature | neo |
|---|---|
| Folder tree (personal, shared, address book, …, trash), lazy loading, deep link `#files/folder/<id>` and `#files/file/<id>` (expand_folder_id) | done (`FilesMain`) |
| File grid: sort, paging on scroll, multi select, search below the folder, quota | done (`FolderStore`) |
| Detail (east): preview head, properties list, open / download / properties / more | done (`FileDetail`) |
| Upload (button, desktop drop on grid / tree / detail FilesPanel), overwrite question with yes / no / to all | done (one blob per `processUploadQueue` request: `overwrite=yes` overwrites all conflicts) |
| New folder, rename, cut / copy / paste (overwrite queue), move to trash, delete permanently | done; Delete key = trash, ctrl+Delete = delete permanently (Grid `deleteKey` with `ctrlKey`) |
| Drag and drop of rows onto folder rows and tree nodes (move, Ctrl copy) | done (`enableDragDrop()`) |
| Trash: list, restore, delete permanently | done; Delete key and a row context menu (Restore / Delete permanently) too |
| Folder properties: name, comment, activate sharing, notify (with subfolders question), apply display settings, permissions (SharePanel on the folder's ACL, `core/aclGroup` routes) | done (`FolderPropertiesDialog`, `acl.mjs`) |
| File properties: name, comment, content expiry, default "Open with", older versions (download on double click) | done (`FilePropertiesDialog`) |
| Lock / unlock, favorites (bookmarks) below the tree | done |
| Open / "Open with": the server's handlers (`files/file/handlers`) | done (`fileHandlers.mjs`: Download, Inline, ImageViewer built in; a handler whose JavaScript opens a URL, like WOPI Collabora / Office Online, opens that URL; modules add their own handler classes via ModuleRegistry `fileHandlers`) |
| Files in detail panels: open with the user's handler, "Browse files", drop upload | done (core `FilesPanel`, ModuleRegistry hook `openFile`) |
| Email files (a folder: pick its files in `SelectFilesDialog`, ExtJS `openFolderTree`), Email download link (`DownloadLinkDialog`, `files/file/emailDownloadLink`) in the item menu when the user has the e-mail composer | done (`FilesMain.emailItems()`) |
| Folder picker for other modules (ExtJS SelectFolderDialog / SaveAsDialog, asks before overwriting): `ModuleRegistry.getConfigs('selectFolder')[0]({appName, windowId, title?, fileName?})` → `{id, path, fileName?}` or null | done (`SelectFolderDialog`; used by e-mail "Save to personal folder") |
| Thumbnails view, folder upload (subfolders), keyboard shortcuts Ctrl+C/X/V, create download link / copy direct link (Share menu without e-mail), compress / decompress, templates, batch edit, column state per folder | not ported |

### neo gotchas

- `files/folder/tree` with `showFiles` returns file nodes whose ids collide with folder ids:
  `toTreeNode()` (util.mjs) makes them `f:<id>` and keeps the file id in `fileId`.
- Theme CSS beats a module rule of equal specificity (`.neo-theme-go .neo-form-container
  {padding: 0}` loads later): add the component class to the selector
  (`.my-dialog .neo-form-container.my-form`).

- The home folder is listed as `folder_id: ''`; its id comes from the tree's first root
  (`resolveHomeFolder()`). The first load must not write the route: a deep link waits for
  it and would be replaced by `#files/folder/<home>`.
- `files/folder/list` and other legacy responses can carry handler JavaScript
  (`startjs:…:endjs`); `parseLegacyJson` drops it and neo never runs it.
- A hidden grid gets no width for flex columns: the trash grid uses fixed widths.
- Folder ACL: add groups with `core/aclGroup/selectedStore {model_id, add, addAttributes: {"level": L}}`,
  change a level with `core/aclGroup/updateRecord {model_id, record: {"id": groupId, "level": L}}`,
  remove with `delete_keys`.
