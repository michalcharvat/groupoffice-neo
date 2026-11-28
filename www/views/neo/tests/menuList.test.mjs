// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';
import SelectionModel from '../node_modules/neo.mjs/src/selection/Model.mjs';
import DomEvent from '../node_modules/neo.mjs/src/manager/DomEvent.mjs';

setup({appConfig: {name: 'test'}});

const {default: MenuList} = await import('../src/menu/List.mjs');

describe('GO.menu.List outside pointer', () => {
    const body      = {id: 'document.body', tagName: 'body', cls: []},
          mousedown = id => DomEvent.fire({eventName: 'mousedown', data: {path: [{id, tagName: 'div', cls: []}, body]}});

    let menu, unmounts, getComponent;

    beforeEach(() => {
        // other test files stub Neo.getComponent, DomEvent.fire looks the menu up through it
        getComponent = Neo.getComponent;
        Neo.getComponent = id => Neo.manager.Component.get(id);

        // the menu's own selection model needs a rendered view
        menu = Neo.create(MenuList, {appName: 'test', floating: true, items: [{text: 'One'}], align: {target: 'trigger-node'},
            selectionModel: {module: SelectionModel}});
        unmounts = 0;
        menu.unmount = () => {unmounts++; menu._mounted = false};
        menu._mounted = true;
        menu.syncOutsidePointerListener(true)
    });

    afterEach(() => {
        menu.syncOutsidePointerListener(false);
        menu.destroy();
        Neo.getComponent = getComponent
    });

    it('a mousedown outside the main view (a dialog) closes the menu once', () => {
        mousedown('dialog-west-node');
        mousedown('dialog-west-node');
        assert.equal(unmounts, 1)
    });

    it('a mousedown on the trigger or in the menu keeps it open', () => {
        mousedown('trigger-node');
        mousedown(menu.id);
        assert.equal(unmounts, 0)
    });

    it('drops the body listener once closed', () => {
        menu.syncOutsidePointerListener(false);
        mousedown('dialog-west-node');
        assert.equal(unmounts, 0);
        assert.equal(menu.bodyPointerListener, null)
    });
});
