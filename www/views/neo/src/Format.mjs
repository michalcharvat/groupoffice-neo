/**
 * Formatting helpers for GO values. Date and time follow the user's GO settings
 * (User.dateFormat / timeFormat, PHP date() letters) like GOUI's Format.
 */
import {lookup, t} from './Translate.mjs';

const dateTime = new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      DAYS   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// GO's language files: full_months is {1: …, 12: …}, full_days an array from Sunday.
// Looked up per call: the JMAP client imports this module before the translations load.
const monthName = i => lookup('full_months')?.[i + 1] || MONTHS[i],
      dayName   = i => lookup('full_days')?.[i] || DAYS[i];

/**
 * The user's formats; the JMAP client sets them after login
 */
export const userFormat = {
    dateFormat: 'd-m-Y',
    timeFormat: 'G:i'
}

const pad = n => String(n).padStart(2, '0');

/**
 * Subset of PHP's date() used by GO's date and time formats
 * @param {Date} date
 * @param {String} format
 * @returns {String}
 */
export function formatDate(date, format) {
    let out = '';

    for (const c of format) {
        const h = date.getHours();

        switch (c) {
            case 'd': out += pad(date.getDate()); break;
            case 'j': out += date.getDate(); break;
            case 'm': out += pad(date.getMonth() + 1); break;
            case 'n': out += date.getMonth() + 1; break;
            case 'M': out += lookup('short_months')?.[date.getMonth() + 1] || MONTHS[date.getMonth()].slice(0, 3); break;
            case 'F': out += monthName(date.getMonth()); break;
            case 'Y': out += date.getFullYear(); break;
            case 'y': out += String(date.getFullYear()).slice(-2); break;
            case 'l': out += dayName(date.getDay()); break;
            case 'D': out += lookup('short_days')?.[date.getDay()] || DAYS[date.getDay()].slice(0, 3); break;
            case 'H': out += pad(h); break;
            case 'G': out += h; break;
            case 'h': out += pad(h % 12 || 12); break;
            case 'g': out += h % 12 || 12; break;
            case 'i': out += pad(date.getMinutes()); break;
            case 's': out += pad(date.getSeconds()); break;
            case 'a': out += h < 12 ? 'am' : 'pm'; break;
            case 'A': out += h < 12 ? 'AM' : 'PM'; break;
            default : out += c
        }
    }

    return out
}

function toDate(value) {
    if (!value) {
        return null
    }

    const date = value instanceof Date ? value : new Date(value);
    return isNaN(date) ? null : date
}

export function formatDateTime(value) {
    const date = toDate(value);
    return date ? dateTime.format(date) : ''
}

/**
 * Full date and time in the user's format (GOUI: the cell's title)
 */
export function formatUserDateTime(value) {
    const date = toDate(value);
    return date ? formatDate(date, userFormat.dateFormat + ' ' + userFormat.timeFormat) : ''
}

/**
 * GOUI Format.smartDateTime(): today only the time, yesterday/tomorrow by name,
 * the surrounding week by weekday, this year without the year.
 * @param {String|Date} value
 * @param {Boolean} showTime=true
 * @returns {String}
 */
export function smartDateTime(value, showTime=true) {
    const date = toDate(value);

    if (!date) {
        return ''
    }

    const {dateFormat, timeFormat} = userFormat,
          now      = new Date(),
          day      = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000,
          diffDays = day(date) - day(now),
          time     = formatDate(date, timeFormat);

    switch (diffDays) {
        case 0 : return showTime ? time : t('Today');
        case -1: return showTime ? `${t('Yesterday')} ${t('at')} ${time}` : t('Yesterday');
        case 1 : return showTime ? `${t('Tomorrow')} ${t('at')} ${time}` : t('Tomorrow');
    }

    let format = dateFormat;

    if (diffDays > -6 && diffDays < 6) {
        format = 'l'
    } else if (now.getFullYear() === date.getFullYear()) {
        let dayIndex   = dateFormat.indexOf('d'),
            monthIndex = dateFormat.indexOf('m');

        dayIndex === -1 && (dayIndex = dateFormat.indexOf('j'));
        format = dayIndex > monthIndex ? 'M j' : 'j M'
    }

    return formatDate(date, showTime ? format + ' ' + timeFormat : format)
}

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c])
}

