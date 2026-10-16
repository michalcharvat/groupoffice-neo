import Container       from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import DescriptionList from '../../component/DescriptionList.mjs';
import Button          from '../../button/Button.mjs';

/**
 * Dev demo: GOUI DescriptionList — text, HTML and vdom values, several values per
 * term, empty values left out; records can be replaced.
 */
class DescriptionListDemo extends Container {
    static config = {
        className: 'GO.dev.demo.DescriptionList',
        layout   : {ntype: 'vbox', align: 'start'},
        style    : {padding: '16px', gap: '16px', overflow: 'auto'},
        items    : [{
            module   : DescriptionList,
            reference: 'dl',
            records  : [
                ['Name', 'Jane <Doe>'],
                ['E-mail', {html: '<a href="mailto:jane@example.com">jane@example.com</a>'}],
                ['Phone', '+31 6 1234 5678', '+31 20 123 4567'],
                ['Not shown (empty)', null],
                ['Status', {vdom: {tag: 'span', cls: ['go-dev-status', 'go-dev-status-done'], text: 'active'}}]
            ]
        }, {
            module : Button,
            ui     : 'secondary',
            text   : 'Replace records',
            handler: data => {
                data.component.parent.getReference('dl').records = [['Replaced', new Date().toLocaleString()]]
            }
        }]
    }
}

export default Neo.setupClass(DescriptionListDemo);
