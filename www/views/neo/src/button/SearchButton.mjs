import Button      from './Button.mjs';
import SearchField from '../../node_modules/neo.mjs/src/form/field/Search.mjs';
import Toolbar     from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {t} from '../Translate.mjs';

/**
 * GOUI searchbtn(): a search icon that lays a toolbar with a search field over its
 * own toolbar. Fires 'search' ({text}) 300ms after typing; the back arrow closes the
 * overlay and keeps the text on the button, like GOUI.
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
                    listeners: {change: ({value}) => me.onSearchChange(value)}
                }]
            })
        }

        me.overlay.hidden = false;
        me.timeout(50).then(() => me.overlay.items[1].focus())
    }

    close() {
        let me    = this,
            value = me.overlay.items[1].value || '';

        me.overlay.hidden = true;
        me.text = value || null;
        me.toggleCls('go-search-active', !!value)
    }

    onSearchChange(value) {
        let me = this;

        clearTimeout(me.searchTimer);

        me.searchTimer = setTimeout(() => {
            me.toggleCls('go-search-active', !!value);
            me.fire('search', {text: value || ''})
        }, 300)
    }
}

export default Neo.setupClass(SearchButton);
