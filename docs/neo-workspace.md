# neo workspaces (design, 2026-11-24)

Status: design agreed with the owner in chat, reviewed by Codex (2026-11-24). Phase 1 implemented
(2026-11-24, see "Phase 1: as built"); phases 2 and 3 open. **Model v2 (owner decision 2026-11-25,
implemented the same day, see "Model v2: workspaces as top-bar tabs")** replaces the dock as the whole main
area and the one-workspace-per-window binding; where it differs, it wins over the sections before it.

**Where it lives (owner decision 2026-11-24):** everything workspace-specific is the module
**`sf/workspaces`** in the sf-mono repository, branch `neo` since 2026-11-25 (`docs/neo-upstream-sync.md`, "sf modules for neo"; `go/modules/sf/workspaces`: entity, JMAP, tables, tests and
its neo frontend in `views/neo`). Workspaces are **off by default**: without the module installed, or for a
user without access to it (standard module permissions, the module is shared with "Internal" on install),
the neo `MainView` is today's one card per module and loads no dock code. neo core only has a generic
extension point (ModuleRegistry `mainViewExtension`, `docs/neo-small-modules.md` "Main view extensions") and the generic pieces (top-bar drag source, per-window
storage, container queries). neo adds no database updates to core (`docs/neo-upstream-sync.md`).

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
  server side on the first `SfWorkspacesWorkspace/query` that finds none (one transaction, unique per user, so two
  windows opening at once create one). The default workspace id is a user property (`sfWorkspacesSettings.defaultWorkspaceId`);
  deleting the default makes the first remaining one the default, deleting the last one is refused.
- **One workspace per browser window** (phase 1; model v2 opens several workspace tabs per window). Each window runs its own `Viewport` / `MainView`
  (`apps/go/app.mjs` `onStart`), so every window has its own module views. The same module can be open in
  two windows, each with its own view (e-mail in window 1 and window 2 is fine). Within one window a module
  is in at most one panel (`MainView.openModules` is keyed by module name). A module twice in one window
  (two note books side by side) needs module views that can exist more than once: phase 3 or later.
- **Window binding** (phase 1; model v2 keeps the open workspace tabs instead). The window keeps its workspace id in `sessionStorage` (per window, survives a reload;
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
- **Medium** and **wide**, split at GO's `$breakpointMedium` = 1200px (`goui/style/_config.scss`; the
  breakpoints GO already uses, owner 2026-11-24): each has its own layout. Two columns can get tight on
  some widths above that; revisit after phase 1. A profile without a saved layout opens the workspace's
  panels as tabs in one group.

## Saving and conflicts

- **Write queue per window:** autosave, Save and Revert go through one queue bound to the workspace id and
  profile the change was made in (a switch of workspace or profile flushes or drops the pending debounce,
  never sends it to the new one). Revert cancels a pending debounce first and is committed as a new state.
- **Conditional writes:** every layout autosave (`SfWorkspacesWorkspace/set` from the save queue) carries `ifInState`; New, Rename and Delete in the switcher don't (JMAP, `EntityController` checks it when
  supplied). The client sends only the changed properties: `panels` and the one changed
  `layouts.<profile>` (patch syntax), not the whole object.
- **Conflict** (another window saved the same workspace in between): re-read, then
  - a change to another profile, or to `panels` only adding/removing different panels: merge and retry;
  - the same profile changed in both: last write wins for the layout, and the other window shows a notice
    and reloads the workspace (push via the existing SSE/state changes).
- **Checkpoint:** "Save" copies `panels` and `layouts` to `savedPanels` / `savedLayouts`. "Revert" restores
  both together, so a reverted layout never refers to a panel that is gone.

## Backend: entity `Workspace` (module sf/workspaces)

- `go\modules\sf\workspaces\model\Workspace` (JMAP name `SfWorkspacesWorkspace`, the sf convention) with
  its controller in the module, table `sf_workspaces_workspace` (`id`, `aclId`, `createdBy`, `name`, `icon`,
  `sortOrder`, `panels`, `layouts`, `savedPanels`, `savedLayouts` as JSON text, `modifiedAt`) in the module's
  `install/install.sql`. The default workspace is `User.sfWorkspacesSettings.defaultWorkspaceId`, a
  `UserSettings` property hung on the core User by the module (table `sf_workspaces_user_settings`), not a
  core column.
