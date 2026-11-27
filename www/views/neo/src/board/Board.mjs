import NeoBoard           from '../../node_modules/neo.mjs/src/board/Container.mjs';
import {registerCardItem} from '../../node_modules/neo.mjs/src/board/CardItems.mjs';
import Store              from '../../node_modules/neo.mjs/src/data/Store.mjs';
import {avatarHtml}       from '../Format.mjs';
import client             from '../jmap/Client.mjs';
import {setDataAndFireLoad} from '../data/setData.mjs';
import {t}                from '../Translate.mjs';
import Card               from './Card.mjs';
import CardModel          from './CardModel.mjs';
import SortZone           from './SortZone.mjs';

// Tags in their own colours: {name, color}
registerCardItem('goTags', record => record.tags?.length ? {
    cls: ['neo-board-card-tags'],
    cn : record.tags.map(tag => ({
        tag  : 'span',
        cls  : ['neo-board-card-tag', 'go-board-tag'],
        style: tag.color ? {'--go-board-tag-color': tag.color} : null,
        text : String(tag.name)
    }))
} : null);

// Due date, icons and the assignee's avatar in one row; neo's due date classes give the overdue look
registerCardItem('goMeta', record => {
    const cn = [];

    record.due && cn.push({
        tag : 'span',
        cls : ['neo-board-card-due-date', ...(record.overdue ? ['neo-board-card-due-date-overdue'] : [])],
        text: String(record.due)
    });
    (record.icons || []).forEach(icon => cn.push({tag: 'i', cls: ['go-icon', ...(icon.cls ? [icon.cls] : [])], title: icon.title || '', text: icon.icon}));
    record.assignee && cn.push({cls: ['go-board-assignee'], html: avatarHtml(record.assignee, ['go-avatar-small'])});

    return cn.length ? {cls: ['go-board-card-meta'], cn} : null
});

/**
 * @summary Kanban board over a GO store: columns by key, one card per record and column, a drop between columns
 * sends the JMAP patch the caller computes.
 * @description Generic: the caller passes the columns and functions that place, order, render and move a record
 * (docs/neo-core-components.md, "GO.board.Board"). neo's board shows one card per record of its own store; this
 * board keeps a projection store with a row per (source record, column), so a record can show in several columns.
 * Drag only between columns; neo's card editor, column reordering and swimlanes are not used.
 * @class GO.board.Board
 * @extends Neo.board.Container
 */
class Board extends NeoBoard {
    static config = {
        className: 'GO.board.Board',
        baseCls  : ['neo-board', 'go-board'],
        ariaLabel: t('Board'),
        cardItems: [{type: 'title'}, {type: 'goTags'}, {type: 'progress'}, {type: 'goMeta'}],
        cardModule: Card,
        columnsResortable: false,
        sortZoneConfig   : {module: SortZone},
        /**
         * Columns in display order: [{key, title, color, dropDisabled}]
         * @member {Object[]} boardColumns_=[]
         * @reactive
         */
        boardColumns_: [],
        /**
         * Source of the cards, e.g. a GO.data.JmapStore; the board does not load it
         * @member {Neo.data.Store|null} sourceStore_=null
         * @reactive
         */
        sourceStore_: null,
        /**
         * JMAP entity a drop patch is sent to
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * Column keys of a record: none hides it, several show a card in each
         * @member {Function} columnsOf=record => []
         */
        columnsOf: record => [],
        /**
         * Order of the records inside a column
         * @member {Function} compare=() => 0
         */
        compare: () => 0,
        /**
         * Display fields of a record: {title, tags, assignee, due, overdue, icons, progress, color}
         * @member {Function} cardData=record => ({title: record.title})
         */
        cardData: record => ({title: record.title}),
        /**
         * False refuses dragging the record (no write permission)
         * @member {Function} canDrag=() => true
         */
        canDrag: () => true,
        /**
         * JMAP patch for moving a record from one column to another, null refuses the drop
         * @member {Function} dropPatch=() => null
         */
        dropPatch: () => null,
        store: {module: Store, model: CardModel}
    }

    /**
     * @summary Hands the columns to neo's board (column key = neo's status).
     * @param {Object[]} value
     * @param {Object[]} oldValue
     */
    afterSetBoardColumns(value, oldValue) {
        this.columns = (value || []).map(column => ({status: String(column.key), title: column.title, color: column.color || null}))
    }

    /**
     * @summary Rebuilds the cards on every change of the source store.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     */
    afterSetSourceStore(value, oldValue) {
        const listeners = {load: this.rebuild, loadMore: this.rebuild, recordChange: this.rebuild, scope: this};

        oldValue?.un(listeners);
        value?.on(listeners);
        this.isConstructed && this.rebuild()
    }

    /**
     * @summary Listens to its own selection and builds the first cards.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.on('selectionChange', ({records}) => me.fire('cardSelect', {records: me.toSource(records)}));
        me.rebuild()
    }

    /**
     * @summary The source records of cards, each once.
     * @param {Object[]} cards card records of the board store
     * @returns {Object[]}
     */
    toSource(cards) {
        const ids = [...new Set(cards.map(card => card.sourceId))];

        return ids.map(id => this.sourceStore?.get(id)).filter(Boolean)
    }

    /**
     * @summary The source record of a card.
     * @param {Object|null} card card record of the board store
     * @returns {Object|null}
     */
    getDataRecord(card) {
        return card ? this.sourceStore?.get(card.sourceId) || null : null
    }

