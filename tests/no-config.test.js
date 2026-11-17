const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.PORT = '0';
delete process.env.ADMIN_USERNAME;
delete process.env.ADMIN_PASSWORD;
delete process.env.DATABASE_URL;
const { server, pool } = require('../server');
after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
test('missing credentials disable only administration', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/admin.html')).status, 503);
  assert.equal((await fetch(base + '/api/bookings')).status, 503);
});
