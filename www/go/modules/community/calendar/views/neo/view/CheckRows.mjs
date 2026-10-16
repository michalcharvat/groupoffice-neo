import Component    from '../../../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import {t}          from '../../../../../../../views/neo/src/Translate.mjs';

/**
 * Rows with a coloured check box, a text and a row menu (GOUI check-list with
 * checkbox({color}) per row), optionally grouped under headings.
 *
 *     {module: CheckRows, rows: [{id: '1', text: 'Work', color: 'ff0000', checked: true, selected: false,
 *                                 menu: true, group: 'Rooms', icon: 'web'}]}
 *     (leadIcon: 'group' shows an icon instead of the check box)
 *
 * Events:
 * - check   {id, checked}   the box was clicked
 * - select  {id}            the row was clicked (selectable: true)
 * - rowMenu {id, target}    the "more" icon was clicked, target: DOM id to align a menu to
 * - checkContextMenu {id, target}  right click on a box (target: {x, y, width, height})
 */
class CheckRows extends Component {
    static config = {
        className : 'GO.calendar.CheckRows',
        baseCls   : ['go-cal-check-rows'],
        /** @member {Object[]} rows_=[] */
        rows_     : [],
        /** @member {Boolean} selectable=false a row click selects the row */
        selectable: false,
        _vdom     : {tag: 'ul', cn: []}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click      : me.onRowClick,       scope: me},
            {contextmenu: me.onRowContextMenu, scope: me}
        ])
    }

    onConstructed() {
        super.onConstructed();
        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-cal-check'], windowId: this.windowId})
    }

    afterSetRows() {
        let me    = this,
            cn    = [],
            group = null;

        (me.rows || []).forEach(row => {
            if ((row.group || null) !== group) {
                group = row.group || null;
                group && cn.push({tag: 'li', cls: ['go-cal-check-group'], cn: [{tag: 'h3', text: group}]})
            }

            const rowCn = [
                row.leadIcon ? {tag: 'i', cls: ['go-icon', 'go-cal-lead-icon'], text: row.leadIcon} : {tag: 'span', id: `${me.id}__check_${row.id}`, cls: ['go-check', 'go-cal-check', row.checked ? 'go-checked' : null].filter(Boolean),
                    style: row.color ? {color: '#' + row.color} : {}, 'data-check': row.id, tabIndex: 0, role: 'checkbox', 'aria-checked': row.checked ? 'true' : 'false'},
                {tag: 'span', cls: ['go-cal-check-text'], cn: [
                    {vtype: 'text', text: row.text},
                    row.icon ? {tag: 'i', cls: ['go-icon'], text: row.icon} : null
                ].filter(Boolean)}
            ];

            row.menu && rowCn.push({tag: 'i', id: `${me.id}__menu_${row.id}`, cls: ['go-icon', 'go-row-menu'], text: 'more_horiz', title: t('More options'), 'data-menu': row.id});

            cn.push({tag: 'li', cls: ['go-cal-check-row', row.selected ? 'selected' : null].filter(Boolean), 'data-row': row.id, cn: rowCn})
        });

        me.vdom.cn = cn;
        me.update()
    }

    /**
     * @param {String} id
     * @param {Object} changes
     */
    updateRow(id, changes) {
        this.rows = this.rows.map(row => row.id === id ? {...row, ...changes} : row)
    }

    static find(data, key) {
        return data.path?.find(n => n.data?.[key] !== undefined)?.data[key]
    }

    onRowClick(data) {
        let me    = this,
            check = CheckRows.find(data, 'check'),
            menu  = CheckRows.find(data, 'menu'),
            row   = CheckRows.find(data, 'row');

        if (menu !== undefined) {
            me.fire('rowMenu', {id: menu, target: `${me.id}__menu_${menu}`})
        } else if (check !== undefined) {
            const checked = !me.rows.find(r => r.id === check)?.checked;
            me.updateRow(check, {checked});
            me.fire('check', {id: check, checked})
        } else if (row !== undefined && me.selectable) {
            me.fire('select', {id: row})
        }
    }

    onRowContextMenu(data) {
        const check = CheckRows.find(data, 'check');
        check !== undefined && this.fire('checkContextMenu', {id: check, target: {x: data.clientX, y: data.clientY, width: 1, height: 1}})
    }
}

export default Neo.setupClass(CheckRows);
