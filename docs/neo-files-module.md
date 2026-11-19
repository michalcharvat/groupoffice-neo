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

See the end of this file (filled in per section).
