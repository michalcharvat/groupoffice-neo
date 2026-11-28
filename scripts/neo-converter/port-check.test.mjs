// node --test scripts/neo-converter/  (delta.mjs over git revs, its use in scripts/neo-port-check.sh)
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {after, before, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {fileDelta} from './delta.mjs';

const check = join(dirname(fileURLToPath(import.meta.url)), '../neo-port-check.sh'),
      dialog = extra => `go.modules.amd.demo.D = Ext.extend(go.form.Dialog, {initFormItems: function () {
          return [{xtype: 'textarea', name: 'note', height: 100}${extra ? ", {xtype: 'textfield', name: 'label'}" : ''}];
      }});\n`;
let repo, git, c1, c2;

// a module repo: master is upstream with a classic change marked Port-to: neo, neo has the module's views/neo
before(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'neo-port-check-')));  // git prints /private/var on macOS
    git  = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {encoding: 'utf8'}).trim();
    const put = (path, text) => { mkdirSync(dirname(join(repo, path)), {recursive: true}); writeFileSync(join(repo, path), text) };

    git('init', '-q', '-b', 'master');
    put('demo/views/extjs3/D.js', dialog(false));
    git('add', '.'); git('commit', '-qm', 'base');
    c1 = git('rev-parse', 'HEAD');
    git('checkout', '-qb', 'neo');
    put('demo/views/neo/PORTING.md', '# map\n');
    git('add', '.'); git('commit', '-qm', 'neo views');
    git('checkout', '-q', 'master');
    put('demo/views/extjs3/D.js', dialog(true));
    put('demo/views/extjs3/N.js', dialog(false).replace('.D =', '.N ='));
    put('demo/views/extjs3/lib/x.min.js', 'var x=1;\n');
    put('demo/views/extjs3/Bad.js', 'go.x = {;\n');  // acorn cannot parse it
    git('add', '.'); git('commit', '-qm', 'label field', '-m', 'Port-to: neo');
    c2 = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'neo');
});

after(() => rmSync(repo, {recursive: true, force: true}));

test('fileDelta: between two revs, a file new at the later rev, a bad rev', () => {
    const mod = join(repo, 'demo');
    // the working tree (neo) has D.js without the label; the revs decide, not the checkout
    assert.ok(fileDelta(mod, 'D.js', c1, c2).some(l => l.startsWith('+ field:label')));
    assert.ok(fileDelta(mod, 'N.js', c1, c2).some(l => l.startsWith('+ field:note')));
    assert.deepEqual(fileDelta(mod, 'D.js', c1), []);
    assert.throws(() => fileDelta(mod, 'D.js', 'no-such-rev', c2), /git show no-such-rev/);
});

test('neo-port-check: a delta line per classic file, --delta runs it', () => {
    const run  = (...args) => spawnSync('bash', [check, '-C', repo, '--upstream', 'master', ...args], {encoding: 'utf8'}),
          list = run(),
          short = c2.slice(0, 9);

    assert.equal(list.status, 1, list.stderr);
    assert.match(list.stdout, new RegExp(`delta: node '[^']+delta\\.mjs' '${repo}/demo' 'D\\.js' ${short}\\^ ${short}`));
    assert.match(list.stdout, /'N\.js'/);
    assert.doesNotMatch(list.stdout, /delta: .*x\.min\.js/);  // vendored lib/ is listed but gets no delta

    const ran = run('--delta');
    assert.equal(ran.status, 1, ran.stderr);
    assert.match(ran.stdout, /\n {8}\+ field:label \{/);
    assert.match(ran.stdout, /\n {8}delta: .*Unexpected token/);
    assert.match(ran.stdout, /, 1 delta runs failed \(/);
    assert.doesNotMatch(list.stdout + ran.stdout, /\x1d/);  // the run records never show
});
