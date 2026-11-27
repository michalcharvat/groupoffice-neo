import HtmlField  from '../form/field/HtmlField.mjs';
import HtmlFieldMentionPlugin from '../form/field/HtmlFieldMentionPlugin.mjs';
import Button     from '../button/Button.mjs';
import client     from '../jmap/Client.mjs';
import {avatarHtml, escapeHtml, formatUserDateTime, sanitizeHtml, smartDateTime} from '../Format.mjs';
import Card       from './Card.mjs';
import {enableImageZoom} from '../view/ImageWindow.mjs';
import {blobImages} from '../Markdown.mjs';
import {t} from '../Translate.mjs';

/** CommentLabel colour: hex without "#" (GOUI colorfield) */
const HEX = /^[0-9a-f]{3}([0-9a-f]{3})?$/i;

/**
 * "Comments" of an entity (community/comments, GO.comments.CommentsPanel): the comments
 * oldest first, each with the author's avatar, name and date, and a field to add one.
 *
 * Comment text is HTML from other users: the server's XSS check (Comment::$validateXSS,
 * a heuristic that can be switched off) is not trusted, the text goes through
 * Format.sanitizeHtml(). New comments are typed in a GO.form.field.HtmlField; "@name"
 * mentions a user (HtmlFieldMentionPlugin), who gets an alert from the server.
 *
 * Labels (CommentLabel, GOUI CommentEditor / CommentList): a new comment gets the labels
 * picked with the label button, comments show theirs as coloured icons. Administrators
 * manage the labels in System settings (the comments module's card, settings button).
 */
class CommentsPanel extends Card {
    static config = {
        className: 'GO.detail.CommentsPanel',
        cls      : ['go-comments-panel'],
        title    : t('Comments'),
        stateId  : 'comments-detail',
        watch    : ['Comment'],
        capability: 'go:community:comments'
    }

    /**
     * Labels picked for the next comment (ids)
     * @member {String[]} pickedLabels=[]
     */
    pickedLabels = []

    /**
     * All labels by id, from the last load
     * @member {Object} labels={}
     */
    labels = {}

    /**
     * Icon of a label in its colour (vdom)
     * @param {Object} label {name, color}
     * @returns {Object}
     */
    static labelIconVdom(label) {
        const color = HEX.test(label?.color || '') ? '#' + label.color : null;

        return {tag: 'span', cls: ['go-icon', 'go-comment-label'], style: color ? {color} : null, title: label?.name || '', text: 'label'}
    }

    createTools() {
        // GOUI CommentsPanel: the settings button opens the labels (LabelDialog), administrators only
        return client.isAdmin && client.hasCapability('go:community:comments') ? [{
            module : Button,
            icon   : 'settings',
            tooltip: t('Labels'),
            handler: () => Neo.Main.setRoute({value: 'systemsettings/community-comments', windowId: this.windowId})
        }] : []
    }

