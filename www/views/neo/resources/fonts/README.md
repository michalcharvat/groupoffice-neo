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

| `Lato-Regular.woff2`, `Lato-Bold.woff2` | `www/views/Extjs3/themes/Paper/fonts/` | `99e6af9674fd2c2ce9c4164028e51f852d612af7` (2026-11-24) |

Lato is © Łukasz Dziedzic, licensed under the SIL Open Font License 1.1 (`LICENSE-Lato.txt`).
The neo theme (`Global.scss`) and the standalone pages (`resources/scss/page/page.scss`) load it,
so neither needs `views/Extjs3`.
