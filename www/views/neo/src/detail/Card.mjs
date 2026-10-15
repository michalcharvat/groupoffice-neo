import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Button    from '../button/Button.mjs';
import client    from '../jmap/Client.mjs';
import {getState, setState} from '../State.mjs';
import {t} from '../Translate.mjs';

/**
 * Collapsible card of a detail view, like the panels go.detail.Panel adds below an
 * entity (Comments, Files, History): a title row with a collapse button over a body.
 *
 * Subclasses implement createBody() (item configs), loadData(entity, entityId, record),
 * showData(data) and clearData().
 * They reload when the server reports a change of their `watch` entities.
 */
class Card extends Container {
    static config = {
        className: 'GO.detail.Card',
        baseCls  : ['go-detail-card', 'go-card', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {String} title=''
         */
        title: '',
        /**
         * localStorage state id for the collapsed state (ExtJS stateId, e.g. "files-detail")
         * @member {String|null} stateId=null
         */
        stateId: null,
        /**
         * Entities whose changes reload the card
         * @member {String[]} watch=[]
         */
        watch: []
    }

    /**
     * Entity shown: {entity, entityId, record}
     * @member {Object|null} current=null
     */
    current = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype : 'container',
            cls   : ['go-detail-card-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                ntype: 'component',
                tag  : 'h3',
                flex : 1,
                text : me.title
            }, ...me.createTools(), {
                module   : Button,
                icon     : 'expand_less',
                reference: 'collapseButton',
                tooltip  : t('Collapse'),
                handler  : () => me.setCollapsed(!me.collapsed)
            }]
        }, {
            ntype    : 'container',
            reference: 'body',
            cls      : ['go-detail-card-body'],
            layout   : {ntype: 'vbox', align: 'stretch'},
            // the card grows with its content: no item shrinks (a squeezed button row clips)
            items    : me.createBody().map(item => ({flex: 'none', ...item}))
        }];

        if (me.watch.length) {
            client.watch(me.watch);

            me.removeStateListener = client.on('stateChange', ({changed}) => {
                if (me.current && changed.some(e => me.watch.includes(e))) {
                    me.reload()
                }
            })
        }
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.stateId) {
            const {collapsed} = await getState(me.stateId, me.windowId);
            me.isDestroyed || me.setCollapsed(!!collapsed, false)
        }
    }

    destroy(...args) {
        this.removeStateListener?.();
        super.destroy(...args)
    }

    /**
     * @returns {Object[]} buttons left of the collapse button
     */
    createTools() {
        return []
    }

    /**
     * @returns {Object[]}
     */
    createBody() {
        return []
    }

    /**
     * @param {Boolean} collapsed
     * @param {Boolean} save=true
     */
    setCollapsed(collapsed, save=true) {
        let me     = this,
            button = me.getReference('collapseButton');

        me.collapsed = collapsed;
        me.getReference('body').hidden = collapsed;
        button.icon    = collapsed ? 'expand_more' : 'expand_less';
        button.tooltip = collapsed ? t('Expand') : t('Collapse');

        save && me.stateId && setState(me.stateId, {collapsed}, me.windowId)
    }

    /**
     * Shows the card for an entity, or clears it
     * @param {String|null} entity e.g. "Note"
     * @param {String|null} entityId
     * @param {Object|null} record
     */
    setEntity(entity, entityId, record=null) {
        let me = this;

        me.current = entity && entityId ? {entity, entityId, record} : null;
        me.reload()
    }

    reload() {
        // every reload (entity change or push) supersedes the pending ones
        let me         = this,
            generation = me.generation = (me.generation || 0) + 1,
            {current}  = me;

        if (!current) {
            me.clearData();
            return
        }

        me.loadData(current.entity, current.entityId, current.record)
            .then(data => !me.isDestroyed && generation === me.generation && me.showData(data))
            .catch(e => !me.isDestroyed && generation === me.generation && me.showError(e))
    }

    /**
     * @returns {Promise<*>} data for render()
     */
    async loadData(entity, entityId, record) {
        return null
    }

    /**
     * @param {*} data result of loadData()
     */
    showData(data) {}

    clearData() {}

    showError(e) {
        console.error(e)
    }
}

export default Neo.setupClass(Card);
