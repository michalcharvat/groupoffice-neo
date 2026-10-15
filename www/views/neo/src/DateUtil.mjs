/**
 * Local date helpers for GO's "Y-m-d" date values. new Date('2026-10-16') is UTC
 * midnight (the day before west of UTC): parse the parts instead.
 */

const pad = n => String(n).padStart(2, '0');

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

/**
 * ISO 8601 with the local offset, PHP's "c" ("2026-10-16T10:30:00+02:00")
 * @param {Date} date
 * @returns {String}
 */
export function toIsoLocal(date) {
    const offset = -date.getTimezoneOffset(),
          sign   = offset >= 0 ? '+' : '-',
          abs    = Math.abs(offset);

    return `${toYmd(date)}T${toHi(date)}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
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

/** JMAP / iCalendar weekdays, index = Date#getDay() */
export const DAY_KEYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
