#!/usr/bin/env node
/**
 * What a classic change means for the neo port (docs/neo-converter-study.md, "A later classic change").
 *
 *     node scripts/neo-converter/delta.mjs <module dir> <classic file> [<rev before, default HEAD> [<rev after>]]
 *
 * Converts the classic file (relative to views/extjs3) as it is at <rev before> and at <rev after> (without
 * it: the working tree) and lists the difference config by config (field / column / store / line added,
 * removed, key changed) plus TODO blocks that are new. A file missing at a rev counts as empty, so a new file
 * lists all its configs as added. scripts/neo-port-check.sh prints this command per waiting classic file.
 * The hand port is not touched: the list says what to carry over, in the hand port's notation.
 */
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {basename, join, relative} from 'node:path';
import {classicFiles, convertSource, loadIconMap, scanModule} from './convert.mjs';
import {extractConfigs} from './measure.mjs';

/**
 * @summary Config-level difference of two converted versions.
 * @param {String} before converted code
 * @param {String} after converted code
 * @returns {String[]} one line per change
 */
export function configDelta(before, after) {
    const index = code => new Map(extractConfigs(code).map(c => [c.id, c.entries])),
          a     = index(before),
          b     = index(after),
          out   = [],
          norm  = c => c.replace(/\s+/g, ' '),
          short = c => norm(c).slice(0, 90);

    for (const [id, entries] of b) {
        if (!a.has(id)) {
            out.push(`+ ${id} {${[...entries].map(([k, v]) => `${k}: ${short(v.code)}`).join(', ')}}`);
            continue
        }
        const old = a.get(id);
        for (const [k, v] of entries) {
            if (!old.has(k)) out.push(`+ ${id} ${k}: ${short(v.code)}`);
            else if (norm(old.get(k).code) !== norm(v.code)) out.push(`~ ${id} ${k}: ${short(old.get(k).code)} → ${short(v.code)}`)
        }
        for (const k of old.keys()) b.get(id).has(k) || out.push(`- ${id} ${k}`)
    }
    for (const id of a.keys()) b.has(id) || out.push(`- ${id}`);

    // TODO blocks with their original code: a changed listener shows as - old block, + new block
    const blocks = code => {
        const list = [];
        for (const line of code.split('\n').map(l => l.trim())) {
            if (line.startsWith('// TODO(neo-converter)')) list.push([line]);
            else if (line.startsWith('//   ') && list.length) list.at(-1).push(line)
        }
        return new Set(list.map(b => b.join('\n')))
    };
    const ba = blocks(before), bb = blocks(after);
    for (const b of ba) bb.has(b) || out.push(`- ${b.split('\n')[0]} (its original code changed or went)`);
    for (const b of bb) ba.has(b) || out.push(`+ ${b.replace(/\n/g, '\n    ')}`);
    return out
}

/**
 * @summary The classic file at a git rev, '' when it does not exist there.
 * @param {String} moduleDir
 * @param {String} file relative to the module dir
 * @param {String} rev
 * @returns {String}
 */
function showAt(moduleDir, file, rev) {
    try {
        return execFileSync('git', ['-C', moduleDir, 'show', `${rev}:./${file}`], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, LC_ALL: 'C'}})
    } catch (e) {
        // only a path missing at that rev is empty; a bad rev or no git repo is an error
        if (/does not exist in|exists on disk, but not in/.test(e.stderr)) return '';
        throw new Error(`git show ${rev}:${file} in ${moduleDir}: ${String(e.stderr).trim()}`)
    }
}

/**
 * @summary The delta of one classic file between two revs.
 * @param {String} moduleDir e.g. ~/Projects/groupoffice26-neo-amd/ports
 * @param {String} file relative to views/extjs3
 * @param {String} [before='HEAD'] git rev
 * @param {String} [after] git rev, without it the working tree
 * @returns {String[]} configDelta() lines
 */
export function fileDelta(moduleDir, file, before = 'HEAD', after) {
    const rel     = relative(moduleDir, join(moduleDir, 'views/extjs3', file)),
          path    = join(moduleDir, rel),
          // shortcut: the module scan (own combos, xtypes) is of the checkout, not of each rev; fine while they rarely change
          sources = existsSync(join(moduleDir, 'views/extjs3')) ? classicFiles(moduleDir).map(f => readFileSync(f, 'utf8')) : [],
          module  = {pkg: 'amd', name: basename(moduleDir), iconMap: loadIconMap(moduleDir), ...scanModule(sources)},
          newSrc  = after ? showAt(moduleDir, rel, after) : (existsSync(path) ? readFileSync(path, 'utf8') : ''),
          convert = src => src ? convertSource(src, module).code : '';

    return configDelta(convert(showAt(moduleDir, rel, before)), convert(newSrc))
}

if (process.argv[1]?.endsWith('delta.mjs')) {
    try {
        const lines = fileDelta(...process.argv.slice(2, 6));
        console.log(lines.length ? lines.join('\n') : 'no difference in what the converter writes')
    } catch (e) {
        // a classic file acorn cannot parse (or a bad rev): one line, not a stack trace in the port list
        console.error(`delta: ${e.message}`);
        process.exitCode = 1
    }
}
