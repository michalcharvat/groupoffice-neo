# Tasks, neo.mjs UI

Port of `../goui` (GOUI) to the neo webclient; see `www/views/neo/README.md` for the shell.

| File | What |
|---|---|
| `Index.mjs` | registers the module (route `#tasks/task/<id>`, header "+" and search, My account card) |
| `util.mjs` | progress/priority options, status chip and progress bar HTML, task dates ("Y-m-d"), name caches (Principal, TaskList, TaskCategory), module rights |
| `view/TasksMain.mjs` | west: schedule (`ScheduleList`), show completed, assigned (mine / unassigned), lists (`TaskListList`, colour per list), categories, saved filters; center: grid with multi select (merge, delete); east: `TaskDetail` |
| `view/TaskDialog.mjs` | task form (`AutocompleteChips` categories, `DateField`, `DurationField` in seconds, `RecurrenceField`, alerts as `ArrayField`) |
| `view/TaskListDialog.mjs`, `CategoryDialog.mjs`, `SubscribeDialog.mjs`, `ContinueTaskDialog.mjs`, `SettingsPanel.mjs` | list (with permissions), category (global with `mayChangeCategories`), subscribe, continue (date + alert, progress, comment), My account |

Styles: `www/views/neo/resources/scss/src/apps/go/tasks/<Class>.scss` (theme-go).

Filters (ExtJS MainPanel): schedule `today` = `start <= now`, `week` = `due <= 7days`, (un)scheduled;
no checked list = all subscribed lists of the `list` role; categories offered = own, global and
those of the checked lists. The schedule entry and "show completed" are kept in `state-tasks-main`,
the checked lists in `tasksSettings.lastTasklistIds` (with "remember last selected").

Still different from GOUI: the grid is not grouped by list (a "List" column instead) and tasks
can't be dragged onto a list; no import/export, print or project field; the responsible combo
lists all users (the Principal filter has no ACL condition); the category menu closes after
each pick.

## Core findings (candidates for www/views/neo/README.md "Gotchas")

Kept here so parallel module cards don't collide in the shared README.

- **CSS per class**: neo drops only a *leading* `view` from the className. Name module classes
  `GO.<module>.X` (→ `apps/go/<module>/X.scss`); `GO.tasks.view.X` would look for
  `apps/go/tasks/view/X.scss` and load no CSS.
- **Push states** (`src/jmap/Client.mjs`): only the first fetch of a type sets its state
  (`#baseState()`), then only SSE events move it. A dialog that saved and read back its entity
  used to take the new state, so the push of its own change was "no change" and no list reloaded.
- **Per-user properties send no push**: `TaskList.isSubscribed` (and colour, visibility) live in
  `tasks_tasklist_user`; (un)subscribing does not change the TaskList state. Reload by hand.
- **Floating menus above dialogs**: neo menus get an inline `z-index: 100`, dialogs and their mask
  1000. `GO.menu.List.showAt()` sets `zIndex: 1100`.
- **Option id 0**: neo's `ComboBox.getSubmitValue()` is `value[valueField] || emptyValue`; an option
  `{id: 0}` (priority "Normal") was sent as null. `GO.form.field.LocalCombo` keeps 0.
- **Saving resets the form**: `DataSourceForm` loads the saved entity and resets *every* field, also
  unnamed helper fields. Read them on `beforesave`, not `save`.
- **`cls` of a panel's east/west item**: `MainThreeColumnPanel` replaces a child's `cls`; use
  `baseCls` for the structural class (`TaskDetail`).
- **`isDestroyed` of live instances is `undefined`**: `x?.isDestroyed === false` never matches;
  test `x && !x.isDestroyed`.
- **JMAP maps** (`addMap`, e.g. `Task.alerts`): the whole map is replaced on set
  (`Property::patchMap()`); send `true` to keep an entry, `null` to remove, `_NEW_<n>` for new ones.
