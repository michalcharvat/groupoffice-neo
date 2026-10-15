import Container from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import TextField from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar   from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button    from '../../button/Button.mjs';
import AddLinkButton    from '../../link/AddLinkButton.mjs';
import LinkBrowseButton from '../../link/LinkBrowseButton.mjs';
import LinkDetail       from '../../link/LinkDetail.mjs';

/**
 * Links of any entity: type the entity and its id, "Show" loads the links card;
 * the buttons add links and open the link browser.
 */
class LinksDemo extends Container {
    static config = {
        className: 'GO.dev.demo.Links',
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {padding: '16px', gap: '12px', overflow: 'auto'},
        items    : [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                module   : TextField,
                reference: 'entity',
                labelText: 'Entity',
                labelPosition: 'inline',
                value    : 'Note',
                width    : 160
            }, {
                module   : TextField,
                reference: 'entityId',
                labelText: 'Id',
                labelPosition: 'inline',
                width    : 120
            }, {
                module : Button,
                text   : 'Show',
                ui     : 'primary',
                handler: 'up.onShow'
            }, '->', {
                module   : AddLinkButton,
                reference: 'addButton'
            }, {
                module   : LinkBrowseButton,
                reference: 'browseButton'
            }]
        }, {
            module   : LinkDetail,
            reference: 'links',
            flex     : 'none'
        }]
    }

    onShow() {
        let me       = this,
            entity   = String(me.getReference('entity').value || '').trim() || null,
            entityId = String(me.getReference('entityId').value || '').trim() || null;

        me.getReference('addButton').setEntity(entity, entityId);
        me.getReference('browseButton').setEntity(entity, entityId);
        me.getReference('links').setEntity(entity, entityId)
    }
}

export default Neo.setupClass(LinksDemo);
