/**
 * Helpers of the files module's neo UI
 */

/** Material icon per file extension (ExtJS filetype-<ext> classes) */
const ICONS = {
    folder: 'folder',
    pdf   : 'picture_as_pdf',
    zip: 'folder_zip', tar: 'folder_zip', tgz: 'folder_zip', gz: 'folder_zip', rar: 'folder_zip', '7z': 'folder_zip',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', bmp: 'image', svg: 'image', webp: 'image', heic: 'image', tif: 'image', tiff: 'image',
    mp3: 'audio_file', wav: 'audio_file', ogg: 'audio_file', flac: 'audio_file', m4a: 'audio_file',
    mp4: 'video_file', mov: 'video_file', avi: 'video_file', webm: 'video_file', ogv: 'video_file', mkv: 'video_file',
    xls: 'table_chart', xlsx: 'table_chart', ods: 'table_chart', csv: 'table_chart',
    ppt: 'slideshow', pptx: 'slideshow', odp: 'slideshow',
    doc: 'article', docx: 'article', odt: 'article', rtf: 'article', txt: 'article', md: 'article',
    html: 'code', htm: 'code', xml: 'code', json: 'code', js: 'code', php: 'code', css: 'code',
    eml: 'mail', msg: 'mail', ics: 'event', vcf: 'contact_page'
};

/**
 * @param {Object} record list record
 * @returns {Boolean}
 */
export function isFolder(record) {
    return record?.extension === 'folder' || String(record?.type_id || '').startsWith('d:')
}

/**
 * Material icon of a list record (a shared folder gets folder_shared like ExtJS)
 * @param {Object} record
 * @returns {String}
 */
export function fileIcon(record) {
    if (isFolder(record)) {
        return record.acl_id > 0 && !+record.readonly ? 'folder_shared' : 'folder'
    }

    return ICONS[String(record?.extension || '').toLowerCase()] || 'description'
}

/**
 * The legacy controllers send paths with HTML entities (htmlspecialchars / htmlentities)
 * @param {String} value
 * @returns {String}
 */
export function decodeEntities(value) {
    return String(value ?? '')
        .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (m, code) => String.fromCodePoint(+code))
        .replace(/&amp;/g, '&')
}

/**
 * Material icon of a tree node from its ExtJS iconCls
 * @param {String} iconCls
 * @returns {String}
 */
export function treeIcon(iconCls) {
    return {
        'ic-home'         : 'home',
        'ic-folder-shared': 'folder_shared',
        'ic-delete'       : 'delete',
        'ic-folder'       : 'folder'
    }[iconCls] || 'folder'
}

/**
 * Invalid file / folder name (ExtJS NewFolderDialog validator)
 * @param {String} name
 * @returns {Boolean}
 */
export function isValidName(name) {
    return !!name && !/[&/:*?"<>|\\]/.test(name) && !/[ .]$/.test(name)
}

// moved to the core DateUtil: the start page uses it too
export {userDateToYmd} from '../../../../views/neo/src/DateUtil.mjs';

/**
 * name and extension of a new file name for files/file/submit. The controller appends
 * "." + extension whenever `extension` is sent: without a dot it is left out, so the
 * file keeps its extension (like ExtJS)
 * @param {String} fileName
 * @returns {{name: String, extension?: String}}
 */
export function splitFileName(fileName) {
    const dot = fileName.lastIndexOf('.');
    return dot > 0 ? {name: fileName.slice(0, dot), extension: fileName.slice(dot + 1)} : {name: fileName}
}
