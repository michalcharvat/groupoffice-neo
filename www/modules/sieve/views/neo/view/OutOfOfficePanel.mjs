import Container from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import {outOfOfficeItems} from './outOfOffice.mjs';

/**
 * The fields of the "Out of office" card of the account dialog (ExtJS
 * GO.sieve.OutOfOfficePanel); loading and saving: see outOfOffice.mjs
 */
class OutOfOfficePanel extends Container {
    static config = {
        className: 'GO.sieve.OutOfOfficePanel',
        cls      : ['go-sieve-ooo-panel'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.items = outOfOfficeItems()
    }
}

export default Neo.setupClass(OutOfOfficePanel);
