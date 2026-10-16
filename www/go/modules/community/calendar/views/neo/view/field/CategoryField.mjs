import {translator} from '../../../../../../../../views/neo/src/Translate.mjs';
import calendarData from '../../data.mjs';
import SuggestField from './SuggestField.mjs';

const t = translator('core', 'core');

/**
 * Categories of an event (GOUI autocompletechips over CalendarCategory): coloured chips,
 * suggestions of the categories for the event's calendar (global ones and its own).
 *
 * Value: array of category ids.
 */
class CategoryField extends SuggestField {
    static config = {
        className: 'GO.calendar.field.CategoryField',
        baseCls  : ['go-field', 'go-cal-suggest', 'go-cal-categories'],
        name     : 'categoryIds',
        /** @member {String|null} calendarId_ categories of this calendar (and global ones) */
        calendarId_: null
    }

    construct(config) {
        config.labelText ??= t('Categories');
        super.construct(config);
        this.addDomListeners({click: this.onChipRemove, delegate: '.go-cal-chip-remove', scope: this})
    }

    beforeSetValue(value) {
        return Array.isArray(value) ? value.map(String) : []
    }

    available() {
        const ids = this.value || [];

        return calendarData.categories.filter(c => !ids.includes(c.id) && (!c.calendarId || !this.calendarId || String(c.calendarId) === String(this.calendarId)))
    }

    createValueNodes() {
        return (this.value || []).map(id => {
            const cat = calendarData.getCategory(id);

            return {tag: 'span', cls: ['go-cal-chip'], style: cat?.color ? {color: '#' + cat.color} : {}, cn: [
                {tag: 'span', text: cat?.name ?? '???'},
                this.readOnly ? null : {tag: 'i', cls: ['go-icon', 'go-cal-chip-remove'], 'data-cat': id, text: 'close'}
            ].filter(Boolean)}
        })
    }

    async suggest(text) {
        const q = text.toLowerCase();

        return this.available().filter(c => c.name.toLowerCase().includes(q)).map(c => ({text: c.name, icon: 'label', color: c.color, data: c}))
    }

    onPick(item) {
        this.userChange([...(this.value || []), item.data.id])
    }

    onFreeText(text) {
        const cat = this.available().find(c => c.name.toLowerCase() === text.toLowerCase());
        cat && this.onPick({data: cat});
        return !!cat
    }

    onChipRemove(data) {
        const id = data.path.find(n => n.data?.cat)?.data.cat;
        id && this.userChange((this.value || []).filter(v => v !== id))
    }
}

export default Neo.setupClass(CategoryField);
