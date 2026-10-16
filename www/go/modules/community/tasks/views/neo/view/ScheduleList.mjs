import TextList     from '../../../../../../../views/neo/src/list/TextList.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'tasks');

/**
 * GOUI ScheduleFilter: today, due in seven days, all, unscheduled, scheduled; one is
 * selected. FILTERS gives the Task/query condition per id.
 */
class ScheduleList extends TextList {
    static config = {
        className    : 'GO.tasks.ScheduleList',
        baseCls      : ['go-tasks-schedule', 'neo-list'],
        displayField : 'name',
        useInternalId: false,
        store        : {
            keyProperty: 'id',
            model      : {fields: [{name: 'id'}, {name: 'name'}, {name: 'icon'}, {name: 'color'}]},
            data       : [
                {id: 'today',       name: t('Today'),             icon: 'content_paste', color: 'green'},
                {id: 'week',        name: t('Due in seven days'), icon: 'filter_7',      color: 'purple'},
                {id: 'all',         name: t('All'),               icon: 'assignment',    color: 'red'},
                {id: 'unscheduled', name: t('Unscheduled'),       icon: 'event_busy',    color: 'blue'},
                {id: 'scheduled',   name: t('Scheduled'),         icon: 'event',         color: 'orange'}
            ]
        }
    }

    /**
     * Task/query condition per entry (ExtJS MainPanel.setStatusFilter)
     */
    static FILTERS = {
        today      : {start: '<=now'},
        week       : {due: '<=7days'},
        all        : null,
        unscheduled: {scheduled: false},
        scheduled  : {scheduled: true}
    }

    createItemContent(record) {
        return [
            {tag: 'i', cls: ['go-icon', 'go-tasks-schedule-icon', 'go-tasks-' + record.color], text: record.icon},
            {tag: 'span', html: escapeHtml(record.name)}
        ]
    }
}

export default Neo.setupClass(ScheduleList);
