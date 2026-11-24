# Images and sounds of the neo client

Copies of classic Paper theme files, so neo, the standalone pages (`go\core\webclient\Page`) and
the server code that serves them work in a build without `views/Extjs3` (docs/neo-switch.md,
section 8). Source: `www/views/Extjs3/themes/Paper/`, commit
`99e6af9674fd2c2ce9c4164028e51f852d612af7` (2026-11-24).

| File | Copied from | Used by |
|---|---|---|
| `logo-white.svg` | `img/logo-white.svg` | neo header, login, app launcher; standalone pages |
| `default-app-icon.svg` | `img/default-app-icon.svg` | `App::downloadModuleIcon()` for modules without an icon |
| `reminder.png` | `img/notify/reminder.png` | desktop notifications (`src/alerts/NotificationCenter.mjs`) |
| `filetype/*.svg` | `img/filetype/` | file icons of `index.php?r=core/thumb` (`CoreController::actionThumb()`) |
| `../sounds/*.mp3` | `sounds/*.mp3` | notification sounds (`NotificationCenter.mjs`) |
