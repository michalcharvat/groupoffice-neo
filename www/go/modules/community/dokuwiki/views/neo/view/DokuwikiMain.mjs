import Container    from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {t as coreT, translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'dokuwiki');

/**
 * Dokuwiki module (dokuwiki MainPanel): the configured wiki in an iframe, "Refresh" loads
 * its start page again
 */
class DokuwikiMain extends Container {
    static config = {
        className : 'GO.dokuwiki.view.DokuwikiMain',
        baseCls   : ['go-dokuwiki', 'neo-container'],
        layout    : {ntype: 'vbox', align: 'stretch'},
        /**
         * Route prefix, set by the shell
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    /**
     * @member {String} url=''
     */
    url = ''

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            cls   : ['go-bg-mid', 'go-border-bottom'],
            items : [{
                module : Button,
                icon   : 'refresh',
                text   : coreT('Refresh'),
                handler: () => me.showWiki()
            }]
        }, {
            ntype    : 'component',
            reference: 'frame',
            flex     : 1,
            vdom     : {tag: 'iframe', cls: ['go-dokuwiki-frame'], title: t('title')}
        }, {
            ntype    : 'component',
            reference: 'empty',
            cls      : ['go-empty'],
            flex     : 1,
            hidden   : true,
            text     : t('Used as dokuwiki URL')
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.loadSettings()
    }

    async loadSettings() {
        let me = this;

        try {
            const {list} = await client.queryGet('Module', {filter: {package: 'community', name: 'dokuwiki'}, properties: ['id', 'settings']});

            me.url = list[0]?.settings?.externalUrl || '';
            me.isDestroyed || me.showWiki()
        } catch (e) {
            console.error('dokuwiki settings', e)
        }
    }

    /**
     * (Re)loads the wiki's URL: about:blank first, so the same URL loads again
     */
    async showWiki() {
        let me    = this,
            frame = me.getReference('frame');

        me.getReference('empty').hidden = !!me.url;
        frame.hidden = !me.url;

        if (me.url) {
            frame.vdom.src = 'about:blank';
            await frame.promiseUpdate();

            if (!me.isDestroyed) {
                frame.vdom.src = me.url;
                frame.update()
            }
        }
    }
}

export default Neo.setupClass(DokuwikiMain);
