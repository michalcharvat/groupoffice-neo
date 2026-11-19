import FormContainer from '../../../../../views/neo/node_modules/neo.mjs/src/form/Container.mjs';
import TextField     from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../views/neo/src/button/Button.mjs';
import BoolCheckBox  from '../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import ActionTable   from '../../../../../views/neo/src/list/ActionTable.mjs';
import {notifyError} from '../../../../../views/neo/src/Notify.mjs';
import {t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';
import Dialog        from '../../../../../views/neo/src/view/Dialog.mjs';

const t = translator('legacy', 'summary');

/**
 * The user's RSS feeds (GO.summary.WebFeedsGrid): title, URL and "Summary" (show the item
 * text) per feed, edited in the form below the list. Save sends the whole list to
 * summary/rssFeed/saveFeeds, which deletes the feeds left out. Module managers can add a
 * new feed for all users.
 *
 * Fires `saved`.
 */
class FeedsDialog extends Dialog {
    static config = {
        className: 'GO.summary.FeedsDialog',
        cls      : ['go-feeds-dialog'],
        modal    : true,
        resizable: true,
        title    : t('Rss Feeds'),
        wrapperStyle: {
            height   : '520px',
            left     : 'calc(50vw - 350px)',
            maxHeight: '90vh',
            maxWidth : '100vw',
            top      : 'max(5vh, calc(50vh - 260px))',
            width    : '700px'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    /**
     * Feeds being edited: {id?, title, url, summary, allUsers?, key}
     * @member {Object[]} feeds=[]
     */
    feeds = []

    /**
     * Key of the feed in the form, null: a new one
     * @member {Number|null} editKey=null
     */
    editKey = null

    construct(config) {
        super.construct(config);

        let me        = this,
            mayManage = client.isAdmin || !!client.session?.capabilities?.['go:legacy:summary']?.mayManage;

        me.items = [{
            // a scrolling box: the table itself would stretch its rows over the height
            ntype: 'container',
            cls  : ['go-scroll'],
            flex : 1,
            items: [{
                module   : ActionTable,
                reference: 'table',
                flex     : 'none',
                keyProperty: 'key',
                columns  : [
                    {text: t('Title'), field: 'title', flex: true},
                    {text: 'URL', field: 'url', flex: true},
                    {text: t('Summary'), field: 'summary', type: 'check'}
                ],
                actions  : [
                    {action: 'edit', icon: 'edit', tooltip: coreT('Edit')},
                    {action: 'delete', icon: 'delete', tooltip: coreT('Delete')}
                ]
            }]
        }, {
            module   : FormContainer,
            reference: 'form',
            cls      : ['go-feeds-form'],
            flex     : 'none',
            items    : [{
                module       : TextField,
                name         : 'title',
                labelText    : t('Title'),
                labelPosition: 'inline'
            }, {
                module       : TextField,
                name         : 'url',
                labelText    : 'URL',
                labelPosition: 'inline',
                inputType    : 'url'
            }, {
                module    : BoolCheckBox,
                name      : 'summary',
                valueLabel: t('Summary')
            }, {
                module    : BoolCheckBox,
                name      : 'allUsers',
                reference : 'allUsers',
                valueLabel: t('All users'),
                hidden    : !mayManage
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : [{
                module   : Button,
                reference: 'applyButton',
                icon     : 'add',
                text     : coreT('Add'),
                handler  : () => me.applyForm()
            }, '->', {
                module : Button,
                text   : coreT('Cancel'),
                handler: () => me.close()
            }, {
                module : Button,
                ui     : 'primary',
                text   : coreT('Save'),
                handler: () => me.save()
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            table = me.getReference('table');

        table.on('action', ({action, record}) => action === 'edit' ? me.editFeed(record) : me.removeFeed(record));
        table.on('rowDoubleClick', ({record}) => me.editFeed(record));
        table.on('check', ({record, checked}) => {
            record.summary = checked;
            me.showFeeds()
        });

        me.load()
    }

    async load() {
        let me = this;

        try {
            const {results = []} = await client.legacy('summary/rssFeed/store');

            me.feeds = results.map((feed, i) => ({id: feed.id, title: feed.title, url: feed.url, summary: !!Number(feed.summary), key: i + 1}));
            me.isDestroyed || me.showFeeds()
        } catch (e) {
            notifyError(me, e)
        }
    }

    showFeeds() {
        this.getReference('table').records = [...this.feeds]
    }

    editFeed(feed) {
        let me = this;

        me.editKey = feed.key;
        me.getReference('form').setValues({title: feed.title || '', url: feed.url || '', summary: !!feed.summary, allUsers: false});
        me.getReference('allUsers').disabled = true;

        const button = me.getReference('applyButton');
        button.text = coreT('Apply');
        button.icon = 'check'
    }

    removeFeed(feed) {
        let me = this;

        me.feeds = me.feeds.filter(f => f.key !== feed.key);
        me.editKey === feed.key && me.resetForm();
        me.showFeeds()
    }

    resetForm() {
        let me     = this,
            button = me.getReference('applyButton');

        me.editKey = null;
        me.getReference('form').reset();
        me.getReference('allUsers').disabled = false;
        button.text = coreT('Add');
        button.icon = 'add'
    }

    /**
     * Adds the form's feed to the list, or updates the one being edited
     * @returns {Promise<Boolean>} false when the form is invalid
     */
    async applyForm() {
        let me   = this,
            form = me.getReference('form');

        const values = await form.getSubmitValues();

        // no "required" on the field: it would show its error again after every reset
        if (!String(values.url || '').trim()) {
            return false
        }

        const feed = {
            title  : String(values.title || '').trim() || String(values.url).trim(),
            url    : String(values.url).trim(),
            summary: !!values.summary
        };

        if (me.editKey !== null) {
            Object.assign(me.feeds.find(f => f.key === me.editKey) || {}, feed)
        } else {
            me.feeds.push({...feed, allUsers: !!values.allUsers, key: Math.max(0, ...me.feeds.map(f => f.key)) + 1})
        }

        me.resetForm();
        me.showFeeds();
        return true
    }

    async save() {
        let me = this;

        // a filled in form that wasn't added yet
        const values = await me.getReference('form').getSubmitValues();

        if (String(values.url || '').trim() && !await me.applyForm()) {
            return
        }

        try {
            await client.legacy('summary/rssFeed/saveFeeds', {
                feeds: JSON.stringify(me.feeds.map(({id, title, url, summary, allUsers}) => ({
                    ...id ? {id} : {},
                    title,
                    url,
                    summary: summary ? 1 : 0,
                    ...allUsers ? {allUsers: true} : {}
                })))
            });

            me.fire('saved');
            me.close()
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(FeedsDialog);
