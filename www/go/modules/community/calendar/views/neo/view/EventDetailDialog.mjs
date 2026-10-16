import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import Dialog       from '../../../../../../../views/neo/src/view/Dialog.mjs';
import EventDetail  from './EventDetail.mjs';

const t = translator('community', 'calendar');

/**
 * An event in a window (GOUI EventDetailWindow): events the user may not change,
 * invitations, items from links.
 *
 *     Neo.create(EventDetailDialog, {appName, windowId, item})
 */
class EventDetailDialog extends Dialog {
    static config = {
        className   : 'GO.calendar.EventDetailDialog',
        cls         : ['go-cal-detail-dialog'],
        modal       : false,
        resizable   : true,
        title       : t('Event'),
        wrapperStyle: {height: '80vh', left: 'calc(50vw - 282px)', top: '10vh', width: '565px'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /** @member {CalendarItem|null} item */
        item: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : EventDetail,
            reference: 'detail',
            flex     : 1,
            listeners: {
                // GOUI: the edit button opens the editor even for events of others (forceWrite)
                edit: ({item}) => {
                    me.close();
                    item.open(null, true)
                }
            }
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.title = this.item?.title || t('Event');
        this.getReference('detail').setItem(this.item)
    }
}

export default Neo.setupClass(EventDetailDialog);
