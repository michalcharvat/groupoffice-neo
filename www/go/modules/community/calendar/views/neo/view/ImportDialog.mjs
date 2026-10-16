import Component    from '../../../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import UploadButton from '../../../../../../../views/neo/src/component/UploadButton.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';

const t = translator('community', 'calendar');

/**
 * Import an ICS file into a calendar (GOUI CalendarList.importIcs()): pick the file,
 * optionally import the events as new (ignore UID), then a report.
 *
 *     Neo.create(ImportDialog, {appName, windowId, calendar})
 *
 * Events: imported {}
 */
class ImportDialog extends Dialog {
    static config = {
        className   : 'GO.calendar.ImportDialog',
        cls         : ['go-cal-import-dialog'],
        modal       : true,
        headerConfig: headerTools('close'),
        title       : t('Import ICS file'),
        wrapperStyle: {left: 'calc(50vw - 250px)', top: '20vh', width: '500px'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /** @member {Object|null} calendar */
        calendar: null
    }

    /** @member {File|null} file */
    file = null
    /** @member {Boolean} ignoreUid */
    ignoreUid = false

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module      : Component,
            reference   : 'body',
            cls         : ['go-cal-import-body'],
            flex        : 'none',
            vdom        : {cn: []},
            domListeners: [{click: () => me.toggleUid(), delegate: '.go-cal-import-uid', scope: me}]
        }, {
            module   : Toolbar,
            reference: 'buttons',
            cls      : ['go-dialog-buttons'],
            flex     : 'none',
            items    : [{
                module    : UploadButton,
                multiple  : false,
                buttonText: t('Choose file'),
                listeners : {files: ({files}) => {me.file = files[0]; me.renderBody()}}
            }, '->', {
                module   : Button,
                ui       : 'primary',
                reference: 'startButton',
                text     : t('Start'),
                disabled : true,
                handler  : () => me.start()
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.renderBody()
    }

    toggleUid() {
        this.ignoreUid = !this.ignoreUid;
        this.renderBody()
    }

    renderBody(report = null) {
        let me   = this,
            body = me.getReference('body');

        body.vdom.cn = report ? report : [
            {tag: 'p', text: t('Calendar') + ': ' + (me.calendar?.name || '')},
            {tag: 'p', text: me.file ? `${me.file.name} (${Math.round(me.file.size / 1024)} kB)` : t('No file selected')},
            {tag: 'label', cls: ['go-cal-import-uid'], cn: [
                {tag: 'span', cls: ['go-check', me.ignoreUid ? 'go-checked' : null].filter(Boolean)},
                {vtype: 'text', text: ' ' + t('Import events as new (Ignore UID)')}
            ]}
        ];

        body.update();
        me.getReference('startButton').disabled = !me.file || !!report
    }

    async start() {
        let me = this;

        me.isLoading = t('Importing...');

        try {
            const blob = await client.upload(me.file),
                  r    = await client.call('CalendarEvent/import', {blobIds: [blob.blobId || blob.id], calendarId: me.calendar.id, ignoreUid: me.ignoreUid}),
                  rows = [];

            r.saved && rows.push({tag: 'p', cls: ['green'], text: t('Imported %s events successful.').replace('%s', r.saved)});
            r.skipped > 0 && rows.push({tag: 'p', cls: ['orange'], text: t('Skipped %s event(s) because UID already existed.').replace('%s', r.skipped)});

            if (r.failed > 0) {
                rows.push({tag: 'p', cls: ['red'], text: t('%s events were not imported.').replace('%s', r.failed)});
                rows.push({tag: 'ul', html: (r.failureReasons || []).map(reason => `<li>${escapeHtml(reason)}</li>`).join('')})
            }

            me.renderBody(rows.length ? rows : [{tag: 'p', text: t('Done')}]);
            me.fire('imported', {})
        } catch (e) {
            me.renderBody([{tag: 'p', cls: ['red'], text: t('ICS file could not be imported, error: ') + (e.message || e)}])
        } finally {
            me.isDestroyed || (me.isLoading = false)
        }
    }
}

export default Neo.setupClass(ImportDialog);
