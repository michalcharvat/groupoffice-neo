import Component     from '../../../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import {parseYmd}    from '../../../../../../../views/neo/src/DateUtil.mjs';
import {avatarHtml, escapeHtml, formatDate, userFormat} from '../../../../../../../views/neo/src/Format.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {t as coreT, translator} from '../../../../../../../views/neo/src/Translate.mjs';
import EntitySelectDialog from '../../../../../../../views/neo/src/view/EntitySelectDialog.mjs';

const t = translator('community', 'addressbook');

/**
 * Start page portlet "Upcoming birthdays" (views/extjs3/BirthdaysPortlet.js): contacts with
 * a birthday in the next 30 days, in the address books chosen with "Settings"
 * (User.birthdayPortletAddressBooks, all readable ones when none), soonest first, with the
 * age they turn. A click opens the contact.
 */
class BirthdaysPortlet extends Component {
    static config = {
        className: 'GO.addressbook.BirthdaysPortlet',
        cls      : ['go-portlet-list', 'go-birthdays-portlet'],
        html     : ''
    }

    /**
     * @member {Object[]} records=[]
     */
    records = []

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.addDomListeners([{click: me.onClick, scope: me}]);
        me.refresh()
    }

    async refresh() {
        let me = this;

        try {
            const [user] = await client.get('User', [client.user.id], ['id', 'birthdayPortletAddressBooks']),
                  books  = user?.birthdayPortletAddressBooks || [],
                  filter = {birthday: 'now..30 days', ...books.length ? {addressBookId: books} : {}};

            const {list} = await client.queryGet('Contact', {
                filter,
                limit     : 100,
                properties: ['id', 'name', 'dates', 'photoBlobId', 'addressBookId']
            });

            const bookIds = [...new Set(list.map(c => c.addressBookId))],
                  names   = bookIds.length ? new Map((await client.get('AddressBook', bookIds, ['id', 'name'])).map(b => [String(b.id), b.name])) : new Map();

            if (me.isDestroyed) {
                return
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            me.records = list.map(contact => {
                const birthday = parseYmd(contact.dates?.find(d => d.type === 'birthday')?.date);

                if (!birthday) {
                    return null
                }

                // the next birthday: this year, or next year when it has passed
                let next = new Date(today.getFullYear(), birthday.getMonth(), birthday.getDate());
                next < today && (next = new Date(today.getFullYear() + 1, birthday.getMonth(), birthday.getDate()));

                return {...contact, birthday, next, age: next.getFullYear() - birthday.getFullYear(), book: names.get(String(contact.addressBookId)) || ''}
            }).filter(Boolean).sort((a, b) => a.next - b.next);

            me.html = me.records.length ? me.records.map((c, i) => `<div class="go-portlet-row" data-index="${i}">
                    ${avatarHtml(c.name)}
                    <span class="go-portlet-text"><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.book)}</small></span>
                    <span class="go-portlet-meta">${escapeHtml(formatDate(c.birthday, userFormat.dateFormat))}<br>${escapeHtml(coreT('Age') + ': ' + c.age)}</span>
                </div>`).join('')
                : `<div class="go-empty"><i class="go-icon">cake</i><br>${escapeHtml(coreT('No items to display'))}</div>`
        } catch (e) {
            me.isDestroyed || (me.html = `<div class="go-empty">${escapeHtml(e.message)}</div>`)
        }
    }

    onClick({path}) {
        let me     = this,
            index  = path.find(n => n.cls?.includes('go-portlet-row'))?.data?.index,
            record = index !== undefined && me.records[Number(index)];

        record && Neo.Main.setRoute({value: 'addressbook/contact/' + record.id, windowId: me.windowId})
    }

    /**
     * The address books of the portlet: User.birthdayPortletAddressBooks
     */
    async openSettings() {
        let me = this;

        try {
            const [user] = await client.get('User', [client.user.id], ['id', 'birthdayPortletAddressBooks']);

            const ids = await EntitySelectDialog.ask({
                appName : me.appName,
                windowId: me.windowId,
                title   : t('Address books'),
                entity  : 'AddressBook',
                value   : user?.birthdayPortletAddressBooks || []
            });

            if (ids) {
                await client.set('User', {update: {[client.user.id]: {birthdayPortletAddressBooks: ids.map(Number)}}});
                me.refresh()
            }
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(BirthdaysPortlet);
