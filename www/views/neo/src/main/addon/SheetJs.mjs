import Base from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import {fetchArrayBuffer, loadScript} from '../loadScript.mjs';

/**
 * Main thread side of the sheet preview (src/preview/officePreviews.mjs): SheetJS (views/neo/lib/xlsx, the classic
 * client has its own copy in amd/libs) reads a workbook and returns the cells of its first sheet as text. The App
 * worker escapes them into a table.
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/SheetJs', windowId})
 * @summary Reads the first sheet of an xls / xlsx file with SheetJS.
 * @class GO.main.addon.SheetJs
 * @extends Neo.main.addon.Base
 */
class SheetJs extends Base {
    static config = {
        className: 'GO.main.addon.SheetJs',
        // the library is loaded on the first readFirstSheet()
        preloadFilesDelay: false,
        remote: {
            app: ['readFirstSheet']
        }
    }

    /**
     * @summary The formatted cells of the first sheet, at most maxRows rows and maxColumns columns.
     * @param {Object} data
     * @param {String} data.url        absolute same-origin URL of the file
     * @param {String} data.scriptUrl  absolute URL of xlsx.full.min.js
     * @param {Number} data.maxRows
     * @param {Number} data.maxColumns
     * @returns {Promise<Object>} {name, rows: String[][], header, truncated, columnsCut}
     */
    async readFirstSheet({url, scriptUrl, maxRows, maxColumns}) {
        const [buffer] = await Promise.all([fetchArrayBuffer(url), loadScript(scriptUrl)]),
              XLSX     = globalThis.XLSX,
              // only the first sheet, one row more than shown tells whether there are more
              workbook = XLSX.read(buffer, {type: 'array', sheets: 0, sheetRows: maxRows + 1}),
              name     = workbook.SheetNames[0] || '',
              sheet    = workbook.Sheets[name];

        if (!sheet?.['!ref']) {
            return {name, rows: [], header: false, truncated: false, columnsCut: false}
        }

        const range      = XLSX.utils.decode_range(sheet['!ref']),
              columnsCut = range.e.c - range.s.c + 1 > maxColumns;

        // a sparse sheet (A1 and XFD1) would otherwise give thousands of empty cells per row
        columnsCut && (range.e.c = range.s.c + maxColumns - 1);

        const rows = XLSX.utils.sheet_to_json(sheet, {header: 1, raw: false, defval: '', range}),
              // a header has text in every cell, judged by the cell types (a date or "$5.00" is a number)
              header = Array.from({length: range.e.c - range.s.c + 1},
                  (x, i) => sheet[XLSX.utils.encode_cell({r: range.s.r, c: range.s.c + i})])
                  .every(cell => cell?.t === 's' && String(cell.v).trim() !== '');

        return {
            name,
            rows      : rows.slice(0, maxRows).map(row => row.map(cell => cell == null ? '' : String(cell))),
            header,
            truncated : rows.length > maxRows,
            columnsCut
        }
    }
}

export default Neo.setupClass(SheetJs);
