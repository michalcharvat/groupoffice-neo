/**
 * Pure helpers of Editor.js documents (GO.form.field.EditorJsField): parse, compare, emptiness and
 * read-only HTML. No Neo imports, so module code tested under `node --test` can use them too.
 *
 * Block text from Editor.js is inline HTML (bold, links, colours): editorJsToHtml() sends it through
 * the caller's sanitizer (Format.sanitizeHtml() in the client); everything else is escaped. Unknown
 * block types are left out.
 */

/**
 * @summary The content of an Editor.js document for comparing: its blocks without the image
 * cropper's interface state (sf/editorjs EditorField.js isDirty()); save time and version left out.
 * @param {*} doc
 * @returns {String}
 */
function editorJsContent(doc) {
    const blocks = doc && typeof doc === 'object' && Array.isArray(doc.blocks) ? doc.blocks : [];

    return JSON.stringify(blocks.map(block => {
        if (block?.type !== 'image' || !block.tunes?.imageResize) {
            return block
        }

        const {cropperInterface, ...imageResize} = block.tunes.imageResize;

        return {...block, tunes: {...block.tunes, imageResize}}
    }))
}

/**
 * @summary Whether two Editor.js documents have the same content (an editor that only re-saved
 * a loaded document did not change it).
 * @param {*} a
 * @param {*} b
 * @returns {Boolean}
 */
export function editorJsSame(a, b) {
    return editorJsContent(a) === editorJsContent(b)
}

/**
 * @summary Whether an Editor.js document is empty: no blocks, or one empty paragraph
 * (sf/editorjs EditorField.js validate()).
 * @param {*} doc
 * @returns {Boolean}
 */
export function isEditorJsEmpty(doc) {
    const blocks = doc && typeof doc === 'object' && Array.isArray(doc.blocks) ? doc.blocks : [];

    return blocks.length === 0 || (blocks.length === 1 && blocks[0]?.type === 'paragraph' && !blocks[0]?.data?.text)
}

/**
 * @summary An Editor.js document from a stored value, or from a JSON string of one (a form
 * builder default), null when it is none.
 * @param {*} value
 * @returns {Object|null}
 */
export function toEditorJsDoc(value) {
    let doc = value;

    if (typeof doc === 'string') {
        try {
            doc = JSON.parse(doc)
        } catch (e) {
            return null
        }
    }

    return doc && typeof doc === 'object' && !Array.isArray(doc) && Array.isArray(doc.blocks) ? doc : null
}

/**
 * @summary Whether HTML shows nothing (tags, breaks and spaces only).
 * @param {String} html
 * @returns {Boolean}
 */
export function isHtmlEmpty(html) {
    return String(html ?? '')
        .replace(/<br\s*\/?>/gi, '')
        .replace(/&nbsp;/gi, '')
        .replace(/\s+/g, '')
        .replace(/<[^>]*>/g, '')
        .trim() === ''
}

/**
 * @summary Escapes text for HTML content and attribute values.
 * @param {*} value
 * @returns {String}
 */
function escape(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * @summary A URL an img or a link may use: http(s) or relative, else null.
 * @param {*} url
 * @returns {String|null}
 */
export function safeUrl(url) {
    const value = String(url ?? '').replace(/[\u0000- \u007f-\u009f]+/g, '');

    if (!value) {
        return null
    }

    // no scheme: relative
    return !/^[^/?#]*:/.test(value) || /^https?:/i.test(value) ? String(url).trim() : null
}

/**
 * @summary A copy of a document with each image URL passed through fn (image tool file.url,
 * simple image url); the same document when none changes.
 * @param {*} doc
 * @param {Function} fn url → url
 * @returns {*}
 */
export function mapImageUrls(doc, fn) {
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.blocks)) {
        return doc
    }

    let changed = false;

    const blocks = doc.blocks.map(block => {
        const data = block?.type === 'image' ? block.data : null;

        if (!data || typeof data !== 'object') {
            return block
        }

        const fileUrl = typeof data.file?.url === 'string' ? fn(data.file.url) : data.file?.url,
              url     = typeof data.url === 'string' ? fn(data.url) : data.url;

        if (fileUrl === data.file?.url && url === data.url) {
            return block
        }

        changed = true;

        const copy = {...data};

        fileUrl !== data.file?.url && (copy.file = {...data.file, url: fileUrl});
        url !== data.url && (copy.url = url);

        return {...block, data: copy}
    });

    return changed ? {...doc, blocks} : doc
}

/**
 * @summary Image URLs relative to the API (classic and server tools store `download.php?blob=`)
 * made absolute with root, as a page with another base (neo's <base href>) would miss them.
 * @param {*} doc
 * @param {String} root the API URL with a trailing slash (client.apiUrl)
 * @param {Map} [made] gets each absolute URL → its stored form, for restoreImageUrls()
 * @returns {*}
 */
