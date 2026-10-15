/**
 * Occurrences of a JMAP RecurrenceRule (groupoffice-core Recurrence, which wraps ical.js).
 * Supports frequency daily/weekly/monthly/yearly with interval, count, until, byDay
 * (with nthOfPeriod), byMonthDay, byMonth, byYearDay, byWeekNo (yearly) and bySetPosition.
 * Every occurrence keeps the start's time of day.
 *
 *     for (const date of new Recurrence({dtstart, rule}).loop(from, until)) { … }
 */
import {addDays, dayNumber, parseDate, weekOfYear} from './date.mjs';

const DAYS = {su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6};

// a daily rule from 1990 up to today: ~13000 periods, well below
const MAX_PERIODS = 50000;

// year of the ISO week: the year of its Thursday
const isoYear = date => addDays(date, 3 - (date.getDay() + 6) % 7).getFullYear();

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

export default class Recurrence {
    /**
     * @param {Object} config
     * @param {Date} config.dtstart first occurrence (wall time of the event)
     * @param {Object} config.rule JMAP RecurrenceRule
     */
    constructor({dtstart, rule}) {
        this.dtstart = new Date(dtstart);
        this.rule    = rule || {};

        const until = this.rule.until;

        if (until) {
            const date = parseDate(until);
            // a date-only until includes the whole day
            this.until = String(until).length <= 10 ? addDays(date, 1) : date;
            this.untilInclusive = String(until).length > 10
        }
    }

    /**
     * Occurrences from `from` (inclusive) to `to` (exclusive)
     * @param {Date} from
     * @param {Date} to
     * @param {Function} [iter] (date, index) => false stops, index counts from `from`
     * @returns {Generator<Date>}
     */
    *loop(from, to, iter) {
        let index = 0;

        for (const date of this.all(to)) {
            if (date >= to) {
                return
            }

            if (date < from) {
                continue
            }

            if (iter && iter(date, index) === false) {
                return
            }

            index++;
            yield date
        }
    }

    /**
     * All occurrences from dtstart on, in order
     * @param {Date} [before] stop at periods starting after this date (default: 200 years on)
     * @returns {Generator<Date>}
     */
    *all(before) {
        let me     = this,
            rule   = me.rule,
            count  = 0,
            start  = me.dtstart,
            freq   = String(rule.frequency || '').toLowerCase(),
            step   = Math.max(1, parseInt(rule.interval) || 1);

        if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) {
            // hourly etc.: not shown as a series
            yield new Date(start);
            return
        }

        const limit = before || new Date(start.getFullYear() + 200, 0, 1);

