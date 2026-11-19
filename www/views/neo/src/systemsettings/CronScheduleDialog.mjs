import TextField    from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox from '../form/field/BoolCheckBox.mjs';
import FormWindow   from '../view/FormWindow.mjs';
import {t}          from '../Translate.mjs';

/**
 * A scheduled task that a module registered (go.cron.NewCronDialog, CronJobSchedule): its
 * description, cron expression and whether it runs. The server checks the expression.
 */
class CronScheduleDialog extends FormWindow {
    static config = {
        className   : 'GO.systemsettings.CronScheduleDialog',
        entityName  : 'CronJobSchedule',
        title       : t('Scheduled tasks'),
        properties  : ['id', 'description', 'expression', 'enabled'],
        wrapperStyle: {height: 'auto', left: 'calc(50vw - 230px)', top: '20vh', width: 'min(460px, 100vw)'}
    }

    createFormItems() {
        return [{
            module       : TextField,
            name         : 'description',
            labelText    : t('Description'),
            labelPosition: 'inline'
        }, {
            module         : TextField,
            name           : 'expression',
            labelText      : t('Expression'),
            labelPosition  : 'inline',
            placeholderText: '0 0 * * *',
            required       : true
        }, {
            module    : BoolCheckBox,
            name      : 'enabled',
            valueLabel: t('Enabled')
        }]
    }

    addCustomFields() {
        // CronJobSchedule has no custom fields
    }
}

export default Neo.setupClass(CronScheduleDialog);
