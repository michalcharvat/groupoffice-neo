# Font Awesome Free in the neo client

| Files | Copied from | Version |
|---|---|---|
| `css/all.min.css`, `webfonts/*.woff2`, `LICENSE.txt` | the official npm package `@fortawesome/fontawesome-free`, its `css/`, `webfonts/` and `LICENSE.txt` unchanged | 7.3.1 (tarball sha512 `wmglKKPDIkgV3aWlZzWECCPoGIkYCulzBwxG9+w7rc5BGapZ6cPMpoPOT8k36J0Ni7PPX6c/rsoMWfS4d1MUMg==`) |

Font Awesome Free is © Fonticons, Inc.: icons CC BY 4.0, fonts SIL OFL 1.1, code MIT (`LICENSE.txt`).
Only the Free files belong here: the core is AGPL. Font Awesome Pro stays in sf/fontawesome.

`go\core\webclient\Neo` links `css/all.min.css` in the page head (solid, regular and brands; a
browser fetches a woff2 only when an icon of that style is shown). A module that ships
`views/neo/fontawesome.css` replaces it, so the page never loads both: sf/fontawesome links the Pro
css there with the same class names (`fa-solid fa-ship`).

Core and non-sf code use only icons that exist in Free; Pro-only icons only in amd/sf modules, and
buttons keep a Material Symbols name (`icon`) as their fallback.

Updating: download the tarball of the new version from registry.npmjs.org, compare its sha512 with
`npm view @fortawesome/fontawesome-free@<version> dist.integrity`, copy the same files and bump
the `?v=` in `Neo::iconStylesheets()` and the version above. Stay on the major of sf/fontawesome's Pro.
