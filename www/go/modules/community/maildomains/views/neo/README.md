# Mail domains, neo.mjs UI

Port of the GOUI client (`../goui/script`). Registered in `Index.mjs` (main view, global
search route `#maildomains/<id>`, System settings card).

| File | GOUI |
|---|---|
| `view/MailDomainsMain.mjs` | `MainPanel` + `DomainTable`: list (show inactive, PTR status, search, add) \| detail. The list is the center panel, the detail the east panel, west stays hidden |
| `view/DomainDetail.mjs` | `DomainDetail`: header card, DNS card, mailboxes and aliases (`DomainGridCard`), edit, export, delete |
| `view/DnsSettingsPanel.mjs`, `view/dkim.mjs` | `DnsSettingsPanel`: SPF/DMARC/MX with status and message, DKIM keys (enable, delete, add, copy TXT) |
| `view/DomainDialog.mjs`, `MailboxDialog.mjs`, `AliasDialog.mjs` | same names; quotas are MB in the form, bytes on the server |
| `view/ImportDkimKeyDialog.mjs`, `MailboxExportDialog.mjs` | same names |
| `view/SystemSettingsPanel.mjs` | `SystemSettings` (mail host), card interface of the System settings dialog |
| `view/util.mjs` | status icons, renderers, principal names, module settings |
| styles | `views/neo/resources/scss/src/apps/go/maildomains/view/MailDomainsMain.scss` (theme-go) |

## Differences to GOUI

- DKIM selector of an existing key is read only (GOUI: renaming creates a new key anyway).
- Alias recipients: chips plus an "Add mailbox" combo (GOUI: autocomplete in the chips field).
- Export: all mailboxes of the domain (GOUI: the loaded rows). GO 26 exports in the
  background and reports the file as a core Alert; the dialog polls `Alert/get` and shows
  the download link.
- The detail and the list reload after their own changes (push may not run).

## Notes

- Needs the module's composer packages (`composer install` in the module folder,
  `vendor/` is gitignored) for the DNS check (`mlocati/spf-lib`).
- `MailDomain/checkPtr` and the DNS check fail on a dev box without a configured mail host
  (System settings → Mail domains); the UI shows the server's error.
- `Alert/get` with `properties` must include `userId` (SingleOwnerEntity's permission check
  reads it, otherwise "must not be accessed before initialization").
