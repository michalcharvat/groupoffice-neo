import Base from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';

/**
 * Main thread side of src/postForm.mjs: POSTs fields to a URL in a named browser
 * window through a hidden `<form target>`. A worker can't build a form or submit
 * one, and a POST keeps values such as access tokens out of the URL and the
 * history. Loaded per window:
 *     await Neo.Main.importAddon({name: 'WS/PostForm', windowId})
 */
class PostForm extends Base {
    static config = {
        className: 'GO.main.addon.PostForm',
        // no library files to load
        preloadFilesDelay: false,
        remote: {
            app: ['post']
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.url form action
     * @param {Object} data.fields name => value, sent as hidden inputs
     * @param {String} [data.target='_blank'] window name; an existing window of that name is reused
     * @returns {Boolean} false: the popup blocker stopped the window, nothing was sent
     */
    post({url, fields, target='_blank'}) {
        // opening the target first shows whether the popup blocker allows it: a form submit
        // into a blocked window fails silently. '' keeps an open window of that name as it is.
        if (target !== '_self' && !window.open('', target)) {
            return false
        }

        const form = document.createElement('form');

        form.method = 'post';
        form.action = url;
        form.target = target;
        form.hidden = true;

        Object.entries(fields || {}).forEach(([name, value]) => {
            const input = document.createElement('input');

            input.type  = 'hidden';
            input.name  = name;
            input.value = value ?? '';
            form.appendChild(input)
        });

        document.body.appendChild(form);
        form.submit();
        form.remove();

        return true
    }
}

export default Neo.setupClass(PostForm);
