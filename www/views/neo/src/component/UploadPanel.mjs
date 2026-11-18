import Component  from '../../node_modules/neo.mjs/src/component/Base.mjs';
import {fileSize} from '../Format.mjs';
import {t}        from '../Translate.mjs';

/**
 * Progress of the running uploads of one window (the ExtJS "Uploads" notification): total
 * percentage, "{finished} of {total} files", a row per file with its progress and an abort
 * button, and "Abort all". GO.jmap.Uploader creates it in the bottom right corner when an
 * upload takes a moment and closes it when all are done; it calls refresh() on progress.
 */
class UploadPanel extends Component {
    static config = {
        className: 'GO.component.UploadPanel',
        baseCls  : ['go-upload-panel'],
        /**
         * The GO.jmap.Uploader whose items this panel shows
         * @member {Object|null} uploader=null
         */
        uploader: null,
        _vdom:
        {role: 'status', 'aria-live': 'polite', cn: [
            {cls: ['go-upload-panel-header'], cn: [
                {tag: 'span', cls: ['go-icon'], text: 'upload'},
                {cls: ['go-upload-panel-text'], cn: [
                    {tag: 'span', cls: ['go-upload-panel-title']},
                    {tag: 'span', cls: ['go-upload-panel-count']}
                ]},
                {tag: 'button', type: 'button', cls: ['go-upload-panel-abort-all']}
            ]},
            {tag: 'progress', cls: ['go-upload-panel-progress'], max: 100, value: 0},
            {cls: ['go-upload-panel-list'], cn: []}
        ]}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.vdom.cn[0].cn[2].text = t('Abort all');

        me.addDomListeners([
            {click: me.onAbortAllClick, delegate: '.go-upload-panel-abort-all', scope: me},
            {click: me.onAbortClick,    delegate: '.go-upload-panel-abort',     scope: me}
        ]);

        me.refresh()
    }

    /**
     * Renders the uploader's items of this window
     */
    refresh() {
        let me      = this,
            items   = me.uploader?.getItems(me.windowId) || [],
            shown   = items.filter(i => i.status !== 'aborted'),
            running = shown.some(i => i.status === 'queued' || i.status === 'uploading'),
            total   = shown.reduce((sum, i) => sum + i.size, 0),
            loaded  = shown.reduce((sum, i) => sum + Math.min(i.loaded, i.size), 0),
            percent = total ? Math.floor(loaded / total * 100) : (running ? 0 : 100),
            [header, progress, list] = me.vdom.cn,
            [, text, abortAll] = header.cn;

        text.cn[0].text = t('Uploads') + ' • ' + percent + '%';
        text.cn[1].text = t('{finished} of {total}')
            .replace('{finished}', String(shown.filter(i => i.status === 'done' || i.status === 'failed').length))
            .replace('{total}', String(shown.length)) + ' ' + t('files');

        abortAll.removeDom = !running;
        progress.value     = percent;

        list.cn = shown.map(item => {
            const active = item.status === 'queued' || item.status === 'uploading';

            return {
                cls: ['go-upload-panel-item', 'go-upload-panel-' + item.status],
                cn : [
                    {tag: 'span', cls: ['go-upload-panel-name'], text: item.name, title: item.name},
                    {tag: 'span', cls: ['go-upload-panel-size'], text: UploadPanel.itemText(item)},
                    {tag: 'button', type: 'button', cls: ['go-upload-panel-abort'], title: t('Abort'),
                        'aria-label': t('Abort') + ' ' + item.name, 'data-id': String(item.id), removeDom: !active,
                        cn: [{tag: 'span', cls: ['go-icon'], text: 'close'}]}
                ]
            }
        });

        me.update()
    }

    /**
     * @param {Object} item an Uploader item
     * @returns {String} e.g. "1.20 MB / 4.00 MB", "Failed"
     */
    static itemText(item) {
        switch (item.status) {
            case 'failed':
                return t('Failed');
            case 'done':
                return fileSize(item.size);
            case 'uploading':
                return (fileSize(item.loaded) || '0 B') + ' / ' + fileSize(item.size);
            default:
                return fileSize(item.size)
        }
    }

    onAbortAllClick() {
        this.uploader?.abortAll(this.windowId)
    }

    onAbortClick(data) {
        const id = Number(data.path?.find(n => n.data?.id !== undefined)?.data.id);
        id && this.uploader?.abort(id)
    }
}

export default Neo.setupClass(UploadPanel);
