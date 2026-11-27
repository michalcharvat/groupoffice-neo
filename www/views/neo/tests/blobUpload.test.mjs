// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
// neo's own unit-test globals (no browser): setup.mjs first, then the engine
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: BlobField}  = await import('../src/form/field/BlobField.mjs');
const {default: ImageField} = await import('../src/form/field/ImageField.mjs');
const {default: uploader}   = await import('../src/jmap/Uploader.mjs');

/**
 * Replaces uploader.upload() for one test: resolves with `blob` or rejects with `error`
 */
function stubUpload({blob, error}) {
    const original = uploader.upload;
    uploader.upload = () => error ? Promise.reject(error) : Promise.resolve(blob);
    return () => uploader.upload = original
}

/**
 * Replaces uploader.upload() with uploads the test settles itself, in any order
 * @returns {{pending: Object[], restore: Function}} pending: [{resolve, reject}] per upload
 */
function deferUploads() {
    const original = uploader.upload,
          pending  = [];

    uploader.upload = () => new Promise((resolve, reject) => pending.push({resolve, reject}));
    return {pending, restore: () => uploader.upload = original}
}

const file = {name: 'logo.png'};

describe('file fields and failed uploads', () => {
    let restore;

    afterEach(() => restore?.());

    for (const [name, create, currentId] of [
        ['GO.form.field.BlobField',  () => Neo.create(BlobField,  {appName: 'test', name: 'logo', value: {id: 'old', name: 'old.png'}}), f => f.value?.id],
        ['GO.form.field.ImageField', () => Neo.create(ImageField, {appName: 'test', name: 'photoBlobId', value: 'old'}), f => f.value]
    ]) {
        describe(name, () => {
            it('keeps the old file but is invalid after a failed replacement, flush() waits for it', async () => {
                restore = stubUpload({error: new Error('Too large')});
                const field = create();

                field.onInputChange ? field.onInputChange({files: [file]}) : field.onFileChange({files: [file]});
                await field.flush();

                assert.equal(currentId(field), 'old');
                assert.equal(field.isValid(), false);
                assert.equal(field.validate(false), false);
                field.destroy()
            });

            it('a successful upload after a failure makes it valid again', async () => {
                restore = stubUpload({error: new Error('Too large')});
                const field = create();
                const upload = field.onInputChange?.bind(field) || field.onFileChange.bind(field);

                await upload({files: [file]});
                restore();
                restore = stubUpload({blob: {blobId: 'new', name: 'logo.png'}});
                await upload({files: [file]});

                assert.equal(currentId(field), 'new');
                assert.equal(field.isValid(), true);
                field.destroy()
            });

            it('an upload the user aborted keeps the old file without an error', async () => {
                restore = stubUpload({error: Object.assign(new Error('aborted'), {name: 'AbortError'})});
                const field = create();

                await (field.onInputChange || field.onFileChange).call(field, {files: [file]});

                assert.equal(currentId(field), 'old');
                assert.equal(field.isValid(), true);
                field.destroy()
            });

            it('flush() waits for an upload that fails later, also one started while waiting', async () => {
                const deferred = deferUploads();
                restore = deferred.restore;
                const field  = create(),
                      upload = (field.onInputChange || field.onFileChange).bind(field);

                upload({files: [file]});
                let flushed = false;
                const flush = field.flush().then(() => flushed = true);

                upload({files: [file]});
                deferred.pending[0].resolve({blobId: 'first', name: 'a.png'});
                await new Promise(resolve => setTimeout(resolve, 0));
                assert.equal(flushed, false);

                deferred.pending[1].reject(new Error('Too large'));
                await flush;
                assert.equal(field.isValid(), false);
                assert.equal(currentId(field), 'old');
                field.destroy()
            });

            it('an older upload that settles last does not replace the newer outcome', async () => {
                const deferred = deferUploads();
                restore = deferred.restore;
                const field  = create(),
                      upload = (field.onInputChange || field.onFileChange).bind(field);

                upload({files: [file]});
                upload({files: [file]});
                deferred.pending[1].reject(new Error('Too large'));
                deferred.pending[0].resolve({blobId: 'stale', name: 'a.png'});
                await field.flush();

                assert.equal(currentId(field), 'old');
                assert.equal(field.isValid(), false);
                field.destroy()
            });

            it('destroyed during an upload: settling does not throw', async () => {
                const deferred = deferUploads();
                restore = deferred.restore;
                const field = create(),
                      done  = (field.onInputChange || field.onFileChange).call(field, {files: [file]});

                field.destroy();
                deferred.pending[0].reject(new Error('Too large'));
                await done
            });

            it('removing the file clears the upload error', async () => {
                restore = stubUpload({error: new Error('Too large')});
                const field = create();

                await (field.onInputChange || field.onFileChange).call(field, {files: [file]});
                field.onClearClick();

                assert.equal(currentId(field) ?? null, null);
                assert.equal(field.isValid(), true);
                field.destroy()
            });
        });
    }

    it('BlobField: a failed first upload offers Remove, which discards it', async () => {
        restore = stubUpload({error: new Error('Too large')});
        const field = Neo.create(BlobField, {appName: 'test', name: 'logo'});

        assert.equal(field.vdom.cn[4].removeDom, true);
        await field.onInputChange({files: [file]});
        assert.equal(field.vdom.cn[4].removeDom, false);
        field.onClearClick();
        assert.equal(field.vdom.cn[4].removeDom, true);
        assert.equal(field.isValid(), true);
        field.destroy()
    });

    it('BlobField: reset() of a required field shows no stale upload error', async () => {
        restore = stubUpload({error: new Error('Too large')});
        const field = Neo.create(BlobField, {appName: 'test', name: 'cert', required: true});

        await field.onInputChange({files: [file]});
        assert.equal(field.vdom.cn[5].text, 'Too large');
        field.reset(null);
        assert.notEqual(field.vdom.cn[5].text, 'Too large');
        field.destroy()
    });

    it('BlobField: required without a file is invalid', () => {
        const field = Neo.create(BlobField, {appName: 'test', name: 'cert', required: true});

        assert.equal(field.isValid(), false);
        field.value = {id: 'x'};
        assert.equal(field.isValid(), true);
        field.destroy()
    });
});
