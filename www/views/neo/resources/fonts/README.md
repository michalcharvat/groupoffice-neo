# Fonts of the neo theme

| File | Copied from | Commit |
|---|---|---|
| `MaterialSymbolsOutlined.woff2` | `www/views/goui/goui/resources/iconfont/MaterialSymbolsOutlined.woff2` | goui `44012a937778ccaa1c9b5176373e0eec9d7e0afd` (2026-11-24) |

Material Symbols is © Google LLC, licensed under the Apache License 2.0
(`LICENSE-MaterialSymbols.txt`, https://www.apache.org/licenses/LICENSE-2.0;
https://developers.google.com/fonts/docs/material_symbols#licensing).

`resources/scss/go/Global.scss` loads it as the `Material Symbols Rounded` icon font. The
compiled `dist/<mode>/css/theme-go/Global.css` points at this folder
(`../../../../resources/fonts/`), which is served with the rest of `views/neo`, so the build
does not copy it. Refreshing after a GOUI update: `docs/neo-upstream-sync.md`.
