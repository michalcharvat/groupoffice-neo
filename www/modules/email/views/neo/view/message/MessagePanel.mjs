import Container from '../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {escapeHtml} from '../../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import client    from '../../../../../../views/neo/src/jmap/Client.mjs';
import {t}       from '../../util.mjs';

/**
 * The message view: the east panel of the e-mail module and the body of openMessageWindow()
 * (ExtJS GO.email.MessagePanel).
 *
 * STUB of card 1: shows subject and sender only. Card 2 (message view) replaces this file
 * and keeps the API:
 * - load({accountId, mailbox, uid}) → Promise of the email/message/view response (null when
 *   another load() replaced it), reset() empties the panel
 * - reference 'toolbar': the host may insert buttons (EmailMain adds the phone's close button)
 * - events: load {message} (the email/message/view response: seen, do_not_mark_as_read, …;
 *   the host marks the message as read), loadError {error}
 */
class MessagePanel extends Container {
    static config = {
        className: 'GO.email.message.MessagePanel',
        baseCls  : ['go-email-message-panel', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module   : Toolbar,
            reference: 'toolbar',
            flex     : 'none',
            cls      : ['go-bg-mid', 'go-border-bottom'],
            items    : ['->']
        }, {
            ntype    : 'component',
            reference: 'body',
            flex     : 1,
            cls      : ['go-email-message-body', 'go-scroll'],
            html     : ''
        }]
    }

    /**
     * The shown message: {accountId, mailbox, uid}
     * @member {Object|null} message=null
     */
    message = null

    /**
     * @param {Object} params
     * @param {Number} params.accountId
     * @param {String} params.mailbox
     * @param {Number} params.uid
     * @returns {Promise<Object|null>}
     */
    async load({accountId, mailbox, uid}) {
        let me         = this,
            generation = me.loadGeneration = (me.loadGeneration || 0) + 1;

        me.message = {accountId, mailbox, uid};
        me.showHtml(`<p class="go-email-message-loading">${escapeHtml(t('Loading...'))}</p>`);

        try {
            const data = await client.legacy('email/message/view', {account_id: accountId, mailbox, uid});

            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            me.showHtml(`<h3 class="go-email-message-subject">${escapeHtml(data.subject)}</h3>`
                + `<p class="go-email-message-from">${escapeHtml(data.full_from || data.from || '')}</p>`
                + `<p class="go-email-stub">${escapeHtml(t('The message view is not available yet'))}</p>`);

            me.fire('load', {message: data});
            return data
        } catch (error) {
            if (!me.isDestroyed && generation === me.loadGeneration) {
                me.showHtml('');
                notifyError(me, error);
                me.fire('loadError', {error})
            }
            return null
        }
    }

    reset() {
        this.loadGeneration = (this.loadGeneration || 0) + 1;
        this.message = null;
        this.showHtml('')
    }

    /**
     * @param {String} html
     * @protected
     */
    showHtml(html) {
        const body = this.getReference('body');
        body && (body.html = html)
    }
}

export default Neo.setupClass(MessagePanel);
