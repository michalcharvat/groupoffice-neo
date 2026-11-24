import Container        from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import TextArea         from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField        from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import SelectField      from '../../../../../views/neo/src/form/field/SelectField.mjs';
import client           from '../../../../../views/neo/src/jmap/Client.mjs';
import LegacyFormWindow from '../../../../../views/neo/src/view/LegacyFormWindow.mjs';
import {translator}     from '../../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'site');

/** Fields of the dialog that site/content/update saves */
const FIELDS = ['template', 'default_child_template', 'meta_title', 'meta_keywords', 'meta_description'];

/**
 * "Advanced options" of a content item (GO.site.ContentDialog, site/content/update): Info
 * (created, modified, user; template and default child template from the site's config,
 * site/content/templateStore) and Meta (title, keywords, description).
 *
 *     ContentDialog.open({appName, windowId, id}) // → the dialog, after loading
 */
class ContentDialog extends LegacyFormWindow {
    static config = {
        className    : 'GO.site.view.ContentDialog',
        // custom fields of the content item (the legacy model has CustomFieldsTrait)
        entityName   : 'Content',
        title        : t('Content'),
        generalHeader: {text: t('Info')},
        wrapperStyle : {height: 'min(720px, 90vh)', left: 'calc(50vw - 300px)', top: 'max(5vh, calc(50vh - 360px))', width: 'min(600px, 100vw)'},
        /**
         * Content item id
         * @member {String|Number|null} contentId=null
         */
        contentId: null,
        /**
         * Templates of the site: [{value, text}]
         * @member {Object[]} templates=[]
         */
        templates: []
    }

    /**
     * Loads the content item and the site's templates, then shows the dialog
     * @param {Object} config appName, windowId, id
     * @returns {Promise<ContentDialog>}
     */
    static async open({id, ...config}) {
        // GET: site/content/update saves on POST
        const {data} = await client.legacy('site/content/update', {id}, {method: 'GET'}),
              {results = []} = await client.legacy('site/content/templateStore', {siteId: data.site_id}),
              templates = results.map(r => ({value: r.path, text: r.name}));

        // a template the site's config no longer lists stays selectable
        [data.template, data.default_child_template].forEach(path => {
            path && !templates.some(o => o.value === path) && templates.push({value: path, text: path})
        });

        return Neo.create(ContentDialog, {
            ...config,
            contentId: id,
            templates,
            values   : {
                info_ctime            : data.ctime || '',
                info_mtime            : data.mtime || '',
                info_user             : await userName(data.user_id),
                template              : data.template || null,
                default_child_template: data.default_child_template || null,
                meta_title            : data.meta_title || '',
                meta_keywords         : data.meta_keywords || '',
                meta_description      : data.meta_description || '',
                customFields          : data.customFields || {}
            }
        })
    }

    createFormItems() {
        let me   = this,
            // named: a FormWindow resets fields without a value of `values` when it is ready
            show = (label, name) => ({
                module       : TextField,
                name,
                labelText    : label,
                labelPosition: 'inline',
                readOnly     : true,
                clearable    : false
            });

        return [{
            ntype: 'component',
            tag  : 'p',
            cls  : ['go-form-text'],
            text : t('Information about this content item')
        }, show(t('Created'), 'info_ctime'), show(t('Modified'), 'info_mtime'), show(t('User'), 'info_user'), {
            ntype: 'component',
            tag  : 'p',
            cls  : ['go-form-text'],
            text : t('Choose a template in which you want to view this content item')
        }, {
            module       : SelectField,
            name         : 'template',
            labelText    : t('Template'),
            labelPosition: 'inline',
            required     : true,
            options      : me.templates
        }, {
            module       : SelectField,
            name         : 'default_child_template',
            labelText    : t('Default child template'),
            labelPosition: 'inline',
            options      : [{value: null, text: ''}, ...me.templates]
        }]
    }

    onConstructed() {
        const result = super.onConstructed();

        this.addCard({
            header: {text: t('Meta')},
            items : [{
                module: Container,
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [{
                    ntype: 'component',
                    tag  : 'p',
                    cls  : ['go-form-text'],
                    text : t('Meta tags are a great way for webmasters to provide search engines with information about their sites.')
                }, {
                    module       : TextField,
                    name         : 'meta_title',
                    labelText    : t('Meta title'),
                    labelPosition: 'inline',
                    maxLength    : 100
                }, {
                    module       : TextField,
                    name         : 'meta_keywords',
                    labelText    : t('Meta keywords'),
                    labelPosition: 'inline',
                    maxLength    : 255
                }, {
                    module       : TextArea,
                    name         : 'meta_description',
                    labelText    : t('Meta description'),
                    labelPosition: 'inline',
                    maxLength    : 255,
                    height       : 120
                }]
            }]
        });

        return result
    }

    async save(modified, values) {
        const params = {id: this.contentId};

        FIELDS.forEach(key => key in modified && (params[key] = modified[key] ?? ''));
        // the legacy model takes its custom fields as JSON; only the changed ones, so a save
        // doesn't undo another user's change of another field
        'customFields' in modified && (params.customFieldsJSON = JSON.stringify(modified.customFields || {}));

        Object.keys(params).length > 1 && await client.legacy('site/content/update', params);
        return {id: this.contentId}
    }
}

/**
 * Name of the content's user (the ExtJS dialog showed the id)
 * @param {Number|String} id
 * @returns {Promise<String>}
 */
async function userName(id) {
    if (!+id) {
        return ''
    }

    try {
        const list = await client.get('Principal', [String(id)], ['name']);
        return list?.[0]?.name || String(id)
    } catch (e) {
        return String(id)
    }
}

export default Neo.setupClass(ContentDialog);
