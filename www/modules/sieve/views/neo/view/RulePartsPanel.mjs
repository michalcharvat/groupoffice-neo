import Container   from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar     from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button      from '../../../../../views/neo/src/button/Button.mjs';
import ActionTable from '../../../../../views/neo/src/list/ActionTable.mjs';
import {t as coreT} from '../../../../../views/neo/src/Translate.mjs';
import {t}         from '../util.mjs';

/**
 * The conditions or the actions of a rule in the rule dialog (ExtJS CriteriumGrid,
 * ActionGrid): a list with add, edit (pencil or double click), delete and move up / down.
 * The records live here until the rule is saved.
 *
 *     {module: RulePartsPanel, title: t('...'), render: criteriumText, openEditor: async part => newPart | null}
 *
 * Fires `change` after every change.
 */
class RulePartsPanel extends Container {
    static config = {
        className: 'GO.sieve.RulePartsPanel',
        cls      : ['go-sieve-rule-parts'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * Text above the list
         * @member {String} title=''
         */
        title: '',
        /**
         * Shown without records
         * @member {String} emptyText=''
         */
        emptyText: '',
        /**
         * The text of a record
         * @member {Function|null} render=null
         */
        render: null,
        /**
         * Opens the editor of a record (null: a new one) and resolves with the edited record,
         * or null when it was cancelled
         * @member {Function|null} openEditor=null
         */
        openEditor: null
    }

    /**
     * Ids for the table rows
     * @member {Number} nextId=1
     */
    nextId = 1

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-sieve-rule-parts-bar'],
            flex  : 'none',
            items : [{ntype: 'component', cls: ['go-sieve-rule-parts-title'], text: me.title, flex: 1}, {
                module : Button,
                icon   : 'add',
                text   : coreT('Add'),
                handler: () => me.edit(null)
            }]
        }, {
            module   : ActionTable,
            reference  : 'table',
            keyProperty: '_id',
            flex       : 'none',
            emptyText: me.emptyText,
            columns  : [{text: '', render: r => me.render(r), flex: true}],
            actions  : [
                {action: 'up', icon: 'arrow_upward', tooltip: t('Move up'), disabled: r => me.indexOf(r) < 1},
                {action: 'down', icon: 'arrow_downward', tooltip: t('Move down'), disabled: r => me.indexOf(r) >= me.records.length - 1},
                {action: 'edit', icon: 'edit', tooltip: coreT('Edit')},
                {action: 'delete', icon: 'delete', tooltip: coreT('Delete')}
            ]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.table.on('action', ({action, record}) => me.onAction(action, record));
        me.table.on('rowDoubleClick', ({record}) => me.edit(record))
    }

    /**
     * @returns {GO.list.ActionTable}
     */
    get table() {
        return this.getReference('table')
    }

    /**
     * @returns {Object[]} the records with their row id (`_id`)
     */
    get records() {
        return this.table.records
    }

    /**
     * @returns {Object[]} the records without the row id
     */
    getValues() {
        return this.records.map(({_id, ...record}) => record)
    }

    /**
     * @param {Object[]} records
     */
    setValues(records) {
        this.setRecords(records.map(r => ({...r, _id: this.nextId++})), false)
    }

    /**
     * @param {Object[]} records with `_id`
     * @param {Boolean} [fire=true]
     * @protected
     */
    setRecords(records, fire=true) {
        this.table.records = records;
        fire && this.fire('change')
    }

    /**
     * @param {Object} record
     * @returns {Number}
     */
    indexOf(record) {
        return this.records.findIndex(r => r._id === record._id)
    }

    onAction(action, record) {
        let me      = this,
            records = [...me.records],
            index   = me.indexOf(record);

        switch (action) {
            case 'edit':
                return me.edit(record);

            case 'delete':
                records.splice(index, 1);
                return me.setRecords(records);

            case 'up':
            case 'down': {
                const target = index + (action === 'up' ? -1 : 1);

                if (index >= 0 && target >= 0 && target < records.length) {
                    [records[index], records[target]] = [records[target], records[index]];
                    me.setRecords(records)
                }
            }
        }
    }

    /**
     * @param {Object|null} record null for a new record
     */
    async edit(record) {
        let me = this;

        const {_id, ...value} = record || {},
              edited = await me.openEditor(record ? value : null);

        if (!edited || me.isDestroyed) {
            return
        }

        const records = [...me.records],
              index   = record ? me.indexOf(record) : -1;

        if (index >= 0) {
            records[index] = {...edited, _id}
        } else {
            records.push({...edited, _id: me.nextId++})
        }

        me.setRecords(records)
    }
}

export default Neo.setupClass(RulePartsPanel);
