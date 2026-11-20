import client from '../../../../../../views/neo/src/jmap/Client.mjs';
import {avatarHtml, escapeHtml, formatUserDateTime, sanitizeHtml, smartDateTime} from '../../../../../../views/neo/src/Format.mjs';
import {linkType, resolveRoute} from '../../../../../../views/neo/src/link/linkTypes.mjs';
import {fmt, t as coreT} from '../../../../../../views/neo/src/Translate.mjs';
import {fileIcon}     from '../../../../../files/views/neo/util.mjs';
import {unescapeHtml, t} from '../../util.mjs';

/**
 * HTML of the message view (ExtJS MessagePanel.js template). Everything from the message is
 * escaped; the body goes through Format.sanitizeHtml() on top of the server's sanitizeHtml()
 * and XSS check. Clickable parts carry classes and data-* attributes, MessagePanel handles
 * the clicks (neo sends the DOM path with classes and data, not hrefs):
 * - .go-email-address[data-address]  an address (index in the `addresses` list)
 * - .go-email-attachment[data-attachment], .go-email-attachment-more, .go-email-attachments-more
 * - .go-email-unblock, .go-email-filterxss, .go-email-fullbody, .go-email-spam, .go-email-notspam
 * - .go-email-contact (avatar of a known contact), .go-email-msglink[data-link]
 */

/**
 * Header, warnings, attachments and links above the body
 * @param {Object} data email/message/view (or messageAttachment) response
 * @param {Object[]} addresses filled with {email, name} of the shown addresses
 * @param {Object} [options]
 * @param {Boolean} [options.actions=true] spam bar (not for an attached message)
 * @param {String} [options.prefix] DOM id prefix: menus align to `<prefix>-address-<n>`,
 *                 `<prefix>-attachment-<n>`, `<prefix>-more-<n>` and `<prefix>-allmore`
 * @returns {String}
 */
export function headerHtml(data, addresses, {actions=true, prefix='go-email'}={}) {
    const subject = unescapeHtml(data.subject) || t('No subject'),
          date    = data.udate ? data.udate * 1000 : null;

    return `<div class="go-email-message-header">
        <div class="go-email-message-sender">
            ${avatar(data, addresses, prefix)}
            <div class="go-email-message-sender-text">
                <div class="go-email-message-from">${address({email: data.sender, personal: data.from}, addresses, prefix, true)}</div>
                ${date ? `<div class="go-email-message-date" title="${escapeHtml(formatUserDateTime(date))}">${escapeHtml(smartDateTime(date))}</div>` : ''}
            </div>
            ${priority(data.priority)}
        </div>
        <h2 class="go-email-message-subject">${escapeHtml(subject)}</h2>
        ${recipients(t('To'), data.to, addresses, prefix)}
        ${recipients(t('CC'), data.cc, addresses, prefix)}
        ${recipients(t('BCC'), data.bcc, addresses, prefix)}
        ${labels(data.labels)}
        ${links(data.links)}
    </div>
    ${warnings(data, actions)}
    ${attachmentsHtml(data.attachments, prefix)}`
}

/**
 * The message body
 * @param {Object} data
 * @param {String} [prefix] DOM id prefix of the mailto: links (`<prefix>-mailto-<n>`)
 * @returns {String}
 */
