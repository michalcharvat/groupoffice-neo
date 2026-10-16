import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';

/**
 * GOUI DescriptionList: key/value lines (<dl>) for detail panels.
 *
 * records: [[term, value, …]], a term with one or more values. A value is
 * - a string or number: shown as text (escaped)
 * - {html: '…'}: trusted HTML (escape user data yourself)
 * - {vdom: {…}}: a vdom node
 * - a function (record) => one of the above
 * Empty values (null, undefined, '') leave out their line, like a GO detail view does.
 *
 *     {module: DescriptionList, records: [
 *         [t('Name'), note.name],
 *         [t('E-mail'), {html: `<a href="mailto:${escapeHtml(mail)}">${escapeHtml(mail)}</a>`}]
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

    afterSetRecords() {
        let me = this,
            cn = [];

        (me.records || []).forEach(([term, ...values]) => {
            const dds = values.map(value => DescriptionList.toNode(value)).filter(Boolean);

            if (dds.length) {
                cn.push({tag: 'dt', text: String(term ?? '')}, ...dds)
            }
        });

        me.vdom.cn = cn;
        me.update()
    }

    /**
     * @param {*} value
     * @returns {Object|null} dd node
     * @protected
     */
    static toNode(value) {
        typeof value === 'function' && (value = value());

        if (value === null || value === undefined || value === '') {
            return null
        }

        if (typeof value === 'object') {
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
