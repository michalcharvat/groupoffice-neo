import NeoTreeColumn from '../../node_modules/neo.mjs/src/grid/column/Tree.mjs';
import {escapeHtml}  from '../Format.mjs';

/**
 * @summary neo's tree column with the label escaped: neo writes the cell value into the vdom as HTML.
 * @description `type: 'tree'` in GO.grid.Grid and GO.scheduler.Scheduler. A column whose dataField holds trusted
 * HTML the caller built and escaped itself (an avatar, a badge) sets `htmlValue: true`.
 * @class GO.grid.TreeColumn
 * @extends Neo.grid.column.Tree
 */
class TreeColumn extends NeoTreeColumn {
    static config = {
        className: 'GO.grid.TreeColumn',
        /**
         * True: the value is trusted HTML and is rendered as is
         * @member {Boolean} htmlValue=false
         */
        htmlValue: false
    }

    /**
     * @summary neo's record configs of the cell component, with the value escaped unless htmlValue.
     * @param {Object} config
     * @param {Neo.data.Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        const result = super.applyRecordConfigs(config, record);

        if (this.htmlValue !== true) {
            result.value = result.value == null ? result.value : escapeHtml(result.value)
        }

        return result
    }
}

export default Neo.setupClass(TreeColumn);
