import Button        from '../../button/Button.mjs';
import Container     from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import MarkdownField from '../../form/field/MarkdownField.mjs';
import Toolbar       from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {markdownToHtml}                from '../../Markdown.mjs';
import ImageWindow, {zoomableImages} from '../../view/ImageWindow.mjs';

const escape = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);

/**
 * Dev tab: GO.form.field.MarkdownField (toolbar, preview, paste / drop / button image
 * upload), the rendered Markdown and image zoom (GO.view.ImageWindow)
 */
class MarkdownFieldDemo extends Container {
    static config = {
        className: 'GO.dev.demo.MarkdownField',
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {padding: '16px', gap: '12px'}
    }

    images = []

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module     : MarkdownField,
            reference  : 'field',
            name       : 'content',
            labelText  : 'Content',
            placeholder: 'Type Markdown…',
            flex       : 1,
            value      : '# Hello\n**bold**, *italic* and ~~strike~~\n- [ ] todo\n- [x] done\n\n<img src="x" onerror="console.warn(\'MARKDOWN-XSS\')">'
        }, {
            module: Toolbar,
            flex  : 'none',
            items : [{
                module : Button,
                text   : 'Get value',
                handler: () => me.onGetValue()
            }, {
                module : Button,
                text   : 'Render',
                handler: () => me.onRender()
            }, {
                module : Button,
                text   : 'Read only',
                handler: () => me.onReadOnly()
            }]
        }, {
            ntype    : 'component',
            reference: 'output',
            cls      : ['go-markdown', 'go-image-zoom'],
            flex     : 'none',
            style    : {minHeight: '3em'},
            html     : ''
        }];
    }

    onConstructed() {
        super.onConstructed();

        this.getReference('output').addDomListeners({
            click   : data => {
                const image = this.images[data.target?.data?.zoom];
                image && ImageWindow.show({appName: this.appName, windowId: this.windowId, ...image})
            },
            delegate: '.go-zoomable'
        })
    }

    async onGetValue() {
        const value = await this.getReference('field').flush();
        this.getReference('output').html = `<pre>${escape(value) || '(empty)'}</pre>`
    }

    async onRender() {
        const {html, images} = zoomableImages(markdownToHtml(await this.getReference('field').flush()));

        this.images = images;
        this.getReference('output').html = html
    }

    onReadOnly() {
        const field = this.getReference('field');
        field.readOnly = !field.readOnly
    }
}

export default Neo.setupClass(MarkdownFieldDemo);