- **Personal only:** `AclOwnerEntity`, but on create the server sets `createdBy` to the authenticated
  user and a private ACL (owner manage, nobody else; the entity type's default ACL is not copied). Writable
  properties are an allowlist (`name`, `icon`, `sortOrder`, `panels`, `layouts`, `savedPanels`,
  `savedLayouts`); `createdBy`, `aclId` and ACL entries from the client are ignored or refused (workspaces are
  never shared). Administrators get manage access through the ACL like on every entity; the
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
  module that uses it and is the biggest part outside the dock itself. Done: wide (three columns), medium
  577–1200px of the module's width (center and east, the west a drawer, like GOUI's `.main-3-col .west`)
  and narrow (one card); the medium step was missing until 2026-11-25.
- Badges, module popout, global keyboard shortcuts and dialogs relate to the focused panel. The module
  popout (`MainView` placeholder card + `GO.view.PopupView`, `src/Popup.mjs`, shared App worker only) is
  replaced by the dock tear-out in phase 3; until then it pops out a panel's module the same way.
- The dock API is new in neo 14 and still moving. Wrap it in one GO class, `GO.workspaces.Workspace`
  (`sf/workspaces/views/neo/Workspace.mjs`), so a neo upgrade touches one place; note it in
  `docs/neo-core-components.md` → "neo.mjs upgrades".

## Phases

1. **Base:** entity `Workspace` (table, JMAP, ACL, validation, tests); `GO.view.Workspace` over the dock as
   the main area of `MainView`; drag from the top bar, maximize, close; write queue with conditional saves
   per workspace and profile; window ↔ workspace binding, `#ws/<id>`, a switcher; container queries for
   `MainThreeColumnPanel`; no workspace below the narrow limit.
2. **Management and windows:** open in a new window, Save/Revert checkpoints, launcher row of workspaces
   and Shift+click "open beside" (the launcher card leaves an event for it), keyboard shortcuts, the
   after-login preference, the empty-centre option, undo/redo.
3. **Advanced:** tear-out of single panels instead of the module popout, auto-hide at edges, lock,
   export/import as JSON, a module more than once in one window.

## Phase 1: as built (2026-11-24)

Where it lives:

Module `sf/workspaces` (sf-mono, paths below `go/modules/sf/workspaces/`):