export function bodyHtml(data, prefix='go-email') {
    let mailto = 0;

    let body = data.htmlbody !== undefined && data.htmlbody !== null
        ? sanitizeHtml(data.htmlbody)
        : `<div class="go-email-plain">${escapeHtml(data.plainbody || '')}</div>`;

    // sanitizeHtml() writes links as <a href="…" target="_blank" rel="noopener noreferrer">: a
    // mailto: link opens the address menu instead of the desktop mail program (ExtJS)
    body = body.replace(/<a href="mailto:([^"]*)" target="_blank" rel="noopener noreferrer">/g,
        (match, href) => `<a class="go-email-mailto" id="${prefix}-mailto-${mailto++}" data-mailto="${href}" tabindex="0">`)
        // inline images (cid:) point to "index.php?r=email/message/attachment…", relative to the
        // web root; the neo page's base is views/neo/apps/go/
        .replace(/<img src="index\.php\?/g, `<img src="${client.baseUrl}index.php?`);

    return `<div class="go-email-message-content go-image-zoom">${body}</div>
        ${data.body_truncated ? `<p class="go-email-message-truncated"><a class="go-email-fullbody" tabindex="0">${escapeHtml(t('The actual message is larger than can be shown here. Click here to see the entire message.'))}</a></p>` : ''}`
}

/**
 * Text and address of an `email/message/view` recipient
 * @param {Object} recipient {email, personal}
 * @param {Object[]} addresses
 * @param {String} prefix
 * @param {Boolean} [full] name and address
 * @returns {String}
 */
function address({email, personal}, addresses, prefix, full=false) {
    const name = unescapeHtml(personal || ''),
          mail = String(email || '');

    if (!mail) {
        return name ? `<span class="go-email-noaddress">${escapeHtml(name)}</span>` : ''
    }

    const index = addresses.push({email: mail, name}) - 1,
          text  = name || mail;

    return `<a class="go-email-address" id="${prefix}-address-${index}" data-address="${index}" tabindex="0" title="${escapeHtml(name ? `${name} <${mail}>` : mail)}">${escapeHtml(text)}</a>`
        + (full && name ? ` <span class="go-email-address-mail">&lt;${escapeHtml(mail)}&gt;</span>` : '')
}

/**
 * @param {String} label
 * @param {Object[]} list
 * @param {Object[]} addresses
 * @param {String} prefix
 * @returns {String}
 */
function recipients(label, list, addresses, prefix) {
    if (!Array.isArray(list) || !list.length) {
        return ''
    }

    const items = list.map(r => address(r, addresses, prefix)).filter(Boolean);

    return items.length
        ? `<div class="go-email-message-recipients"><span class="go-email-message-recipients-label">${escapeHtml(label)}:</span> ${items.join(', ')}</div>`
        : ''
}

/**
 * Photo of the matched contact (a link to it), else initials of the sender (the address menu)
 * @param {Object} data
 * @param {Object[]} addresses
 * @param {String} prefix
 * @returns {String}
 */
function avatar(data, addresses, prefix) {
    const contact = data.contact,
          name    = unescapeHtml(data.from || data.sender || '');

    if (contact?.id) {
        const inner = contact.photoBlobId
            ? `<img src="${escapeHtml(client.baseUrl + 'api/download.php?blob=' + encodeURIComponent(contact.photoBlobId))}" alt="">`
            : contact.isOrganization ? '<i class="go-icon">business</i>' : avatarHtml(contact.name || name);

        return `<a class="go-email-avatar go-email-contact" tabindex="0" title="${escapeHtml(contact.name || name)}">${inner}</a>`
    }

    if (!data.sender) {
        return ''
    }

    const index = addresses.push({email: String(data.sender), name}) - 1;

    return `<a class="go-email-avatar go-email-address" id="${prefix}-address-${index}" data-address="${index}" tabindex="0">${avatarHtml(name || data.sender)}</a>`
}

/**
 * X-Priority: 1-2 high, 4-5 low (3 / 0 normal)
 * @param {Number} value
 * @returns {String}
 */
function priority(value) {
    value = Number(value) || 3;

    if (value < 3) {
        return `<i class="go-icon go-email-priority-high" title="${escapeHtml(t('Priority') + ': ' + t('High'))}">priority_high</i>`
    }

    return value > 3 ? `<i class="go-icon go-email-priority-low" title="${escapeHtml(t('Priority') + ': ' + t('Low'))}">low_priority</i>` : ''
}

/**
 * @param {Object[]} list [{name, color}]
 * @returns {String}
 */
function labels(list) {
    if (!Array.isArray(list) || !list.length) {
        return ''
    }

    // without the label colour, like the message grid: no inline styles
    return `<div class="go-email-message-labels">${list.map(label =>
        `<span class="go-email-label"><i class="go-icon">label</i>${escapeHtml(unescapeHtml(label.name))}</span>`).join('')}</div>`
}

/**
 * Items the message is linked to (savemailas `links`)
 * @param {Object[]} list
 * @returns {String}
 */
function links(list) {
    if (!Array.isArray(list) || !list.length) {
        return ''
    }

    return `<div class="go-email-message-links">${list.map((link, index) => {
        const type  = linkType(link.entity, link.filter),
              route = resolveRoute(link.entity, link.entityId ?? link.model_id);

        return `<a class="go-email-msglink${route ? '' : ' go-email-msglink-static'}" data-link="${index}" tabindex="0" title="${escapeHtml(type.title)}">`
            + `<i class="go-icon">${escapeHtml(type.icon)}</i>${escapeHtml(unescapeHtml(link.name || ''))}</a>`
    }).join('')}</div>`
}

/**
 * Blocked images, XSS, spam
 * @param {Object} data
 * @param {Boolean} actions
 * @returns {String}
 */
function warnings(data, actions) {
    let html = '';

    if (data.blocked_images > 0) {
        html += `<div class="go-email-warning go-email-blocked"><i class="go-icon">image_not_supported</i><span>`
            + escapeHtml(fmt(t('{blocked_images} external images were blocked for your security.'), {blocked_images: data.blocked_images}))
            + ` <a class="go-email-unblock" tabindex="0">${escapeHtml(t('Click here to unblock them'))}</a></span></div>`
    }

    if (data.xssDetected) {
        html += `<div class="go-email-warning go-email-xss"><i class="go-icon">gpp_maybe</i><span>`
            + `<a class="go-email-filterxss" tabindex="0">${escapeHtml(t('This message may contain malicious content. Click here to view the filtered message anyway.'))}</a></span></div>`
    }

    if (actions && data.account_id && data.mailbox) {
        html += data.isInSpamFolder
            ? `<div class="go-email-spambar"><i class="go-icon">report</i><span>${escapeHtml(t('This message has been identified as spam.'))} <a class="go-email-notspam" tabindex="0">${escapeHtml(t('Not spam'))}</a></span></div>`
            : ''
    }

    return html
}

/**
 * Attachments with their icon and size; "more" opens the attachment menu
 * @param {Object[]} list
 * @param {String} [prefix] DOM id prefix
 * @returns {String}
 */
export function attachmentsHtml(list, prefix='go-email') {
    if (!Array.isArray(list) || !list.length) {
        return ''
    }

    return `<div class="go-email-attachments">
        <div class="go-email-attachments-header">
            <i class="go-icon">attach_file</i>
            <span>${escapeHtml(t('Attachments'))} (${list.length})</span>
            <a class="go-icon go-email-attachments-more" id="${prefix}-allmore" tabindex="0" title="${escapeHtml(coreT('More options'))}">more_horiz</a>
        </div>
        <div class="go-email-attachment-list">${list.map((a, index) => `
            <div class="go-email-attachment" id="${prefix}-attachment-${index}" data-attachment="${index}" tabindex="0" title="${escapeHtml(a.name)}">
                <i class="go-icon go-email-attachment-icon">${fileIcon({extension: a.extension})}</i>
                <span class="go-email-attachment-name">${escapeHtml(a.name)}</span>
                <small class="go-email-attachment-size">${escapeHtml(a.human_size || '')}</small>
                <a class="go-icon go-email-attachment-more" id="${prefix}-more-${index}" tabindex="0" title="${escapeHtml(coreT('More options'))}">more_vert</a>
            </div>`).join('')}
        </div>
    </div>`
}