        for (let period = 0; period < MAX_PERIODS; period++) {
            // a rule that never matches must not run through all periods
            if (me.periodStart(freq, period * step) > limit) {
                return
            }

            const candidates = me.period(freq, period * step);

            if (candidates === null) {
                return
            }

            for (const date of candidates) {
                if (date < start) {
                    continue
                }

                if (me.until && (me.untilInclusive ? date > me.until : date >= me.until)) {
                    return
                }

                if (rule.count && count >= rule.count) {
                    return
                }

                count++;
                yield date
            }
        }
    }

    /**
     * First day of the period `offset` periods after dtstart's
     * @protected
     */
    periodStart(freq, offset) {
        const s = this.dtstart;

        switch (freq) {
            case 'daily'  : return new Date(s.getFullYear(), s.getMonth(), s.getDate() + offset);
            case 'weekly' : return new Date(s.getFullYear(), s.getMonth(), s.getDate() + offset * 7 - 6);
            case 'monthly': return new Date(s.getFullYear(), s.getMonth() + offset, 1);
            default       : return new Date(s.getFullYear() + offset - 1, 11, 25)
        }
    }

    /**
     * Candidate occurrences of the period `offset` periods after dtstart's, sorted
     * @param {String} freq
     * @param {Number} offset
     * @returns {Date[]|null} null when the dates go out of range
     * @protected
     */
    period(freq, offset) {
        let me    = this,
            rule  = me.rule,
            start = me.dtstart,
            dates = [];

        const at = (y, m, d) => new Date(y, m, d, start.getHours(), start.getMinutes(), start.getSeconds());

        switch (freq) {
            case 'daily': {
                const day = at(start.getFullYear(), start.getMonth(), start.getDate() + offset);
                me.matchesMonth(day) && me.matchesMonthDay(day) && me.matchesWeekDay(day) && dates.push(day);
                break
            }

            case 'weekly': {
                const wkst      = DAYS[rule.firstDayOfWeek] ?? 1,
                      first     = at(start.getFullYear(), start.getMonth(), start.getDate() - ((start.getDay() - wkst + 7) % 7) + offset * 7),
                      weekDays  = rule.byDay?.length ? rule.byDay.map(d => DAYS[d.day]) : [start.getDay()];

                for (let i = 0; i < 7; i++) {
                    const day = addDays(first, i);
                    weekDays.includes(day.getDay()) && me.matchesMonth(day) && dates.push(day)
                }
                break
            }

            case 'monthly': {
                const month = new Date(start.getFullYear(), start.getMonth() + offset, 1);

                if (rule.byMonth?.length && !me.matchesMonth(month)) {
                    break
                }

                dates = me.monthDates(month.getFullYear(), month.getMonth(), at);
                break
            }

            case 'yearly': {
                const year = start.getFullYear() + offset;

                if (rule.byYearDay?.length) {
                    const total = (new Date(year + 1, 0, 1) - new Date(year, 0, 1)) / 86400000;

                    rule.byYearDay.map(Number).forEach(n => {
                        const index = n > 0 ? n - 1 : total + n;
                        index >= 0 && index < total && dates.push(at(year, 0, 1 + index))
                    })
                } else if (rule.byWeekNo?.length) {
                    const weekDays = rule.byDay?.length ? rule.byDay.map(d => DAYS[d.day]) : [start.getDay()],
                          weeks    = rule.byWeekNo.map(Number);

                    // ISO weeks of `year` start up to 3 days before and end up to 3 days after it
                    for (let day = at(year - 1, 11, 29); day < at(year + 1, 0, 4); day = addDays(day, 1)) {
                        isoYear(day) === year && weeks.includes(weekOfYear(day)) && weekDays.includes(day.getDay()) && dates.push(day)
                    }
                } else if (rule.byMonth?.length) {
                    rule.byMonth.map(m => parseInt(m) - 1).sort((a, b) => a - b).forEach(month => {
                        dates.push(...me.monthDates(year, month, at))
                    })
                } else if (rule.byDay?.length && !rule.byMonthDay?.length) {
                    // weekdays of the whole year, nthOfPeriod counts in the year
                    dates = me.weekDaysIn(at(year, 0, 1), at(year, 11, 31), at)
                } else {
                    dates = me.monthDates(year, start.getMonth(), at)
                }
                break
            }
        }

        if (dates.length && dates[0].getFullYear() > 9999) {
            return null
        }

        dates.sort((a, b) => a - b);

        // drop duplicates (e.g. byMonthDay and byDay hitting the same day)
        dates = dates.filter((date, i) => i === 0 || dayNumber(date) !== dayNumber(dates[i - 1]));

        if (rule.bySetPosition?.length) {
            const len = dates.length;

            dates = rule.bySetPosition.map(Number)
                .map(pos => dates[pos > 0 ? pos - 1 : len + pos])
                .filter(Boolean)
                .sort((a, b) => a - b)
        }

        return dates
    }

    /**
     * Dates in one month by byMonthDay / byDay, else dtstart's day of the month
     * (skipped in months without that day, RFC 5545)
     * @protected
     */
    monthDates(year, month, at) {
        let me   = this,
            rule = me.rule,
            last = daysInMonth(year, month),
            dates;

        if (rule.byMonthDay?.length) {
            dates = rule.byMonthDay.map(Number)
                .map(n => n > 0 ? n : last + n + 1)
                .filter(n => n >= 1 && n <= last)
                .map(n => at(year, month, n));

            rule.byDay?.length && (dates = dates.filter(d => me.matchesWeekDay(d)))
        } else if (rule.byDay?.length) {
            dates = me.weekDaysIn(at(year, month, 1), at(year, month, last), at)
        } else {
            const day = me.dtstart.getDate();
            dates = day <= last ? [at(year, month, day)] : []
        }

        return dates
    }

    /**
     * The byDay weekdays between first and last (inclusive); nthOfPeriod picks the nth
     * (negative: from the end) of that weekday in the range
     * @protected
     */
    weekDaysIn(first, last, at) {
        const result = [];

        this.rule.byDay.forEach(({day, nthOfPeriod}) => {
            const weekday = DAYS[day],
                  matches = [];

            for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
                d.getDay() === weekday && matches.push(at(d.getFullYear(), d.getMonth(), d.getDate()))
            }

            if (nthOfPeriod) {
                const n    = parseInt(nthOfPeriod),
                      pick = matches[n > 0 ? n - 1 : matches.length + n];

                pick && result.push(pick)
            } else {
                result.push(...matches)
            }
        });

        return result
    }

    matchesMonth(date) {
        const months = this.rule.byMonth;
        return !months?.length || months.map(m => parseInt(m)).includes(date.getMonth() + 1)
    }

    matchesMonthDay(date) {
        const days = this.rule.byMonthDay;

        if (!days?.length) {
            return true
        }

        const last = daysInMonth(date.getFullYear(), date.getMonth());
        return days.map(Number).some(n => (n > 0 ? n : last + n + 1) === date.getDate())
    }

    matchesWeekDay(date) {
        const days = this.rule.byDay;
        return !days?.length || days.some(d => DAYS[d.day] === date.getDay())
    }
}
