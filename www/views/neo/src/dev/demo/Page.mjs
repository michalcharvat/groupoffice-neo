import Component    from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import Container    from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import {escapeHtml} from '../../Format.mjs';

/**
 * Base of a Dev demo page, like goui-docs Page.ts: a scrolling column with the page
 * title, then the items of pageItems(). Helpers for the usual GOUI docs blocks:
 *
 *     pageItems() {
 *         return [p(t('Some text')), h3(t('Heading')), code('const a = 1;'), {module: Button, …}]
 *     }
 *
 * log(text) writes into an output box, when the page has one (output()).
 */
class Page extends Container {
    static config = {
        className   : 'GO.dev.demo.Page',
        cls         : ['go-dev-page'],
        layout      : {ntype: 'vbox', align: 'stretch'},
        // a vbox shrinks its items to fit: let the page scroll instead
        itemDefaults: {flex: 'none'},
        /**
         * Page heading
         * @member {String} heading=''
         */
        heading: ''
    }

    construct(config) {
        super.construct(config);

        let me = this;

        // fixed height items: a vbox would shrink them, a style (gap…) of an item drops the
        // flex the layout puts into its wrapperStyle, so it goes into the style itself
        me.items = [
            me.heading && h2(me.heading),
            ...me.pageItems()
        ].filter(Boolean).map(item => ({...item, style: {flex: '0 0 auto', ...item.style}}))
    }

    /**
     * Items below the heading
     * @returns {Object[]}
     */
    pageItems() {
        return []
    }

    /**
     * Prepends a line to the output box (reference 'output', see output())
     * @param {String} text
     */
    log(text) {
        const box = this.getReference('output');

        if (box) {
            box.html = escapeHtml(text) + '\n' + box.html.split('\n').slice(0, 30).join('\n')
        }
    }
}

/**
 * Paragraph of text, or of static HTML with {html}
 * @param {String|Object} text
 * @returns {Object}
 */
export function p(text) {
    return {module: Component, tag: 'p', style: {margin: 0, maxWidth: '800px'}, ...(typeof text === 'string' ? {text} : text)}
}

/**
 * @param {String} text
 * @returns {Object}
 */
export function h2(text) {
    return {module: Component, tag: 'h2', style: {margin: 0}, text}
}

/**
 * @param {String} text
 * @returns {Object}
 */
export function h3(text) {
    return {module: Component, tag: 'h3', style: {margin: '8px 0 0'}, text}
}

/**
 * Source code block
 * @param {String} text
 * @returns {Object}
 */
export function code(text) {
    return {module: Component, tag: 'pre', cls: ['go-dev-output'], text}
}

/**
 * Output box for Page.log()
 * @returns {Object}
 */
export function output() {
    return {module: Component, reference: 'output', tag: 'pre', cls: ['go-dev-output'], html: ''}
}

/**
 * The Page a component sits in (handlers get the button, not the page)
 * @param {Neo.component.Base} component
 * @returns {GO.dev.demo.Page}
 */
export function pageOf(component) {
    while (component && !(component instanceof Page)) {
        component = component.parent
    }

    return component || null
}

export default Neo.setupClass(Page);
