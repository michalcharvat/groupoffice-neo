import TextArea      from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox  from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import PrincipalCombo from '../../../../../../../views/neo/src/form/field/PrincipalCombo.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import FormWindow    from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import calendarData  from '../data.mjs';
import AlertField    from './field/AlertField.mjs';
import ColorField    from './field/ColorField.mjs';
import {addShareCard, CALENDAR_LEVELS} from './shareCard.mjs';

const t = translator('community', 'calendar');

/**
 * Create or edit a calendar (GOUI CalendarWindow): name, colour, description, owner,
 * availability, sync, default reminders, publishing as ICS, permissions.
 *
 *     Neo.create(CalendarDialog, {appName, windowId, entityId})
 */
class CalendarDialog extends FormWindow {
    static config = {
        className : 'GO.calendar.CalendarDialog',
        cls       : ['go-form-window', 'go-cal-form-dialog'],
        entityName: 'Calendar',
        title     : t('Create calendar'),
        wrapperStyle: {height: '85vh', left: 'calc(50vw - 240px)', top: '7vh', width: '480px'}
    }

    createFormItems() {
        let me = this;

        return [{
            module       : TextField,
            name         : 'name',
            reference    : 'nameField',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true,
            flex         : 'none'
        }, {
            module   : ColorField,
            name     : 'color',
            labelText: t('Color'),
            required : true,
            flex     : 'none'
        }, {
            module       : TextArea,
            name         : 'description',
            reference    : 'descriptionField',
            labelText    : t('Description'),
            labelPosition: 'inline',
            flex         : 'none'
        }, {
            module         : PrincipalCombo,
            principalEntity: 'User',
            name           : 'ownerId',
            reference      : 'ownerField',
            labelText      : t('Owner'),
            labelPosition  : 'inline',
            placeholder    : t('Shared'),
            flex           : 'none'
        }, {
            module    : BoolCheckBox,
            reference : 'availabilityField',
            valueLabel: t('Events affect availability'),
            flex      : 'none'
        }, {
            module    : BoolCheckBox,
            name      : 'syncToDevice',
            valueLabel: t('Sync to device') + ' — ' + t('Make calendar available in CalDAV and ActiveSync'),
            flex      : 'none'
        }, {
            ntype: 'component',
            tag  : 'h3',
            cls  : ['go-cal-form-heading'],
            text : t('Default notifications'),
            flex : 'none'
        }, {
            module      : AlertField,
            name        : 'defaultAlertsWithTime',
            isForDefault: true,
            labelText   : t('Events with time'),
            flex        : 'none'
        }, {
            module      : AlertField,
            name        : 'defaultAlertsWithoutTime',
            isForDefault: true,
            fullDay     : true,
            labelText   : t('Events without time (Full-day)'),
            flex        : 'none'
        }, {
            module    : BoolCheckBox,
            reference : 'publishField',
            valueLabel: t('Publish calendar as ICS file'),
            flex      : 'none',
            hidden    : true
        }, {
            ntype    : 'component',
            reference: 'publishUrl',
            cls      : ['go-cal-publish-url'],
            flex     : 'none',
            hidden   : true
        }]
    }

    async onConstructed() {
        await super.onConstructed();

        let me = this;

        addShareCard(me, 'Calendar', CALENDAR_LEVELS());

        me.form.on('load', ({data}) => me.onLoaded(data));
        me.form.on('beforesave', ({data}) => {
            const affects = !!me.getReference('availabilityField').checked,
                  ownerId = me.getReference('ownerField').getSubmitValue?.();

            data.includeInAvailability = !affects ? 'none' : (String(ownerId) === String(client.user.id) ? 'all' : 'attending')
        });

        me.getReference('publishField').on('change', ({value}) => me.onPublish(!!value));
    }

    onLoaded(data) {
        let me       = this,
            rights   = calendarData.rights,
            editable = data.id ? !!data.myRights?.mayAdmin : !!rights.mayChangeCalendars;

        me.title = t(data.id ? 'Edit calendar' : 'Create calendar');

        me.getReference('availabilityField').checked = data.includeInAvailability ? data.includeInAvailability !== 'none' : true;
        me.getReference('ownerField').hidden       = !editable;
        me.getReference('descriptionField').hidden = !editable;
        me.getReference('nameField').readOnly      = !editable;

        const publish = me.getReference('publishField');
        me.publishing = true;
        publish.hidden  = !editable || !data.id;
        publish.checked = !!data.publishKey;
        me.publishing = false;

        const url = me.getReference('publishUrl');
        url.hidden = !data.publishKey;
        url.text   = data.publishKey ? (client.session?.pageUrl || client.baseUrl + 'api/page.php') + '/community/calendar/ics/' + data.publishKey : ''
    }

    /**
     * Publishing saves right away (GOUI): the server makes the publish key
     */
    async onPublish(on) {
        let me = this;

        if (me.publishing || !me.form.currentId) {
            return
        }

        try {
            await client.set('Calendar', {update: {[me.form.currentId]: {publish: on}}});
            const [data] = await client.get('Calendar', [me.form.currentId]);
            data && !me.isDestroyed && me.onLoaded(data)
        } catch (e) {
            me.showError(e.message)
        }
    }
}

export default Neo.setupClass(CalendarDialog);
