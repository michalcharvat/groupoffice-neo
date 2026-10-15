import Button          from '../../button/Button.mjs';
import Container       from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import TextField       from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import DetailFieldsets from '../../customfields/DetailFieldsets.mjs';
import FormWindow      from '../../view/FormWindow.mjs';

/**
 * A FormWindow with only the name field: everything else are the entity's custom fields
 */
class DemoCustomFieldsWindow extends FormWindow {
    static config = {
        className : 'GO.dev.DemoCustomFieldsWindow',
        properties: ['id', 'name'],
        title     : 'Custom fields demo'
    }

    createFormItems() {
        return [{
            module: TextField, name: 'name', labelText: 'Name', labelPosition: 'inline', required: true, flex: 'none'
        }]
    }
}

Neo.setupClass(DemoCustomFieldsWindow);

/**
 * Custom fields of an entity: the form (FormWindow) and the detail cards
 */
class CustomFieldsDemo extends Container {
    static config = {
        className: 'GO.dev.demo.CustomFields',
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {padding: '16px', gap: '12px', overflow: 'auto'}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype: 'component',
            flex : 'none',
            text : 'Entity + id: "Open form" edits its custom fields in a FormWindow, "Show detail" renders the detail cards.'
        }, {
            ntype : 'container',
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            style : {gap: '12px'},
            items : [{
                module   : TextField,
                reference: 'entity',
                labelText: 'Entity',
                value    : 'Note',
                width    : 200
            }, {
                module   : TextField,
                reference: 'entityId',
                labelText: 'Id',
                width    : 160
            }, {
                module : Button,
                text   : 'Open form',
                ui     : 'primary',
                handler: () => me.openForm()
            }, {
                module : Button,
                text   : 'Show detail',
                handler: () => me.getReference('detail').setEntity(me.getReference('entity').value, me.getReference('entityId').value)
            }]
        }, {
            ntype    : 'component',
            reference: 'log',
            flex     : 'none'
        }, {
            module   : DetailFieldsets,
            reference: 'detail',
            flex     : 'none'
        }]
    }

    openForm() {
        let me  = this,
            id  = me.getReference('entityId').value,
            win = Neo.create(DemoCustomFieldsWindow, {
                appName   : me.appName,
                windowId  : me.windowId,
                entityName: me.getReference('entity').value,
                entityId  : id || null
            });

        win.on('save', ({data}) => {
            me.getReference('log').text = 'saved ' + data.id;
            me.getReference('detail').setEntity(me.getReference('entity').value, data.id)
        })
    }
}

export default Neo.setupClass(CustomFieldsDemo);
