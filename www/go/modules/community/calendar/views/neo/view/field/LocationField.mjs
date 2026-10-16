import client       from '../../../../../../../../views/neo/src/jmap/Client.mjs';
import {translator} from '../../../../../../../../views/neo/src/Translate.mjs';
import SuggestField from './SuggestField.mjs';

const t = translator('community', 'calendar');

/**
 * Location of an event (GOUI LocationField): free text that grows with its lines,
 * suggests addresses of contacts while typing, opens a URL location in the browser.
 *
 * Value: the text.
 */
class LocationField extends SuggestField {
    static config = {
        className: 'GO.calendar.field.LocationField',
        baseCls  : ['go-field', 'go-cal-suggest', 'go-cal-location'],
        name     : 'location',
        multiline: true
    }

    construct(config) {
        config.labelText ??= t('Location');
        super.construct(config);
        this.addDomListeners({click: this.onOpenClick, delegate: '.go-cal-location-open', scope: this})
    }

    afterSetValue(value, oldValue) {
        // typed text is the value; a value from the form shows in the input
        this.inputText = value || '';
        super.afterSetValue(value, oldValue)
    }

    getSubmitValue() {
        return this.value || ''
    }

    createControl() {
        const nodes = super.createControl(),
              input = nodes.find(n => n.id === this.inputId);

        // GOUI: as many rows as lines
        input && (input.rows = Math.max(1, (this.inputText.match(/\n/g) || []).length + 1));

        /^https?:\/\//.test(this.value || '') && nodes.push({tag: 'i', cls: ['go-icon', 'go-cal-location-open'], title: t('Open'), text: 'open_in_browser'});

        return nodes
    }

    onInput(data) {
        super.onInput(data);
        this.clean = false;
        this.value = this.inputText
    }

    onOpenClick() {
        Neo.Main.windowOpen({url: this.value, windowName: '_blank', windowId: this.windowId})
    }

    async suggest(text) {
        const {list} = await client.queryGet('Contact', {filter: {text}, limit: 50, properties: ['id', 'name', 'addresses']}),
              result = [];

        list.forEach(c => (c.addresses || []).forEach(a => {
            a.formatted && result.push({text: c.name, sub: a.formatted.replace(/\n/g, ', '), icon: 'location_on', data: a.formatted.replace(/\n/g, ', ')})
        }));

        return result
    }

    onPick(item) {
        this.userChange(item.data);
        this.inputText = item.data
    }
}

export default Neo.setupClass(LocationField);
