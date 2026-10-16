# Bookmarks, neo.mjs UI

Port of `views/goui` (GOUI) with the parts GOUI lacks taken from `views/extjs3`.
Shell, components and gotchas: `views/neo/README.md`.

| File | What |
|---|---|
| `Index.mjs` | registers the module; `onLogin` registers every bookmark with `behaveAsModule` as its own module `bookmarks-<id>` (ExtJS `Module.js` `initModule()`), so it needs a reload like in ExtJS |
| `view/BookmarksMain.mjs` | toolbar (add, toggle view, administrate categories, category filter, search) and a card layout: the bookmarks, or one bookmark's page (`BookmarkFrame`) |
| `view/BookmarksView.mjs` | bookmarks per category as links; "grid" (tiles) or "columns" (GOUI column view), remembered in `state-bookmarks-main` |
| `view/BookmarkFrame.mjs` | a page in an iframe with "open in new tab"; main view of the `bookmarks-<id>` modules |
| `view/BookmarkDialog.mjs`, `LogoField.mjs` | bookmark form; a typed URL fetches title, description and favicon (`community/bookmarks/Bookmark/description`) |
| `view/CategoriesDialog.mjs`, `CategoryDialog.mjs` | categories grid (owner, add, delete, double click edits) and the category form with permissions |
| `../../../../../views/neo/resources/scss/src/apps/go/bookmarks/` | styles (theme-go) |

Notes:

- Bookmarks are written by other users: only `http(s)` URLs become links or iframes (`util.mjs` `safeUrl()`).
- A bookmark with "open in new browser tab" is a plain `<a target="_blank">`, the browser opens it.
  The others open in `BookmarkFrame`; many sites refuse to be framed (`X-Frame-Options`),
  the toolbar link opens them in a tab (same limit as the ExtJS IFrame tab).
- Only module managers (`mayManage`) may create categories (server `Category::canCreate()`);
  the categories button shows for them and for users with manage rights on a category.
- Logos are blobs: a container with its own data folder shows broken images for blobs
  uploaded elsewhere.
