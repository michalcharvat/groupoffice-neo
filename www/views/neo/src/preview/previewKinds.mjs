/**
 * Which preview GO.preview.FilePreview shows for a file, and the previews other code adds (DOM-free, tested in
 * tests/filePreview.test.mjs).
 *
 *     previewKindOf({extension: 'md'})                 // 'markdown'
 *     previewKindOf({type: 'application/pdf'})         // 'pdf'
 *     previewKindOf({name: 'report.XLSX'})             // 'sheet', registered by officePreviews.mjs:
 *
 *     registerPreview('sheet', {
 *         extensions: ['xls', 'xlsx'],
 *         render    : async ({src, windowId}) => escapedHtmlOfTheFirstSheet
 *     });
 */

const EXTENSIONS = {
    pdf     : ['pdf'],
    image   : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
    markdown: ['md', 'markdown'],
    text    : ['txt', 'csv', 'json', 'xml', 'html', 'htm', 'css', 'js', 'mjs', 'ts', 'php', 'sql', 'sh', 'bash', 'yaml',
               'yml', 'ini', 'conf', 'cfg', 'log', 'env', 'htaccess'],
    audio   : ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'],
    video   : ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv', 'm4v']
};

/** At most this many characters of a text file are shown */
export const TEXT_LIMIT = 1000000;

/** Registered previews by kind: {extensions, types, render} */
const registered = new Map();

/**
 * @summary Adds a preview kind, e.g. sheets or docx. Built-in kinds come first and cannot be replaced.
 * @param {String} kind
 * @param {Object} preview
 * @param {String[]} [preview.extensions=[]] lower case, without the dot
 * @param {String[]} [preview.types=[]] MIME types
 * @param {Function} preview.render async ({url, src, name, extension, type, signal, windowId}) => HTML; the renderer sanitises it
 * and passes signal to its fetch (aborted when another file is shown),
 * FilePreview inserts it as is
 */
export function registerPreview(kind, {extensions = [], types = [], render}) {
    if (EXTENSIONS[kind]) {
        throw new Error(`Preview kind "${kind}" is built in`)
    }

    registered.set(kind, {extensions: extensions.map(e => e.toLowerCase()), types: types.map(t => t.toLowerCase()), render})
}

/**
 * @summary The registered preview of a kind.
 * @param {String} kind
 * @returns {Object|null} {extensions, types, render}
 */
export function registeredPreview(kind) {
    return registered.get(kind) || null
}

/**
 * @summary The extension of a file name, lower case and without the dot.
 * @param {String|null} name
 * @returns {String}
 */
export function extensionOf(name) {
    const match = String(name || '').match(/\.([^./\\]+)$/);

    return match ? match[1].toLowerCase() : ''
}

/**
 * @summary The kind of preview for a file: by its extension (given or from the name), else by its MIME type.
 * @param {Object} file
 * @param {String} [file.extension]
 * @param {String} [file.type] MIME type
 * @param {String} [file.name]
 * @returns {String|null} 'pdf', 'image', 'markdown', 'text', 'audio', 'video', a registered kind, or null
 */
export function previewKindOf({extension, type, name} = {}) {
    const ext  = String(extension || '').toLowerCase().replace(/^\./, '') || extensionOf(name),
          mime = String(type || '').toLowerCase().split(';')[0].trim();

    if (ext) {
        for (const [kind, list] of Object.entries(EXTENSIONS)) {
            if (list.includes(ext)) {
                return kind
            }
        }

        for (const [kind, preview] of registered) {
            if (preview.extensions.includes(ext)) {
                return kind
            }
        }
    }

    if (!mime) {
        return null
    }

    if (mime === 'application/pdf') {
        return 'pdf'
    }

    if (mime === 'text/markdown') {
        return 'markdown'
    }

    const top = mime.split('/')[0];

    if (['image', 'audio', 'video'].includes(top)) {
        return top
    }

    if (top === 'text' || ['application/json', 'application/xml', 'application/javascript'].includes(mime)) {
        return 'text'
    }

    for (const [kind, preview] of registered) {
        if (preview.types.includes(mime)) {
            return kind
        }
    }

    return null
}
