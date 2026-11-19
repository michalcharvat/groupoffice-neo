import FormContainer from '../../../../../views/neo/node_modules/neo.mjs/src/form/Container.mjs';
import TextField     from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../views/neo/src/button/Button.mjs';
import {userDateToYmd, parseYmd} from '../../../../../views/neo/src/DateUtil.mjs';
import DateField     from '../../../../../views/neo/src/form/field/DateField.mjs';
import HtmlField     from '../../../../../views/neo/src/form/field/HtmlField.mjs';
import {formatDate, userFormat} from '../../../../../views/neo/src/Format.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError} from '../../../../../views/neo/src/Notify.mjs';
import {t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';
import Dialog        from '../../../../../views/neo/src/view/Dialog.mjs';

const t = translator('legacy', 'summary');

/**
 * One announcement (GO.summary.AnnouncementDialog): "Show until", title and content,
 * saved with summary/announcement/submit. Who may read it follows the announcement's ACL,
 * which the classic UI edits.
 *
 * Fires `saved` after a save.
 */
class AnnouncementDialog extends Dialog {
    static config = {
        className: 'GO.summary.AnnouncementDialog',
        cls      : ['go-announcement-dialog'],
        modal    : true,
        resizable: true,
        title    : t('Announcement'),
        wrapperStyle: {
            height   : '600px',
            left     : 'calc(50vw - 350px)',
            maxHeight: '90vh',
            maxWidth : '100vw',
            top      : 'max(5vh, calc(50vh - 300px))',
            width    : '700px'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * Announcement id, null for a new one
         * @member {Number|null} announcementId=null
         */
        announcementId: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : FormContainer,
            reference: 'form',
            cls      : ['go-announcement-form'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : [{
                module       : DateField,
                name         : 'due_time',
                labelText    : t('Show until'),
                labelPosition: 'inline',
                flex         : 'none'
            }, {
                module       : TextField,
                name         : 'title',
                labelText    : t('Title'),
                labelPosition: 'inline',
                required     : true,
                flex         : 'none'
            }, {
                module   : HtmlField,
                name     : 'content',
                labelText: coreT('Content'),
                flex     : 1
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                ui     : 'primary',
                text   : coreT('Save'),
                handler: () => me.save()
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.announcementId && this.load()
    }

    async load() {
        let me = this;

        try {
            const {data = {}} = await client.legacy('summary/announcement/load', {id: me.announcementId});

            me.isDestroyed || me.getReference('form').setValues({
                title   : data.title || '',
                content : data.content || '',
                // the legacy controller sends and takes dates in the user's date format
                due_time: userDateToYmd(data.due_time, userFormat.dateFormat) || null
            })
        } catch (e) {
            notifyError(me, e)
        }
    }

    async save() {
        let me   = this,
            form = me.getReference('form');

        if (!await form.validate()) {
            return
        }

        const values = await form.getSubmitValues(),
              due    = values.due_time ? parseYmd(values.due_time) : null;

        try {
            await client.legacy('summary/announcement/submit', {
                ...me.announcementId ? {id: me.announcementId} : {},
                title   : values.title || '',
                content : values.content || '',
                due_time: due ? formatDate(due, userFormat.dateFormat) : ''
            });

            me.fire('saved');
            me.close()
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(AnnouncementDialog);
