# neo workspaces (design, 2026-11-24)

Status: design agreed with the owner in chat, reviewed by Codex (2026-11-24), not implemented.
Implementation starts after the cards that change `apps/go/view/MainView.mjs`
(`core-runs-without-extjs-and-goui`, `6-8-style-app-launcher`).

## Goal

The main area of the neo webclient becomes a dock (neo.mjs 14 `Neo.dashboard.dock.Workspace`) instead of
one card per module. A user splits the screen into panels like the tool windows of IntelliJ IDEA, keeps
several named workspaces (for example "Mail": e-mail + calendar, "Documents": notes + files) and shows each
in its own browser window, for example one per monitor.

## Behaviour

- **One panel = today.** A module opened from the menu or launcher fills the area, as now. Nothing changes
  for a user who never drags.
- **Split by dragging.** Dragging a module tab of the top bar, or a panel header, shows the dock's drop
  indicators: a five-position cross on the hovered panel (left, right, top, bottom, centre = as a tab) plus
  chips for the four edges of the whole area, with a transient preview (`interaction/DropIndicators.mjs`,
  `Preview.mjs`). The top-bar buttons (`MainView` topbar) need a drag source of our own; the dock only
  drags its own tabs.
- **Maximize.** A panel can fill the whole area and Esc restores it (`plugin/Maximize.mjs`). Presentation
  only: it is not saved in the layout.
- **Close.** Default: closing the last tab of a panel removes the panel and its two-child split collapses,
  so the neighbour takes the space (`Operations.closeItem`; closing one of several tabs keeps the panel).
  Option "keep an empty area": only for the centre of an edge-zone topology. `LayoutAdapter`
  `enableDockCenterWell` projects an already-empty centre as a well; it does not keep an arbitrary split
  child on close. With the option, the workspace uses an edge-zone layout (side bands + centre) and opening
  or dropping a module fills the empty centre first.
- **Operations to expose** (panel header context menu + our own key bindings): split, tab, move, resize,
  maximize/restore, close, lock (`setItemLocked`), pin (`setItemPinned`), auto-hide at an edge
  (`setItemAutoHidden`; the rail reveals on click, on hover only with `autoHideRevealOnHover`), tear out to a
  native window and back (`window/TearOut.mjs`). `interaction/KeyboardCommands.mjs` only covers detach and
  cross-window transfer; the other keys are ours.
- **Undo/redo** for model changes only (every change is a pure reducer step over the dock document,
  `model/Operations.mjs`): keep a history of documents. Tear-out and cross-window transfers are not undone.

## Workspaces

- **Several named workspaces per user**, from the first phase. The first one ("Default") is created
  server side on the first `Workspace/query` that finds none (one transaction, unique per user, so two
  windows opening at once create one). The default workspace id is a user property (`defaultWorkspaceId`);
  deleting the default makes the first remaining one the default, deleting the last one is refused.
- **One workspace per browser window.** Each window runs its own `Viewport` / `MainView`
  (`apps/go/app.mjs` `onStart`), so every window has its own module views. The same module can be open in
  two windows, each with its own view (e-mail in window 1 and window 2 is fine). Within one window a module
  is in at most one panel (`MainView.openModules` is keyed by module name). A module twice in one window
  (two note books side by side) needs module views that can exist more than once: phase 3 or later.
