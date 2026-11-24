import client from '../jmap/Client.mjs';
import {avatarHtml, escapeHtml} from '../Format.mjs';
import {t} from '../Translate.mjs';

/**
 * Cells of a history (LogEntry) grid, shared by the detail panel (GO.detail.HistoryPanel) and
 * the history module (GO.history.view.HistoryMain). Their styles are global
 * (resources/scss/go/shared/_history.scss): neo loads a class's sheet only with that class.
 */

/**
 * The user who made the change: avatar and name
 * @param {Object} record LogEntry with creatorName, createdBy, avatarId
 * @returns {String} html
 */
export function creatorHtml(record) {
    const name   = record.creatorName || (record.createdBy ? '' : t('Unknown user')),
          avatar = record.avatarId
              ? `<img class="go-avatar go-avatar-small" alt="" src="${escapeHtml(client.baseUrl + 'api/thumb.php?blob=' + encodeURIComponent(record.avatarId) + '&w=64&h=64&zc=1')}">`
              : avatarHtml(name || '?', ['go-avatar-small']);

    return `<span class="go-history-user">${avatar}<span>${escapeHtml(name)}</span></span>`
}

/**
 * The icon that opens GO.detail.HistoryDetailDialog, when the entry has changes
 * @param {*} changes
 * @returns {String} html
 */
export function changesHtml(changes) {
    return changes ? `<i class="go-icon go-history-changes" title="${escapeHtml(t('Show changes'))}">note</i>` : ''
}
