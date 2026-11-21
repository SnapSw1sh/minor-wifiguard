import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createAppServer } from '../server.mjs';

test('Static server serves the app only and refuses writes and traversal', async t => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const raw = (path,method = 'GET') => new Promise((resolve,reject) => {
    const req = request({ hostname:'127.0.0.1', port, path, method },res => {
      let body=''; res.setEncoding('utf8'); res.on('data',chunk => body+=chunk); res.on('end',() => resolve({ status:res.statusCode,headers:res.headers,body }));
    });
    req.on('error',reject);req.end();
  });
  const home = await raw('/');
  assert.equal(home.status,200); assert.ok(home.body.includes('WiFiGuard'));
  assert.ok(home.headers['content-security-policy'].includes("connect-src 'none'"));
  const js = await raw('/src/app.js'); assert.equal(js.status,200); assert.ok(js.headers['content-type'].startsWith('text/javascript'));
  assert.equal((await raw('/','HEAD')).body,'');
  assert.equal((await raw('/','POST')).status,405);
  for (const path of ['/README.md','/package.json','/.openai/hosting.json','/../README.md','/src/missing.js']) assert.equal((await raw(path)).status,404);
  assert.equal((await raw('/..%2fREADME.md')).status,403);
  assert.equal((await raw('/%5c..%5cREADME.md')).status,400);
  assert.equal((await raw('/%00')).status,400);
  assert.equal((await raw('/%zz')).status,400);
});
