import PeriodPicker from './PeriodPicker.mjs';
import {formatDate} from '../Format.mjs';

/**
 * GOUI MonthPicker: the twelve months of a year; `select` fires with {date}, the first day
 * of the picked month.
 *
 *     {module: MonthPicker, value: new Date(), listeners: {select: ({date}) => ...}}
 */
class MonthPicker extends PeriodPicker {
    static config = {
        className: 'GO.component.MonthPicker',
        baseCls  : ['go-periodpicker', 'go-monthpicker']
    }

    periodStart(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1)
    }

    periods(year) {
        return Array.from({length: 12}, (_, month) => {
            const date = new Date(year, month, 1),
                  name = formatDate(date, 'F');

            return {date, html: name.charAt(0).toUpperCase() + name.slice(1)}
        })
    }
}

export default Neo.setupClass(MonthPicker);
