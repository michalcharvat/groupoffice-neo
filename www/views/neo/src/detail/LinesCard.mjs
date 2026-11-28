import DescriptionList from '../component/DescriptionList.mjs';
import Card            from './Card.mjs';

/**
 * @summary A collapsible detail section of label / value lines (a classic go.detail.Panel
 * XTemplate panel), filled by its detail view instead of loading by itself. Hidden while it has
 * no lines (or no HTML).
 *
 *     {module: LinesCard, title: t('Voyage'), stateId: 'amd-crew-voyage-detail-voyage', reference: 'voyageCard'}
 *     card.setLines([[t('Vessel'), 'Baltic Star'], [t('Member'), {html: '<a …>…</a>'}]])
 *     card.setLines(null)   // hides it
 *     card.setHtml('<table>…</table>')   // trusted HTML instead (escape the data)
 *     card.setHtml(cellsHtml([['s6 pad', t('Vessel'), name]]))   // classic grid cells (detail/cells.mjs)
 * @class GO.detail.LinesCard
 * @extends GO.detail.Card
 */
class LinesCard extends Card {
    static config = {
        /**
         * @member {String} className='GO.detail.LinesCard'
         * @protected
         */
        className: 'GO.detail.LinesCard',
        cls      : ['go-detail-lines-card'],
        hidden   : true
    }

    /**
     * @summary The description list of the lines and the HTML of a table.
     * @returns {Object[]}
     */
    createBody() {
        return [
            {module: DescriptionList, reference: 'lines'},
            {ntype: 'component', reference: 'html', cls: ['go-detail-lines-html'], html: ''}
        ]
    }

    /**
     * @summary Shows the lines, hides the card for null or none.
     * @param {Array[]|null} lines [label, value] pairs, value text or {html}
     */
    setLines(lines) {
        this.getReference('lines').records = lines || [];
        this.getReference('html').html = '';
        this.hidden = !lines?.length
    }

    /**
     * @summary Shows trusted HTML instead of lines, hides the card for ''.
     * @param {String} html
     */
    setHtml(html) {
        this.getReference('lines').records = [];
        this.getReference('html').html = html || '';
        this.hidden = !html
    }
}

export default Neo.setupClass(LinesCard);
