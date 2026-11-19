/**
 * Minimal RSS 2.0 / RDF / Atom reader for the App worker (no DOMParser in workers). Reads
 * the items' title, link, date and description; text is decoded, HTML is left to the caller
 * (sanitizeHtml()).
 */

const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};

/**
 * @param {String} value XML text (CDATA or escaped)
 * @returns {String}
 */
function decode(value) {
    const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(value);

    if (cdata) {
        return cdata[1]
    }

    return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
        if (e[0] === '#') {
            const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
            return n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : ''
        }

        return ENTITIES[e.toLowerCase()] ?? m
    })
}

/**
 * @param {String} xml element content
 * @param {String} tag e.g. "title"
 * @returns {String|null}
 */
function child(xml, tag) {
    const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
    return m ? decode(m[1]).trim() : null
}

/**
 * Atom <link href="..."/>: the alternate (or first) link
 * @param {String} xml
 * @returns {String|null}
 */
function atomLink(xml) {
    const links = [...xml.matchAll(/<link\b([^>]*)\/?>/gi)].map(m => m[1]),
          attr  = (attrs, name) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs),
          link  = links.find(a => !attr(a, 'rel') || /alternate/i.test(attr(a, 'rel')[0])) || links[0],
          href  = link && attr(link, 'href');

    return href ? decode(href[2] ?? href[3]) : null
}

/**
 * @param {String} xml the feed
 * @returns {{title: String|null, items: Object[]}} items {title, link, date (Date|null), description (HTML)}
 */
export function parseFeed(xml) {
    xml = String(xml || '');

    const isAtom  = /<feed\b/i.test(xml) && !/<rss\b/i.test(xml),
          itemTag = isAtom ? 'entry' : 'item',
          head    = xml.split(new RegExp(`<${itemTag}\\b`, 'i'))[0],
          items   = [...xml.matchAll(new RegExp(`<${itemTag}\\b[^>]*>([\\s\\S]*?)</${itemTag}>`, 'gi'))].map(([, body]) => {
              const dateText = child(body, 'pubDate') || child(body, 'dc:date') || child(body, 'updated') || child(body, 'published'),
                    date     = dateText ? new Date(dateText) : null;

              return {
                  title      : child(body, 'title') || '',
                  link       : (isAtom ? atomLink(body) : child(body, 'link')) || null,
                  date       : date && !isNaN(date) ? date : null,
                  description: child(body, 'description') || child(body, 'summary') || child(body, 'content') || ''
              }
          });

    return {title: child(head, 'title'), items}
}
