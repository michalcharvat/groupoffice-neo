import {marked}       from '../node_modules/marked/lib/marked.esm.js';
import client         from './jmap/Client.mjs';
import {sanitizeHtml} from './Format.mjs';

/**
 * Markdown utilities (GOUI groupoffice-core util/Markdown). Runs in the App worker:
 * marked parses without a DOM, Format.sanitizeHtml() rebuilds the output from an
 * allowlist.
 *
 *     import {contentToHtml} from '../Markdown.mjs';
 *     body.html = contentToHtml(note.content, note.type)
 */

/**
 * Content type of entities like notes that can be written in HTML or Markdown
 * @typedef {'html'|'markdown'} TextType
 */

/**
 * Renders Markdown to sanitised HTML. Markdown may contain raw HTML and the server
 * does not sanitise Markdown content, so the output always goes through sanitizeHtml().
 * @param {String} markdown
 * @returns {String}
 */
export function markdownToHtml(markdown) {
    const html = marked.parse(String(markdown || ''), {async: false, breaks: true, gfm: true})
        // task list items: the sanitiser drops <input>, show the state as a character
        .replace(/<input\b[^>]*\btype="checkbox"[^>]*>/g, input => /\bchecked\b/.test(input) ? '☑' : '☐');

    return sanitizeHtml(html)
}

/**
 * The content as HTML: Markdown is rendered, HTML is returned as is (the server
 * sanitises HTML content on save).
 * @param {String} content
 * @param {TextType} [type='html']
 * @returns {String}
 */
export function contentToHtml(content, type = 'html') {
    return type === 'markdown' ? markdownToHtml(content) : blobImages(content || '')
}

/**
 * Images with data-blob-id get the blob's download URL as src when they have none or an
 * object URL ("blob:…"): GOUI HtmlField saves pasted images with the object URL of the
 * upload, which is gone after a reload (GOUI Image.replaceImages()).
 * @param {String} html
 * @returns {String}
 */
export function blobImages(html) {
    return String(html || '').replace(/<img\b[^>]*>/gi, tag => {
        const blobId = /\sdata-blob-id\s*=\s*"([a-f0-9]{40})"/i.exec(tag)?.[1],
              src    = /\ssrc\s*=\s*"([^"]*)"/i.exec(tag)?.[1];

        if (!blobId || (src && !/^\s*blob:/i.test(src))) {
            return tag
        }

        return tag.replace(/\ssrc\s*=\s*"[^"]*"/i, '').replace(/^<img/i, `<img src="${client.apiUrl}download.php?blob=${blobId}"`)
    })
}

/**
 * Adds the image size to an image URL, like GOUI MarkdownField, so other clients know
 * the aspect ratio before the image loads
 * @param {String} url
 * @param {Number} width
 * @param {Number} height
 * @returns {String}
 */
export function addImageSize(url, width, height) {
    return url + (url.includes('?') ? '&' : '?') + `w=${width}&h=${height}`
}
