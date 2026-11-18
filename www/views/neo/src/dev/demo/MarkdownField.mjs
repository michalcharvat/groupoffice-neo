import Button        from '../../button/Button.mjs';
import Container     from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import MarkdownField from '../../form/field/MarkdownField.mjs';
import Toolbar       from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {markdownToHtml}                from '../../Markdown.mjs';
import {enableImageZoom}  from '../../view/ImageWindow.mjs';

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

    async onGetValue() {
        const value = await this.getReference('field').flush();
        this.getReference('output').html = `<pre>${escape(value) || '(empty)'}</pre>`
    }

    async onRender() {
        const output = this.getReference('output');

        output.html = markdownToHtml(await this.getReference('field').flush());
        enableImageZoom(output)
    }

    onReadOnly() {
        const field = this.getReference('field');
        field.readOnly = !field.readOnly
    }
}

export default Neo.setupClass(MarkdownFieldDemo);
