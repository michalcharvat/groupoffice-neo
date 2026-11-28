#!/usr/bin/env node
/**
 * What a classic change means for the neo port (docs/neo-converter-study.md, "A later classic change").
 *
 *     node scripts/neo-converter/delta.mjs <module dir> <classic file> [<git rev, default HEAD>]
 *
 * Converts the classic file as it is at <rev> and as it is now and lists the difference config by
 * config (field / column / store / line added, removed, key changed) plus TODO blocks that are new.
 * The hand port is not touched: the list says what to carry over, in the hand port's notation.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
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

if (process.argv[1]?.endsWith('delta.mjs')) {
    const [moduleDir, file, rev = 'HEAD'] = process.argv.slice(2),
          path    = join(moduleDir, 'views/extjs3', file),
          sources = classicFiles(moduleDir).map(f => readFileSync(f, 'utf8')),
          module  = {pkg: 'amd', name: basename(moduleDir), iconMap: loadIconMap(moduleDir), ...scanModule(sources)},
          oldSrc  = execFileSync('git', ['-C', moduleDir, 'show', `${rev}:./${relative(moduleDir, path)}`], {encoding: 'utf8'}),
          lines   = configDelta(convertSource(oldSrc, module).code, convertSource(readFileSync(path, 'utf8'), module).code);

    console.log(lines.length ? lines.join('\n') : 'no difference in what the converter writes')
}
