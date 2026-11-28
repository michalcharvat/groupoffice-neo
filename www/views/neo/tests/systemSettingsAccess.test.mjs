// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: client}         = await import('../src/jmap/Client.mjs'),
      {default: ModuleRegistry} = await import('../src/ModuleRegistry.mjs'),
      {maySeeSystemSettings}    = await import('../src/systemsettings/cards.mjs');

describe('System settings access', () => {
    let user, session;

    before(() => { user = client.user; session = client.session });
    afterEach(() => { client.user = user; client.session = session; ModuleRegistry.unregister('sstest') });

    const as = (isAdmin, capabilities) => { client.user = {id: 9, isAdmin}; client.session = {capabilities} };
    const registerModule = (systemSettings = {title: 'Test', panel: () => Promise.resolve({default: class {}})}) =>
        ModuleRegistry.register({name: 'sstest', package: 'test', capability: 'go:test:sstest', systemSettings});

    it('is shown to administrators', () => {
        as(true, {});
        assert.equal(maySeeSystemSettings(), true)
    });

    it('is hidden from a plain user, also with module access but no mayManage', () => {
        registerModule();
        as(false, {'go:core:core': {}, 'go:test:sstest': {mayManage: false}});
        assert.equal(maySeeSystemSettings(), false)
    });

    it('is shown to a manager of a module with a systemSettings card', () => {
        registerModule();
        as(false, {'go:core:core': {}, 'go:test:sstest': {mayManage: true}});
        assert.equal(maySeeSystemSettings(), true)
    });

    it('is hidden from a module manager when the module has no systemSettings card', () => {
        registerModule([]);
        as(false, {'go:core:core': {}, 'go:test:sstest': {mayManage: true}});
        assert.equal(maySeeSystemSettings(), false)
    });

    it('is shown to user, group and custom field managers', () => {
        for (const right of ['mayChangeUsers', 'mayChangeGroups', 'mayChangeCustomFields']) {
            as(false, {'go:core:core': {[right]: true}});
            assert.equal(maySeeSystemSettings(), true, right)
        }
    });
});