| Part | File |
|---|---|
| Entity, validation, default workspace | `model/Workspace.php`, `model/WorkspaceLayout.php` (mirror of neo's document validator), `model/UserSettings.php` |
| JMAP | `controller/Workspace.php` (`SfWorkspacesWorkspace/*`); `User.sfWorkspacesSettings.defaultWorkspaceId` (read-only) |
| Tables | `install/install.sql` (`sf_workspaces_workspace`, `sf_workspaces_user_settings`) |
| Tests | `tests/WorkspaceTest.php` (+ `tests/ensure-default.php`, a child process for the concurrent first open; `tests/setup-database.php` creates the `GO_TEST_DB`, see the go:tests skill) |
| Registration | `views/neo/Index.mjs` (no app; `mainArea`, model v2: `mainViewExtension`) |
| Main area, profiles, switcher | `views/neo/MainArea.mjs` (`GO.workspaces.MainView`, a subclass of `GO.view.MainView`; removed in model v2) |
| Dock wrapper | `views/neo/Workspace.mjs` (`GO.workspaces.Workspace`) |
| Write queue | `views/neo/SaveQueue.mjs` |
| Styles | `views/neo/style.css` |

neo core (groupoffice26-neo), generic:

| Part | File |
|---|---|
| Extension point (phase 1, replaced in model v2) | `src/ModuleRegistry.mjs`: a module's `mainArea: () => import(...)` resolves to a subclass of `GO.view.MainView`; `loadMainView()` picks the first one the user has access to, `apps/go/view/Viewport.mjs` builds it. `MainView` hooks: `initModulesArea()` (set up the area below the top bar), `start(current)` (boot), plus the module methods a subclass overrides (`onHashChange`, `openModule`, `quickAdd`, `popOutModule`, `moveModuleToWindow`, `dockModule`, `closeModules`, `removeModules`). The top bar, launcher (`getReference('launcher')`, its `openBeside` event), badges and popout stay in `MainView`. |
| Window binding | `views/neo/src/windowStorage.mjs` + main-thread addon `src/main/addon/WindowStorage.mjs` (`sessionStorage`) |
| Drag from the top bar | main-thread addon `src/main/addon/DockDrag.mjs` (native drag and drop of the module tabs, custom DOM events `goDockDragStart` / `goDockDragEnd` / `goDockDrop` to the App worker); loaded by the main area that wants it |
| Container queries | `MainThreeColumnPanel.scss`, calendar and bookmarks follow their panel width |

How it works:

- A panel is a module view in a host container (`go-module-host`); the panel id is the dock item id
  (`p<time><random>`). MainView owns the hosts, the dock keeps them alive through `getPreservedItemIds()`
  and shows them through `resolvePane()`. One panel per module per workspace (phase 3 lifts that).
- The focused panel is the last one clicked (pane or its tab). The address follows it with
  `replaceRoute` (`<module>/<route>`); a route change inside a panel is saved as that panel's route.
- Window binding precedence: `#ws/<id>` > the window's `sessionStorage` (`go-workspace-id`) > the user's
  default. `#ws/<id>` loads the workspace, then the address moves on to its focused panel.
- Profile from a `ResizeObserver` on MainView: ≤ 576px narrow, < 1200px medium, otherwise wide. Narrow
  shows the panels as one tab group (CSS `go-workspace-narrow`), nothing is saved. Its tab strip switches
  between the panels: the top bar shows only the pressed tab when narrow, so it can't (the strip was hidden
  until 2026-11-25 and the other panels were unreachable on a phone); tabs that don't fit go to its "More
  tabs" menu, the dock actions (panel menu, maximize, close) are hidden (`style.css`), and the right click
  menu and "move out" (a tab dropped on the top bar) do nothing (`OpenWorkspace` checks the profile); widening reloads the workspace from the server plus the module the
  user switched to. When that module was not a panel of the workspace yet, it is saved as a new panel
  right after widening (the first save after the narrow time; before 2026-11-25 only with the next
  change, so a reload lost it).
- Saving: every committed dock change (and a panel's route) is queued; 1.5 s debounce per workspace and
  profile; `SfWorkspacesWorkspace/set` with `ifInState` and a patch of `panels` plus `layouts/<profile>`. On
  `stateMismatch` the queue reads `Workspace/changes`: when this workspace didn't change it only moves on to
  the new state, otherwise it re-reads the workspace and applies only what this window changed against
  the copy it edited: panels it added, changed or closed (all other panels, their routes included, are
  the server's); the profile's layout only when this window changed it (then last write wins, items of
  panels gone are dropped; "changed" means a dock edit, not only a route). The same local edit is applied
  again to each fresh copy, and the type state is taken together with that copy. Up to 5 attempts; after a merge the window reloads the workspace to show
  the result. A save that fails otherwise (network) stays queued for the next flush.
- Another window's save arrives as a `SfWorkspacesWorkspace` state change: a window that shows the workspace reloads
  it when the panels or its own profile's layout changed (with the notice "This workspace was changed in
  another window."), otherwise it only takes the new base.
- Switcher (top bar, icon `dashboard`, hidden when narrow): the workspaces, New (name prompt), Rename,
  Delete (confirm; the last one can't be deleted, the server moves the default to the next one).

Deviations from the design above:

- Workspaces are a module, off by default (owner decision 2026-11-24, see the status above); the first
  version put them in core with a core database update, which breaks upstream merges.
- The module's strings are in its own `language/en.php` (and `cs.php`); the client uses
  `t(key, 'sf', 'workspaces')`.
- `ifInState` is compared with the global `SfWorkspacesWorkspace` state (JMAP has no per-entity state), so any save
  of another workspace of the user is a mismatch too; `SfWorkspacesWorkspace/changes` tells the two apart (above).
- Access is the owner's (and an administrator's) whatever the ACL holds (`internalGetPermissionLevel()`,
  `applyAclToQuery()`, `getChanges()`): a default grant of the entity type applied to all ACLs must not share a
  workspace, nor report its changes to another user.
- A bookmark opened as a module (`bookmarks-<id>`, bookmarks `views/neo/Index.mjs`) is a panel; the server
  checks access to the bookmarks module, the client opens only bookmarks the user can see.
- A malformed `panels` / `layouts` value (not an object) is a validation error of that record.
- `sfWorkspacesSettings.defaultWorkspaceId` is read-only for the client and shown only to its user and
  administrators. Its foreign key sets it to null when the workspace is deleted (the server moves the
  default to the next one first; a missing default falls back to the first workspace). Choosing a default
  in the UI is phase 2.
- The server validates only a profile layout that changed against the panels; a stale reference in
  another profile is reconciled by the client when that profile is shown ("Reconciling profiles").
  Module access is checked for new or changed panels only, and the client drops panels of modules the
  user can no longer open.
- PHP turns `{}` into `[]` on the JSON round trip; the client normalizes the document
  (`normalizeDocument()`).
- The maximized panel is not kept in `sessionStorage`: a reload restores the layout, not the maximize.
  The layout is captured with `getDocument()`, a copy of `getPerspectiveDocument()`.
- The dock's maximize button shows when the pointer is over the group header (neo's contextual actions);
  Esc restores.
- Known neo warning: "Neo.tab.header.Button: 'cls' / 'maxWidth' was set after destroy()" can show once when
  a profile change reloads the workspace (the tab Overflow plugin measures buttons the reconciler just
  replaced; neo ignores the write). Not an error; check again after a neo.mjs upgrade.
- The launcher's Shift+click "open beside" is left for phase 2 (the event is reachable from the main area
  through `getReference('launcher')`).
