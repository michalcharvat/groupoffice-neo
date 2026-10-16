import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import FormWindow    from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import ColorField    from './field/ColorField.mjs';

const t = translator('community', 'calendar');

/**
 * A calendar from a webcal / ICS link (GOUI SubscribeWebCalWindow)
 */
class WebcalDialog extends FormWindow {
    static config = {
        className : 'GO.calendar.WebcalDialog',
        cls       : ['go-form-window', 'go-cal-form-dialog'],
        entityName: 'Calendar',
        title     : t('Enter webcal address'),
        wrapperStyle: {height: '360px', left: 'calc(50vw - 300px)', top: '20vh', width: '600px'},
        values    : {color: '356772'}
    }

    createFormItems() {
        return [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true,
            flex         : 'none'
        }, {
            module   : ColorField,
            name     : 'color',
            labelText: t('Color'),
            flex     : 'none'
        }, {
            module       : TextField,
            name         : 'webcalUri',
            labelText    : 'URI',
            labelPosition: 'inline',
            required     : true,
            flex         : 'none'
        }]
    }
}

export default Neo.setupClass(WebcalDialog);
