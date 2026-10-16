import Component    from '../../../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import {formatUserDateTime} from '../../../../../../../views/neo/src/Format.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';
import {parseDate}  from '../util/date.mjs';

const t = translator('community', 'calendar');

/**
 * The exceptions of a recurring event (GOUI EventWindow.openExceptionsWindow()): changed
 * and removed occurrences, each with a button that undoes it.
 *
 *     Neo.create(ExceptionsDialog, {appName, windowId, item, overrides})
 */
class ExceptionsDialog extends Dialog {
    static config = {
        className   : 'GO.calendar.ExceptionsDialog',
        cls         : ['go-cal-exceptions-dialog'],
        modal       : true,
        headerConfig: headerTools('close'),
        title       : t('Exceptions'),
        wrapperStyle: {height: '400px', left: 'calc(50vw - 200px)', top: '20vh', width: '400px'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /** @member {CalendarItem|null} item */
        item     : null,
        /** @member {Object} overrides recurrenceId → override */
        overrides: {}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : Component,
            reference: 'list',
            cls      : ['go-cal-exceptions'],
            flex     : 1,
            vdom     : {tag: 'ul', cn: []},
            domListeners: [{click: me.onRemove, delegate: '.go-cal-exception-remove', scope: me}]
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.renderList()
    }

    renderList() {
        const list = this.getReference('list');

        list.vdom.cn = Object.entries(this.overrides).map(([recurrenceId, o]) => ({tag: 'li', cn: [
            {tag: 'span', cn: [
                {vtype: 'text', text: formatUserDateTime(parseDate(recurrenceId))},
                {tag: 'small', text: t(o?.excluded ? 'Excluded' : 'Override')}
            ]},
            {tag: 'button', type: 'button', cls: ['go-icon', 'go-cal-exception-remove'], 'data-rid': recurrenceId, title: t('Delete'), text: 'delete'}
        ]}));

        list.update()
    }

    async onRemove(data) {
        let me  = this,
            rid = data.path.find(n => n.data?.rid)?.data.rid;

        if (!rid) {
            return
        }

        try {
            await me.item.undoException(rid);
            const overrides = {...me.overrides};
            delete overrides[rid];
            me.overrides = overrides;
            me.isDestroyed || me.renderList()
        } catch (e) {
            // CalendarItem showed it
        }
    }
}

export default Neo.setupClass(ExceptionsDialog);
