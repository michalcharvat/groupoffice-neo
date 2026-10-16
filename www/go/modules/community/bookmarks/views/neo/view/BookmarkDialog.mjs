import TextArea     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {safeUrl, t} from '../util.mjs';
import LogoField    from './LogoField.mjs';

/**
 * Create or edit a bookmark (GOUI BookmarksDialog, ExtJS BookmarksDialog).
 * A typed URL fills in the page's title, description and favicon
 * (community/bookmarks/Bookmark/description).
 */
class BookmarkDialog extends FormWindow {
    static config = {
        className : 'GO.bookmarks.BookmarkDialog',
        cls       : ['go-form-window', 'go-bookmark-dialog'],
        entityName: 'Bookmark',
        properties: ['id', 'content', 'name', 'description', 'categoryId', 'logo', 'openExtern', 'behaveAsModule'],
        title     : t('Bookmark'),
        wrapperStyle: {
            height   : '650px',
            left     : 'calc(50vw - 250px)',
            maxHeight: '90vh',
            top      : 'max(5vh, calc(50vh - 325px))',
            width    : '500px'
        }
    }

    /**
     * The last URL its page information was fetched for
     * @member {String|null} fetchedUrl=null
     */
    fetchedUrl = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.on('formReady', () => me.syncOpenExtern())
    }

    destroy(...args) {
        clearTimeout(this.urlTimer);
        super.destroy(...args)
    }

    createFormItems() {
        let me = this;

        return [{
            module         : TextField,
            name           : 'content',
            reference      : 'urlField',
            inputType      : 'url',
            labelText      : 'URL',
            labelPosition  : 'inline',
            placeholderText: 'https://example.com',
            required       : true,
            flex           : 'none',
            validator      : field => !!safeUrl(field.value) || t('Invalid URL'),
            listeners      : {userChange: ({value}) => me.onUrlInput(value)}
        }, {
            module       : TextField,
            name         : 'name',
            reference    : 'nameField',
            labelText    : t('Title'),
            labelPosition: 'inline',
            required     : true,
            flex         : 'none'
        }, {
            module       : TextArea,
            name         : 'description',
            reference    : 'descriptionField',
            labelText    : t('Description'),
            labelPosition: 'inline',
            flex         : 'none',
            height       : 100
        }, {
            module       : JmapComboBox,
            name         : 'categoryId',
            labelText    : t('Category'),
            labelPosition: 'inline',
            required     : true,
            flex         : 'none',
            entity       : 'BookmarksCategory',
            displayField : 'name',
            valueField   : 'id',
            jmapFilter   : {permissionLevel: LEVEL_WRITE},
            jmapSort     : [{property: 'name', isAscending: true}]
        }, {
            module   : LogoField,
            name     : 'logo',
            reference: 'logoField',
            labelText: t('Logo'),
            flex     : 'none'
        }, {
            module    : BoolCheckBox,
            name      : 'openExtern',
            reference : 'openExternField',
            valueLabel: t('Open in new browser tab'),
            flex      : 'none'
        }, {
            module    : BoolCheckBox,
            name      : 'behaveAsModule',
            reference : 'behaveAsModuleField',
            valueLabel: t('Behave as a module (Browser reload required)'),
            flex      : 'none',
            listeners : {change: () => me.syncOpenExtern(true)}
        }]
    }

    /**
     * A bookmark shown as a module opens inside GO (ExtJS: the checkbox is cleared and disabled)
     * @param {Boolean} [clear] the user (un)checked "behave as a module"
     */
    syncOpenExtern(clear = false) {
        let me       = this,
            asModule = me.getReference('behaveAsModuleField')?.checked,
            extern   = me.getReference('openExternField');

        if (!extern) {
            return
        }

        clear && asModule && (extern.checked = false);
        extern.disabled = !!asModule
    }

    /**
     * Fetches the page information once the user stops typing
     * @param {String} value
     */
    onUrlInput(value) {
        let me = this;

        clearTimeout(me.urlTimer);

        me.urlTimer = setTimeout(() => {
            const url = safeUrl(value);
            url && url !== me.fetchedUrl && me.fetchPageInfo(url)
        }, 800)
    }

    /**
     * Title, description and favicon of a web page, fetched by the server
     * @param {String} url
     */
    async fetchPageInfo(url) {
        let me = this;

        me.fetchedUrl = url;
        me.isLoading  = true;

        try {
            const info = await client.call('community/bookmarks/Bookmark/description', {url});

            // destroyed, or the user typed another URL meanwhile
            if (me.isDestroyed || me.fetchedUrl !== url) {
                return
            }

            info.title       && (me.getReference('nameField').value = info.title);
            info.description && (me.getReference('descriptionField').value = info.description);
            info.logo        && (me.getReference('logoField').value = info.logo);

            // the server follows a redirect
            if (info.url && info.url !== url && safeUrl(info.url)) {
                me.fetchedUrl = info.url;
                me.getReference('urlField').value = info.url
            }
        } catch (e) {
            // no page information: the user fills it in
            console.warn('Bookmark description', e)
        } finally {
            me.isDestroyed || (me.isLoading = false)
        }
    }
}

export default Neo.setupClass(BookmarkDialog);
