const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'dist');
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target);
for (const file of ['index.html', 'styles.css', 'favicon.svg', 'robots.txt', 'google72712df90b9e25b7.html', 'yandex_0e2572565aa11afc.html', 'yandex_9a2800b80c3250ef.html']) {
  fs.copyFileSync(path.join(root, file), path.join(target, file));
}
// Legacy URLs retain the same updated content on ordinary static hosting.
fs.copyFileSync(path.join(root, 'index.html'), path.join(target, 'start-sales.html'));
console.log('Public files only: dist/ (no admin, server, database or project metadata)');
