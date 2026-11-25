// Turns a built neo webclient into its release form, IN PLACE (docs/neo-switch.md, "Release build").
//
// Usage: node buildScripts/release.mjs --in-place [www dir]
//
// build/build.sh runs it on the release package after scripts/install-npm.sh, instead of
// `npm prune --omit=dev` (see trimPackages()). It refuses to run in a git checkout: the minified
// files would replace the sources.
//
// Why not neo's own production builds: `dist/esm` (buildScripts/build/esmodules.mjs) flattens
// the workspace and the engine into one dist/esm tree and only takes sources inside views/neo,
// and the webpack builds bundle the app. GO modules live outside views/neo (modules/*/views/neo,
// go/modules/<package>/<module>/views/neo, and modules installed later from other repositories)
// and import views/neo/src and views/neo/node_modules/neo.mjs/src by relative path. A module
// that kept importing node_modules/neo.mjs/src next to a dist/esm copy would start a second
// engine (two class registries). So the release keeps every URL and the runtime environment
// 'development' (neo derives worker, theme and app paths from it) and makes the files smaller:
//
// 1. every .mjs/.js of the shell (apps, src), of neo.mjs/src and of all module views/neo folders
//    minified with Terser, with the options of neo's dist/esm build (exports keep their names);
// 2. the theme CSS (dist/development) minified with cssnano, without source maps, and only
//    the themes GO loads (theme-go and the structural src sheets);
// 3. node_modules without the build tools, neo.mjs and Font Awesome trimmed to what the page
//    loads (neo.mjs/src, Font Awesome css and webfonts).
import fs           from 'node:fs';
import path         from 'node:path';
import * as Terser  from 'terser';
import postcss      from 'postcss';
import cssnano      from 'cssnano';

const args = process.argv.slice(2);

if (!args.includes('--in-place')) {
    console.error('Usage: node buildScripts/release.mjs --in-place [www dir]\nRewrites the neo webclient in place; run it on a release package only (build/build.sh).');
    process.exit(1)
}

const
    neo     = path.resolve(import.meta.dirname, '..'),
    // resolved, so a symlink to a checkout's www can't hide its .git from the guard below
    www     = fs.realpathSync(path.resolve(args.find(arg => !arg.startsWith('--')) || path.join(neo, '../..'))),
    neoDir  = path.join(www, 'views/neo'),
    // the themes GO loads (Neo.php: themes ['neo-theme-go']) plus neo's structural sheets
    themes  = ['src', 'theme-go'],
    failures = [];

if (fs.existsSync(path.join(www, '.git')) || fs.existsSync(path.join(www, '..', '.git'))) {
    console.error(`${www} is a git checkout: the release build would overwrite the sources`);
    process.exit(1)
}

if (!fs.existsSync(path.join(neoDir, 'node_modules/neo.mjs/src')) || !fs.existsSync(path.join(neoDir, 'dist/development'))) {
    console.error(`${neoDir} is not built: run scripts/install-npm.sh first`);
    process.exit(1)
}

/**
 * Files below dir, depth first
 * @param {String} dir
 * @returns {String[]}
 */
function files(dir) {
    return fs.readdirSync(dir, {recursive: true, withFileTypes: true})
        .filter(entry => entry.isFile())
        .map(entry => path.join(entry.parentPath, entry.name))
}

/**
 * The views/neo folders of the modules: modules/<module>, go/modules/<package>/<module>,
 * promodules/<module> (a source checkout's layout; the release package copies them to modules/)
 * @returns {String[]}
 */
function moduleViewDirs() {
    const globs = [['modules', '*'], ['go/modules', '*', '*'], ['promodules', '*']],
          dirs  = [];

    for (const [base, ...levels] of globs) {
        let parents = [path.join(www, base)];
        for (const _ of levels) {
            parents = parents.flatMap(parent => fs.existsSync(parent)
                ? fs.readdirSync(parent, {withFileTypes: true}).filter(e => e.isDirectory()).map(e => path.join(parent, e.name))
                : [])
        }
        dirs.push(...parents.map(dir => path.join(dir, 'views/neo')).filter(dir => fs.existsSync(dir)))
    }
    return dirs
}

/**
 * 1. Minifies the ES modules in place
 */
