/**
 * Local date helpers for GO's "Y-m-d" date values. new Date('2026-10-16') is UTC
 * midnight (the day before west of UTC): parse the parts instead.
 *
 * Time zone: neo shows dates in the user's GO time zone (User.timezone), not the
 * browser's, like GOUI (Format.timezone / DateTime.defaultTimezone). A date the UI works
 * with is a "wall time" Date: its local fields (getHours() …) are the time the user sees
 * in their zone. toUserTime() turns an instant from the server into one,
 * fromUserTime() a wall time back into the instant, userNow() is the current wall time.
 * Like GOUI's DateTime this is a JS Date in the browser's zone: a wall time inside the
 * browser's own DST gap moves an hour, and a repeated DST hour of the user's (or a given)
 * zone maps to its first occurrence.
 */

const pad = n => String(n).padStart(2, '0');

/** The user's IANA time zone; null: the browser's (the wall time is the local time) */
let userTimeZone = null;

/**
 * Sets the user's time zone (the JMAP client after login)
 * @param {String|null} timeZone e.g. "Europe/Amsterdam"; null, empty or unknown: the browser's
 */
export function setUserTimeZone(timeZone) {
    const resolved = resolveTimeZone(timeZone);

    // the browser's own zone needs no conversion
    userTimeZone = resolved !== Intl.DateTimeFormat().resolvedOptions().timeZone ? resolved : null
}

const resolvedZones = new Map();

/**
 * Checks an IANA time zone name
 * @param {String|null} timeZone e.g. "Asia/Singapore"
 * @returns {String|null} the canonical name; null for null, empty or unknown (with a console warning)
 */
export function resolveTimeZone(timeZone) {
    if (!timeZone) {
        return null
    }

    if (!resolvedZones.has(timeZone)) {
        try {
            resolvedZones.set(timeZone, new Intl.DateTimeFormat('en-US', {timeZone}).resolvedOptions().timeZone)
        } catch (e) {
            console.warn('Unknown time zone ' + timeZone);
            resolvedZones.set(timeZone, null)
        }
    }

    return resolvedZones.get(timeZone)
}

/** A zone argument of the helpers below: a valid name, else the user's zone */
const zoneOf = timeZone => (timeZone && resolveTimeZone(timeZone)) || userTimeZone;

const offsetFormats = {};

/**
 * Offset of a time zone at an instant, in ms (wall time = utc + offset)
 * @param {Number} utcMs
 * @param {String} timeZone IANA name
 * @returns {Number}
 */
export function tzOffset(utcMs, timeZone) {
    const parts = {};

    offsetFormats[timeZone] ??= new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    offsetFormats[timeZone].formatToParts(new Date(utcMs)).forEach(p => parts[p.type] = p.value);

    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second) - Math.floor(utcMs / 1000) * 1000
}

/**
 * An instant → the user's wall time
 * @param {Date|Number|String} instant a Date, ms since the epoch or a string with an offset or Z
 * @param {String|null} [timeZone] IANA name: the wall time in that zone instead of the user's
 * @returns {Date|null} a new Date
 */
export function toUserTime(instant, timeZone=null) {
    const ms = instant instanceof Date ? instant.getTime() : (typeof instant === 'number' ? instant : Date.parse(instant));

    if (instant === null || instant === undefined || instant === '' || isNaN(ms)) {
        return null
    }

    const zone = zoneOf(timeZone);

    if (!zone) {
        return new Date(ms)
    }

    const wall = new Date(ms + tzOffset(ms, zone));

    return new Date(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds(), wall.getUTCMilliseconds())
}

/**
 * The user's wall time → the instant (inverse of toUserTime())
 * @param {Date} date wall time
 * @param {String|null} [timeZone] IANA name: a wall time in that zone instead of the user's
 * @returns {Date} a new Date
 */
export function fromUserTime(date, timeZone=null) {
    const zone = zoneOf(timeZone);

    if (!zone) {
        return new Date(date)
    }

    const day    = 86400000,
          wall   = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()),
          // with the offsets of the day before and after: a repeated hour has two matches (the first wins), a skipped one none
          first  = wall - tzOffset(wall - day, zone),
          second = wall - tzOffset(wall + day, zone);

    return new Date([first, second].find(instant => instant + tzOffset(instant, zone) === wall) ?? first)
}