export function rootImageUrls(doc, root, made) {
    return mapImageUrls(doc, url => {
        // the browser trims an img src too
        const trimmed = url.trim();

        // scheme (http:, data:), absolute path or fragment: as stored
        if (!trimmed || /^[^/?#]*:/.test(trimmed) || /^[/?#]/.test(trimmed)) {
            return url
        }

        made?.set(root + trimmed, url);

        return root + trimmed
    })
}

/**
 * @summary The stored form of image URLs rootImageUrls() made absolute, so an untouched document
 * saves as it was loaded.
 * @param {*} doc
 * @param {Map} made absolute URL → stored form
 * @returns {*}
 */
export function restoreImageUrls(doc, made) {
    return made.size ? mapImageUrls(doc, url => made.get(url) ?? url) : doc
}

/**
 * @summary The text alignment of a block (alignment tune), as a style attribute.
 * @param {Object} block
 * @returns {String}
 */
function alignStyle(block) {
    const align = block?.tunes?.alignment?.alignment;

    return ['left', 'center', 'right', 'justify'].includes(align) && align !== 'left' ? ` style="text-align: ${align}"` : ''
}

/**
 * @summary The items of a list block, nested (list tool 2: {content, items, meta}; 1: strings).
 * @param {Array} items
 * @param {String} tag ul / ol
 * @param {Boolean} checklist
 * @param {Function} sanitize
 * @returns {String}
 */
function listHtml(items, tag, checklist, sanitize) {
    if (!Array.isArray(items) || !items.length) {
        return ''
    }

    const lis = items.map(item => {
        const content = typeof item === 'string' ? item : item?.content ?? item?.text ?? '',
              checked = checklist && (item?.meta?.checked ?? item?.checked),
              box     = checklist ? `<span class="go-ejs-check">${checked ? '☑' : '☐'}</span> ` : '',
              nested  = typeof item === 'object' ? listHtml(item?.items, tag, checklist, sanitize) : '';

        return `<li>${box}${sanitize(String(content))}${nested}</li>`
    }).join('');

    return `<${tag}${checklist ? ' class="go-ejs-checklist"' : ''}>${lis}</${tag}>`
}

/**
 * @summary HTML of one block, '' for an unknown or empty one.
 * @param {Object} block
 * @param {Function} sanitize inline HTML → safe HTML
 * @returns {String}
 */
function blockHtml(block, sanitize) {
    const data  = block?.data || {},
          style = alignStyle(block);

    switch (block?.type) {
        case 'paragraph':
            return data.text ? `<p${style}>${sanitize(String(data.text))}</p>` : '';

        case 'header': {
            const level = Math.min(6, Math.max(1, Number(data.level) || 2));
            return `<h${level}${style}>${sanitize(String(data.text ?? ''))}</h${level}>`
        }

        case 'list': {
            const kind = data.style === 'ordered' ? 'ol' : 'ul';
            return listHtml(data.items, kind, data.style === 'checklist', sanitize)
        }

        case 'nestedchecklist':
        case 'checklist':
            return listHtml(data.items, data.style === 'ordered' ? 'ol' : 'ul', true, sanitize);

        case 'quote':
            return `<blockquote${style}>${sanitize(String(data.text ?? ''))}` +
                (data.caption ? `<footer>${sanitize(String(data.caption))}</footer>` : '') + '</blockquote>';

        case 'table': {
            const rows = Array.isArray(data.content) ? data.content : [];

            return rows.length ? '<table class="go-ejs-table">' + rows.map((row, i) => {
                const cell = i === 0 && data.withHeadings ? 'th' : 'td';
                return '<tr>' + (Array.isArray(row) ? row : []).map(c => `<${cell}>${sanitize(String(c ?? ''))}</${cell}>`).join('') + '</tr>'
            }).join('') + '</table>' : ''
        }

        case 'code':
        // diagrams (flowcharts, ASCII art): their source as text
        case 'flowcharts':
        case 'a2s':
            return data.code ? `<pre class="go-ejs-code"><code>${escape(data.code)}</code></pre>` : '';

        case 'image': {
            const url = safeUrl(data.file?.url ?? data.url);

            return url ? `<figure class="go-ejs-image"><img src="${escape(url)}" alt="${escape(String(data.caption ?? '').replace(/<[^>]*>/g, ''))}">` +
                (data.caption ? `<figcaption>${sanitize(String(data.caption))}</figcaption>` : '') + '</figure>' : ''
        }

        case 'embed': {
            const url = safeUrl(data.source ?? data.embed);
            return url ? `<p><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(data.caption || url)}</a></p>` : ''
        }

        case 'delimiter':
        case 'pageBreak':
            return '<hr>';

        case 'breakLine':
            return '<br>';

        default:
            return ''
    }
}

/**
 * @summary HTML of an Editor.js document, null when it shows nothing.
 * @param {*} doc {blocks}
 * @param {Function} sanitize inline HTML → safe HTML
 * @returns {String|null}
 */
export function editorJsToHtml(doc, sanitize) {
    const blocks = doc && typeof doc === 'object' && Array.isArray(doc.blocks) ? doc.blocks : [],
          html   = blocks.map(block => blockHtml(block, sanitize)).join('');

    return html ? `<div class="go-ejs">${html}</div>` : null
}
