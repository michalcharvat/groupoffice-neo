import client         from './jmap/Client.mjs';
import ModuleRegistry from './ModuleRegistry.mjs';
import {notifyError}  from './Notify.mjs';

/**
 * Writing e-mail from any module (ExtJS go.showComposer in go/core/views/extjs3/Mail.js):
 * the composer of the e-mail module, or the desktop mail program through a mailto: link
 * when the e-mail module is not available or the user chose the desktop composer
 * (emailSettings.use_desktop_composer).
 *
 *     import {showComposer} from '../Mail.mjs';
 *
 *     showComposer({appName, windowId, to: 'john@example.com', name: 'John', subject, body})
 *     showComposer({appName, windowId, values: {to, cc, bcc, subject, body}, links: [{entity: 'Contact', entityId: 5}]})
 *     showComposer({appName, windowId, loadUrl: 'files/file/emailDownloadLink', loadParams: {ids: '[1]'}})
 *
 * `to` may be an address list string or an array of addresses (the calendar mails all
 * participants). The other keys go to the e-mail module's compose() unchanged, see
 * www/modules/email/views/neo/view/composer/compose.mjs.
 */

/**
 * The user's emailSettings.use_desktop_composer (JMAP User)
 * @returns {Promise<Boolean>}
 */
async function useDesktopComposer() {
    if (!client.user?.id) {
        return false
    }

    try {
        const response = await client.call('User/get', {ids: [client.user.id], properties: ['id', 'emailSettings']});
        return !!response.list?.[0]?.emailSettings?.use_desktop_composer
    } catch (e) {
        // the e-mail module adds emailSettings: without it the property is unknown
        return false
    }
}

/**
 * Opens the e-mail composer or the desktop mail program
 * @param {Object} cfg appName and windowId (required), to, name, subject, body, values,
 *     loadUrl, loadParams, links and the other keys of compose()
 * @returns {Promise<Object|null>} the composer window, null when mailto: was used
 */
export async function showComposer(cfg = {}) {
    const open = ModuleRegistry.getConfigs('showComposer')[0];

    try {
        if (open && !await useDesktopComposer()) {
            const values = cfg.values || {
                to     : cfg.to || '',
                subject: cfg.subject || '',
                body   : cfg.body || ''
            };

            // a single address with a display name ("name" + "to" of ExtJS go.showComposer)
            if (!cfg.values && cfg.name && typeof cfg.to === 'string' && cfg.to && !/[<,;]/.test(cfg.to)) {
                values.to = [{name: cfg.name, email: cfg.to}]
            }

            return await open({...cfg, values})
        }

        await mailtoFromConfig(cfg)
    } catch (e) {
        notifyError(cfg, e)
    }

    return null
}

/**
 * The desktop composer: loadUrl is loaded as plain text without template first (ExtJS)
 * @param {Object} cfg
 * @returns {Promise<void>}
 */
async function mailtoFromConfig(cfg) {
    if (cfg.loadUrl) {
        const response = await client.legacy(cfg.loadUrl, {...cfg.loadParams || {}, content_type: 'plain', template_id: 0}),
              data     = response.data || {};

        await mailto(cfg, {to: data.to, body: data.plainbody, subject: data.subject});
        return
    }

    const values = cfg.values || {};

    await mailto(cfg, {
        to     : cfg.to ?? values.to,
        name   : cfg.name,
        subject: cfg.subject ?? values.subject,
        body   : cfg.body ?? values.body,
        cc     : values.cc,
        bcc    : values.bcc
    })
}

/**
 * Addresses for a mailto: link: a list string, an array of strings or of {name, email}
 * @param {String|String[]|Object[]|null} value
 * @returns {String}
 */
function addressList(value) {
    if (!value) {
        return ''
    }

    return (Array.isArray(value) ? value : [value])
        .map(v => v && typeof v === 'object' ? v.email : v)
        .filter(Boolean)
        .join(',')
}

/**
 * The mailto: URL (ExtJS go.util.mailto())
 * @param {Object} message {to, name, cc, bcc, subject, body}
 * @returns {String}
 */
export function mailtoUrl({to, name, cc, bcc, subject, body}) {
    let address = addressList(to);

    // a single address with its name: "name" <address>
    if (name && address && !address.includes(',')) {
        address = `"${String(name).replace(/["\\]/g, '\\$&')}" <${address}>`
    }

    const query = [];

    [['cc', addressList(cc)], ['bcc', addressList(bcc)], ['subject', subject], ['body', body]].forEach(([key, value]) => {
        value && query.push(key + '=' + encodeURIComponent(value))
    });

    return 'mailto:' + encodeURIComponent(address).replace(/%40/g, '@').replace(/%2C/g, ',') + (query.length ? '?' + query.join('&') : '')
}

/**
 * Hands a mailto: link to the desktop mail program. Not in this window (location.href,
 * window.open(url, '_self') or a clicked link): every one of them fires beforeunload, and neo
 * then disconnects the window from the shared worker while the page stays (see
 * src/main/addon/Download.mjs). A hidden frame is blocked by GroupOffice's CSP (frame-src).
 * A new window target opens the mail program without unloading the page.
 * @param {Object} owner {appName, windowId}
 * @param {Object} message {to, name, cc, bcc, subject, body}
 * @returns {Promise<Boolean>} opened (false: blocked by the browser)
 */
export async function mailto(owner, message) {
    return !!await Neo.Main.windowOpen({url: mailtoUrl(message), windowId: owner.windowId, windowName: 'go-mailto'})
}

export default showComposer;
