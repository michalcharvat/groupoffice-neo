import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';
import {showComposer} from '../Mail.mjs';

/**
 * GOUI DescriptionList: key/value lines (<dl>) for detail panels.
 *
 * records: [[term, value, …]], a term with one or more values. A value is
 * - a string or number: shown as text (escaped)
 * - {html: '…'}: trusted HTML (escape user data yourself)
 * - {vdom: {…}}: a vdom node
 * - {email: 'a@b.c', name, …}: an e-mail address; a click opens the composer with it
 *   (src/Mail.mjs showComposer(), mailto: without the e-mail module). Other keys go to
 *   showComposer(), e.g. entity + entityId for the template's tags.
 * - a function (record) => one of the above
 * Empty values (null, undefined, '') leave out their line, like a GO detail view does.
 *
 *     {module: DescriptionList, records: [
 *         [t('Name'), note.name],
 *         [t('E-mail'), {email: contact.email, name: contact.name}]
 *     ]}
 */
class DescriptionList extends Component {
    static config = {
        className: 'GO.component.DescriptionList',
        ntype    : 'go-dl',
        baseCls  : ['go-dl'],
        /**
         * @member {Array[]} records_=[]
         */
        records_: [],
        _vdom   : {tag: 'dl', cn: []}
    }

    /**
     * The {email} values of the records, by data-email index
     * @member {Object[]} emails=[]
     */
    emails = []

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({click: me.onEmailClick, delegate: '.go-dl-email', scope: me})
    }

    afterSetRecords() {
        let me = this,
            cn = [];

        me.emails = [];

        (me.records || []).forEach(([term, ...values]) => {
            const dds = values.map(value => DescriptionList.toNode(value, me.emails)).filter(Boolean);

            if (dds.length) {
                cn.push({tag: 'dt', text: String(term ?? '')}, ...dds)
            }
        });

        me.vdom.cn = cn;
        me.update()
    }

    /**
     * @param {Object} data
     * @protected
     */
    onEmailClick(data) {
        let me   = this,
            node = (data.path || []).find(n => n.cls?.includes('go-dl-email')),
            cfg  = node && me.emails[Number(node.data?.email)];

        cfg && showComposer({...cfg, to: cfg.email, appName: me.appName, windowId: me.windowId})
    }

    /**
     * @param {*} value
     * @param {Object[]} [emails] collects the {email} values
     * @returns {Object|null} dd node
     * @protected
     */
    static toNode(value, emails = []) {
        typeof value === 'function' && (value = value());

        if (value === null || value === undefined || value === '') {
            return null
        }

        if (typeof value === 'object') {
            if ('email' in value) {
                if (!value.email) {
                    return null
                }

                emails.push(value);

                // no href: a mailto: link would leave the composer out
                return {tag: 'dd', cn: [{
                    tag     : 'a',
                    cls     : ['go-dl-email'],
                    role    : 'button',
                    tabIndex: 0,
                    data    : {email: String(emails.length - 1)},
                    text    : String(value.email)
                }]}
            }

            if ('html' in value) {
                return value.html ? {tag: 'dd', html: value.html} : null
            }

            if (value.vdom) {
                return {tag: 'dd', cn: [value.vdom]}
            }
        }

        return {tag: 'dd', text: String(value)}
    }
}

export default Neo.setupClass(DescriptionList);