async function minifyScripts() {
    const dirs = [
        path.join(neoDir, 'apps'),
        path.join(neoDir, 'src'),
        path.join(neoDir, 'node_modules/neo.mjs/src'),
        ...moduleViewDirs()
    ];

    let count = 0, before = 0, after = 0;

    for (const dir of dirs) {
        for (const file of files(dir)) {
            if (!/\.m?js$/.test(file) || file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}node_modules${path.sep}neo.mjs${path.sep}src${path.sep}`)) {
                continue
            }
            const source = fs.readFileSync(file, 'utf8');
            try {
                // the options of neo's dist/esm build (buildScripts/build/esmodules.mjs), plus the
                // class names: neo.mjs/src/Main.mjs registers main thread addons by
                // constructor.name (Neo.Main.addon.Stylesheet), core/Base.mjs falls back to it
                const result = await Terser.minify(source, {
                    module         : true,
                    compress       : {dead_code: true},
                    mangle         : {toplevel: true},
                    keep_classnames: true
                });
                fs.writeFileSync(file, result.code);
                count++;
                before += Buffer.byteLength(source);
                after  += Buffer.byteLength(result.code)
            } catch (error) {
                failures.push(file);
                console.error(`Error minifying ${path.relative(www, file)}:`, error.message)
            }
        }
    }

    console.log(`Minified ${count} scripts: ${mb(before)} → ${mb(after)}`)
}

/**
 * 2. Minifies the theme CSS, drops its source maps and the themes GO does not load
 */
async function minifyThemes() {
    const css      = path.join(neoDir, 'dist/development/css'),
          // the worker reads resources/; the theme build writes a copy into dist/development
          maps     = ['resources/theme-map.json', 'dist/development/resources/theme-map.json']
              .map(file => path.join(neoDir, file)).filter(file => fs.existsSync(file)),
          nano     = postcss([cssnano({preset: 'default'})]);

    for (const dir of fs.readdirSync(css)) {
        if (!themes.includes(dir)) {
            fs.rmSync(path.join(css, dir), {recursive: true, force: true})
        }
    }

    let count = 0;
    for (const file of files(css)) {
        if (file.endsWith('.map')) {
            fs.rmSync(file);
            continue
        }
        if (!file.endsWith('.css')) {
            continue
        }
        try {
            const result = await nano.process(fs.readFileSync(file, 'utf8'), {from: file, to: file, map: false});
            fs.writeFileSync(file, result.css);
            count++
        } catch (error) {
            failures.push(file);
            console.error(`Error minifying ${path.relative(www, file)}:`, error.message)
        }
    }

    // the theme map lists the sheets per theme: keep it to the folders that are still there
    const prune = node => Array.isArray(node)
        ? node.filter(theme => themes.includes(theme))
        : Object.fromEntries(Object.entries(node).map(([key, value]) => [key, prune(value)]));

    for (const themeMap of maps) {
        fs.writeFileSync(themeMap, JSON.stringify(prune(JSON.parse(fs.readFileSync(themeMap, 'utf8')))))
    }

    console.log(`Minified ${count} theme sheets (${themes.join(', ')})`)
}

/**
 * 3. Removes the build tools from node_modules and keeps only what the page loads of the runtime
 * packages (package.json "dependencies")
 *
 * Instead of `npm prune --omit=dev`: npm reinstalls a package whose files changed, which would
 * bring back the unminified, untrimmed neo.mjs.
 */
function trimPackages() {
    const modules = path.join(neoDir, 'node_modules'),
          runtime = Object.keys(JSON.parse(fs.readFileSync(path.join(neoDir, 'package.json'), 'utf8')).dependencies),
          // what the page loads of each runtime package; a package not listed here stays whole
          keep    = {
              'neo.mjs'                      : ['src', 'package.json', 'LICENSE'],
              '@fortawesome/fontawesome-free': ['css', 'webfonts', 'package.json', 'LICENSE.txt']
          };

    for (const name of runtime) {
        const manifest = JSON.parse(fs.readFileSync(path.join(modules, name, 'package.json'), 'utf8'));
        if (Object.keys(manifest.dependencies || {}).length) {
            throw new Error(`${name} has dependencies of its own; release.mjs keeps only the packages in package.json "dependencies"`)
        }
    }

    for (const entry of fs.readdirSync(modules)) {
        const scoped = entry.startsWith('@') ? fs.readdirSync(path.join(modules, entry)).map(sub => `${entry}/${sub}`) : [entry];
        for (const name of scoped) {
            runtime.includes(name) || fs.rmSync(path.join(modules, name), {recursive: true, force: true})
        }
        entry.startsWith('@') && !fs.readdirSync(path.join(modules, entry)).length && fs.rmSync(path.join(modules, entry), {recursive: true})
    }

    for (const [name, entries] of Object.entries(keep)) {
        const dir = path.join(modules, name);
        for (const entry of fs.readdirSync(dir)) {
            entries.includes(entry) || fs.rmSync(path.join(dir, entry), {recursive: true, force: true})
        }
    }

    // only the scripts run: neo.mjs/src also carries a few README files
    for (const file of files(path.join(modules, 'neo.mjs/src'))) {
        file.endsWith('.md') && fs.rmSync(file)
    }

    console.log(`Kept ${runtime.join(', ')} in node_modules`)
}

function mb(bytes) {
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

await minifyScripts();
await minifyThemes();

if (failures.length) {
    console.error(`\n${failures.length} file(s) failed to minify; the package is not releasable`);
    process.exit(1)
}

trimPackages();
console.log('neo release build done');
