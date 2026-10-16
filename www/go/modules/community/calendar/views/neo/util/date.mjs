/**
 * Date helpers of the calendar (GOUI DateTime / DateInterval subset).
 *
 * A calendar date is a plain JS Date whose local fields are the wall time the user sees
 * (the user's GO time zone, see toUserTime()). JMAP dates are strings without an offset:
 * "Y-m-d" (all day) or "Y-m-dTH:i:s" in the event's time zone.
 */
import {formatDate} from '../../../../../../../views/neo/src/Format.mjs';
import {lookup, t}  from '../../../../../../../views/neo/src/Translate.mjs';

const pad = n => String(n).padStart(2, '0');

export const DAY_MS = 86400000;

/**
 * Settings the calendar dates depend on, set by CalendarMain from the User
 */
export const dateSettings = {
    /** 0 = Sunday, 1 = Monday (User.firstWeekday) */
    firstWeekday: 1,
    /** User.timezone, null: the browser's */
    timezone    : null,
    /** User.timeFormat, e.g. "G:i" */
    timeFormat  : 'G:i'
};

/**
 * "Y-m-d" or "Y-m-dTH:i(:s)" (a trailing offset or Z is ignored) → local Date
 * @param {String|Date|null} value
 * @returns {Date|null}
 */
export function parseDate(value) {
    if (value instanceof Date) {
        return new Date(value)
    }

    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(value ?? ''));

    if (!m) {
        return null
    }

    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
}

/**
 * @param {Date} date
 * @returns {String} "Y-m-d"
 */
export function ymd(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * @param {Date} date
 * @returns {String} "Y-m-dTH:i:s"
 */
export function ymdhis(date) {
    return `${ymd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * @param {Date} date
 * @returns {String} "Y-m-dTH:i"
 */
export function ymdhi(date) {
    return `${ymd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Number for comparing days, e.g. 20261016
 * @param {Date} date
 * @returns {Number}
 */
export function dayNumber(date) {
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
}

/**
 * @param {Date} a
 * @param {Date} b
 * @returns {Boolean}
 */
export function sameDay(a, b) {
    return dayNumber(a) === dayNumber(b)
}

/**
 * @param {Date} date
 * @returns {Date} a copy at 00:00
 */
export function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d
}

export function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d
}

export function addMinutes(date, minutes) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + minutes);
    return d
}

/**
 * Whole days from a to b, by calendar day (DST safe)
 * @param {Date} a
 * @param {Date} b
 * @returns {Number}
 */
export function diffDays(a, b) {
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS)
}

/**
 * @param {Date} date
 * @returns {Number} minutes since midnight
 */
export function minuteOfDay(date) {
    return date.getHours() * 60 + date.getMinutes()
}

/**
 * Day index within the user's week, 0 = first weekday
 * @param {Date} date
 * @returns {Number}
 */
export function weekDay(date) {
    return (date.getDay() - dateSettings.firstWeekday + 7) % 7
}

/**
 * First day of the user's week of date, 00:00
 * @param {Date} date
 * @returns {Date}
 */
export function weekStart(date) {
    return addDays(startOfDay(date), -weekDay(date))
}

/**
 * ISO 8601 week number
 * @param {Date} date
 * @returns {Number}
 */
export function weekOfYear(date) {
    const d   = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())),
          day = d.getUTCDay() || 7;

    d.setUTCDate(d.getUTCDate() + 4 - day);

    return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY_MS + 1) / 7)
}

/**
 * PHP date() letters (Format.formatDate) plus W (ISO week)
 * @param {Date} date
 * @param {String} format
 * @returns {String}
 */
export function format(date, format) {
    return format.includes('W') ? format.split('W').map(part => formatDate(date, part)).join(weekOfYear(date)) : formatDate(date, format)
}

/**
 * The time in the user's format
 * @param {Date} date
 * @returns {String}
 */
export function formatTime(date) {
    return formatDate(date, dateSettings.timeFormat)
}

/**
 * Weekday names from the user's first weekday on
 * @param {Boolean} short
 * @returns {String[]}
 */
export function dayNames(short = false) {
    const names = lookup(short ? 'short_days' : 'full_days') || ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return Array.from({length: 7}, (_, i) => names[(i + dateSettings.firstWeekday) % 7])
}

/**
 * @param {Number} month 0-11
 * @returns {String}
 */
export function monthName(month) {
    return lookup('full_months')?.[month + 1] || formatDate(new Date(2000, month, 1), 'F')
}

/**
 * ISO 8601 duration, GOUI DateInterval: {invert, years, months, days, hours, minutes, seconds}.
 * Weeks count as 7 days.
 * @param {String} iso e.g. "P1D", "PT1H30M", "-PT15M", "P1W"
 * @returns {Object|null}
 */
export function parseDuration(iso) {
    const m = /^([+-])?P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(String(iso ?? ''));

    if (!m) {
        return null
    }

    return {
        invert : m[1] === '-',
        years  : +(m[2] || 0),
        months : +(m[3] || 0),
        days   : +(m[4] || 0) * 7 + +(m[5] || 0),
        hours  : +(m[6] || 0),
        minutes: +(m[7] || 0),
        seconds: Math.floor(+(m[8] || 0))
    }
}

