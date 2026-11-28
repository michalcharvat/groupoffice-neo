// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: MainThreeColumnPanel} = await import('../src/view/MainThreeColumnPanel.mjs');

const proto = MainThreeColumnPanel.prototype;

/**
 * A stand-in for a MainThreeColumnPanel: its panels and the center splitter, with the panel
 * methods on it
 */
function fakePanel(config = {}) {
    const part = (cls = []) => ({
              cls,
              hidden   : false,
              toggleCls(name, on) {
                  this.cls = this.cls.filter(c => c !== name).concat(on ? [name] : [])
              }
          }),
          west           = part(),
          center         = {...part(['go-active']), wrapperStyle: {flex: 'none', width: '42rem'}},
          east           = part(),
          centerSplitter = part();

    const panel = {
        eastHidden  : false,
        panels      : {west, center, east},
        centerSplitter,
        getReference: name => name === 'centerSplitter' ? centerSplitter : null,
        ...config
    };

    ['setEastHidden', 'activatePanel', 'showCenter'].forEach(name => panel[name] = proto[name]);
    return panel
}

describe('GO.view.MainThreeColumnPanel', () => {
    it('hides the east and its splitter and lets the center flex', () => {
        const panel = fakePanel();

        panel.setEastHidden(true);
        assert.equal(panel.panels.east.hidden, true);
        assert.equal(panel.centerSplitter.hidden, true);
        assert.deepEqual(panel.panels.center.wrapperStyle, {flex: '1 1 0%', width: '42rem'});
    });

    it('gives the center back its fixed width when the east shows again', () => {
        const panel = fakePanel();

        panel.setEastHidden(true);
        panel.setEastHidden(true); // twice must not lose the saved flex
        panel.setEastHidden(false);
        assert.equal(panel.panels.east.hidden, false);
        assert.equal(panel.centerSplitter.hidden, false);
        assert.deepEqual(panel.panels.center.wrapperStyle, {flex: 'none', width: '42rem'});
    });

    it('shows a hidden east when a record activates it', () => {
        const panel = fakePanel();

        panel.setEastHidden(true);
        panel.activatePanel('east');
        assert.equal(panel.eastHidden, false);
        assert.equal(panel.panels.east.hidden, false);
        assert.deepEqual(panel.panels.east.cls, ['go-active']);
    });

    it('starts with a fixed center when the east was hidden from the start', () => {
        const panel = fakePanel({eastHidden: true});

        panel.panels.center.wrapperStyle = {flex: '1 1 0%', width: '50rem'};
        panel.panels.east.hidden         = true;
        panel.activatePanel('east');
        assert.equal(panel.panels.center.wrapperStyle.flex, null); // the CSS default again
    });

    it('keeps a configured center flex when the east starts hidden', () => {
        const panel = fakePanel({eastHidden: true, centerFlex: '0 0 24rem'});

        panel.panels.center.wrapperStyle = {flex: '1 1 0%'};
        panel.panels.east.hidden         = true;
        panel.setEastHidden(false);
        assert.equal(panel.panels.center.wrapperStyle.flex, '0 0 24rem');
    });

    it('goes back to the center card when the active east is hidden (phone)', () => {
        const panel = fakePanel();

        panel.activatePanel('east');
        panel.setEastHidden(true);
        assert.deepEqual(panel.panels.center.cls, ['go-active']);
        assert.deepEqual(panel.panels.east.cls, []);
    });
});