/**
 * GOUI Format.fileSize(): 1536 → "1.50 kB", 0 / empty → ''
 * @param {Number} bytes
 * @returns {String}
 */
export function fileSize(bytes) {
    if (!bytes) {
        return ''
    }

    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
    return (bytes / Math.pow(1024, i)).toFixed(i ? 2 : 0) + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i]
}

/**
 * GO's initials for an avatar (go.util.initials): first and last word
 */
export function initials(name) {
    let parts = String(name || '').trim().split(/\s+/);

    if (parts.length > 2) {
        parts = [parts[0], parts[parts.length - 1]]
    }

    return parts.map(p => p.charAt(0).toUpperCase()).join('')
}

// go.Colors without GO's default header colour (0277BD)
const AVATAR_COLORS = ['C62828', 'AD1457', '6A1B9A', '4527A0', '283593', '1565C0', '00838F',
                       '00695C', '2E7D32', '558B2F', '9E9D24', 'F9A825', 'FF8F00', 'EF6C00', '424242'];

/**
 * GO avatar colour (go.util.avatar): derived from the name
 * @param {String} name
 * @returns {String} e.g. "#C62828"
 */
export function avatarColor(name) {
    let sum = 0;

    name = String(name || '');

    for (let i = 0; i < name.length; i++) {
        sum += name.charCodeAt(i)
    }

    return '#' + AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

/**
 * GO avatar (go.util.avatar): initials on a colour derived from the name
 * @param {String} name
 * @param {String[]} cls extra classes
 * @returns {String} HTML
 */
export function avatarHtml(name, cls=[]) {
    return `<span class="${['go-avatar', ...cls].join(' ')}" style="background-color:${avatarColor(name)}" title="${escapeHtml(name)}">${escapeHtml(initials(name))}</span>`
}

const SAFE_TAGS = new Set(['a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                           'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strike', 'strong',
                           'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul']),
      VOID_TAGS = new Set(['br', 'hr', 'img']),
      // relative URLs (GO's api/download.php?blob=...), http(s) and mailto only
      SAFE_URL  = /^(https?:|mailto:|[^:]*$)/i;

/**
 * Allowlist HTML sanitiser for HTML from other users (comments), defence in depth on
 * top of the server's XSS check. Runs in the worker (no DOM): the output is rebuilt
 * from tokens, so nothing of the input passes unescaped. Keeps formatting tags, drops
 * every attribute except a[href] and img[src] with a safe URL, drops <script>/<style>
 * with their content and escapes everything else.
 * @param {String} html
 * @returns {String}
 */
export function sanitizeHtml(html) {
    // keep existing entities, escape the rest of the text
    const text = s => s.replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
          attr = (attrs, name) => {
              const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
              // decode what a browser decodes in an attribute ("javascript&colon;", "&#58;"),
              // then drop control characters and whitespace: the URL check sees the real value
              return m ? (m[2] ?? m[3] ?? m[4] ?? '')
                  .replace(/&#x([0-9a-f]+);?/gi, (x, h) => String.fromCodePoint(parseInt(h, 16)))
                  .replace(/&#(\d+);?/g, (x, d) => String.fromCodePoint(Number(d)))
                  .replace(/&(colon|tab|newline|amp);?/gi, (x, n) => ({colon: ':', tab: '\t', newline: '\n', amp: '&'})[n.toLowerCase()])
                  .replace(/[\u0000-\u0020]/g, '') : null
          };

    let out = '';

    String(html || '')
        .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .split(/(<\/?[a-zA-Z][^>]*>)/)
        .forEach(part => {
            const tag = part.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/);

            if (!tag) {
                out += text(part);
                return
            }

            const [, close, rawName, attrs] = tag,
                  name = rawName.toLowerCase();

            if (!SAFE_TAGS.has(name)) {
                return
            }

            if (close) {
                VOID_TAGS.has(name) || (out += `</${name}>`);
                return
            }

            if (name === 'a') {
                const href = attr(attrs, 'href');
                out += href && SAFE_URL.test(href)
                    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`
                    : '<a>'
            } else if (name === 'img') {
                const src = attr(attrs, 'src');
                src && SAFE_URL.test(src) && (out += `<img src="${escapeHtml(src)}" alt="">`)
            } else {
                out += `<${name}>`
            }
        });

    return out
}
