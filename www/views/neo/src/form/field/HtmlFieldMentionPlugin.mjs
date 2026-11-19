import Plugin from '../../../node_modules/neo.mjs/src/plugin/Base.mjs';
import client from '../../jmap/Client.mjs';

/**
 * "@name" mentions for GO.form.field.HtmlField, port of GOUI HtmlFieldMentionPlugin.
 *
 * Adds a "Mention user" button to the toolbar. Typing "@" after a space (or the button)
 * shows suggestions at the caret; arrow keys, Enter / Tab or a click pick one, Escape
 * closes them. The pick replaces "@typed" with "@" + value.
 *
 *     {module: HtmlField, name: 'text', plugins: [{module: HtmlFieldMentionPlugin}]}
 *
 * The main thread editor (GO.main.addon.HtmlEditor) watches the caret and owns the
 * suggestion list; this plugin only answers its "mentionQuery" events with provider().
 * The default provider suggests users and inserts their username, which the comments
 * module turns into a notification (Comment::findMentions()).
 */
class HtmlFieldMentionPlugin extends Plugin {
    static config = {
        className: 'GO.form.field.HtmlFieldMentionPlugin',
        ntype    : 'plugin-go-htmlfieldmention',
        /**
         * Toolbar position of the button, null: at the end
         * @member {Number|null} btnIndex=null
         */
        btnIndex: null,
        /**
         * Suggestions
         * @member {Number} limit=10
         */
        limit: 10,
        /**
         * (text, limit) => Promise<[{value, display, sub?}]>, null: users (value = username)
         * @member {Function|null} provider=null
         */
        provider: null
    }

    /** bumped per query: only the latest answer is shown */
    generation = 0

    onOwnerConstructed() {
        super.onOwnerConstructed();

        let me      = this,
            {owner} = me,
            toolbar = [...owner.toolbar];

        owner.mentionPlugin = me;

        if (!toolbar.includes('mention')) {
            toolbar.splice(me.btnIndex ?? toolbar.length, 0, 'mention');
            owner.toolbar = toolbar;
            owner.renderToolbar()
        }

        owner.addDomListeners({mentionQuery: me.onMentionQuery, scope: me})
    }

    /**
     * Users whose name, username or e-mail matches
     * @param {String} text
     * @param {Number} limit
     * @returns {Promise<Object[]>}
     */
    static async userProvider(text, limit) {
        const {list} = await client.queryGet('Principal', {
            filter    : {entity: 'User', text},
            sort      : [{property: 'name'}],
            limit,
            properties: ['id', 'name', 'description']
        });

        // a user's Principal.description is the username; the server finds "@name" with
        // letters, digits, "_", "-" and inner dots only (e-mail usernames can't be mentioned)
        return list.filter(p => /^[\w-]+(\.[\w-]+)*$/.test(p.description || '')).map(p => ({value: p.description, display: p.name, sub: '@' + p.description}))
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.query the text after "@"
     */
    async onMentionQuery({id, query}) {
        let me         = this,
            {owner}    = me,
            windowId   = owner.editorWindowId,
            generation = ++me.generation,
            items;

        if (id !== owner.id || !windowId) {
            return
        }

        try {
            items = await (me.provider || HtmlFieldMentionPlugin.userProvider)(query || '', me.limit)
        } catch (e) {
            console.error('HtmlFieldMentionPlugin', e);
            items = []
        }

        if (generation !== me.generation || me.isDestroyed || owner.isDestroyed || owner.editorWindowId !== windowId) {
            return
        }

        owner.addon.showMentions({
            id   : owner.id,
            query,
            items: items.map(({value, display, sub}) => ({value: String(value), display: display ?? null, sub: sub ?? null})),
            windowId
        }).catch(() => {})
    }
}

export default Neo.setupClass(HtmlFieldMentionPlugin);
