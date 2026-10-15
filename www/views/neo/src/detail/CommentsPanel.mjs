import TextArea   from '../../node_modules/neo.mjs/src/form/field/TextArea.mjs';
import Button     from '../button/Button.mjs';
import client     from '../jmap/Client.mjs';
import {avatarHtml, escapeHtml, formatUserDateTime, sanitizeHtml, smartDateTime} from '../Format.mjs';
import Card       from './Card.mjs';
import {t} from '../Translate.mjs';

/**
 * "Comments" of an entity (community/comments, GO.comments.CommentsPanel): the comments
 * oldest first, each with the author's avatar, name and date, and a field to add one.
 *
 * Comment text is HTML from other users: the server's XSS check (Comment::$validateXSS,
 * a heuristic that can be switched off) is not trusted, the text goes through
 * Format.sanitizeHtml(). New comments are typed as text: neo has no rich text
 * editor, so the text is escaped and line breaks become <br>.
 */
class CommentsPanel extends Card {
    static config = {
        className: 'GO.detail.CommentsPanel',
        cls      : ['go-comments-panel'],
        title    : t('Comments'),
        stateId  : 'comments-detail',
        watch    : ['Comment']
    }

    createBody() {
        return [{
            ntype    : 'component',
            reference: 'list',
            cls      : ['go-comments'],
            html     : ''
        }, {
            module       : TextArea,
            reference    : 'input',
            hideLabel    : true,
            placeholderText: t('Add a comment...'),
            height       : 80
        }, {
            ntype : 'container',
            cls   : ['go-detail-card-buttons'],
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
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
        // a draft belongs to the note it was typed for
        if (this.current?.entityId !== entityId) {
            this.getReference('input').value = '';
            this.getReference('error').text  = ''
        }

        super.setEntity(entity, entityId, record)
    }

    async loadData(entity, entityId) {
        const {list} = await client.queryGet('Comment', {
            filter    : {entity, entityId},
            sort      : [{property: 'date', isAscending: true}],
            properties: ['id', 'text', 'date', 'createdBy']
        });

        const ids   = [...new Set(list.map(c => c.createdBy).filter(Boolean))],
              names = {};

        if (ids.length) {
            (await client.get('Principal', ids, ['id', 'name'])).forEach(p => names[p.id] = p.name)
        }

        return {list, names}
    }

    showData({list, names}) {
        this.getReference('list').html = list.map(c => {
            const name = names[c.createdBy] || t('Unknown');

            return `<div class="go-comment">
                ${avatarHtml(name)}
                <div class="go-comment-body">
                    <div class="go-comment-meta"><b>${escapeHtml(name)}</b> <span title="${formatUserDateTime(c.date)}">${smartDateTime(c.date)}</span></div>
                    <div class="go-comment-text">${sanitizeHtml(c.text)}</div>
                </div>
            </div>`
        }).join('')
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
            text    = String(input.value || '').trim(),
            current = me.current;

        if (!text || !current || button.disabled) {
            return
        }

        button.disabled = true;
        me.getReference('error').text = '';

        try {
            await client.set('Comment', {create: {new: {
                entity  : current.entity,
                entityId: current.entityId,
                text    : escapeHtml(text).replace(/\n/g, '<br>')
            }}});

            // the user may have moved on to another note meanwhile
            if (me.current === current) {
                input.value = '';
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
