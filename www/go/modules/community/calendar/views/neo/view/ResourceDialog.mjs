import TextArea      from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import LocalCombo    from '../../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import TextList      from '../../../../../../../views/neo/src/list/TextList.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import FormWindow    from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import calendarData  from '../data.mjs';
import ColorField    from './field/ColorField.mjs';
import {addShareCard, CALENDAR_LEVELS} from './shareCard.mjs';

const t = translator('community', 'calendar');

/**
 * Create or edit a resource: a Calendar in a resource group (GOUI ResourceWindow)
 */
class ResourceDialog extends FormWindow {
    static config = {
        className : 'GO.calendar.ResourceDialog',
        cls       : ['go-form-window', 'go-cal-form-dialog'],
        entityName: 'Calendar',
        title     : t('Resource'),
        wrapperStyle: {height: '75vh', left: 'calc(50vw - 250px)', top: '12vh', width: '500px'}
    }

    construct(config) {
        config.values = {color: '69554f', includeInAvailability: 'all', ...(config.values || {})};
        super.construct(config)
    }

    createFormItems() {
        return [{
            module       : LocalCombo,
            name         : 'groupId',
            labelText    : t('Group'),
            labelPosition: 'inline',
            required     : true,
            flex         : 'none',
            displayField : 'name',
            valueField   : 'id',
            listConfig   : {module: TextList},
            store        : {keyProperty: 'id', data: calendarData.resourceGroups.map(g => ({id: g.id, name: g.name}))}
        },
        {module: TextField, name: 'name', labelText: t('Name'), labelPosition: 'inline', required: true, flex: 'none'},
        {module: ColorField, name: 'color', labelText: t('Color'), flex: 'none'},
        {module: TextArea, name: 'description', labelText: t('Description'), labelPosition: 'inline', flex: 'none'}]
    }

    async onConstructed() {
        await super.onConstructed();

        let me = this;

        addShareCard(me, 'Calendar', CALENDAR_LEVELS());
        me.form.on('beforeload', ({data}) => {data.groupId != null && (data.groupId = String(data.groupId))})
    }
}

export default Neo.setupClass(ResourceDialog);
