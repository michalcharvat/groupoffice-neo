import Container    from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import {fieldset}   from '../../../../../../../views/neo/src/form/fieldset.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import SelectField  from '../../../../../../../views/neo/src/form/field/SelectField.mjs';

const t = translator('community', 'calendar');

const pref = name => 'calendarPreferences.' + name;

const hint = text => ({ntype: 'component', cls: ['go-field-hint'], flex: 'none', text});

const select = (name, labelText, options, hint) => ({module: SelectField, name: pref(name), labelText, options, hint: hint || ''});

/**
 * Calendar card of My account (GOUI calendar PreferencesPanel): User.calendarPreferences,
 * saved with the User.
 */
class PreferencesPanel extends Container {
    static config = {
        className: 'GO.calendar.PreferencesPanel',
        baseCls  : ['go-cal-preferences', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        let me = this;

        super.construct({...config, items: [fieldset(t('Preferences'), [
            {module: BoolCheckBox, name: pref('showWeekNumbers'), valueLabel: t('Show week numbers in calendar')},
            {module: BoolCheckBox, name: pref('showTooltips'),    valueLabel: t('Show pop-up info when hovering over appointments')},
            {module: BoolCheckBox, name: pref('showDeclined'),    valueLabel: t('Show events that you have declined')},
            {module: BoolCheckBox, name: pref('multiLine'),       valueLabel: t('Show multiline event blocks') + ' (beta)'},
            {module: BoolCheckBox, name: pref('showCategoryColor'), valueLabel: t('Show event in category color')},
            hint(t('Only when one calendar is selected and the event has one category')),
            {module: BoolCheckBox, name: pref('printWeekInGrid'), valueLabel: t('Print week and workweek in a grid with hours')},
            {
                module       : JmapComboBox,
                name         : pref('defaultCalendarId'),
                reference    : 'defaultCalendar',
                entity       : 'Calendar',
                jmapFilter   : {davaccountId: null},
                properties   : ['id', 'name'],
                jmapSort     : [{property: 'sortOrder'}, {property: 'name'}],
                labelText    : t('Default calendar'),
                labelPosition: 'inline',
                width        : null
            }, hint(t('Start with this calendar selected')), {
                module       : JmapComboBox,
                name         : pref('personalCalendarId'),
                reference    : 'personalCalendar',
                entity       : 'Calendar',
                jmapFilter   : {davaccountId: null, isResource: false, permissionLevel: 30},
                properties   : ['id', 'name'],
                jmapSort     : [{property: 'sortOrder'}, {property: 'name'}],
                labelText    : t('Personal calendar'),
                labelPosition: 'inline',
                width        : null
            }, hint(t('Invitation to event will be added into this calendar')),
            select('weekViewGridSnap', t('Raster size for day/week view'), [
                {value: 5, text: '5 ' + t('minutes')}, {value: 15, text: '15 ' + t('minutes')},
                {value: 30, text: '30 ' + t('minutes')}, {value: 60, text: '1 ' + t('hour')}
            ], t('The duration adjustment when resizing an event')),
            select('weekViewGridSize', t('Height for day/week view'), [
                {value: 4, text: t('Extra small')}, {value: 5, text: t('Small')}, {value: 7, text: t('Regular')},
                {value: 8, text: t('Medium')}, {value: 9, text: t('Large')}
            ], t('The height of a single day')),
            select('startView', t('Default view when opening the calendar'), [
                {value: 'day', text: t('Day')}, {value: 'week', text: t('Week')}, {value: 'days-5', text: t('Workweek')},
                {value: 'weeks-14', text: '2 ' + t('Weeks')}, {value: 'weeks-21', text: '3 ' + t('Weeks')},
                {value: 'month', text: t('Month')}, {value: 'split-5', text: t('Split')}, {value: 'year', text: t('Year')},
                {value: 'list', text: t('List')}
            ]),
            select('defaultDuration', t('Default duration'), [
                {value: 'PT30M', text: '30 ' + t('minutes')}, {value: 'PT1H', text: '1 ' + t('hour')},
                {value: 'PT2H', text: '2 ' + t('hours')}, {value: null, text: t('All day')}
            ], t('Duration for a new event when no range is selected'))
        ]), {
            ...fieldset(t('Process e-mail in'), [
                // GOUI: "mark as read and archive" only shows while its option is on (userChange:
                // a change listener that hides a sibling during the load drops the tick)
                {module: BoolCheckBox, name: pref('autoAddInvitations'), reference: 'autoAddInvitations',
                 valueLabel: t('Automatically add invitation to your calendar'), listeners: {userChange: () => me.syncArchiveFields()}},
                hint(t('Whenever an event invitation is received, add the event to your default calendar')),
                {module: BoolCheckBox, name: pref('markReadAndFileAutoAdd'), reference: 'markReadAndFileAutoAdd', cls: ['go-cal-pref-sub'],
                 valueLabel: t('Mark invitation as read and archive'), hidden: true},
                {module: BoolCheckBox, name: pref('autoUpdateInvitations'), reference: 'autoUpdateInvitations',
                 valueLabel: t('Automatically apply updates from organizer'), listeners: {userChange: () => me.syncArchiveFields()}},
                hint(t('Whenever an update to an event already in your calendar is received, update the event, or delete it if the event is cancelled')),
                {module: BoolCheckBox, name: pref('markReadAndFileAutoUpdate'), reference: 'markReadAndFileAutoUpdate', cls: ['go-cal-pref-sub'],
                 valueLabel: t('Mark updates as read and archive'), hidden: true}
            ]),
            reference: 'processFieldset'
        }]})
    }

    /**
     * @param {Object} user the loaded User
     */
    onLoad(user) {
        // the user's own calendars (an admin editing another user)
        this.getReference('personalCalendar').jmapFilter = {davaccountId: null, isResource: false, permissionLevel: 30, ownerId: user.id};
        this.getReference('defaultCalendar').jmapFilter  = {davaccountId: null, isSubscribedFor: user.id};
        this.syncArchiveFields()
    }

    /**
     * The archive options follow their auto add / auto update option
     */
    syncArchiveFields() {
        let me = this;

        [['autoAddInvitations', 'markReadAndFileAutoAdd'], ['autoUpdateInvitations', 'markReadAndFileAutoUpdate']].forEach(([option, archive]) => {
            const field = me.getReference(archive),
                  on    = me.getReference(option);

            field && (field.hidden = !on?.checked)
        })
    }
}

export default Neo.setupClass(PreferencesPanel);
