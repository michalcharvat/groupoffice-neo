// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {cellHtml, cellsHtml} from '../src/detail/cells.mjs';

describe('detail grid cells (src/detail/cells.mjs)', () => {
    it('cellHtml: the classic markup <p class="s6 pad"><label>…</label><span>…</span></p>', () => {
        assert.equal(cellHtml('s6 pad', 'Vessel', 'Baltic Star'),
            '<p class="s6 pad"><label>Vessel</label><span>Baltic Star</span></p>');
        assert.equal(cellHtml('s12', 'Remarks', 0), '<p class="s12"><label>Remarks</label><span>0</span></p>')
    });

    it('cellHtml: text is escaped, {html} is kept', () => {
        assert.equal(cellHtml('s6 pad', 'A & B', '<b>x</b>'),
            '<p class="s6 pad"><label>A &amp; B</label><span>&lt;b&gt;x&lt;/b&gt;</span></p>');
        assert.equal(cellHtml('s6 pad', 'Member', {html: '<a href="#x">M</a>'}),
            '<p class="s6 pad"><label>Member</label><span><a href="#x">M</a></span></p>');
        assert.equal(cellHtml('s6 pad" onclick="x', 'L', ''),
            '<p class="s6 pad&quot; onclick=&quot;x"><label>L</label><span></span></p>')
    });

    it('cellHtml: an empty value keeps the cell, an empty label leaves the label out, {html} keeps an empty one', () => {
        assert.equal(cellHtml('s6 pad', 'Issuer', null), '<p class="s6 pad"><label>Issuer</label><span></span></p>');
        assert.equal(cellHtml('s12 pad', '', 'only'), '<p class="s12 pad"><span>only</span></p>');
        assert.equal(cellHtml('s6 pad', {html: '&nbsp;'}, 'x'), '<p class="s6 pad"><label>&nbsp;</label><span>x</span></p>')
    });

    it('cellsHtml: in order, falsy entries (a classic <tpl if>) left out', () => {
        const name = '';

        assert.equal(cellsHtml([
            ['s6 pad', 'Active', 'Yes'],
            name && ['s12 pad', 'Name', name],
            null,
            ['s6 pad', 'City', 'Riga']
        ]), '<p class="s6 pad"><label>Active</label><span>Yes</span></p><p class="s6 pad"><label>City</label><span>Riga</span></p>');
        assert.equal(cellsHtml([]), '');
        assert.equal(cellsHtml(null), '')
    })
});
