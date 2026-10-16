import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';
import {t}       from '../Translate.mjs';

/**
 * A small table over plain records, rendered as its own vdom: text columns, checkbox
 * columns and icon buttons per row (ExtJS EditorGridPanel + RowActions, GOUI Table with a
 * delete column). For short lists that are edited in place: allowed groups, SMTP
 * accounts, module permissions.
 *
 *     {
 *         module : ActionTable,
 *         columns: [
 *             {text: t('Group'), field: 'name', flex: true},
 *             {text: t('Read'),  field: 'mayRead', type: 'check'},      // fires `check`
 *             {text: '', render: record => '…'}                         // text, never HTML
 *         ],
 *         actions: [{action: 'delete', icon: 'delete', tooltip: t('Delete')}],  // fire `action`
 *         records: [{id: 1, name: 'Admins', mayRead: true}]
 *     }
 *
 * An action may have `disabled(record)` and `hidden(record)`; `rowCls(record)` adds row classes
 * (e.g. group header rows).
 *
 * Events: action {action, record, target (DOM id of the button, for menus)}, check {record, field, checked},
 * rowDoubleClick {record}
 */
class ActionTable extends Component {
    static config = {
        className: 'GO.list.ActionTable',
        ntype    : 'go-actiontable',
        baseCls  : ['go-actiontable'],
        /**
         * @member {Object[]} columns_=[]
         */
        columns_: [],
        /**
         * Icon buttons at the end of every row
         * @member {Object[]} actions_=[]
         */
        actions_: [],
        /**
         * @member {Object[]} records_=[]
         */
        records_: [],
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * Shown without records
         * @member {String} emptyText_=t('No items to display')
         */
        emptyText_: t('No items to display'),
        /**
         * Checkboxes can't be changed
         * @member {Boolean} readOnly_=false
         */
        readOnly_: false,
        /**
         * (record) => extra row classes
         * @member {Function|null} rowCls=null
         */
        rowCls: null,
        _vdom:
        {tag: 'table', cn: [
            {tag: 'thead', cn: [{tag: 'tr', cn: []}]},
            {tag: 'tbody', cn: []}
        ]}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click   : me.onActionClick, delegate: '.go-actiontable-action', scope: me},
            {change  : me.onCheckChange, delegate: '.go-actiontable-check',  scope: me},
            {dblclick: me.onRowDblClick, delegate: '.go-actiontable-row',    scope: me}
        ])
    }

    afterSetColumns() {
        this.render_()
    }

    afterSetActions() {
        this.render_()
    }

    afterSetRecords() {
        this.render_()
    }

    afterSetEmptyText() {
        this.render_()
    }

    afterSetReadOnly() {
        this.render_()
    }

    /**
     * @param {String|Number} key
     * @returns {Object|null}
     */
    getRecord(key) {
        return this.records.find(record => String(record[this.keyProperty]) === String(key)) || null
    }

    /**
     * Rebuilds head and body (render() is taken by Component)
     * @protected
     */
    render_() {
        let me                         = this,
            {actions, columns, records} = me,
            [thead, tbody]             = me.vdom.cn;

        if (!thead) {
            return
        }

        thead.cn[0].cn = [
            ...columns.map(column => ({
                tag: 'th',
                cls: ActionTable.cellCls(column),
                text: column.text || ''
            })),
            ...actions.length ? [{tag: 'th', cls: ['go-actiontable-actions']}] : []
        ];

        tbody.cn = records.length ? records.map(record => me.createRow(record)) : [{
            tag: 'tr',
            cls: ['go-actiontable-empty'],
            cn : [{tag: 'td', colspan: columns.length + (actions.length ? 1 : 0), text: me.emptyText}]
        }];

        me.update()
    }

    /**
     * @param {Object} column
     * @returns {String[]}
     */
    static cellCls(column) {
        return [
            ...column.type === 'check' ? ['go-actiontable-checkcell'] : [],
            ...column.flex ? ['go-actiontable-flex'] : [],
            ...column.cls || []
        ]
    }

    /**
     * @param {Object} record
     * @returns {Object} vdom
     * @protected
     */
    createRow(record) {
        let me  = this,
            key = String(record[me.keyProperty]);

        return {
            tag     : 'tr',
            cls     : ['go-actiontable-row', ...me.rowCls?.(record) || []],
            'data-key': key,
            cn      : [
                ...me.columns.map(column => {
                    if (column.type === 'check') {
                        return {tag: 'td', cls: ActionTable.cellCls(column), cn: [{
                            tag         : 'input',
                            type        : 'checkbox',
                            cls         : ['go-actiontable-check'],
                            checked     : !!record[column.field],
                            disabled    : me.readOnly || null,
                            'aria-label': column.text,
                            'data-key'  : key,
                            'data-field': column.field
                        }]}
                    }

                    const value = column.render ? column.render(record) : record[column.field];

                    return {tag: 'td', cls: ActionTable.cellCls(column), text: value == null ? '' : String(value)}
                }),
                ...me.actions.length ? [{
                    tag: 'td',
                    cls: ['go-actiontable-actions'],
                    cn : me.actions.filter(action => !action.hidden?.(record)).map(action => ({
                        tag         : 'button',
                        type        : 'button',
                        cls         : ['go-actiontable-action', 'neo-button', 'go-icon-button'],
                        title       : action.tooltip || '',
                        'aria-label': action.tooltip || action.action,
                        disabled    : (action.disabled && action.disabled(record)) || null,
                        'data-key'  : key,
                        'data-action': action.action,
                        cn          : [{tag: 'span', cls: ['go-icon'], text: action.icon}]
                    }))
                }] : []
            ]
        }
    }

    /**
     * @param {Object} data DOM event
     * @returns {Object|null} the dataset of the nearest node that has `name`
     * @protected
     */
    static findData(data, name) {
        return data.path?.find(node => node.data?.[name] !== undefined)?.data || null
    }

    onActionClick(data) {
        const node   = data.path?.find(n => n.data?.action !== undefined),
              record = node && this.getRecord(node.data.key);

        record && this.fire('action', {action: node.data.action, record, target: node.id})
    }

    onCheckChange(data) {
        let me      = this,
            dataset = ActionTable.findData(data, 'field'),
            record  = dataset && me.getRecord(dataset.key);

        if (record) {
            record[dataset.field] = !!data.target?.checked;
            me.fire('check', {record, field: dataset.field, checked: record[dataset.field]})
        }
    }

    onRowDblClick(data) {
        const dataset = ActionTable.findData(data, 'key'),
              record  = dataset && this.getRecord(dataset.key);

        record && this.fire('rowDoubleClick', {record})
    }
}

export default Neo.setupClass(ActionTable);
