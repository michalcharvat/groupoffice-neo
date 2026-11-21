/**
 * Sets the records of a plain neo Store and makes sure 'load' fires (at least once). Setting data
 * fires it through the collection's mutate event, but not when an empty result replaces an empty
 * store (no mutation) or the records equal the old ones (an equal array skips afterSetData).
 * Listeners, like the empty state of GO.grid.Grid, still need it. Without that load `isLoading` is
 * set back to its value before: neo's beforeSetData() sets it and only afterSetData() clears it,
 * so a skipped afterSetData left the store "loading" (no loadMore()).
 *
 *     me.totalCount = total;
 *     me.isLoaded   = true;
 *     setDataAndFireLoad(me, records);
 *
 * @param {Neo.data.Store} store
 * @param {Object[]} records
 * @param {Object} [event={}] more properties of a load event fired here (e.g. total)
 */
export function setDataAndFireLoad(store, records, event={}) {
    let fired   = false,
        loading = store.isLoading,
        onLoad  = () => {fired = true};

    store.on('load', onLoad);

    try {
        store.data = records
    } finally {
        store.un('load', onLoad)
    }

    if (!fired) {
        // before the event: a listener may start loadMore(), which sets isLoading itself
        store.isLoading = loading;
        store.fire('load', {items: store.items, ...event})
    }
}
