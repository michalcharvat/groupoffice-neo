import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox  from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import LocalCombo    from '../../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import TextList      from '../../../../../../../views/neo/src/list/TextList.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import FormWindow    from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import calendarData  from '../data.mjs';
import ColorField    from './field/ColorField.mjs';

const t = translator('community', 'calendar');

/**
 * Create or edit a category (GOUI CategoryWindow): name, colour, the calendar it belongs
 * to (empty: all), global for admins (no owner).
 */
class CategoryDialog extends FormWindow {
    static config = {
        className : 'GO.calendar.CategoryDialog',
        cls       : ['go-form-window', 'go-cal-form-dialog'],
        entityName: 'CalendarCategory',
        title     : t('Create category'),
        wrapperStyle: {height: '480px', left: 'calc(50vw - 200px)', top: '15vh', width: '400px'}
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
            module       : LocalCombo,
            name         : 'calendarId',
            labelText    : t('Calendar'),
            labelPosition: 'inline',
            placeholder  : t('All'),
            flex         : 'none',
            width        : null,
            displayField : 'name',
            valueField   : 'id',
            listConfig   : {module: TextList},
            // categories of a calendar: calendars the user manages
            store        : {keyProperty: 'id', data: calendarData.calendars.filter(c => c.myRights?.mayAdmin).map(c => ({id: c.id, name: c.name}))}
        }, {
            module    : BoolCheckBox,
            name      : 'isGlobal',
            valueLabel: t('Global category'),
            hidden    : !calendarData.user.isAdmin,
            flex      : 'none'
        }]
    }

    async onConstructed() {
        await super.onConstructed();

        let me = this;

        me.form.on('beforeload', ({data}) => {
            data.isGlobal = 'ownerId' in data ? data.ownerId === null : false;
            data.calendarId != null && (data.calendarId = String(data.calendarId))
        });
        me.form.on('load', ({data}) => me.title = t(data.id ? 'Edit category' : 'Create category'));
        me.form.on('beforesave', ({data, isNew}) => {
            if ('isGlobal' in data || isNew) {
                data.ownerId = data.isGlobal ? null : client.user.id
            }
            delete data.isGlobal;
            // an empty combo gives '': the server would look for that calendar
            'calendarId' in data && !data.calendarId && (data.calendarId = null)
        })
    }
}

export default Neo.setupClass(CategoryDialog);
