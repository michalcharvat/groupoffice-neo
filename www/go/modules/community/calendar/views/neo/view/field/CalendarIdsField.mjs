import Field        from '../../../../../../../../views/neo/src/form/field/Field.mjs';
import client       from '../../../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml} from '../../../../../../../../views/neo/src/Format.mjs';

/**
 * Calendars of a view (GOUI ViewWindow check list): every calendar the user can see with
 * a coloured check box. Value: array of calendar ids.
 */
class CalendarIdsField extends Field {
    static config = {
        className: 'GO.calendar.field.CalendarIdsField',
        baseCls  : ['go-field', 'go-cal-ids']
    }

    /** @member {Object[]} calendars */
    calendars = []

    construct(config) {
        super.construct(config);
        this.addDomListeners({click: this.onRowClick, delegate: '.go-cal-ids-row', scope: this});
        this.load()
    }

    async load() {
        try {
            const {list} = await client.queryGet('Calendar', {sort: [{property: 'sortOrder'}, {property: 'name'}], properties: ['id', 'name', 'color']});
            this.calendars = list;
            this.isDestroyed || this.renderControl()
        } catch (e) {
            console.error(e)
        }
    }

    beforeSetValue(value) {
        return Array.isArray(value) ? value.map(String) : []
    }

    createControl() {
        const ids = this.value || [];

        return [{tag: 'ul', cls: ['go-cal-check-rows'], cn: this.calendars.map(c => ({
            tag: 'li', cls: ['go-cal-ids-row'], 'data-cid': String(c.id), cn: [
                {tag: 'span', cls: ['go-check', 'go-cal-check', ids.includes(String(c.id)) ? 'go-checked' : null].filter(Boolean), style: {color: '#' + (c.color || '356772')}},
                {tag: 'span', cls: ['go-cal-check-text'], html: escapeHtml(c.name)}
            ]
        }))}]
    }

    onRowClick(data) {
        const id  = data.path.find(n => n.data?.cid)?.data.cid,
              ids = this.value || [];

        id && this.userChange(ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id])
    }
}

export default Neo.setupClass(CalendarIdsField);
