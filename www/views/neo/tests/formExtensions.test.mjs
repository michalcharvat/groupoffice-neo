// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {createFormExtensions, loadFormExtensions, saveFormExtensions} from '../src/form/formExtensions.mjs';

const quiet = async fn => {
    const error = console.error;
    console.error = () => {};
    try { return await fn() } finally { console.error = error }
};

describe('form extensions', () => {
    it('keeps the extensions the modules give, skips null and failing factories', async () => {
        const win = {entityName: 'Voyage'},
              ext = {load() {}};

        const list = await quiet(() => createFormExtensions([
            w => w.entityName === 'Voyage' ? ext : null,
            () => null,
            () => { throw new Error('broken') }
        ], win));

        assert.deepEqual(list, [ext]);
    });

    it('awaits load() in order before returning, a failing one does not stop the others', async () => {
        const calls = [],
              data  = {id: '1', formBuilder: {formStructure: []}};

        await quiet(() => loadFormExtensions([
            {load: async d => { await new Promise(r => setTimeout(r, 5)); calls.push(['a', d]) }},
            {load: () => { throw new Error('broken') }},
            {save() {}},
            {load: d => calls.push(['b', d])}
        ], data));

        assert.deepEqual(calls, [['a', data], ['b', data]]);
    });

    it('lets save() change the data in order', async () => {
        const event = {isNew: false, cancel: false, data: {formBuilder: {formStructure: [1], answer: 'x'}}};

        await saveFormExtensions([
            {save: async ({data}) => { delete data.formBuilder.formStructure }},
            {load() {}},
            {save: ({data, isNew}) => { data.extra = isNew }}
        ], event);

        assert.deepEqual(event.data, {formBuilder: {answer: 'x'}, extra: false});
    });

    it('rejects when a save() fails, so the save stops', async () => {
        await assert.rejects(saveFormExtensions([{save: () => { throw new Error('no') }}], {data: {}}), /no/);
    });
});
