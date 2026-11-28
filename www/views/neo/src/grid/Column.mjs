import NeoColumn    from '../../node_modules/neo.mjs/src/grid/column/Base.mjs';
import {escapeHtml} from '../Format.mjs';

/**
 * @summary neo's plain column with the value escaped: neo writes a renderer's string into the cell as HTML, and the
 * default renderer returns the raw value.
 * @description `type: 'column'` (the default) in GO.grid.Grid and GO.scheduler.Scheduler. Only the default renderer
 * escapes: a column with its own `renderer` returns markup and escapes the values itself. A column whose dataField
 * holds trusted HTML the caller built and escaped itself sets `htmlValue: true`.
 * @class GO.grid.Column
 * @extends Neo.grid.column.Base
 */
class Column extends NeoColumn {
    static config = {
        className: 'GO.grid.Column',
        /**
         * True: the value is trusted HTML and is rendered as is
         * @member {Boolean} htmlValue=false
         */
        htmlValue: false
    }

    /**
     * @summary The cell value, escaped unless htmlValue.
     * @param {Object} data
     * @param {GO.grid.Column} data.column the column itself (not `this`: a rendererScope may run it)
     * @param {*} data.value
     * @returns {*}
     */
    cellRenderer({column, value}) {
        return value == null || column?.htmlValue === true ? value : escapeHtml(value)
    }
}

export default Neo.setupClass(Column);
