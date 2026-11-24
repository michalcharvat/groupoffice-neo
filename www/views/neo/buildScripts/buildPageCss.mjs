// Compiles the stylesheet of the standalone pages (go\core\webclient\Page: installer, upgrade,
// error, maintenance and invitation pages) to dist/page.css.
//
// resources/scss/page/page.scss uses the GO tokens of the neo theme (goui-theme copy) and the GO
// helpers dp()/sp(); it is plain CSS for plain HTML, outside neo's theme build. Its url()s are
// relative to dist/ (../resources/fonts, ../resources/images). Runs in `npm run build-themes`,
// after neo's theme build.
import fs              from 'node:fs';
import path            from 'node:path';
import * as sass       from 'sass';

const root   = path.resolve(import.meta.dirname, '..'),
      source = path.join(root, 'resources/scss/page/page.scss'),
      target = path.join(root, 'dist/page.css');

const result = sass.compile(source, {style: 'compressed'});

fs.mkdirSync(path.dirname(target), {recursive: true});
fs.writeFileSync(target, result.css + '\n');
console.log('Wrote ' + path.relative(root, target));
