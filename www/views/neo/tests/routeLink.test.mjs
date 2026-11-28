// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {JSDOM} from '../../../node_modules/jsdom/lib/api.js';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});
// the addon listens on the document when it is created
globalThis.document ??= new JSDOM('').window.document;

const {routeLink, entityLink} = await import('../src/link/routeLink.mjs'),
      {default: History}      = await import('../src/main/addon/History.mjs');

describe('route links', () => {
    it('routeLink() escapes the route, entityLink() falls back to text', () => {
        assert.equal(routeLink('a/"b"', 'X'),
            '<a class="go-route-link" role="link" tabindex="0" data-route="a/&quot;b&quot;">X</a>');
        assert.equal(entityLink('NoSuchEntity', null, '<b>'), '&lt;b&gt;')
    });

    describe('GO.main.addon.History onRouteLink()', () => {
        let dom, document, location;

        beforeEach(() => {
            dom = new JSDOM(`<base href="/views/neo/apps/go/"><body>
                <a id="route" class="go-route-link" data-route="crew/amdcrewmember/5"><span id="inner">x</span></a>
                <a id="hash" href="#addressbook/contact/7">y</a>
                <a id="empty" href="#">z</a>
                <a id="blank" href="#notes" target="_blank">b</a>
                <a id="out" href="https://example.com/">o</a>
                <div contenteditable="true"><a id="edit" href="#notes">e</a></div></body>`, {url: 'https://go.test/'});
            ({document, location} = dom.window);
        });

        const fire = (id, type, init = {}) => {
            const event = new dom.window[type === 'click' ? 'MouseEvent' : 'KeyboardEvent'](type, {bubbles: true, cancelable: true, ...init});

            document.getElementById(id).addEventListener(type, e => History.prototype.onRouteLink.call({}, e));
            Object.defineProperty(globalThis, 'location', {value: location, configurable: true});
            document.getElementById(id).dispatchEvent(event);
            return event
        };

        it('a click inside a data-route link sets the hash', () => {
            fire('inner', 'click');
            assert.equal(location.hash, '#crew/amdcrewmember/5')
        });

        it('Enter on a data-route link sets the hash, other keys do not', () => {
            fire('route', 'keydown', {key: 'a'});
            assert.equal(location.hash, '');
            fire('route', 'keydown', {key: 'Enter'});
            assert.equal(location.hash, '#crew/amdcrewmember/5')
        });

        it('a hash href is prevented (no load against <base href>) and sets the hash', () => {
            assert.equal(fire('hash', 'click').defaultPrevented, true);
            assert.equal(location.hash, '#addressbook/contact/7');
            assert.equal(fire('empty', 'click').defaultPrevented, true)
        });

        it('a hash href with target _blank opens a new tab at the page URL', () => {
            const opened = [],
                  event  = new dom.window.MouseEvent('click', {bubbles: true, cancelable: true});

            Object.defineProperty(globalThis, 'location', {value: location, configurable: true});
            document.getElementById('blank').addEventListener('click', e =>
                History.prototype.onRouteLink.call({openTab: ({url}) => opened.push(url)}, e));
            document.getElementById('blank').dispatchEvent(event);
            assert.equal(event.defaultPrevented, true);
            assert.deepEqual(opened, ['/#notes']);
            assert.equal(location.hash, '')
        });

        it('leaves other links and modifier clicks alone', () => {
            assert.equal(fire('out', 'click').defaultPrevented, false);
            assert.equal(fire('hash', 'click', {ctrlKey: true}).defaultPrevented, false);
            Object.defineProperty(dom.window.HTMLElement.prototype, 'isContentEditable', {
                get() { return !!this.closest('[contenteditable="true"]') }, configurable: true
            });
            assert.equal(fire('edit', 'click').defaultPrevented, false);
            assert.equal(location.hash, '')
        });
    });
});
