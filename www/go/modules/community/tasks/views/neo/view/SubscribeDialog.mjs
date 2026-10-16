import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import SearchButton from '../../../../../../../views/neo/src/button/SearchButton.mjs';
import JmapStore    from '../../../../../../../views/neo/src/data/JmapStore.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import TextList     from '../../../../../../../views/neo/src/list/TextList.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import TaskListModel from '../model/TaskList.mjs';

const t = translator('community', 'tasks');

/**
 * Lists the user is not subscribed to, each with a "Subscribe" button
 */
class SubscribeList extends TextList {
    static config = {
        className    : 'GO.tasks.SubscribeList',
        baseCls      : ['go-tasks-subscribe-list', 'neo-list'],
        displayField : 'name',
        useInternalId: false
    }

    createItemContent(record) {
        return [
            {tag: 'span', cls: ['go-tasks-subscribe-name'], html: escapeHtml(record.name)},
            {tag: 'button', type: 'button', cls: ['go-tasks-subscribe-button'], text: t('Subscribe')}
        ]
    }

    onClick(data) {
        const button = data.path.find(node => node.cls?.includes('go-tasks-subscribe-button')),
              item   = button && data.path.find(node => node.cls?.includes(this.itemCls));

        if (item) {
            this.fire('subscribe', {id: String(this.getItemRecordId(item.id))});
            return
        }

        super.onClick(data)
    }
}

Neo.setupClass(SubscribeList);

/**
 * GOUI SubscribeWindow: subscribe to task lists the user may read
 *
 * Events: subscribed {id}
 */
class SubscribeDialog extends Dialog {
    static config = {
        className   : 'GO.tasks.SubscribeDialog',
        cls         : ['go-tasks-subscribe-dialog'],
        modal       : true,
        resizable   : true,
        headerConfig: headerTools('close'),
        title       : t('Subscribe to task list'),
        wrapperStyle: {height: '70vh', left: 'calc(50vw - 200px)', top: '15vh', width: '400px'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-border-bottom'],
            flex  : 'none',
            items : ['->', {
                module   : SearchButton,
                listeners: {search: ({text}) => me.getReference('list').store.setFilter({text: text || undefined}).catch(() => {})}
            }]
        }, {
            module   : SubscribeList,
            reference: 'list',
            flex     : 1,
            listeners: {subscribe: ({id}) => me.subscribe(id)},
            store    : {
                module    : JmapStore,
                entity    : 'TaskList',
                model     : TaskListModel,
                jmapFilter: {role: 'list', isSubscribed: false},
                jmapSort  : [{property: 'name', isAscending: true}],
                properties: ['id', 'name']
            }
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.getReference('list').store.load().catch(e => notifyError(this, e))
    }

    async subscribe(id) {
        let me = this;

        try {
            await client.set('TaskList', {update: {[id]: {isSubscribed: true}}});

            // isSubscribed is a per-user property: no TaskList push, reload by hand
            if (!me.isDestroyed) {
                me.getReference('list').store.load().catch(e => notifyError(me, e));
                me.fire('subscribed', {id})
            }
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(SubscribeDialog);
