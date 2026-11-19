import PeriodPicker from './PeriodPicker.mjs';
import {addDays, weekOfYear, weekStart} from '../DateUtil.mjs';
import {escapeHtml, formatDate} from '../Format.mjs';
import {t} from '../Translate.mjs';

/**
 * GOUI WeekPicker: the ISO weeks of a year (52 or 53, starting on Monday); `select` fires
 * with {date}, the Monday of the picked week.
 *
 *     {module: WeekPicker, value: new Date(), listeners: {select: ({date}) => ...}}
 */
class WeekPicker extends PeriodPicker {
    static config = {
        className: 'GO.component.WeekPicker',
        baseCls  : ['go-periodpicker', 'go-weekpicker']
    }

    periodStart(date) {
        return weekStart(date)
    }

    /**
     * The year of a week is the year of its Thursday (ISO year)
     */
    periodYear(start) {
        return addDays(start, 3).getFullYear()
    }

    periods(year) {
        const periods = [];

        // week 1 holds January 4th
        for (let date = weekStart(new Date(year, 0, 4)); addDays(date, 3).getFullYear() === year; date = addDays(date, 7)) {
            const week = weekOfYear(date);

            periods.push({
                date,
                title: t('Week') + ' ' + week,
                html : `${week} <small>${escapeHtml(formatDate(date, 'j M'))}</small>`
            })
        }

        return periods
    }
}

export default Neo.setupClass(WeekPicker);