    /**
     * @summary Projects the source records into the board store: a row per record and column, ordered by compare().
     */
    rebuild() {
        let me     = this,
            source = me.sourceStore,
            keys   = new Set((me.boardColumns || []).map(column => String(column.key))),
            rows   = [];

        // a hidden board waits: the caller rebuilds when it shows it
        if (!source || !me.store || me.isDestroyed || me.hidden) {
            return
        }

        [...source.items].sort(me.compare).forEach((record, order) => {
            const data = me.cardData(record);

            me.columnsOf(record).map(String).filter(key => keys.has(key)).forEach(status => rows.push({
                ...data,
                id      : `${record.id}::${status}`,
                sourceId: String(record.id),
                status,
                order
            }))
        });

        setDataAndFireLoad(me.store, rows);
        // the records may have new permissions
        me.cardMap.forEach(card => me.sortZone?.armCard(card))
    }

    /**
     * @summary Checks a move and computes its patch.
     * @param {Object|null} record source record
     * @param {String} fromKey
     * @param {String} toKey
     * @returns {Object|null} the patch, null when the move is refused
     */
    getMovePatch(record, fromKey, toKey) {
        const me     = this,
              target = (me.boardColumns || []).find(column => String(column.key) === String(toKey));

        if (!record || !target || target.dropDisabled || String(fromKey) === String(toKey) || !me.canDrag(record)) {
            return null
        }

        return me.dropPatch(record, String(fromKey), String(toKey)) || null
    }

    /**
     * Moves not sent yet, per source record id: {record, patch, moves: [{card, status, order}]}. One drag of several
     * cards of the same record (a task in two category columns) becomes one patch.
     * @member {Map} pendingMoves=new Map()
     */
    pendingMoves = new Map()

    /**
     * @summary The board's one writer (drop, keyboard, menu): only moves between columns that the caller allows; the
     * card moves at once, keeps its place in the order of compare(), and the patch is sent.
     * @param {Object} data see Neo.board.Container#moveCard
     * @returns {Object|null} the moved card record, null when nothing moved
     */
    moveCard(data) {
        let me     = this,
            card   = data.record ?? (data.key != null ? me.getSourceRecord(data.key)
                   : data.cardId != null ? Neo.getComponent(data.cardId)?.record ?? null : null),
            source = me.getDataRecord(card),
            entry  = source && me.pendingMoves.get(String(source.id)),
            // a second card of the same record in this drag sees the first card's change
            view   = entry ? new Proxy(source, {get: (target, key) => key in entry.patch ? entry.patch[key] : target[key]}) : source,
            from   = card?.status,
            order  = card?.order,
            patch  = card && me.getMovePatch(view, from, data.status ?? from);

        if (!patch) {
            return null
        }

        // no manual order: drop the slot of the drop, then put the order back
        const moved = super.moveCard({record: card, status: data.status});

        if (!moved) {
            return null
        }

        moved.set({order});

        if (!entry) {
            me.pendingMoves.set(String(source.id), {record: source, patch: {...patch}, moves: [{card, status: from, order}]});
            queueMicrotask(() => me.sendPatch(String(source.id)))
        } else {
            Object.assign(entry.patch, patch);
            entry.moves.push({card, status: from, order})
        }

        return moved
    }

    /**
     * @summary Moves a record's card from one column to another, as a drop does ("Move to column").
     * @param {Object} record source record
     * @param {String} fromKey
     * @param {String} toKey
     * @returns {Object|null} the moved card record
     */
    moveRecord(record, fromKey, toKey) {
        return this.moveCard({key: `${record.id}::${fromKey}`, status: String(toKey)})
    }

    /**
     * @summary Saves the moves of a record; a refusal puts its cards back and fires dropError. Success needs
     * nothing: the push reloads the source store.
     * @param {String} id source record id
     */
    async sendPatch(id) {
        let me    = this,
            entry = me.pendingMoves.get(id);

        me.pendingMoves.delete(id);

        try {
            await client.set(me.entity, {update: {[entry.record.id]: entry.patch}})
        } catch (error) {
            if (!me.isDestroyed) {
                // the rows of a rebuild equal the moved ones (same ids): undo the moves on the records themselves
                entry.moves.reverse().forEach(({card, status, order}) => me.store.get(card.id) === card && card.set({status, order}));
                me.rebuild();
                me.fire('dropError', {error})
            }
        }
    }

    /**
     * @summary Double click, Enter and F2 open the record: fires cardOpen instead of neo's card editor.
     * @param {Neo.board.Card|Object|String} cardOrRecord
     * @returns {null}
     */
    activateCard(cardOrRecord) {
        const card   = cardOrRecord instanceof Card ? cardOrRecord.record
                     : typeof cardOrRecord === 'object' ? cardOrRecord : this.store.get(cardOrRecord),
              record = this.getDataRecord(card);

        record && this.fire('cardOpen', {record});
        return null
    }

    /**
     * @summary The card's "..." button: fires cardMenu so the caller shows its menu at the button.
     * @param {Neo.board.Card|Object} cardOrRecord
     * @returns {null}
     */
    openCardEditor(cardOrRecord) {
        const component = cardOrRecord instanceof Card ? cardOrRecord : this.getCard(cardOrRecord),
              record    = this.getDataRecord(component?.record);

        record && this.fire('cardMenu', {record, column: component.record.status, card: component, target: `${component.id}__menu`});
        return null
    }

    /**
     * @summary Stops listening to the source store.
     * @param {...*} args
     */
    destroy(...args) {
        this.sourceStore = null;
        super.destroy(...args)
    }
}

export default Neo.setupClass(Board);
