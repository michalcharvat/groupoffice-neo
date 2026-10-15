import Container    from '../../node_modules/neo.mjs/src/container/Base.mjs';
import BoolCheckBox from '../form/field/BoolCheckBox.mjs';
import {fieldset}   from '../form/fieldset.mjs';
import {t}          from '../Translate.mjs';

/**
 * "Notifications" card of My account (go.usersettings.NoticiationPanel): mail
 * reminders and sounds; "Mute all sounds" disables the single sound options.
 */
class NotificationPanel extends Container {
    static config = {
        className: 'GO.usersettings.NotificationPanel',
        baseCls  : ['go-usersettings-notifications', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [
            fieldset(t('Notifications'), [
                {module: BoolCheckBox, name: 'mail_reminders', valueLabel: t('Mail reminders')}
            ]),
            fieldset(t('Sounds'), [{
                module    : BoolCheckBox,
                name      : 'mute_sound',
                reference : 'muteAll',
                valueLabel: t('Mute all sounds'),
                listeners : {change: () => me.syncMute()}
            },
            {module: BoolCheckBox, name: 'mute_reminder_sound', reference: 'muteReminder', valueLabel: t('Mute reminder sounds')},
            {module: BoolCheckBox, name: 'mute_new_mail_sound', reference: 'muteMail',     valueLabel: t('Mute new mail sounds')}
            ])
        ]
    }

    /**
     * Called by the dialog after loading the user
     */
    onLoad() {
        this.syncMute()
    }

    /**
     * @protected
     */
    syncMute() {
        let me    = this,
            muted = me.getReference('muteAll').checked;

        me.getReference('muteReminder').disabled = muted;
        me.getReference('muteMail').disabled     = muted
    }
}

export default Neo.setupClass(NotificationPanel);
