import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import FormWindow    from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import CalendarIdsField from './field/CalendarIdsField.mjs';
import SelectField   from '../../../../../../../views/neo/src/form/field/SelectField.mjs';
import {addShareCard, VIEW_LEVELS} from './shareCard.mjs';

const t = translator('community', 'calendar');

/**
 * Create or edit a view (GOUI ViewWindow): a named set of calendars shown in a view type
 */
class ViewDialog extends FormWindow {
    static config = {
        className : 'GO.calendar.ViewDialog',
        cls       : ['go-form-window', 'go-cal-form-dialog'],
        entityName: 'CalendarView',
        title     : t('Create view'),
        wrapperStyle: {height: '80vh', left: 'calc(50vw - 290px)', top: '10vh', width: '580px'}
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
            module   : SelectField,
            name     : 'defaultView',
            labelText: t('Display as'),
            flex     : 'none',
            options  : [
                {value: null, text: t('Current ')},
                {value: 'day', text: t('Day')},
                {value: 'days-5', text: t('Workweek')},
                {value: 'week', text: t('Week')},
                {value: 'weeks-14', text: '2 ' + t('Weeks')},
                {value: 'weeks-21', text: '3 ' + t('Weeks')},
                {value: 'month', text: t('Month')},
                {value: 'split-5', text: t('Split')}
            ]
        }, {
            module   : CalendarIdsField,
            name     : 'calendarIds',
            labelText: t('Calendars'),
            flex     : 1
        }]
    }

    async onConstructed() {
        await super.onConstructed();

        let me = this;

        addShareCard(me, 'CalendarView', VIEW_LEVELS());

        me.form.on('load', ({data}) => me.title = t(data.id ? 'Edit view' : 'Create view'));
        me.form.on('beforesave', ({data, isNew}) => {
            isNew && (data.ownerId = client.user.id)
        })
    }
}

export default Neo.setupClass(ViewDialog);
