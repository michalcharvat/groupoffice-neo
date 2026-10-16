# neo: small modules and authentication

Neo UIs of the small community modules (card "neo-ui: menší moduly a autentizace").
Each lives in `www/go/modules/community/<module>/views/neo`. Templates: GOUI (`views/goui`)
where a module has one, else ExtJS3.

| Module | neo UI | Template | Notes |
|---|---|---|---|
| apikeys | System settings card "API Keys": keys (name, user, created), add, view token, delete | GOUI | the token is shown selected in a dialog (no clipboard API from the worker) |
| history | main module "History" (west: date range, user, actions, entity types; LogEntry grid, "Changes" dialog) + System settings card | GOUI | entity types come from `Module/get` `entities` (GOUI: client-side `entities.getAll()`) |
| davclient | My account card "DAV Accounts" (only with the calendar capability) + account dialog (server, collections, permissions) | GOUI | collections are removed by saving the map without them |
| oidc | System settings card (OpenID Connect clients) + "Sign in with …" buttons on the login screen | GOUI | buttons: `views/neo/login.php`, see below |
| otp | login step, My account card "Two Factor Authentication", enable dialog (QR, secret, verify), setup enforced after login, System settings card | ExtJS | GO puts the card into Account and the settings into Authentication; neo shows own cards |
| googleauthenticator | — | — | no UI (replaced by otp) |
| imapauthenticator, ldapauthenticator | System settings cards with server profiles | ExtJS | GO shows them as fieldsets in Authentication; domains and groups are chips (`systemsettings/authServerFields.mjs`) |
| oauth2client | System settings card "OAuth2 Client Settings" + connection dialog | ExtJS | `EmailOverrides.js` (e-mail account dialog) belongs to the legacy email module: open |
| jitsimeet | System settings card + `onlineMeeting` service for the calendar's event dialog | GOUI | `ModuleRegistry.getConfigs('onlineMeeting')` → `[{name, create(), joinText()}]` |
| wopi | System settings card "Office Online" + service dialog (read/write permissions) | ExtJS | opening files with a WOPI service depends on the files UI |
| dokuwiki | main module (wiki in an iframe, Refresh) + System settings card | ExtJS | the module title follows the setting after login |
| multi_instance | main module (instances grid: filters, search, edit, (de)activate, e-mail, delete, site config) + instance dialog with allowed modules | ExtJS | "Login as administrator" is missing: it POSTs an access token to the instance in a popup, which needs a main-thread addon |
| pwned | System settings card (group to check) | ExtJS | |
| serverclient | — | ExtJS | open: extends the "create user" dialog (mailboxes per domain), which neo does not have yet (card "správa uživatelů a skupin"); its domains reach ExtJS through `App::EVENT_HEAD`, which `Neo.php` does not render |
| email, emailfavorites | — | — | open: depend on the legacy email module (outside community) |

Not browser-tested: everything admin-only (System settings cards, history, multi_instance,
dokuwiki) and modules not installed in the dev database. The test user is no administrator;
an admin test account and installing the modules were left to the user. Tested as the test
user: OTP enable (wrong / right code), login with the OTP step (wrong / right code), disable.

## Shared pieces

- **2FA login** (`apps/go/view/LoginView.mjs`, `src/jmap/Client.mjs`): `client.login()` returns
  `{loginToken, authenticators}` when more authenticators are pending; `client.authenticate(loginToken,
  {<id>: data})` sends a step. Each pending authenticator shows the card its module registers:
  `ModuleRegistry.register({loginPanels: {otpauthenticator: () => import(...)}})`, a subclass of
  `src/login/AuthenticatorPanel.mjs` (`createFields()`, `errorText(field, code)`). Modules load
  before login, so the panels are there; an authenticator without a panel shows an error.
- **`onMainView`** (ModuleRegistry): called with each window's main view after login (OTP
  enforcement opens its dialog there). `ModuleRegistry.callHook(name, ...args)`,
  `ModuleRegistry.getConfigs(key)` for other contributions.
- **Login buttons**: `Neo.php` includes every module's `views/neo/login.php` (returns
  `[['text' => ..., 'url' => 'api/page.php/...']]`) into `Neo.config.goLoginButtons`; the login
  view shows them below the form (ExtJS `LoginDialog.addSignInButton()` from `App::EVENT_HEAD`).
- **`src/systemsettings/EntityListPanel.mjs`**: a System settings (or My account) card that lists
  one entity in a `GO.list.ActionTable` with add / edit / delete and a FormWindow; changes save
  at once. Override `prepareRecords()` (names of ids) and `onAction()` for extra actions.
- A getter in a registration (`get userSettings() {...}`) is read when the cards load, after
  login: davclient shows its card only with the calendar capability.

## Gotchas

- `fieldChange` of a neo form passes `{component, value, oldValue}`, not `field`.
- A field without `name` is not submitted (`DataSourceForm.collectValues()`): use it for
  switches that only drive other fields (LDAP "Use authentication", WOPI alternative URI).
- `User/set` of a related record (`otp`) fails with `validationErrors.otp` ("Error occurred in a
  related record"), not with the inner property.
- The OTP secret only comes back in the `User/set` response that requested it
  (`otp.requestSecret`): a later `User/get` returns no secret.
- Read-only text fields still show neo's clear trigger: set `clearable: false`.
