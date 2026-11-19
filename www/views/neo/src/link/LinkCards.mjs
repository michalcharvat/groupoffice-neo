import Container      from '../../node_modules/neo.mjs/src/container/Base.mjs';
import ModuleRegistry from '../ModuleRegistry.mjs';
import LinkDetail     from './LinkDetail.mjs';

/**
 * Link cards of a detail view: the generic "Links" card (LinkDetail) followed by the
 * cards modules register for their entities as ModuleRegistry `linkDetailCards`, like
 * ExtJS go.links.getDetailPanels() / GOUI linkDetailCards: e.g. "Incomplete tasks" and
 * "Completed tasks" (tasks), "Upcoming appointments" and "Past appointments" (calendar).
 * Links to those entities are left out of the generic card.
 *
 * Same API as a single card: setEntity(entity, entityId, record) and `current`.
 */
class LinkCards extends Container {
    static config = {
        className: 'GO.link.LinkCards',
        baseCls  : ['go-link-cards', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * Entity shown: {entity, entityId, record}
     * @member {Object|null} current=null
     */
    current = null

    /**
     * The module cards, once loaded
     * @member {GO.detail.Card[]} cards=[]
     */
    cards = []

    construct(config) {
        super.construct(config);

        let me      = this,
            configs = ModuleRegistry.getConfigs('linkDetailCards');

        me.items = [{
            module         : LinkDetail,
            reference      : 'linkDetail',
            flex           : 'none',
            excludeEntities: configs.flatMap(c => c.entities || [])
        }];

        me.loadCards(configs)
    }

    /**
     * Adds the modules' cards (their code is loaded on demand); a module whose cards fail
     * to load is left out
     * @param {Object[]} configs ModuleRegistry `linkDetailCards`
     * @returns {Promise<void>}
     * @protected
     */
    async loadCards(configs) {
        let me = this;

        const failed = [],
              lists  = await Promise.all(configs.map(c => Promise.resolve().then(() => c.cards()).catch(e => {
                  console.error('linkDetailCards', e);
                  failed.push(...(c.entities || []));
                  return []
              })));

        if (me.isDestroyed) {
            return
        }

        lists.flat().forEach(card => {
            const instance = me.add({flex: 'none', ...card});

            me.cards.push(instance);
            me.current && instance.setEntity(me.current.entity, me.current.entityId, me.current.record)
        });

        if (failed.length) {
            // no card shows these links: the generic card lists them again
            const linkDetail = me.getReference('linkDetail');

            linkDetail.excludeEntities = linkDetail.excludeEntities.filter(e => !failed.includes(e));
            linkDetail.current && linkDetail.reload()
        }
    }

    /**
     * Shows the cards for an entity, or clears them
     * @param {String|null} entity e.g. "Note"
     * @param {String|null} entityId
     * @param {Object|null} record
     */
    setEntity(entity, entityId, record=null) {
        let me = this;

        me.current = entity && entityId ? {entity, entityId, record} : null;

        me.getReference('linkDetail').setEntity(entity, entityId, record);
        me.cards.forEach(card => card.setEntity(entity, entityId, record))
    }
}

export default Neo.setupClass(LinkCards);