- Limits confirmed: 256 KB for `panels` + `layouts` + saved copies, 30 panels, 200 nodes, depth 16,
  route 1024 characters, item title 190.

### Fixes after the first browser check (2026-11-25)

- Focusing a panel replaces the address with the panel's route only while the window's hash is still the
  one the App worker last handled (`replaceRoute(windowId, value, {ifHash})`, `src/history.mjs`): the
  click that focused the panel may set the module's own route (a grid row), and that route wins.
- Tab groups, splits and tab bodies of the dock get `min-height: 0` / `min-width: 0` (module
  `style.css`): a group that is no split child kept `min-height: auto` and grew to its module's content.
- A native drag of a top-bar tab sends no mouseleave: the window's shared tooltip is hidden when the drag
  starts and ends (`hideTooltip()`, `src/tooltip.mjs`). A click on a dock header action hides it too, so a
  toggle (maximize ⇄ restore) shows its new text on the next hover; the actions use the core translations
  (`dockActionTooltips`).
- Header buttons are a pill (`border-radius: 999px`), round for an icon; the switcher and the other header
  buttons have `flex: 'none'` (the toolbar sets `flex` inline, CSS can't override it), the module tabs
  shrink and cut their titles with an ellipsis; below 1200px only the active tab shows its close icon.
- Not fixed here: a module deep link with an empty route (`#notes`) keeps the selection the panel's stored
  route made, so the address and the selected row can differ until the next click (module routing).
- Planned as its own card (owner, 2026-11-25): workspaces as their own tabs in the top bar next to the
  standalone module tabs, instead of the dock being the whole main area. Done: "Model v2" below.

## Model v2: workspaces as top-bar tabs (owner decision and implementation, 2026-11-25)

Why: with the dock as the whole main area, the open module tabs vanished when a workspace opened and a
launcher click landed in a dock tab. Now workspaces are tabs next to the module tabs.

Behaviour:

- The top bar keeps its module tabs exactly as without workspaces, plus a tab per open workspace (after the
  main menu button, then the "+"). The default workspace is called "Workspace" (translated; also a default
  still named "Default"/its translation is shown so), the others by their name, each with its icon
  (`fa fa-table-columns` when it has none). "+" lists the closed workspaces and "New workspace"; when
  narrow (where the core hides every tab that is not pressed) it lists all workspaces but the shown one. Right click on a workspace tab: Rename, Close, Delete (confirm; the last one can't
  be deleted).
- A workspace tab shows its dock; a module tab shows the module alone.
- A module view exists once per window: a standalone tab or a panel in one workspace. Opening a module
  (launcher, search, deep link, link, alert) that is live in a workspace activates that workspace and
  focuses its panel; a module that is a panel of the shown workspace (or of an open one) but live
  nowhere opens there. Otherwise it opens standalone. A panel whose module is live elsewhere in the
  window shows a placeholder: "{module} is open elsewhere in this window." with "Show here" (takes the
  view over; it leaves the other place).
- Dragging a module's top-bar tab onto a workspace tab (hover 600 ms activates it) or into the shown dock
  adds it there; its top-bar tab disappears. Dragging a panel's dock tab onto the top bar, "Move out of the
  workspace" in the panel menu (the ⋮ header action or a right click on the panel's tab), makes it
  standalone again. The panel menu also has "Open in new window" (popout) and "Close".
  Moving out a panel with its module view routes once, itself (`moveOut()`; a placeholder just closes): `onPanelClose()` and the focus moving to the next
  panel (`onPanelActivate()`) leave the address alone meanwhile (`movingOut`), else their
  `replaceRoute()` could land after it and leave the workspace tab pressed. When the address is the
  panel's already, `moveOut()` calls `mainView.showModule()`: a `setRoute()` to the same hash fires no
  hashchange (fixed 2026-11-25).
- Several workspaces per window. `#ws/<id>` opens or activates a workspace tab (unknown id: reloads the
  list once, else "Not found"), then the address moves on to the focused panel. The window keeps
  `{open: [ids], active}` in `sessionStorage` (`go-workspaces`), so a reload restores the open tabs and the
  shown workspace. A window without stored state opens the default workspace's tab; a window bound by
  phase 1 (`go-workspace-id`) opens that workspace's tab once.
- Saving per workspace and screen profile, conflicts and the narrow behaviour stay. Narrow: a workspace tab
  shows its panels as tabs the narrow way and nothing is saved; leaving narrow reloads the open workspaces
  from the server (a panel route changed while narrow is not kept).

Where it lives:

| Part | File |
|---|---|
| Core extension point | `src/ModuleRegistry.mjs` (`mainViewExtension`, `loadMainViewExtensions()`), `apps/go/view/Viewport.mjs`, `apps/go/view/MainView.mjs` (hooks and API: `docs/neo-small-modules.md`, "Main view extensions") |
| Top-bar drag, drop on a tab | `src/main/addon/DockDrag.mjs` (`[data-go-dock-tab]`, `goDockDragHover`) |
| Extension (one per window) | module `views/neo/Extension.mjs` (`WorkspacesExtension`): the "+", tab context menu, routes `ws/<id>`, `showModule`, profile, `sessionStorage`, the shared `SaveQueue` |
| One open workspace tab | module `views/neo/OpenWorkspace.mjs`: its dock card and tab, load, layout per profile, panels and their module views (claimed from MainView), panel menu, move out, drop, popout, remote changes, badge (sum of its live modules) |
| Dock | module `views/neo/Workspace.mjs`: header action `go-panel-menu`, a panel dragged above the dock fires `panelDragOut` / `panelMoveOut` |

Notes and gotchas:

- `MainArea.mjs` and the `mainArea` hook are gone; MainView without an extension is the plain card per
  module and loads no dock code (a user without access, or the module disabled: only the module's
  `style.css` is requested, which Neo.php links for every installed module).
- Boot order: the extension's `start()` opens the stored tabs and loads the shown workspace first (it gets
  the module views it shares with another one), then MainView routes the address.
