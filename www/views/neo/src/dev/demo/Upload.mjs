import Container    from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Component    from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import Button       from '../../button/Button.mjs';
import UploadButton from '../../component/UploadButton.mjs';
import {fileSize}   from '../../Format.mjs';
import {notifyError} from '../../Notify.mjs';
import uploader, {Uploader} from '../../jmap/Uploader.mjs';

/**
 * Dev demo: GO.jmap.Uploader — several files at once, the progress panel bottom right
 * (abort one or all), the server's size limit. Generated files make the progress visible
 * on a fast local server.
 */
class UploadDemo extends Container {
    static config = {
        className: 'GO.dev.demo.Upload',
        layout   : {ntype: 'vbox', align: 'start'},
        style    : {padding: '16px', gap: '16px', overflow: 'auto'},
        items    : [{
            module   : Component,
            reference: 'intro'
        }, {
            module: Container,
            layout: {ntype: 'hbox', wrap: 'wrap'},
            style : {gap: '8px'},
            items : [{
                module    : UploadButton,
                reference : 'choose',
                autoUpload: true,
                buttonText: 'Choose files'
            }, {
                module   : Button,
                ui       : 'secondary',
                reference: 'one',
                text     : 'One generated 200 MB file'
            }, {
                module   : Button,
                ui       : 'secondary',
                reference: 'six',
                text     : 'Six generated 40 MB files (queue)'
            }, {
                module   : Button,
                ui       : 'secondary',
                reference: 'tooLarge',
                text     : 'A file over the size limit'
            }]
        }, {
            module   : Component,
            reference: 'results',
            vdom     : {tag: 'ul', cn: []}
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        // autoUpload: the button uploads, the demo only lists the blobs
        me.getReference('choose').on('upload', ({blobs}) => me.addResults(blobs.map(UploadDemo.blobText)));
        me.getReference('one').handler      = () => me.uploadFiles([UploadDemo.generate('generated-200mb.bin', 200)]);
        me.getReference('six').handler      = () => me.uploadFiles([1, 2, 3, 4, 5, 6].map(n => UploadDemo.generate(`generated-${n}.bin`, 40)));
        me.getReference('tooLarge').handler = () => me.uploadTooLarge();

        me.getReference('intro').html = `<p>maxSizeUpload: <b>${fileSize(uploader.maxSizeUpload) || 'none'}</b>,
            maxConcurrentUpload: <b>${uploader.maxConcurrentUpload}</b>. The panel shows after
            ${uploader.showDelay} ms; abort a file with its × or all with "Abort all".</p>`
    }

    /**
     * @param {String} name
     * @param {Number} mb
     * @returns {File}
     */
    static generate(name, mb) {
        // other content per file: equal files get the same blob id
        const data = new Uint8Array(mb * 1024 * 1024);
        crypto.getRandomValues(data.subarray(0, 1024));
        return new File([data], name, {type: 'application/octet-stream'})
    }

    async uploadFiles(files) {
        const blobs = await uploader.uploadMany(files, {component: this});
        this.addResults(blobs.map(UploadDemo.blobText))
    }

    static blobText(blob) {
        return `${blob.name} (${fileSize(blob.size)}): ${blob.blobId}`
    }

    async uploadTooLarge() {
        // the size is checked before anything is sent: no need for a real file
        const max = uploader.maxSizeUpload || 100 * 1024 * 1024;

        try {
            await uploader.upload({name: 'too-large.bin', size: max + 1}, {component: this})
        } catch (e) {
            Uploader.isAbort(e) || notifyError(this, e)
        }
    }

    addResults(lines) {
        const results = this.getReference('results');

        results.vdom.cn.push(...lines.map(text => ({tag: 'li', text})));
        results.update()
    }
}

export default Neo.setupClass(UploadDemo);
