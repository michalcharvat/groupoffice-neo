// Lists classes and methods without @summary in their JSDoc among the changed neo sources
// (docs/neo-code-style.md). Run from www/views/neo: npm run lint-summary [-- <base ref>]
// Default base: the merge base with neo-ui, compared with the working tree.
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const classRe  = /^(?:export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)/,
      // shortcut: class members are read at 4 spaces and classes at column 0 (this code base's layout),
      // so nested classes and methods of object literals at that indent are not told apart
      methodRe = /^ {4}(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?\*?(?!(?:if|for|while|switch|catch|return|function)\b)(#?[A-Za-z_$][\w$]*)\s*\(/;

/**
 * @summary Added line numbers per file from a `git diff -U0` output.
 * @param {String} diff
 * @returns {Map<String, Set<Number>>} repo-relative path → line numbers in the new file
 */
export function addedLines(diff) {
    const result = new Map();
    let lines = null,
        body  = 0; // lines of the current hunk still to come: a content line may start with "+++"

    for (const line of diff.split('\n')) {
        if (body > 0) {
            body--
        } else if (line.startsWith('+++ ')) {
            // git appends a tab to a path with a space; C-quoted names (with quotes) are not unquoted
            const path = line.slice(4).replace(/\t$/, '');
            lines = path === '/dev/null' ? null : new Set();
            lines && result.set(path.replace(/^b\//, ''), lines)
        } else if (lines && line.startsWith('@@')) {
            const [, oldCount = '1', start, count = '1'] = line.match(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))?/);

            body = Number(oldCount) + Number(count);

            for (let i = 0; i < Number(count); i++) {
                lines.add(Number(start) + i)
            }
        }
    }

    return result
}

/**
 * @summary Classes and methods of a source whose docblock has no @summary, among those touched by added lines.
 *
 * A method counts as touched when an added line falls into its docblock, signature or body; a class
 * only when its docblock or `class` line is added, so a fix inside an old class asks for the method's
 * @summary, not the class's.
 * @param {String}      source
 * @param {Set<Number>} added 1-based line numbers
 * @returns {Object[]} {line, name, kind: 'class'|'method'}
 */
export function missingSummaries(source, added) {
    const lines = source.split('\n'),
          decls = [];
    let inClass = false;

    lines.forEach((text, i) => {
        const classMatch = text.match(classRe);

        if (classMatch) {
            inClass = true;
            decls.push({line: i + 1, name: classMatch[1], kind: 'class'})
        } else if (inClass && /^}\s*;?\s*$/.test(text)) {
            inClass = false;
            decls.push({line: i + 1, end: true})
        } else if (inClass) {
            const methodMatch = text.match(methodRe);

            // `foo(…) {` declares; `foo(…);` would be a call
            if (methodMatch && !/\)\s*;\s*$/.test(text)) {
                decls.push({line: i + 1, name: methodMatch[1], kind: 'method'})
            }
        }
    });

    // docblock: the comment that closes on the line right above the declaration
    decls.forEach(decl => {
        decl.docStart = decl.line;
        decl.doc      = '';

        if (!decl.end && /\*\/\s*$/.test(lines[decl.line - 2] ?? '')) {
            for (let i = decl.line - 2; i >= 0; i--) {
                decl.doc = lines[i] + '\n' + decl.doc;

                if (/\/\*/.test(lines[i])) {
                    if (/^\s*\/\*\*/.test(lines[i])) {
                        decl.docStart = i + 1
                    } else {
                        decl.doc = '' // a plain /* comment */ is no docblock
                    }
                    break
                }
            }
        }
    });

    const missing = [];

    decls.forEach((decl, n) => {
        if (decl.end) {
            return
        }

        const end = decl.kind === 'class' ? decl.line : (decls[n + 1]?.docStart ?? lines.length + 1) - 1;
        let touched = false;

        for (let l = decl.docStart; l <= end && !touched; l++) {
            touched = added.has(l)
        }

        touched && !/@summary\b/.test(decl.doc) && missing.push({line: decl.line, name: decl.name, kind: decl.kind})
    });

    return missing
}

function main() {
    const base = process.argv[2] || execFileSync('git', ['merge-base', 'neo-ui', 'HEAD'], {encoding: 'utf8'}).trim(),
          root = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf8'}).trim(),
          diff = execFileSync('git', ['diff', '-U0', '--no-color', base, '--', '*.mjs'], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}),
          files = addedLines(diff);

    // untracked files: every line is new
    execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard', '--', '*.mjs'], {cwd: root, encoding: 'utf8'})
        .split('\0').filter(Boolean).forEach(path => {
            const count = readFileSync(join(root, path), 'utf8').split('\n').length;
            files.set(path, new Set(Array.from({length: count}, (_, i) => i + 1)))
        });

    let count = 0;

    for (const [path, added] of files) {
        if (!/(^|\/)views\/neo\//.test(path) || /\/(node_modules|dist|tests|buildScripts)\//.test(path) || !existsSync(join(root, path))) {
            continue
        }

        for (const {line, name, kind} of missingSummaries(readFileSync(join(root, path), 'utf8'), added)) {
            console.log(`${path}:${line}  ${kind} ${name}`);
            count++
        }
    }

    console.log(count ? `${count} without @summary (docs/neo-code-style.md)` : 'All changed classes and methods have @summary');
    process.exit(count ? 1 : 0)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
