import client from '../jmap/Client.mjs';
import {escapeHtml, formatUserDateTime, smartDateTime} from '../Format.mjs';
import {fmt, t} from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';
import {linkGroup, linkType, resolveRoute} from './linkTypes.mjs';

/**
 * Data access and HTML of GO links (core `Link` entity), shared by LinkDetail,
 * LinkBrowser and AddLinkButton.
 *
 * A Link points from one entity to another: fromEntity/fromId → toEntity/toId.
 * GO stores links in both directions. Name, description and date of the target
 * come from its core `Search` row (`toSearchId`), like GOUI's relation
 * `to: {path: "toSearchId", dataSource: searchDS}`.
 */

const SEARCH_PROPERTIES = ['id', 'name', 'description', 'entity', 'entityId', 'filter', 'modifiedAt'];

/**
 * Links of an entity with their targets, grouped by type, newest first
 * @param {String} entity e.g. "Note"
 * @param {String|Number} entityId
 * @returns {Promise<Object[]>} [{link, to}], `to` = Search record (may be null)
 */
export async function loadLinks(entity, entityId) {
    const {list} = await client.queryGet('Link', {
        filter    : {entity, entityId},
        sort      : [{property: 'toEntity', isAscending: true}, {property: 'modifiedAt', isAscending: false}],
        properties: ['id', 'fromEntity', 'fromId', 'toEntity', 'toId', 'toSearchId', 'description', 'createdAt']
    });

    const searchIds = [...new Set(list.map(l => l.toSearchId).filter(Boolean))],
          targets   = {};

    if (searchIds.length) {
        (await client.get('Search', searchIds, SEARCH_PROPERTIES)).forEach(s => targets[s.id] = s)
    }

    return list.map(link => ({link, to: targets[link.toSearchId] || null}))
}

/**
 * Number of links of an entity (GOUI LinkBrowseButton text)
 * @returns {Promise<Number>}
 */
export async function countLinks(entity, entityId) {
    const {total} = await client.call('Link/query', {filter: {entity, entityId}, limit: 1, calculateTotal: true});
    return total || 0
}

/**
 * Links an entity to Search results
 * @param {String} fromEntity
 * @param {String|Number} fromId
 * @param {Object[]} targets Search records ({entity, entityId})
 * @returns {Promise<void>}
 */
export async function createLinks(fromEntity, fromId, targets) {
    if (!targets.length) {
        return
    }

    const create = {};

    targets.forEach((to, i) => {
        create['link' + i] = {fromEntity, fromId, toEntity: to.entity, toId: to.entityId}
    });

    await client.set('Link', {create})
}

/**
 * Asks, then deletes a link (GOUI linkDS.confirmDestroy())
 * @param {Neo.component.Base} owner for appName / windowId of the dialog
 * @param {Object} item {link, to}
 * @returns {Promise<Boolean>} true when deleted
 */
export async function confirmUnlink(owner, {link, to}) {
    const confirmed = await ConfirmDialog.ask({
        appName : owner.appName,
        windowId: owner.windowId,
        message : to?.name
            ? fmt(t("Are you sure you want to delete '{item}'?"), {item: t('Link') + ': ' + to.name})
            : t('Are you sure you want to delete the selected item?')
    });

    if (!confirmed) {
        return false
    }

    await client.set('Link', {destroy: [link.id]});
    return true
}

/**
 * Opens the target in its neo module
 * @param {Neo.component.Base} owner
 * @param {Object} item {link, to}
 * @returns {Boolean} false when no neo module shows the entity
 */
export function openLink(owner, {link}) {
    const route = resolveRoute(link.toEntity, link.toId);

    route && Neo.Main.setRoute({value: route, windowId: owner.windowId});

    return !!route
}

/**
 * Grouped list, one row per link: icon group header, name, description, date and
 * an unlink button. Rows carry data-index (index in `items`).
 * @param {Object[]} items [{link, to}]
 * @param {Object} [options]
 * @param {Boolean} [options.unlink=true] show the unlink button
 * @returns {String} HTML
 */
export function renderLinks(items, {unlink=true}={}) {
    let html  = '',
        group = null;

    items.forEach(({link, to}, index) => {
        const key = linkGroup(link.toEntity, to?.filter);

        if (key !== group) {
            const type = linkType(link.toEntity, to?.filter);

            group && (html += '</div>');
            group = key;
            html += `<div class="go-link-group"><h4 class="go-link-group-title"><i class="go-icon">${escapeHtml(type.icon)}</i>${escapeHtml(type.title)}</h4>`
        }

        const route = resolveRoute(link.toEntity, link.toId),
              name  = to?.name || `${link.toEntity} #${link.toId}`,
              desc  = link.description || to?.description || '';

        html += `<div class="go-link${route ? '' : ' go-link-static'}" data-index="${index}"${route ? '' : ` title="${escapeHtml(t('Open it in the classic UI'))}"`}>
            <div class="go-link-text"><b>${escapeHtml(name)}</b>${desc ? `<small>${escapeHtml(desc)}</small>` : ''}</div>
            <span class="go-link-date" title="${escapeHtml(formatUserDateTime(to?.modifiedAt || link.createdAt))}">${escapeHtml(smartDateTime(to?.modifiedAt || link.createdAt))}</span>
            ${unlink ? `<i class="go-icon go-link-unlink" title="${escapeHtml(t('Unlink'))}">link_off</i>` : ''}
        </div>`
    });

    group && (html += '</div>');

    return html
}

/**
 * Delegated click on a renderLinks() list: unlink button or open the row
 * @param {Neo.component.Base} owner
 * @param {Object[]} items the rendered items
 * @param {Object[]} path neo DOM event path
 * @returns {Promise<Boolean>} true when a link was deleted
 */
export async function onLinkListClick(owner, items, path) {
    const row  = path.find(node => node.cls?.includes('go-link')),
          item = row && items[Number(row.data?.index)];

    if (!item) {
        return false
    }

    if (path.some(node => node.cls?.includes('go-link-unlink'))) {
        return confirmUnlink(owner, item)
    }

    openLink(owner, item);
    return false
}
