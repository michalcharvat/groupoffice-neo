import Component from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import Container from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Button    from '../../button/Button.mjs';
import ColorMenu from '../../menu/ColorMenu.mjs';
import {escapeHtml} from '../../Format.mjs';

/**
 * Dev demo: GOUI ColorMenu — a button whose menu is the palette; the button takes the
 * picked colour (updateButton), the select event is logged.
 */
class ColorMenuDemo extends Container {
    static config = {
        className: 'GO.dev.demo.ColorMenu',
        cls      : ['go-dev-page'],
        layout   : 'base',
        items    : [{
            module: Component,
            tag   : 'p',
            text  : 'The button opens the palette (colorSelect event); "Auto" is no colour. The button text takes the colour.'
        }, {
            module   : Button,
            reference: 'button',
            ui       : 'secondary',
            icon     : 'format_color_text',
            text     : 'Text color',
            menu     : {module: ColorMenu, value: '#1E88E5'}
        }, {
            module   : Component,
            reference: 'output',
            tag      : 'pre',
            cls      : ['go-dev-output'],
            html     : ''
        }]
    }

    async onConstructed() {
        super.onConstructed();

        let me     = this,
            button = me.getReference('button');

        await button.menuListReady;
        button.menuList.on('colorSelect', ({color}) => me.log(`select: "${color}"`))
    }

    log(text) {
        const output = this.getReference('output');
        output.html = escapeHtml(text) + '\n' + output.html
    }
}

export default Neo.setupClass(ColorMenuDemo);
