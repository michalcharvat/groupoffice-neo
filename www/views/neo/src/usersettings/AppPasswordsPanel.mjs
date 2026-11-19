import client          from '../jmap/Client.mjs';
import {formatUserDateTime, formatDate, userFormat} from '../Format.mjs';
import EntityListPanel from '../systemsettings/EntityListPanel.mjs';
import {t}             from '../Translate.mjs';
import ConfirmDialog   from '../view/ConfirmDialog.mjs';
import SecretDialog    from '../view/SecretDialog.mjs';
import {notifyError}   from '../Notify.mjs';

/**
 * App passwords of the shown user (go.usersettings.AppPasswordsFieldset), inside the
 * Account card of My account. Changes are saved right away, not with the dialog's Save.
 *
 * Only the user itself creates one: the secret is shown once, to its creator.
 * Administrators see and delete the app passwords of other users; for other user
 * managers the panel stays hidden (AppPassword::applyAclToQuery()).
 */
class AppPasswordsPanel extends EntityListPanel {
    static config = {
        className : 'GO.usersettings.AppPasswordsPanel',
        baseCls   : ['go-apppasswords', 'go-entity-list-panel', 'neo-container'],
        entity    : 'AppPassword',
        // userId: AppPassword::internalGetPermissionLevel() reads it
        properties: ['id', 'userId', 'label', 'scopes', 'createdAt', 'lastUsedAt', 'lastUsedIp'],
        jmapSort  : [{property: 'createdAt', isAscending: false}],
        intro     : t('Use app passwords to let apps like WebDAV, CalDAV, CardDAV and ActiveSync log in without your regular password.'),
        addText   : t('New app password'),
        editable  : false,
        displayField: 'label',
        dialog    : () => import('./AppPasswordDialog.mjs'),
        columns   : [
            {text: t('Label'),        field: 'label', flex: true},
            {text: t('Protocols'),    render: record => (record.scopes || []).map(s => s.protocol).join(', ')},
            {text: t('Created'),      render: record => formatUserDateTime(record.createdAt)},
            {text: t('Last used'),    render: record => record.lastUsedAt ? formatDate(new Date(record.lastUsedAt), userFormat.dateFormat) : ''},
            {text: t('Last used IP'), field: 'lastUsedIp'}
        ],
        // hidden until it's known whose settings these are
        hidden: true
    }

    /**
     * Owner of the shown account
     * @member {String|Number|null} userId=null
     */
    userId = null

    /**
     * Called by the AccountPanel after loading the user
     * @param {Object} user
     */
    onLoad(user) {
        let me  = this,
            own = String(user.id) === String(client.user?.id);

        me.userId = user.id;
        me.getReference('addButton').hidden = !own;
        me.hidden = !own && !client.isAdmin;

        if (!me.hidden) {
            me.jmapFilter = {user: user.id};
            me.load()
        }
    }

    async edit(id) {
        let me = this;

        // new only (editable: false), for the shown user
        const dialog = await super.edit(id, {userId: me.userId});

        // shown in this window: the dialog may be popped out, and closes after saving
        dialog?.on('save', ({isNew, created}) => {
            const secret = isNew && created?.secret;

            secret && !me.isDestroyed && Neo.create(SecretDialog, {
                appName : me.appName,
                windowId: me.windowId,
                title   : t('App password created'),
                message : t("Copy this password now. You won't be able to see it again."),
                secret
            })
        });

        return dialog
    }

    async remove(record) {
        let me = this;

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Confirm'),
            message : t('Are you sure you want to delete this password? This cannot be undone.')
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            await client.set(me.entity, {destroy: [record.id]});
            me.load()
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(AppPasswordsPanel);