- Boot of a second window: the dock's first projection could stay pending in neo for good when it was set
  before or right at the dock's mount, so the load, `MainView.ready` and the window's routing never ended
  (about every third boot in headless Chromium; the stall point moved with timing, and logging hid it). Now
  `OpenWorkspace.dockMounted()` waits for the dock and its host to be mounted plus 100 ms, the first load
  skips clearing an empty dock, and the extension gets the `DockFlip` addon of the window first
  (`Neo.currentWorker.getAddon()`; `Neo.Main.importAddon({name: 'DockFlip'})` never resolved). 15 of 15
  boots after that. Diagnose such a stall with a state field read over CDP `Runtime.evaluate` in the
  shared worker, not with logs.
- The profile is measured on the main view; before it is mounted its rect is empty, so the window's
  `innerWidth` (`Neo.Main.getWindowData()`) counts until the ResizeObserver reports.
- The default workspace is created as "Workspace" (`go()->t("Workspace", "sf", "workspaces")`).
- Module tabs show only the modules open in the window (`docs/neo-small-modules.md`, "Module tabs"). A tab
  restored after a reload has no view until it is shown, so it counts as closed for `isFree()`: the first
  workspace that has the module and loads takes it and the tab goes, which keeps modules in a workspace off
  the top bar. A standalone tab with a live view keeps the old behaviour (the panel shows the placeholder).
