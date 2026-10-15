import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Card      from '../detail/Card.mjs';
import client    from '../jmap/Client.mjs';
import {escapeHtml} from '../Format.mjs';
import customFields, {matchesFilter} from './customFields.mjs';
import {getType} from './types.mjs';

/**
 * One custom field set in a detail view (GOUI customfields/DetailFieldset.ts): a
 * collapsible card listing label and value of the fields that have a value.
 */
class DetailFieldset extends Card {
    static config = {
        className: 'GO.customfields.DetailFieldset',
        cls      : ['go-cf-detail'],
        hidden   : true,
        /**
         * GO FieldSet entity
         * @member {Object|null} fieldSet=null
         */
        fieldSet: null
    }

    construct(config) {
        config.title   ??= config.fieldSet?.name || '';
        config.stateId ??= 'cf-detail-' + config.fieldSet?.id;

        super.construct(config)
    }

    createBody() {
        return [{
            ntype    : 'component',
            reference: 'list',
            cls      : ['go-cf-detail-list'],
            html     : ''
        }]
    }

    /**
     * @param {Object} values the entity's customFields
     * @returns {Promise<String>} HTML, '' when no field has a value
     */
    async render(values = {}) {
        const rows = [],
              {fieldSet} = this;
        let valueRows = 0;

        for (const field of customFields.getFields(fieldSet)) {
            const type = getType(field),
                  html = await type.detailHtml(field, values?.[field.databaseName]);

            if (html) {
                type.noValue || valueRows++;
                rows.push(type.noValue
                    ? `<div class="go-cf-detail-notes">${html}</div>`
                    : `<div class="go-cf-detail-row"><label>${escapeHtml(field.name)}</label><div>${html}</div></div>`)
            }
        }

        // a set with nothing but admin notes shows nothing
        return valueRows ? rows.join('') : ''
    }

    /**
     * @param {String} html
     */
    showHtml(html) {
        this.getReference('list').html = html;
        this.hidden = !html
    }
}

const DetailFieldsetClass = Neo.setupClass(DetailFieldset);

/**
 * The custom field sets of an entity in a detail view, one card per set, hidden
 * when the set has no values or its filter does not match the entity.
 *
 *     {module: DetailFieldsets, reference: 'customFields'}
 *     detailFieldsets.setEntity('Note', 5);
 *
 * Reloads when the server reports a change of the entity type.
 */
class DetailFieldsets extends Container {
    static config = {
        className: 'GO.customfields.DetailFieldsets',
        cls      : ['go-cf-detail-sets'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : []
    }

    /** {entity, entityId} */
    current = null
    /** entity type the cards were built for */
    builtFor = null
    generation = 0

    construct(config) {
        super.construct(config);

        let me = this;

        me.removeStateListener = client.on('stateChange', ({changed}) => {
            me.current && changed?.includes(me.current.entity) && me.reload()
        })
    }

    destroy(...args) {
        this.removeStateListener?.();
        super.destroy(...args)
    }

    /**
     * @param {String|null} entity e.g. 'Note'
     * @param {String|null} entityId
     */
    setEntity(entity, entityId) {
        this.current = entity && entityId ? {entity, entityId} : null;
        this.reload()
    }

    async reload() {
        let me         = this,
            generation = ++me.generation,
            {current}  = me;

        if (!current) {
            me.items.forEach(card => card.hidden = true);
            return
        }

        try {
            await customFields.load();

            if (me.isDestroyed || generation !== me.generation) {
                return
            }

            const fieldSets = customFields.getFieldSets(current.entity);

            if (me.builtFor !== current.entity) {
                me.removeAll(true);
                me.builtFor = current.entity;
                fieldSets.length && me.add(fieldSets.map(fieldSet => ({module: DetailFieldsetClass, fieldSet, flex: 'none'})))
            }

            if (!fieldSets.length) {
                return
            }

            const [entity] = await client.get(current.entity, [current.entityId],
                ['id', 'customFields', ...customFields.getFilterProperties(current.entity)]);

            if (me.isDestroyed || generation !== me.generation) {
                return
            }

            for (const card of [...me.items]) {
                const html = entity && matchesFilter(card.fieldSet, entity) ? await card.render(entity.customFields) : '';

                if (me.isDestroyed || generation !== me.generation) {
                    return
                }

                card.isDestroyed || card.showHtml(html)
            }
        } catch (e) {
            console.warn('Custom fields detail', e)
        }
    }
}

export default Neo.setupClass(DetailFieldsets);
