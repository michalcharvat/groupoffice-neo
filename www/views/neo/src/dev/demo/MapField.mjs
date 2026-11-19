import ArrayField     from '../../form/field/ArrayField.mjs';
import Button         from '../../button/Button.mjs';
import ContainerField from '../../form/field/ContainerField.mjs';
import MapField       from '../../form/field/MapField.mjs';
import FormDemo       from './FormDemo.mjs';
import NumberField    from '../../../node_modules/neo.mjs/src/form/field/Number.mjs';
import TextField      from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';

/**
 * Dev demo: GOUI form/MapFieldPage — a map of objects keyed by id (new keys are numbered),
 * and a map of plain values whose keys are edited in the rows (keyFieldName / valueFieldName).
 */
class MapFieldDemo extends FormDemo {
    static config = {
        className: 'GO.dev.demo.MapField',
        intro    : '<p>MapField: an object keyed by id, one row field per entry (buildField). ' +
                   'getValues() shows the map; removed rows leave the map.</p>',
        fields   : [{
            module    : MapField,
            name      : 'alerts',
            reference : 'alerts',
            style     : {gap: '8px'},
            buildField: () => ({
                module: ContainerField,
                style : {gap: '8px'},
                items : [
                    {module: TextField, name: 'offset', labelText: 'Offset', labelPosition: 'inline', flex: 1},
                    {module: TextField, name: 'action', labelText: 'Action', labelPosition: 'inline', width: 160},
                    ArrayField.removeButton()
                ]
            })
        }, {
            module : Button,
            ui     : 'secondary',
            icon   : 'add',
            text   : 'Add alert',
            flex   : 'none',
            style  : {alignSelf: 'start'},
            handler: data => data.component.parent.getReference('alerts').addValue({offset: '-PT15M', action: 'display'})
        }, {
            module        : MapField,
            name          : 'limits',
            reference     : 'limits',
            keyFieldName  : 'key',
            valueFieldName: 'value',
            style         : {gap: '8px'},
            buildField    : () => ({
                module: ContainerField,
                style : {gap: '8px'},
                items : [
                    {module: TextField, name: 'key', labelText: 'Key', labelPosition: 'inline', flex: 1},
                    {module: NumberField, name: 'value', labelText: 'Value', labelPosition: 'inline', width: 160},
                    ArrayField.removeButton()
                ]
            })
        }, {
            module : Button,
            ui     : 'secondary',
            icon   : 'add',
            text   : 'Add limit',
            flex   : 'none',
            style  : {alignSelf: 'start'},
            handler: data => data.component.parent.getReference('limits').addValue(0, 'new')
        }],
        sample: {
            alerts: {1: {offset: '-PT1H', action: 'email'}, 2: {offset: '-PT10M', action: 'display'}},
            limits: {quota: 500, users: 10}
        }
    }
}

export default Neo.setupClass(MapFieldDemo);
