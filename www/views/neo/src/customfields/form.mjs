import customFields from './customFields.mjs';
import FormFieldset from './FormFieldset.mjs';

/**
 * Adds the custom field sets of formWindow.entityName to a GO.view.FormWindow
 * (GOUI FormWindow.addCustomFields()): fieldsets with isTab get a card of their own,
 * the others go below the general fields. Loads `customFields` with the entity.
 *
 * Fieldsets follow their filter: shown only while the entity values match (e.g.
 * noteBookId), checked on load and when a filtered property changes.
 *
 * @param {GO.view.FormWindow} win
 * @returns {Promise<void>} resolves once the fields exist (before the form loads)
 */
export async function addCustomFieldsTo(win) {
    const entity = win.entityName;

    if (!entity) {
        return
    }

    try {
        await customFields.load()
    } catch (e) {
        console.warn('Custom fields not loaded', e);
        return
    }

    const fieldSets = customFields.getFieldSets(entity);

    if (!fieldSets.length || win.isDestroyed) {
        return
    }

    const {form}      = win,
          filterProps = customFields.getFilterProperties(entity);

    // the entity's values and the properties the filters read
    if (form.properties) {
        form.properties = [...new Set([...form.properties, 'customFields', ...filterProps])]
    }

    // a new entity starts with the field defaults
    if (!win.entityId) {
        const defaults = {};

        fieldSets.forEach(fs => customFields.getFields(fs).forEach(f => {
            if (f.default !== null && f.default !== undefined && f.default !== '') {
                defaults[f.databaseName] = f.default
            }
        }));

        Object.keys(defaults).length && (win.values = {
            ...win.values,
            customFields: {...defaults, ...(win.values?.customFields || {})}
        })
    }

    const fieldsets = fieldSets.map(fieldSet => {
        if (fieldSet.isTab) {
            const card = win.addCard({
                header: {text: fieldSet.name},
                items : [{module: FormFieldset, fieldSet, isCard: true, flex: 'none'}]
            });

            return {fieldset: card.items[0], card}
        }

        return {fieldset: win.generalTab.add({module: FormFieldset, fieldSet, flex: 'none'}), card: null}
    });

    const refresh = async () => {
        if (win.isDestroyed) {
            return
        }

        const values      = {...form.entityData, ...await form.getEntityValues()},
              cardItems   = win.cards.getCardContainer().items,
              tabButtons  = win.cards.getTabBar().items;

        fieldsets.forEach(({fieldset, card}) => {
            const visible = fieldset.applyFilter(values);

            if (card) {
                const index  = cardItems.indexOf(card),
                      button = tabButtons[index];

                button && (button.hidden = !visible);
                !visible && win.cards.activeIndex === index && (win.cards.activeIndex = 0)
            }

            fieldset.showReadOnlyValues(form.entityData?.customFields)
        })
    };

    let listening = false;

    form.on('load', async () => {
        await refresh();

        // filtered properties (e.g. the note book combo) switch fieldsets live
        if (!listening && !win.isDestroyed) {
            listening = true;

            (await form.getFields())
                .filter(f => filterProps.includes(f.name) && !f.goCustomField)
                .forEach(f => f.on('change', refresh))
        }
    })
}
