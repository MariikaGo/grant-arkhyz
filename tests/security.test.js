const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.PORT = '0';
process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD = 'test-only:password';
process.env.ADMIN_ORIGIN = 'https://admin.example.test';
delete process.env.DATABASE_URL;
const { server, pool } = require('../server');
const base = () => `http://127.0.0.1:${server.address().port}`;
const auth = 'Basic ' + Buffer.from('test-admin:test-only:password').toString('base64');
after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
test('public aliases stay open and show separate units', async () => {
  for (const path of ['/', '/index.html', '/start-sales.html']) {
    const res = await fetch(base() + path);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Студия и большой номер сдаются отдельно/);
    assert.equal(res.headers.get('x-powered-by'), null);
  }
});
test('project files are never public', async () => {
  for (const path of ['/server.js', '/package.json', '/README.md', '/.git/config', '/.env', '/tests/security.test.js']) {
    assert.equal((await fetch(base() + path)).status, 404, path);
  }
});
test('all administrative API methods require credentials before database access', async () => {
  for (const path of ['/api/bookings', '/api/reviews', '/api/investments', '/admin.html', '/ADMIN.HTML']) {
    assert.equal((await fetch(base() + path)).status, 401, path);
  }
  for (const method of ['DELETE', 'PUT']) {
    assert.equal((await fetch(base() + '/api/bookings/1', { method })).status, 401);
  }
  assert.equal((await fetch(base() + '/admin.html', {headers:{authorization:'Basic !!!'}})).status,401);
});
test('admin authentication supports passwords containing colons', async () => {
  assert.equal((await fetch(base() + '/admin.html', {headers:{authorization:auth}})).status,200);
});
test('cross-origin admin writes blocked; public submission retired', async () => {
  for (const origin of [undefined, 'https://evil.example']) {
    const headers = {authorization:auth}; if (origin) headers.origin = origin;
    assert.equal((await fetch(base() + '/api/bookings/1',{method:'DELETE',headers})).status,403);
  }
  const res = await fetch(base() + '/api/submit-form',{method:'POST'});
  assert.equal(res.status,410);
  assert.equal(res.headers.get('access-control-allow-origin'),null);
});
