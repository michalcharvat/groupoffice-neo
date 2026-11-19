import badges             from '../../../../views/neo/src/Badges.mjs';
import notificationCenter from '../../../../views/neo/src/alerts/NotificationCenter.mjs';
import {escapeHtml}       from '../../../../views/neo/src/Format.mjs';
import client             from '../../../../views/neo/src/jmap/Client.mjs';
import * as api           from './api.mjs';
import {t}                from './util.mjs';
import {loadEmailSettings} from './view/composer/compose.mjs';

/** Id prefix of the new mail message in the notification area */
const PREFIX = 'email-new-';

/**
 * The mail check of the ExtJS GO.checker request "email/account/checkUnseen"
 * (EmailClient.js), also while the e-mail module is closed: every checker_interval
 * seconds (120 by default) it counts the unseen mails of the folders each account checks.
 *
 * - the total is the module's badge (src/Badges.mjs calls count() through the `badge`
 *   config in Index.mjs, the timer through badges.refresh())
 * - new mail adds "You have %d unread email(s)" to the notification area with a desktop
 *   notification and the new mail sound, when the user's emailSettings.notify_new_email is on
 * - the open e-mail module listens with onStatus() for the folder counts
 *
 * One instance per App worker, started by the first count() after login.
 */
class MailChecker {
    #userId    = null
    #timer     = null
    #off       = []
    #listeners = new Set()
    /** running check: concurrent calls share it */
    #checking  = null
    /** check queued after the running one */
    #again     = null
    /** total of the last notification (ExtJS countEmailShown) */
    #shown     = 0
    /** check interval in ms */
    #interval  = 120000
    /** Date.now() of the last check */
    #lastCheck = 0
    /** "accountId:mailbox" → unseen of the folders the last check counted */
    #counts    = new Map()
    /** goes up with every stop(): a check of an earlier login is dropped */
    #generation = 0

    /**
     * The badge count: checks the mail and starts the timer for this user
     * @returns {Promise<Number>} total unseen: the badge as it is now, a count the open module
     * set meanwhile (setUnseen()) is newer than the check, and a failed check keeps the last one
     */
    async count() {
        this.#start();
        await this.check();
        return badges.get('email')
    }

    #start() {
        let me = this;

        if (!client.user || me.#userId === client.user.id) {
            return
        }

        me.stop();
        me.#userId = client.user.id;

        me.#interval = (Number(Neo.config.goCheckerInterval) || 120) * 1000;

        // through Badges: it drops the count of a check that ends after a logout
        me.#timer = setInterval(() => badges.refresh('email'), me.#interval);
        me.#off.push(
            client.on('logout', () => me.stop()),
            // after the computer slept; the push connection also reconnects regularly, then
            // the timer is soon enough
            client.on('stateChange', ({reconnect}) => reconnect && Date.now() - me.#lastCheck >= me.#interval && badges.refresh('email'))
        )
    }

    stop() {
        let me = this;

        clearInterval(me.#timer);
        me.#timer = null;
        me.#off.forEach(off => off?.());
        me.#off     = [];
        me.#userId  = null;
        me.#shown   = 0;
        me.#lastCheck = 0;
        me.#counts.clear();
        me.#checking = null;
        me.#again    = null;
        me.#generation++;
        notificationCenter.sync(PREFIX, new Set())
    }

    /**
     * email/account/checkUnseen now. The open e-mail module calls it after it changed the
     * flags; the badge follows through onStatus().
     * @returns {Promise<Object|null>} email_status {total_unseen, has_new, unseen: [{account_id, mailbox, unseen}]},
     * null when it failed or the user logged out
     */
    check() {
        let me = this;

        if (!me.#userId || globalThis.navigator?.onLine === false) {
            return Promise.resolve(null)
        }

        // the running check may have started before the change the caller made: once more after it
        if (me.#checking) {
            const generation = me.#generation;

            return me.#again ||= me.#checking.then(() => {
                // logged out meanwhile: the queued check belonged to that login
                if (me.#generation !== generation) {
                    return null
                }

                me.#again = null;
                return me.check()
            })
        }

        me.#lastCheck = Date.now();

        const generation = me.#generation,
              checking   = (async () => {
                  try {
                      const status = await api.checkUnseen();

                      if (me.#generation !== generation || !status) {
                          return null
                      }

                      me.#counts = new Map((status.unseen || []).map(({account_id, mailbox, unseen}) => [`${account_id}:${mailbox}`, Number(unseen) || 0]));
                      badges.set('email', status.total_unseen);
                      me.#listeners.forEach(fn => {
                          try {
                              fn(status)
                          } catch (e) {
                              console.error('Mail check listener', e)
                          }
                      });
                      await me.#notify(status, generation);
                      return status
                  } catch (e) {
                      // checked again next time (GO.Checker ignores failures too)
                      console.warn('email/account/checkUnseen', e);
                      return null
                  } finally {
                      me.#checking === checking && (me.#checking = null)
                  }
              })();

        me.#checking = checking;
        return checking
    }

    /**
     * The open e-mail module learned the unseen count of a folder (a message read, flags,
     * a folder loaded): the badge follows at once when the check counts that folder
     * @param {Number|String} accountId
     * @param {String} mailbox
     * @param {Number} unseen
     */
    setUnseen(accountId, mailbox, unseen) {
        let me  = this,
            key = `${accountId}:${mailbox}`;

        unseen = Number(unseen) || 0;

        if (!me.#userId || !me.#counts.has(key) || me.#counts.get(key) === unseen) {
            return
        }

        me.#counts.set(key, unseen);

        const total = [...me.#counts.values()].reduce((sum, count) => sum + count, 0);

        me.#shown = Math.min(me.#shown, total);
        badges.set('email', total);
        total || notificationCenter.sync(PREFIX, new Set())
    }

    /**
     * @param {Function} fn called with the email_status of every check
     * @returns {Function} removes the listener
     */
    onStatus(fn) {
        this.#listeners.add(fn);
        return () => this.#listeners.delete(fn)
    }

    /**
     * ExtJS: a notification when there is new mail (has_new) and more unseen mail than
     * at the last one, or at the first check after login
     */
    async #notify(status, generation) {
        let me    = this,
            total = Number(status.total_unseen) || 0;

        if (total <= 0) {
            me.#shown = total;
            notificationCenter.sync(PREFIX, new Set());
            return
        }

        if ((!status.has_new && me.#shown) || (me.#shown && me.#shown >= total)) {
            me.#shown = total;
            return
        }

        me.#shown = total;

        const settings = await loadEmailSettings();

        if (me.#generation !== generation || !settings.notify_new_email) {
            return
        }

        // a new id every time: the notification center notifies once per id
        const id   = PREFIX + Date.now(),
              text = t('You have %d unread email(s)').replace('%d', total);

        notificationCenter.add({
            id,
            title    : t('New email'),
            text,
            html     : escapeHtml(text),
            icon     : 'email',
            route    : 'email',
            sound    : 'message-new-email',
            muteSound: 'mute_new_mail_sound'
        });
        notificationCenter.sync(PREFIX, new Set([id]))
    }
}

export default new MailChecker();
