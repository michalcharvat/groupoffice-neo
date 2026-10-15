import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';

/**
 * GOUI tabletitle(): title over a "<count> <entity>" line, in a grid toolbar
 */
class TableTitle extends Component {
    static config = {
        className: 'GO.component.TableTitle',
        baseCls  : ['go-table-title'],
        /**
         * @member {String} subtitle_=''
         */
        subtitle_: '',
        /**
         * @member {String} title_=''
         */
        title_: '',
        _vdom: {cn: [
            {tag: 'h4', text: ''},
            {tag: 'small', text: ''}
        ]}
    }

    afterSetSubtitle(value) {
        this.vdom.cn[1].text = value;
        this.update()
    }

    afterSetTitle(value) {
        this.vdom.cn[0].text = value;
        this.update()
    }
}

export default Neo.setupClass(TableTitle);
