import LinkListCard from '../../../../../../views/neo/src/link/LinkListCard.mjs';
import {translator} from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'calendar');

/**
 * "Upcoming appointments" and "Past appointments" in other items' details (GOUI
 * Index.ts linkDetailCards): the linked events from today on and before today, with the
 * Link filters eventsAfter / eventsBefore of Module::onLinkFilter(). See ModuleRegistry
 * `linkDetailCards`.
 *
 * @returns {Object[]} card configs
 */
export default function linkDetailCards() {
    const card = (title, stateId, filter) => ({
        module : LinkListCard,
        title,
        stateId,
        // an event moved to another day changes cards
        watch  : ['Link', 'CalendarEvent'],
        filter : {entities: [{name: 'CalendarEvent'}], ...filter},
        onAdd  : (owner, ctx) => import('./linkWindow.mjs').then(m => m.default({appName: owner.appName, windowId: owner.windowId, ...ctx}))
    });

    return [
        card(t('Upcoming appointments'), 'link-events-upcoming', {eventsAfter: true}),
        card(t('Past appointments'), 'link-events-past', {eventsBefore: true})
    ]
}
