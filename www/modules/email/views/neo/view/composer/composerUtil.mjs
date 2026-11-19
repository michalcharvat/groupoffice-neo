import RecipientsField from '../../../../../../views/neo/src/form/field/RecipientsField.mjs';

/**
 * Helpers of the e-mail composer: address lists as the legacy routes take them, and the
 * signature block in the body.
 */

/** id of the element that wraps the signature in an HTML body (ExtJS EmailComposer.addSignature()) */
export const SIGNATURE_ID = 'EmailSignature';

/**
 * Splits an address list string ('"Doe, John" <j@x.org>, a@b.c; …') at the commas and
 * semicolons outside quotes and angle brackets.
 * @param {String} text
 * @returns {String[]} the non-empty parts
 */
export function splitAddresses(text) {
    const parts = [];

    let current = '', quoted = false, angle = false;

    for (const ch of String(text ?? '')) {
        if (ch === '"' && !angle) {
            quoted = !quoted
        } else if (ch === '<' && !quoted) {
            angle = true
        } else if (ch === '>' && !quoted) {
            angle = false
        } else if ((ch === ',' || ch === ';') && !quoted && !angle) {
            current.trim() && parts.push(current.trim());
            current = '';
            continue
        }

        current += ch
    }

    current.trim() && parts.push(current.trim());

    return parts
}

/**
 * Recipients of a RecipientsField from what callers and the legacy routes give: an address
 * list string, an array of strings or of {name, email}. Unparsable parts are kept as
 * invalid chips ({name: '', email: text}) so the user sees them.
 * @param {String|String[]|Object[]|null} value
 * @returns {Object[]} [{name, email}]
 */
export function toRecipients(value) {
    if (!value) {
        return []
    }

    const items = Array.isArray(value) ? value : [value];

    return items.flatMap(item => {
        if (item && typeof item === 'object') {
            return item.email ? [{name: item.name || item.personal || '', email: item.email}] : []
        }

        return splitAddresses(item).map(text => RecipientsField.parse(text) || {name: '', email: text})
    })
}

/**
 * Recipients as the address list string of email/message/send ('"Name" <email>, …')
 * @param {Object[]|null} recipients [{name, email}]
 * @returns {String}
 */
export function formatRecipients(recipients) {
    return (recipients || []).filter(r => r?.email).map(({name, email}) => {
        name = (name || '').trim();
        return name && name !== email ? `"${name.replace(/["\\]/g, '\\$&')}" <${email}>` : email
    }).join(', ')
}

/**
 * The signature of an alias as the composer inserts it (ExtJS addSignature())
 * @param {Object} alias email/alias/store record
 * @param {Boolean} html
 * @returns {String} '' without signature
 */
export function signatureBlock(alias, html) {
    const sig = alias?.[html ? 'html_signature' : 'plain_signature'];

    if (!sig) {
        return ''
    }

    return html ? `<br><div id="${SIGNATURE_ID}">${sig}</div><br>` : '\n' + sig + '\n'
}

/**
 * Start and end of the signature element in an HTML body: the div with id EmailSignature
 * up to its own closing tag (nested divs counted).
 * @param {String} html
 * @returns {Number[]|null} [start, end] (end exclusive), null when there is none
 */
export function findSignatureDiv(html) {
    const open = new RegExp(`<div\\b[^>]*\\bid=["']?${SIGNATURE_ID}\\b[^>]*>`, 'i').exec(html || '');

    if (!open) {
        return null
    }

    const tag = /<(\/?)div\b[^>]*>/gi;

    let depth = 1, match;

    tag.lastIndex = open.index + open[0].length;

    while ((match = tag.exec(html))) {
        depth += match[1] ? -1 : 1;

        if (depth === 0) {
            return [open.index, match.index + match[0].length]
        }
    }

    return null
}

/**
 * The body with the signature of another alias (ExtJS _setSignature()): an HTML body swaps
 * its EmailSignature element, a text body the old signature text. Without an old signature
 * the new one is added like after loading.
 * @param {Object} params
 * @param {String} params.body
 * @param {Boolean} params.html
 * @param {Object|null} params.oldAlias
 * @param {Object|null} params.newAlias
 * @returns {String}
 */
export function swapSignature({body, html, oldAlias, newAlias}) {
    body = body || '';

    if (html) {
        const range  = findSignatureDiv(body),
              newSig = newAlias?.html_signature || '';

        if (range) {
            const replacement = newSig ? `<div id="${SIGNATURE_ID}">${newSig}</div>` : '';
            return body.slice(0, range[0]) + replacement + body.slice(range[1])
        }

        return oldAlias?.html_signature ? body : addSignature({body, html, alias: newAlias})
    }

    const oldSig = oldAlias?.plain_signature || '';

    if (oldSig) {
        return body.includes(oldSig) ? body.replace(oldSig, newAlias?.plain_signature || '') : body
    }

    return addSignature({body, html, alias: newAlias})
}

/**
 * The body with the alias's signature above or below it (signature_below_reply)
 * @param {Object} params
 * @param {String} params.body
 * @param {Boolean} params.html
 * @param {Object|null} params.alias
 * @returns {String}
 */
export function addSignature({body, html, alias}) {
    const sig = signatureBlock(alias, html);

    if (!sig) {
        return body || ''
    }

    return alias.signature_below_reply ? (body || '') + sig : sig + (body || '')
}

/**
 * ExtJS sends the composer's attachments as JSON [{tmp_file, fileName, from_file_storage, blobId}]
 * (EmailEditorPanel attachmentschanged); loaded ones (reply, forward, draft) have tmp_file,
 * uploaded ones a blobId.
 * @param {Object[]} attachments AttachmentsField value
 * @returns {Object[]}
 */
export function attachmentsParam(attachments) {
    return (attachments || []).map(a => ({
        tmp_file         : a.tmp_file || '',
        fileName         : a.name || a.fileName || '',
        from_file_storage: !!a.from_file_storage,
        blobId           : a.blobId || ''
    }))
}

/**
 * Attachments of a load response (data.attachments) as AttachmentsField items. The field
 * shows the name and links to the blob; loaded items keep their tmp_file and url.
 * @param {Object[]} attachments
 * @returns {Object[]}
 */
export function loadedAttachments(attachments) {
    return (attachments || []).map(a => ({
        ...a,
        name      : a.name || a.fileName || '',
        attachment: true
    }))
}

/**
 * Legacy composer routes put relative "index.php?r=…" URLs into the body (inline images of a
 * forwarded message or draft). neo pages have their base at views/neo/apps/go/, so they would
 * not load: make them absolute. The server finds the images again by their token.
 * @param {String} html
 * @param {String} baseUrl the GroupOffice web root, e.g. "/"
 * @returns {String}
 */
export function absoluteLegacyUrls(html, baseUrl) {
    return (html || '').replace(/(\s(?:src|href)=["'])(index\.php\?)/gi, (all, attr, path) => attr + baseUrl + path)
}