/**
 * Adds an ISO duration to a date by its wall clock fields (like GOUI DateTime.add())
 * @param {Date} date
 * @param {String|Object} duration ISO string or parseDuration() result
 * @returns {Date} a new date
 */
export function addDuration(date, duration) {
    const d    = typeof duration === 'string' ? parseDuration(duration) : duration,
          r    = new Date(date);

    if (!d) {
        return r
    }

    const sign = d.invert ? -1 : 1;

    d.years   && r.setFullYear(r.getFullYear() + sign * d.years);
    d.months  && r.setMonth(r.getMonth() + sign * d.months);
    d.days    && r.setDate(r.getDate() + sign * d.days);
    d.hours   && r.setHours(r.getHours() + sign * d.hours);
    d.minutes && r.setMinutes(r.getMinutes() + sign * d.minutes);
    d.seconds && r.setSeconds(r.getSeconds() + sign * d.seconds);

    return r
}

/**
 * ISO duration from a to b (GOUI a.diff(b).toIso8601()): whole calendar days plus the
 * remaining time, e.g. "P1D", "PT1H30M", "P2DT2H"
 * @param {Date} a
 * @param {Date} b
 * @returns {String}
 */
export function diffDuration(a, b) {
    let invert = b < a;

    invert && ([a, b] = [b, a]);

    let days = diffDays(a, b),
        rest = (b.getHours() * 3600 + b.getMinutes() * 60 + b.getSeconds()) - (a.getHours() * 3600 + a.getMinutes() * 60 + a.getSeconds());

    if (rest < 0) {
        days--;
        rest += 86400
    }

    const h = Math.floor(rest / 3600),
          m = Math.floor(rest % 3600 / 60),
          s = rest % 60;

    let iso = (invert ? '-' : '') + 'P' + (days ? days + 'D' : '');

    if (h || m || s) {
        iso += 'T' + (h ? h + 'H' : '') + (m ? m + 'M' : '') + (s ? s + 'S' : '')
    }

    return iso === 'P' || iso === '-P' ? 'PT0S' : iso
}

/**
 * Readable duration, e.g. "1 hour 30 minutes before"
 * @param {String} iso
 * @returns {String}
 */
export function durationText(iso) {
    const d = parseDuration(iso);

    if (!d) {
        return iso
    }

    const parts = [];
    let days = d.days;

    if (days && days % 7 === 0) {
        parts.push(days / 7 + ' ' + t(days === 7 ? 'week' : 'weeks'));
        days = 0
    }

    days      && parts.push(days + ' ' + t(days === 1 ? 'day' : 'days'));
    d.hours   && parts.push(d.hours + ' ' + t(d.hours === 1 ? 'hour' : 'hours'));
    d.minutes && parts.push(d.minutes + ' ' + t(d.minutes === 1 ? 'minute' : 'minutes'));

    if (!parts.length) {
        return t('At the start')
    }

    parts.push(t(d.invert ? 'before' : 'after'));

    return parts.join(' ')
}

/**
 * Offset of a time zone at an instant, in ms (local = utc + offset)
 * @param {Number} utcMs
 * @param {String} timeZone
 * @returns {Number}
 */
function tzOffset(utcMs, timeZone) {
    const parts = {};

    new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(utcMs)).forEach(p => parts[p.type] = p.value);

    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second) - Math.floor(utcMs / 1000) * 1000
}

/**
 * Wall time in a zone → the same instant as the user's wall time (GOUI toTimezone()).
 * Without zones (or the same zone) the date is returned as it is.
 * @param {Date} date wall time in fromZone (local fields)
 * @param {String|null} fromZone
 * @returns {Date}
 */
export function toUserTime(date, fromZone) {
    const userZone = dateSettings.timezone;

    if (!fromZone || fromZone === userZone || !userZone) {
        return new Date(date)
    }

    try {
        const wall    = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
        let   instant = wall - tzOffset(wall, fromZone);

        // across a DST change the first guess is an hour off
        instant = wall - tzOffset(instant, fromZone);

        const user = new Date(instant + tzOffset(instant, userZone));

        return new Date(user.getUTCFullYear(), user.getUTCMonth(), user.getUTCDate(), user.getUTCHours(), user.getUTCMinutes(), user.getUTCSeconds())
    } catch (e) {
        // unknown zone
        return new Date(date)
    }
}

/**
 * The user's wall time → wall time in another zone (inverse of toUserTime())
 * @param {Date} date
 * @param {String|null} toZone
 * @returns {Date}
 */
export function fromUserTime(date, toZone) {
    const userZone = dateSettings.timezone;

    if (!toZone || toZone === userZone || !userZone) {
        return new Date(date)
    }

    const saved = dateSettings.timezone;

    try {
        dateSettings.timezone = toZone;
        return toUserTime(date, userZone)
    } finally {
        dateSettings.timezone = saved
    }
}
