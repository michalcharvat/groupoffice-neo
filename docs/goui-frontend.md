# GOUI frontend

> Moved verbatim from CLAUDE.md on 2026-11-24.

## Converting ExtJS 3.4 to GOUI

- The legacy UI is ExtJS 3.4 (API docs: https://docs.sencha.com/extjs/3.4.0/). Use them to understand what an old component does, then rebuild it with GOUI components instead of porting it line by line.
- GOUI docs: https://goui.io (source of the docs site: https://github.com/Intermesh/goui-docs). Source and issues: https://github.com/Intermesh/goui. A local copy with type definitions is in `www/node_modules/@intermesh/goui`. The Group-Office wrappers are in `www/views/goui/groupoffice-core`. Read these for the available components before inventing your own.
- The notes module (`www/go/modules/community/notes`) is the reference module: implement other modules the way it does. For example, its `views/goui/script/Main.ts` extends `MainThreeColumnPanel` and uses the base class buttons (`showWestButton`, `openWestButton`, `hideWestButton`, `closeWestButton`, `hideEastButton`, `closeEastButton`) to open and close the west and east panels, and `menucolumn` for row menus.
- Modules already converted are the best examples: `www/go/modules/community/calendar/views/goui`, `comments`, `apikeys` and `oidc`. Copy their structure (`package.json`, build setup) for a new module UI.
- Legacy ExtJS code lives in `views/extjs3` folders. The backend behind it should move to JMAP at the same time.

## Building the GOUI frontend

Every module with a GOUI UI has its own `package.json` in its `views/goui` folder (e.g. `www/go/modules/community/calendar/views/goui`), and so does core (`www/views/goui`). Build from that folder with `npm run build`, or `npm run watch` while developing.

### Styling

- Don't use inline styles (`el.style.…`, `style: {…}` in a component config). Use GOUI's classes where they fit (`pad`, `flow`, `fit`, …), otherwise a class in the module stylesheet.
- The module stylesheet is `views/goui/style/style.scss`. `npm run build` compiles it to `dist/style.css`, which the web client loads for every module. The `build:sass` and `start:sass` scripts in `package.json` do this (see the apikeys or approval module).
- Use GOUI's sass helpers for sizes, like `util.dp()`, instead of pixels: `@use '../../../../../../../views/goui/goui/style/util';` and then `padding: util.dp(12) util.dp(16);`.
- GOUI's utility classes like `pad` are styled as `.goui.pad`, so they only work on GOUI components, not on an element made with `E()`. Give such an element its own class in the module stylesheet.
