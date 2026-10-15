import Dialog from '../view/Dialog.mjs';
import {escapeHtml, formatUserDateTime} from '../Format.mjs';
import {t} from '../Translate.mjs';

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Changes of one LogEntry, like GOUI's HistoryDetailWindow
 * (go/modules/community/history/views/goui/script/HistoryDetailWindow.ts).
 * `changes` is JSON: create → {property: value}, update → {property: [new, old]}.
 */
class HistoryDetailDialog extends Dialog {
    static config = {
        className: 'GO.detail.HistoryDetailDialog',
        cls      : ['go-history-detail'],
        modal    : true,
        resizable: true,
        title    : t('History'),
        wrapperStyle: {
            height: '60vh',
            left  : 'calc(50vw - 400px)',
            top   : '20vh',
            width : '800px'
        },
        /**
         * LogEntry record: action, changes, createdAt, description
         * @member {Object|null} logEntry=null
         */
        logEntry: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.title = me.logEntry?.description || t('History');

        me.items = [{
            ntype: 'component',
            cls  : ['go-history-detail-body'],
            flex : 1,
            html : me.renderChanges(me.logEntry)
        }]
    }

    /**
     * @param {*} value
     * @returns {String} HTML
     */
    formatValue(value) {
        if (value === null || value === undefined) {
            return '<i>null</i>'
        }

        if (typeof value === 'string') {
            return DATE_TIME.test(value) ? escapeHtml(formatUserDateTime(value)) : escapeHtml(value)
        }

        if (typeof value === 'object') {
            return Object.entries(value).map(([k, v]) => `${escapeHtml(k)}: ${this.formatValue(v)}`).join('<br>')
        }

        return escapeHtml(JSON.stringify(value))
    }

    /**
     * @param {Object|null} logEntry
     * @returns {String} HTML
     */
    renderChanges(logEntry) {
        let changes;

        try {
            changes = Object.entries(JSON.parse(logEntry?.changes || '{}') || {})
        } catch (e) {
            return `<div class="go-empty">${escapeHtml(e.message)}</div>`
        }

        const date = `<p>Date: ${escapeHtml(formatUserDateTime(logEntry?.createdAt))}</p><h4>Changes</h4>`;

        if (!changes.length) {
            return date + '<div class="go-empty">No changes</div>'
        }

        if (logEntry.action === 'update') {
            const rows = changes.map(([name, pair]) => {
                const [newValue, oldValue] = Array.isArray(pair) ? pair : [pair, undefined];

                return `<tr><td>${escapeHtml(name)}</td><td>${this.formatValue(oldValue)}</td><td>${this.formatValue(newValue)}</td></tr>`
            }).join('');

            return date + `<table class="go-table"><thead><tr><th>Name</th><th>Old</th><th>New</th></tr></thead><tbody>${rows}</tbody></table>`
        }

        return date + changes.map(([name, value]) => `<div><b>${escapeHtml(name)}:</b> ${this.formatValue(value)}</div>`).join('')
    }
}

export default Neo.setupClass(HistoryDetailDialog);
