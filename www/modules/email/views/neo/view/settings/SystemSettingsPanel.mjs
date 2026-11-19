import Container from '../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import {t} from '../../util.mjs';
import TemplatesGrid from '../template/TemplatesGrid.mjs';

/**
 * E-mail card of System settings (ExtJS GO.email.SystemSettingsPanel), shown to
 * administrators and managers of the e-mail module: the e-mail templates and their groups.
 * The ExtJS panel only held a templates grid (and was not loaded); the server wide e-mail
 * options are config.php settings (email_enable_labels, email_disable_aliases, …) without UI.
 */
class SystemSettingsPanel extends Container {
    static config = {
        className: 'GO.email.settings.SystemSettingsPanel',
        baseCls  : ['go-email-system-settings', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            ntype: 'component',
            tag  : 'h3',
            cls  : ['go-fieldset-legend'],
            flex : 'none',
            text : t('E-mail templates')
        }, {
            module: TemplatesGrid,
            flex  : 1
        }]
    }
}

export default Neo.setupClass(SystemSettingsPanel);