    createBody() {
        return [{
            ntype    : 'component',
            reference: 'list',
            cls      : ['go-comments', 'go-image-zoom'],
            html     : ''
        }, {
            module     : HtmlField,
            reference  : 'input',
            // controls are left out of print (src/print.mjs)
            cls        : ['go-comment-editor', 'go-print-hide'],
            placeholder: t('Add a comment...'),
            toolbar    : ['bold', 'italic', 'underline', '-', 'insertOrderedList', 'insertUnorderedList', '-', 'createLink'],
            plugins    : [{module: HtmlFieldMentionPlugin}]
        }, {
            // labels picked for the new comment, a click removes one
            ntype    : 'container',
            reference: 'pickedLabels',
            cls      : ['go-comment-picked-labels', 'go-print-hide'],
            layout   : {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            hidden   : true,
            items    : []
        }, {
            ntype : 'container',
            cls   : ['go-detail-card-buttons', 'go-print-hide'],
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : Button,
                reference: 'labelButton',
                icon     : 'label',
                tooltip  : t('Add labels', 'community', 'comments'),
                hidden   : true
            }, {
                ntype    : 'component',
                reference: 'error',
                cls      : ['go-form-error'],
                flex     : 1
            }, {
                module   : Button,
                ui       : 'primary',
                icon     : 'send',
                text     : t('Add comment'),
                reference: 'addButton',
                handler  : () => this.onAdd()
            }]
        }]
    }

    setEntity(entity, entityId, record) {
        // a draft belongs to the item it was typed for (File 5 and Folder 5 differ)
        if (this.current?.entity !== entity || this.current?.entityId !== entityId) {
            this.getReference('input').value = '';
            this.getReference('error').text  = '';
            this.setPickedLabels([])
        }

        super.setEntity(entity, entityId, record)
    }

    async loadData(entity, entityId) {
        const {list} = await client.queryGet('Comment', {
            filter    : {entity, entityId},
            sort      : [{property: 'date', isAscending: true}],
            properties: ['id', 'text', 'date', 'createdBy', 'labels']
        });

        const ids   = [...new Set(list.map(c => c.createdBy).filter(Boolean))],
              names = {};

        const [principals, labels] = await Promise.all([
            ids.length ? client.get('Principal', ids, ['id', 'name']) : [],
            client.queryGet('CommentLabel', {sort: [{property: 'name', isAscending: true}], properties: ['id', 'name', 'color']})
                .then(r => r.list)
                .catch(() => [])
        ]);

        principals.forEach(p => names[p.id] = p.name);

        return {list, names, labels}
    }

    showData({list, names, labels}) {
        let me = this;

        me.labels = Object.fromEntries(labels.map(l => [String(l.id), l]));
        me.setLabelMenu(labels);
        // a label deleted meanwhile
        me.setPickedLabels(me.pickedLabels.filter(id => me.labels[id]));

        me.getReference('list').html = list.map(c => {
            const name = names[c.createdBy] || t('Unknown'),
                  tags = (c.labels || []).map(id => me.labels[String(id)]).filter(Boolean).map(CommentsPanel.labelIconHtml).join('');

            return `<div class="go-comment">
                ${avatarHtml(name)}
                <div class="go-comment-body">
                    <div class="go-comment-meta"><b>${escapeHtml(name)}</b> <span title="${formatUserDateTime(c.date)}">${smartDateTime(c.date)}</span>${tags}</div>
                    <div class="go-comment-text">${sanitizeHtml(blobImages(c.text))}</div>
                </div>
            </div>`
        }).join('');

        // also after a popout: the addon is loaded per window
        enableImageZoom(me.getReference('list'))
    }

    /**
     * @param {Object} label {name, color}
     * @returns {String} HTML of labelIconVdom()
     */
    static labelIconHtml(label) {
        const color = HEX.test(label?.color || '') ? ` style="color: #${label.color}"` : '';

        return `<span class="go-icon go-comment-label"${color} title="${escapeHtml(label?.name || '')}">label</span>`
    }

    /**
     * The label button's menu (hidden without labels)
     * @param {Object[]} labels
     * @protected
     */
    setLabelMenu(labels) {
        let me     = this,
            button = me.getReference('labelButton');

        button.hidden = !labels.length;
        button.menu   = labels.length ? labels.map(label => ({
            text   : label.name,
            icon   : 'label',
            handler: () => me.pickedLabels.includes(String(label.id)) || me.setPickedLabels([...me.pickedLabels, String(label.id)])
        })) : null
    }

    /**
     * @param {String[]} ids
     * @protected
     */
    setPickedLabels(ids) {
        let me        = this,
            container = me.getReference('pickedLabels');

        me.pickedLabels = ids;

        container.removeAll();
        container.add(ids.map(id => ({
            module : Button,
            cls    : ['small', 'go-comment-picked-label'],
            icon   : 'close',
            text   : me.labels[id]?.name || id,
            tooltip: t('Remove'),
            handler: () => me.setPickedLabels(me.pickedLabels.filter(other => other !== id))
        })));
        container.hidden = !ids.length
    }

    clearData() {
        let me = this;

        me.getReference('list').html  = '';
        me.getReference('input').value = '';
        me.getReference('error').text  = ''
    }

    showError(e) {
        this.getReference('error').text = e.message || String(e)
    }

    async onAdd() {
        let me      = this,
            input   = me.getReference('input'),
            button  = me.getReference('addButton'),
            current = me.current;

        if (!current || button.disabled) {
            return
        }

        button.disabled = true;
        me.getReference('error').text = '';

        try {
            // typing the debounced sync has not sent yet
            const text = (await input.flush()).trim();

            if (!text || me.current !== current) {
                return
            }

            await client.set('Comment', {create: {new: {
                entity  : current.entity,
                entityId: current.entityId,
                labels  : me.pickedLabels,
                text
            }}});

            // the user may have moved on to another note meanwhile
            if (me.current === current) {
                input.value = '';
                me.setPickedLabels([]);
                me.reload()
            }
        } catch (e) {
            me.showError(e)
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }
}

export default Neo.setupClass(CommentsPanel);
