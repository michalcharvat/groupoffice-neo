import NeoTimelineColumn from '../../node_modules/neo.mjs/src/timeline/Column.mjs';

/**
 * @summary Neo's timeline column with GO.scheduler.Scheduler's per-row background bands, the locale passed on to
 * the header and the scroll reported to the scheduler (growing range).
 * @class GO.scheduler.TimelineColumn
 * @extends Neo.timeline.Column
 */
class TimelineColumn extends NeoTimelineColumn {
    static config = {
        className: 'GO.scheduler.TimelineColumn'
    }

    /** Stops observing the body width */
    #widthCleanup = null

    /**
     * @summary Hands the column's locale to the header too: neo's header keeps Neo.config.locale.
     * @param {Neo.timeline.TimeAxisHeader|null} headerInstance
     */
    bindGridContext(headerInstance=null) {
        super.bindGridContext(headerInstance);

        const me     = this,
              header = me.headerComponent,
              body   = me.parent?.body;

        header && header.locale !== me.locale && (header.locale = me.locale);

        // a measured or resized view can show the whole range without a scrollbar that would grow it
        me.#widthCleanup?.();
        me.#widthCleanup = body ? me.observeConfig(body, 'containerWidth', () => me.parent?.onTimelineScroll?.(me)) : null
    }

    /**
     * @summary Stops observing the body width.
     * @param {...*} args
     */
    destroy(...args) {
        this.#widthCleanup?.();
        this.#widthCleanup = null;
        super.destroy(...args)
    }

    /**
     * @summary Lets the scheduler grow its range when the view comes near an edge.
     * @param {Number} value
     * @param {Number} oldValue
     */
    afterSetScrollLeft(value, oldValue) {
        super.afterSetScrollLeft(value, oldValue);
        oldValue !== undefined && this.isConstructed && this.parent?.onTimelineScroll?.(this)
    }

    /**
     * @summary Adds the row's background bands behind its bars, like neo's non-working bands.
     * @param {Object} data
     * @returns {Object}
     */
    cellRenderer(data) {
        const cell  = super.cellRenderer(data),
              track = cell.cn[0],
              bands = data.record && this.timeAxis ? this.parent?.getRowBackgrounds?.(this.getResourceId(data.record)) : null;

        if (!bands?.length) {
            return cell
        }

        const {timeAxis} = this,
              {visibleStart, visibleEnd} = this.getProjectedDateRange();

        bands.forEach((band, index) => {
            const start = Math.max(+band.startDate, +visibleStart),
                  end   = Math.min(+band.endDate, +visibleEnd);

            if (end <= start) {
                return
            }

            const left = timeAxis.dateToOffset(start);

            // first in the track: bars paint above
            track.cn.unshift({
                id           : `${track.id}__bg-${index}`,
                cls          : ['go-scheduler-background', ...band.cls],
                'aria-hidden': 'true',
                style        : {
                    height       : '100%',
                    left         : `${left}px`,
                    // a click falls through to the track: slotClick
                    pointerEvents: 'none',
                    position     : 'absolute',
                    top          : '0px',
                    // a 30-minute crew change line stays visible on a year scale
                    width        : `${Math.max(2, timeAxis.dateToOffset(end) - left)}px`
                }
            })
        });

        return cell
    }
}

export default Neo.setupClass(TimelineColumn);