- **Window binding.** The window keeps its workspace id in `sessionStorage` (per window, survives a reload;
  through the main thread, like `State.mjs` reaches `localStorage`; `State.mjs` itself is origin-wide and
  can't be used for this). Precedence on start: `#ws/<id>` in the URL > the id in `sessionStorage` > the
  default workspace. A module deep link (`#notes/note/5`) opens in the window's workspace, in the focused
  panel (or as a new panel when the module isn't open). The router (`MainView` route handling) gets a
  special first segment `ws`; Back moves between routes of the focused panel.
- **Continuous save** (debounced) of the current state; "Save" makes a checkpoint, "Revert to saved"
  restores it (see Saving below).
- **Management:** new, rename, duplicate, delete, set default, open in a new window, from the launcher (a
  row of workspaces above the module grid), a switcher in the top bar and `#ws/<id>`. Later: keyboard
  shortcuts (Ctrl+Alt+1…9), workspaces in global search, preference "after login open: last / a given
  workspace / a module".

## What is stored where

One authority per fact: the dock document already holds the item catalog, tab membership and the active
item, so those are not repeated elsewhere.

| Layer | Content | Where |
|---|---|---|
| Panels | the set of panels: stable panel id → module + route of that panel (`notes/note/5`, an e-mail folder) | server, `Workspace.panels`, shared by all profiles and devices |
| Layout | the dock document per profile: splits and their ratios, tab groups, active tab, edge zones, auto-hidden panels; items refer to panel ids | server, `Workspace.layouts[profile]` |
| This window | maximized panel, torn-out native windows, which workspace the window shows | browser only (`sessionStorage`) |

- Split sizes and edge extents are normalized ratios in the dock document, so one layout scales across
  resolutions of the same profile.
- The stored layout is the dock's raw document, schema `neo.dock.zone.v1` (`model/WorkspaceDocument.mjs`;
  not the `neo.dock.layout.v1` saved-layout wrapper of `model/Persistence.mjs`). Capture it with
  `Workspace.getPerspectiveDocument()`, which folds torn-out panels back into their home, so a tear-out
  never saves a missing panel.
- **Reconciling profiles.** Opening or closing a module changes `panels` and the layout of the current
  profile. Another profile's layout is reconciled when it is next shown: a panel it doesn't know is added
  as a tab of its first (or focused) tab group, an item whose panel is gone is removed, the split geometry
  stays.

### Screen profiles

- **Narrow** (`max-width: 576px`, the phone rule of `MainThreeColumnPanel.scss` / `MainView.scss`; 577px is
  already desktop): no workspace. Modules behave as today, one at a time. The dock is suspended, nothing is
  saved while narrow (the single-module state must not overwrite a layout). `#ws/<id>` on a narrow cold
  start shows the workspace's focused panel module (or its first panel) the narrow way. When the window
  shrinks, the focused panel's module stays visible; widening again restores the workspace from the
  server state, plus the module the user switched to as the focused panel.
  The width decides, not the device type: a large tablet or a phone in landscape above the limit gets
  workspaces.
- **Medium** and **wide**, split at about 1400px (to tune after phase 1): each has its own layout. A
  profile without a saved layout opens the workspace's panels as tabs in one group.

## Saving and conflicts

- **Write queue per window:** autosave, Save and Revert go through one queue bound to the workspace id and
  profile the change was made in (a switch of workspace or profile flushes or drops the pending debounce,
  never sends it to the new one). Revert cancels a pending debounce first and is committed as a new state.
- **Conditional writes:** every `Workspace/set` carries `ifInState` (JMAP, `EntityController` checks it when
  supplied). The client sends only the changed properties: `panels` and the one changed
  `layouts.<profile>` (patch syntax), not the whole object.
- **Conflict** (another window saved the same workspace in between): re-read, then
  - a change to another profile, or to `panels` only adding/removing different panels: merge and retry;
  - the same profile changed in both: last write wins for the layout, and the other window shows a notice
    and reloads the workspace (push via the existing SSE/state changes).
- **Checkpoint:** "Save" copies `panels` and `layouts` to `savedPanels` / `savedLayouts`. "Revert" restores
  both together, so a reverted layout never refers to a panel that is gone.

## Backend: entity `Workspace` (go\core)

- `go\core\model\Workspace` with its controller in `go\core\controller`, table `core_workspace`
  (`id`, `aclId`, `createdBy`, `name`, `icon`, `sortOrder`, `panels`, `layouts`, `savedPanels`,
  `savedLayouts` as JSON text, `modifiedAt`); a timestamped entry in `www/go/core/install/updates.php` and the
  table in `www/go/core/install/install.sql`. `defaultWorkspaceId` on the user via an update entry too.
- **Personal by default:** `AclOwnerEntity`, but on create the server sets `createdBy` to the authenticated
  user and a private ACL (owner manage, nobody else; the entity type's default ACL is not copied). Writable
  properties are an allowlist (`name`, `icon`, `sortOrder`, `panels`, `layouts`, `savedPanels`,
  `savedLayouts`); `createdBy`, `aclId` and ACL entries from the client are ignored or refused in phase 1
  and 2 (no sharing UI yet). Administrators get manage access through the ACL like on every entity; the
  UI lists only the user's own workspaces.
- Controller: ACL-filtered queries (`applyAclToQuery()`), permission-checked loads, write/manage checks on
  update and destroy; custom methods (if any) with `@apiPermission`, read-only ones with `@apiReadOnly`.
- **Tests** besides `ControllerPermissionTest`: two ordinary users; user B can't query, get, update or
  destroy user A's workspace; forged `createdBy` / `aclId` / ACL on create and update don't take effect.
- **Validation on save** (PHP 8.2): byte limit of the whole entity incl. checkpoints (e.g. 256 KB), max
  panels (e.g. 30) and node depth; profile keys from a fixed list; layout `schema` = `neo.dock.zone.v1`;
  node ids unique, references resolve, no cycles, split fractions positive and summing to 1; every item
  refers to a panel id; panel modules must be modules the user has access to (re-checked when a route is
  restored on the client, too); dock `metadata` / `blueprint` reduced to the fields GO uses.
- Strings (`Workspace`, `Default`, menu items, notices) in `www/go/core/language/en.php`, client side
  through `t()`.

## Work besides the dock

- `MainThreeColumnPanel` switches its layout on the viewport width (`@media` in
  `resources/scss/src/apps/go/MainThreeColumnPanel.scss`). In a panel it must follow the panel width:
  container queries (`container-type: inline-size` on the panel, `@container` rules). This touches every
  module that uses it and is the biggest part outside the dock itself.
- Badges, module popout, global keyboard shortcuts and dialogs relate to the focused panel. The module
  popout (`MainView` placeholder card + `GO.view.PopupView`, `src/Popup.mjs`, shared App worker only) is
  replaced by the dock tear-out in phase 3; until then it pops out a panel's module the same way.
- The dock API is new in neo 14 and still moving. Wrap it in one GO class, `GO.view.Workspace`
  (`src/view/Workspace.mjs`), so a neo upgrade touches one place; note it in
  `docs/neo-core-components.md` → "neo.mjs upgrades".

## Phases

1. **Base:** entity `Workspace` (table, JMAP, ACL, validation, tests); `GO.view.Workspace` over the dock as
   the main area of `MainView`; drag from the top bar, maximize, close; write queue with conditional saves
   per workspace and profile; window ↔ workspace binding, `#ws/<id>`, a switcher; container queries for
   `MainThreeColumnPanel`; no workspace below the narrow limit.
2. **Management and windows:** open in a new window, Save/Revert checkpoints, launcher row of workspaces
   and Shift+click "open beside" (the launcher card leaves an event for it), keyboard shortcuts, the
   after-login preference, the empty-centre option, undo/redo.
3. **Advanced:** tear-out of single panels instead of the module popout, auto-hide at edges, lock, admin
   templates for groups (sharing, a personal copy for read-only users), export/import as JSON, a module
   more than once in one window.

## Decisions taken (owner, 2026-11-24)

- Workspaces are generic, several per user, not one fixed layout.
- The workspace is the main area itself, not a separate module hosting other modules (that would need two
  hosts of the same views and drag and drop between them).
- No workspace on narrow screens.
- Layout differs per screen profile; the panels are shared.

## Open

- Admin templates for groups: wanted, or personal workspaces only? (assumed phase 3)
- Profile limit between medium and wide (1400px assumed).
- Limits for validation (size, panel count) to confirm in phase 1.
