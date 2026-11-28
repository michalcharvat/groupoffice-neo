import Container from '../../../node_modules/neo.mjs/src/container/Base.mjs';

const cell = (cls, label, value) => `<p class="${cls}"><label>${label}</label><span>${value}</span></p>`;

/**
 * @summary Dev demo: the classic 12-column grid of detail templates (s1–s12, pad) in a detail
 * card, like the crew contract detail: s6 pairs with a taller cell, a row of s4, an s12 block,
 * and two cards inside one html component.
 * @class GO.dev.demo.DetailGrid
 * @extends Neo.container.Base
 */
class DetailGridDemo extends Container {
    static config = {
        className: 'GO.dev.demo.DetailGrid',
        cls      : ['go-detail-scroller'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {maxWidth: '640px'},
        items    : [{
            ntype: 'component',
            cls  : ['go-card'],
            flex : 'none',
            html : cell('s6 pad', 'Contract ID', 'C-2026-0042')
                + cell('s6 pad', 'Rank', 'Chief Officer')
                + cell('s6 pad', 'Vessel', 'MV Northern Star<br>IMO 9876543<br>Flag: Malta')
                + cell('s6 pad', 'Sign on', '01-11-2026')
                + cell('s6 pad', 'Sign off', '28-02-2027')
                + cell('s4', 'Basic wage', '4,200.00')
                + cell('s4', 'Overtime', '850.00')
                + cell('s4', 'Leave pay', '600.00')
                + '<hr>'
                + cell('s12 pad', 'Remarks', 'Long text in an s12 cell wraps over the full width of the card, '
                    + 'below the floated rows above it.')
        }, {
            // cards inside one html component: each keeps the height of its floated cells
            ntype: 'component',
            flex : 'none',
            html : '<div class="go-card">' + cell('s6 pad', 'Nationality', 'Dutch') + cell('s6 pad', 'Born', '12-04-1988') + '</div>'
                + '<div class="go-card">' + cell('s4', 'Height', '182 cm') + cell('s4', 'Weight', '80 kg') + cell('s4', 'Shoe size', '44') + '</div>'
        }]
    }
}

export default Neo.setupClass(DetailGridDemo);