- The dock's header actions show only while the group has the focus or the pointer; the right click on a
  panel tab is the stable way into the panel menu.
- Logout flushes the save queues of all windows of the worker first (`beforeLogout`; the session is
  theirs too), which fixes the open item "Logout destroys the main view after `client.logout()`" below.
- `SaveQueue` keeps `ifInState` per workspace (the state its copy was read or saved at): with several
  workspaces in a window, a newer state taken with one of them let a save of another skip the conflict
  check (Codex review 2026-11-25).
- Review fixes (Codex, 2026-11-25): a workspace whose first load failed loads again when shown and takes no
  drop meanwhile; a module dropped on an inactive workspace tab shows that workspace; a slow workspace open
  doesn't win over an address the window went to meanwhile; a remote change during a load is checked again
  after it; a delete saves a queued edit first instead of dropping it; MainView keeps the address before a
  classic link or an unknown hash, a hash that comes while the extensions start wins over the window's
  first hash, and a claimed standalone view leaves no open token (it read as "open elsewhere").
- Second Codex pass (2026-11-25): "loaded" means the whole load finished (`OpenWorkspace.loaded`), and a
  click on the tab of a failed one loads it again; a module shown in a workspace doesn't take the card
  back when the address moved on meanwhile; an unknown `#ws/<id>` doesn't replace a newer address; a
  quick resize back doesn't leave a dock in the wrong profile; leaving narrow also puts the saved route
  in the address; a push during the first load is checked after it; a closing window stays in the
  logout flush until its own flush ended; each boot load holds up the window's routing for at most
  20 s. Still open (from phase 1, below): `SaveQueue` has one pending slot, so a failed save of one
  workspace is lost when another workspace's edit is pending. The `WS/DockDrag` leak after logout is fixed too: tabs are draggable
  only while a drop target exists.

Browser check (2026-11-25, Playwright against a container with the module): neotest and neoadmin; 900,
1440, 1920 and 390 px; drag into the dock and onto a workspace tab, split, move out by menu and by drag,
new/rename/close/reopen/delete, two windows ("Show here" across windows), popout and back, reload restore,
without access and with the module disabled; no console errors. Harness notes: reloading the only page of
the shared worker comes back blank in headless Chromium, keep a second "anchor" page open; the App
worker's console is read over CDP (shared worker target); Playwright's `dragTo()` sends one dragover, the
dock needs a stepped mouse drag.

## Phase 2: as built (2026-11-25)

Phase 2 of "Phases" above, on model v2 (workspaces are top-bar tabs, several per window). The core keeps
only generic extension points (`docs/neo-small-modules.md`, "Main view extensions": hooks
`launcherItems`, `openBeside`, `searchResults`, `hotKeys`, `cardTitle`; `windowMenuItems()`,
`openWindow()`, `WS/HotKeys`); everything about workspaces is in the module.

Behaviour:

