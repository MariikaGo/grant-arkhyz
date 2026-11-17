const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
test('static artifact contains no administrative or source files', () => {
  execFileSync(process.execPath, ['scripts/build-public.js']);
  const files = fs.readdirSync('dist');
  for (const name of ['admin.html', 'server.js', 'package.json', 'images', '.git', '.env']) assert.ok(!files.includes(name));
  const html = fs.readFileSync('dist/index.html', 'utf8');
  assert.ok(!html.includes('<form'));
  assert.ok(!html.includes('mc.yandex.ru'));
  assert.ok(!html.includes('fonts.googleapis.com'));
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${id}"`), id);
});
test('stored text is escaped in admin tables and edit form attributes', () => {
  const html = fs.readFileSync('admin.html', 'utf8');
  const fn = html.match(/function escapeHTML\(value\) \{[\s\S]*?\n        \}/)[0];
  const escape = vm.runInNewContext(fn + '; escapeHTML');
  assert.equal(escape('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escape('</textarea><script>alert(1)</script>'), '&lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.ok(!/\$\{item\./.test(html));
});
