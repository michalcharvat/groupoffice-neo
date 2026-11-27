import Button      from './Button.mjs';
import SearchField from '../../node_modules/neo.mjs/src/form/field/Search.mjs';
import Toolbar     from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {t} from '../Translate.mjs';
import {searchesWhileTyping} from '../form/searchWhileTyping.mjs';

/**
 * @summary Toolbar search button that opens a search field over its toolbar
 *
 * GOUI searchbtn(): a search icon that lays a toolbar with a search field over its
 * own toolbar. Fires 'search' ({text}) 300ms after typing from 3 characters or emptying
 * the field, and right away on Enter for any text; the back arrow closes the overlay and
 * keeps the text on the button, like GOUI.
 */
class SearchButton extends Button {
    static config = {
        className: 'GO.button.SearchButton',
        icon     : 'search',
        tooltip  : t('Search')
    }

    /**
     * @member {Neo.toolbar.Base|null} overlay=null
     */
    overlay = null
    /**
     * The text of the last 'search' event
     * @member {String} lastText=''
     */
    lastText = ''

    destroy(...args) {
        clearTimeout(this.searchTimer);
        super.destroy(...args)
    }

    onClick(data) {
        super.onClick(data);
        this.open()
    }

    open() {
        let me = this;

        if (!me.overlay) {
            me.overlay = me.parent.add({
                module: Toolbar,
                cls   : ['go-toolbar-overlay'],
                items : [{
                    module : Button,
                    icon   : 'arrow_back',
                    handler: () => me.close()
                }, {
                    module   : SearchField,
                    flex     : 1,
                    // also keeps Enter from submitting a FormWindow around the list
                    keys     : {Enter: () => me.searchNow()},
                    listeners: {change: ({value}) => me.onSearchChange(value)}
                }]
            })
        }

        me.overlay.hidden = false;
        me.timeout(50).then(() => me.overlay.items[1].focus())
    }

    close() {
        let me = this;

        me.overlay.hidden = true;
        // the text the list is filtered by, not a shorter one typed without Enter
        me.text = me.lastText || null;
        me.toggleCls('go-search-active', !!me.lastText)
    }

    /**
     * @summary Fires 'search' 300ms after typing from 3 characters or emptying the field
     * @param {String|null} value
     */
    onSearchChange(value) {
        let me = this;

        clearTimeout(me.searchTimer);
        me.toggleCls('go-search-active', !!value);

        if (searchesWhileTyping(value)) {
            me.searchTimer = setTimeout(() => me.fireSearch(value || ''), 300)
        }
    }

    /**
     * @summary Enter: fires 'search' right away, also for fewer than 3 characters
     */
    searchNow() {
        let me = this;

        clearTimeout(me.searchTimer);
        me.fireSearch(me.overlay.items[1].value || '', true)
    }

    /**
     * @summary Fires 'search' unless the text was searched last
     * @param {String} text
     * @param {Boolean} [force=false] also fire for the same text (Enter searches again)
     */
    fireSearch(text, force = false) {
        let me = this;

        if (force || text !== me.lastText) {
            me.lastText = text;
            me.fire('search', {text})
        }
    }
}

export default Neo.setupClass(SearchButton);