- **Windows.** Workspace tab menu: "Open in new window" (the tab moves to a new browser window of the same
  size; it closes here only when the browser opened the window, else "The browser blocked the new
  window.") and "Move to window N: <what it shows>" for every other window of the session (the tab closes
  here and opens there). A standalone module tab has "Move to window N" too (core), and so has a panel's
  menu (the panel leaves the workspace and the module opens in the other window). A window opened on
  `#ws/<id>` (new window, link) opens only that workspace. Closing a window opened by "Open in new
  window" brings its open workspaces back to the window that opened it (shown there), unless another
  window has them open (2026-11-25; before, they were only gone from both); a reload keeps them there.
  `Extension.returnToOpener()`: the App worker can't tell a closed window from a reloaded one (both
  leave with a "disconnect", a reload comes back under a new window id). So each window has a tag in
  its sessionStorage (`go-workspaces-window`, survives a reload) and the new window gets the opener's
  tag and a key (`go-workspaces-opener`, written into its sessionStorage by `WS/History`
  `openWindow({key, items})`). The opener's page keeps the window handle under the key;
  `isWindowClosed()` reads `window.closed` (checked a few times within 2.5 s, pagehide comes before
  `closed`); the handle goes first, since a duplicated browser tab shares the tag. When the opener
  reloaded since (no handle) or is reloading, the window counts as closed when no window with its tag
  is back within 8 s. Known limits of that fallback (Codex review 2026-11-25, left as they are): a
  reload of the new window slower than 8 s restores its tabs in both windows, and a reload whose tabs
  change and which is closed again within the 8 s brings back the tabs from before. A window closed
  while it starts returns the workspace it was opened for (`ws` in `go-workspaces-opener`).