/**
 * @returns {Date} the current wall time of the user (for "today" and "now")
 */
export function userNow() {
    return toUserTime(Date.now())
}

/**
 * @param {String|Date|null} value "Y-m-d" (a time part is ignored) or a Date
 * @returns {Date|null} local midnight
 */
export function parseYmd(value) {
    if (value instanceof Date) {
        return isNaN(value) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate())
    }

    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));

    if (!m) {
        return null
    }

    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    // 2026-02-31 rolls over: not a date
    return date.getMonth() === Number(m[2]) - 1 ? date : null
}

/**
 * @param {Date} date
 * @returns {String} "Y-m-d"
 */
export function toYmd(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * @param {Date} date
 * @returns {String} "H:i"
 */
export function toHi(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * @param {Date} date
 * @param {Number} days
 * @returns {Date} a new date
 */
export function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d
}

/**
 * @param {Date} date
 * @param {Number} months
 * @returns {Date} a new date
 */
export function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d
}

const iso = (wall, offset) => {
    const sign = offset >= 0 ? '+' : '-',
          abs  = Math.abs(offset);

    return `${toYmd(wall)}T${toHi(wall)}:${pad(wall.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
};

/**
 * ISO 8601 of an instant in a zone, with that zone's offset at the instant
 * @param {Date|Number} instant
 * @param {String|null} [timeZone] IANA name; null: the user's
 * @returns {String}
 */
export function toIsoAt(instant, timeZone=null) {
    const zone = zoneOf(timeZone),
          ms   = +instant;

    return zone ? iso(toUserTime(ms, zone), Math.round(tzOffset(ms, zone) / 60000)) : toIsoLocal(new Date(ms))
}

/**
 * ISO 8601 with the user's offset, PHP's "c" ("2026-10-16T10:30:00+02:00")
 * @param {Date} date wall time; a skipped hour is moved forward, a repeated one is its first occurrence
 * @param {String|null} [timeZone] IANA name: a wall time in that zone, with its offset at that instant
 * @returns {String}
 */
export function toIsoLocal(date, timeZone=null) {
    const zone = zoneOf(timeZone);

    return zone ? toIsoAt(fromUserTime(date, zone), zone) : iso(date, -date.getTimezoneOffset())
}

/**
 * Monday of the week (GO weeks start on Monday)
 * @param {Date} date
 * @returns {Date}
 */
export function weekStart(date) {
    const d = parseYmd(date);
    return addDays(d, -((d.getDay() + 6) % 7))
}

/**
 * ISO 8601 week number (PHP date "W"): weeks start on Monday, week 1 holds January 4th
 * @param {Date} date
 * @returns {Number}
 */
export function weekOfYear(date) {
    const d   = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())),
          day = d.getUTCDay() || 7;

    // the Thursday of the week decides its year
    d.setUTCDate(d.getUTCDate() + 4 - day);

    return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)
}

/** JMAP / iCalendar weekdays, index = Date#getDay() */
export const DAY_KEYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

/**
 * A date in the user's date format (as the legacy controllers send and expect it) to
 * "Y-m-d"; only the day, month and year letters of PHP date() are read
 * @param {String} value e.g. "19-11-2026"
 * @param {String} format e.g. "d-m-Y"
 * @returns {String|null}
 */
export function userDateToYmd(value, format) {
    const parts   = String(value || '').match(/\d+/g) || [],
          letters = String(format || '').replace(/[^djmnYy]/g, '').split(''),
          date    = {};

    if (parts.length < 3 || letters.length < 3) {
        return null
    }

    letters.forEach((letter, i) => {
        const n = parseInt(parts[i], 10);
        if (letter === 'd' || letter === 'j') date.d = n;
        if (letter === 'm' || letter === 'n') date.m = n;
        if (letter === 'Y') date.y = n;
        if (letter === 'y') date.y = 2000 + n;
    });

    if (!date.d || !date.m || !date.y) {
        return null
    }

    const pad = n => String(n).padStart(2, '0');
    return `${date.y}-${pad(date.m)}-${pad(date.d)}`
}
