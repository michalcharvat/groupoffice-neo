import '../node_modules/neo.mjs/src/component/Toast.mjs';
import {t} from './Translate.mjs';

/**
 * Toast notifications. Never window.alert(): it blocks the main thread.
 */
export function notify(component, msg, {title=null, iconCls='fa fa-circle-info', closable=false}={}) {
    Neo.toast({
        appName : component.appName,
        windowId: component.windowId,
        msg,
        title,
        iconCls,
        closable,
        maxWidth: 400,
        // GOUI 26 (.goui-alert): at the top, centred
        position: 'tc'
    })
}

export function notifyError(component, error) {
    console.error(error);
    notify(component, error?.message || String(error), {title: t('Error'), iconCls: 'fa fa-triangle-exclamation', closable: true})
}