- **Save / Revert.** "Save layout" copies the workspace's panels and layouts to `savedPanels` /
  `savedLayouts`; "Revert to saved layout" (disabled without a checkpoint) writes them back and reloads.
  Both go through the write queue (`SaveQueue.checkpoint()` / `revert()`, `exclusive()`: after the
  window's pending saves, with `ifInState` and up to 5 retries on a conflict), so another window's edit is
  never overwritten silently.
- **Undo / redo** of dock changes in this window (50 steps, per workspace): tab menu or Ctrl+Alt+Z, redo
  Ctrl+Alt+Shift+Z / Ctrl+Alt+Y. Focus changes are no steps. A load (another window's change, revert)
  clears the history. Undoing an added panel closes that module view; a snapshot's panel whose module is
  live elsewhere gets its placeholder. Multi-step edits (open beside, undo, redo) run after a running load
  and hold remote reloads until they end (`OpenWorkspace.editing()`); without that a Shift+click right
  after a close was overwritten by the close's own push about every other time.
- **Launcher.** A row above the module tiles: the workspaces (the shown one pressed) and "New workspace";
  in list mode they head the menu. Shift+click / Shift+Enter on a tile opens the module right of the
  focused panel of the shown workspace (else the one shown last, else the default one); into the empty
  centre when there is one. Narrow, or without the module: the tile opens as usual.
- **Shortcuts.** Ctrl+Alt+1…9 show the workspace tabs in their order; undo/redo above. They match
  `KeyboardEvent.code`, so they work on every layout and macOS; AltGr never triggers them.
- **Search.** The header search lists workspaces whose name contains the text (entity "Workspace"),
  before the server results; a click opens the workspace.
- **After login** (My account → Workspaces, `User.sfWorkspacesSettings.startMode` / `startWorkspaceId`):
  "The workspaces open last" (default: the tabs and shown workspace of the window that changed them last
  in this browser, `localStorage` `go-workspaces-last-<userId>` via `src/State.mjs`), "A given workspace"
  (only that tab, shown), "The start module (Look & feel)" (the default workspace's tab, the start module
  shows). Logout clears the windows' stored tabs, so the next login applies the preference. Validation in
  `Module::onUserValidate()`: an unknown mode or another user's workspace is refused ("Invalid value");
  other users read null.
- **Empty centre** ("Keep an empty centre", per workspace, `keepCentre`): the dock projects an empty
  centre as a drop well (neo `enableDockCenterWell`), a drop at an edge makes a band around it
  (`Workspace.toBand()`, 25 %), and the first panel fills the centre. Existing layouts are not converted.
  Without the option an emptied edge zone is dropped (`dropEmptyZones()`).

Backend: `Workspace.keepCentre` (writable), `UserSettings.startMode` / `startWorkspaceId` (FK, `ON DELETE
SET NULL`), update `202611251200`; tests in `tests/WorkspaceTest.php` (start preference of the own
account, defaults hidden from other users, another user's workspace and an unknown mode refused,
keepCentre, checkpoint and revert with `ifInState`). The "another user's workspace" test fails with the
guard removed.

Gotchas:

- `window.open()` copies the opener's `sessionStorage`: the new window restored the old window's tabs.
  `WS/History.openWindow()` clears the copy (the new window is still `about:blank` of the same origin).
- The launcher closes without giving the focus back after Shift+click and after a row item, so the main
  menu button's tooltip is hidden by hand (`hideTooltip()`).
- After `openBeside` the address is set before the panel's own focus routes it, else the address stayed
  on a module closed later (`Extension.openBeside()` sets `routeModule` first).
- The neo theme has to be rebuilt (`npm run build-themes`) after the launcher SCSS change, or the row
  shows unstyled buttons.

Review fixes (Codex, 2026-11-25):

- Only the user (or an administrator) sets the start preference: a user manager may update other
  accounts through the core User controller (`Module::onUserValidate()`, test
  `testAnotherUserCantSetTheStartPreference`).
- A checkpoint or "Keep an empty centre" write doesn't move the window's base or `ifInState`: the next
  edit meets another window's unseen change as a conflict and merges it, instead of overwriting it.
- "Save layout" and "Revert" stop with "The layout could not be saved. Please try again." when a save
  before them failed (`SaveQueue.exclusive()`, type `unsaved`); revert saves a pending edit first
  instead of dropping it.
- Checkpoint layouts are trimmed to the saved panels (an unchanged profile may still name a closed
  panel, a new `savedLayouts` is validated); a saved empty workspace counts as a checkpoint
  (`hasCheckpoint()`: saved panels or saved layouts).
- A push updates the checkpoint marker and `keepCentre` of the other windows without a reload.
- An edit waits at most 10 s for a running load and is skipped when it still runs.
- Undo/redo bring a panel back with the route it had last (`lastRoutes`).
- "Move to window" of an inactive standalone module keeps its deep link (`openModules[name].route`).
- Logout also clears the phase 1 window key; the launcher unregisters its main-thread key
  registrations (field, tiles, row) on destroy.
- Second pass: a save the server refused also blocks Save/Revert (`SaveQueue.failed`, `isUnsaved()`);
  edits made while a revert runs are not saved (`OpenWorkspace.reverting`, the reload shows the
  checkpoint); "Move to window" of a panel stops when its removal wasn't saved and waits for the other
  window's copy to reload (`reloadNow()`); a checkpoint or keepCentre write still moves `ifInState` on
  when the window has seen the server copy (no needless merge, which would reload and clear undo);
  "Save layout" writes the layout too, so an untouched empty workspace gets a checkpoint; a push that
  comes while a save is pending is checked after it.

Browser check (2026-11-25, Playwright, container with the module): neotest and neoadmin; 900, 1440, 1920
and 390 px; launcher row and Shift+click, undo/redo, save/revert, search, Ctrl+Alt+1, new workspace from
the row, keep an empty centre (well, close all panels, refill), open in new window, move a module and a
workspace between windows, My account preference (saved, a new login opens the chosen workspace; module
and last modes), without access and with the module disabled (no row, Shift+click opens as usual, no
shortcuts); no console errors from this change.

## Decisions taken (owner, 2026-11-24)

- Workspaces are generic, several per user, not one fixed layout.
- The workspace is the main area itself, not a separate module hosting other modules (that would need two
  hosts of the same views and drag and drop between them).
- No workspace on narrow screens.
- Layout differs per screen profile; the panels are shared.
- Personal workspaces only; no admin templates or sharing for now.
- Profile limits follow GO's breakpoints: 576px (narrow) and 1200px (medium / wide).

## Open

- Found by the review of the module move (2026-11-24), not fixed in phase 1:
  - Logout destroys the main view after `client.logout()`, so a layout edit made in the last 1.5 s before
    logging out is not saved. Fix: flush the save queue before the logout request. Fixed in model v2.
  - `SaveQueue` keeps one failed write per workspace; a failed save of one profile can be replaced by a
    newer edit of the other profile. Fix: keep failed writes per workspace and profile.
  - The core addon `WS/DockDrag` stays active in a tab after logout; a user without the module who logs in
    there gets draggable module tabs (dropping does nothing). Fix: register and unregister it with the
    workspace main view. Fixed in model v2 (draggable only while a drop target exists).
  - `SfWorkspacesWorkspace/changes` filters `changed` to the user's own workspaces, not `removed`: when an
    administrator grants another user rights on someone's workspace ACL by hand, that user can see the id
    of the workspace once it is deleted (an id only, no data).
- Otherwise see the phases above.
