'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/src/main/assets/warzone/graphics-loader.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const bytes = new ArrayBuffer(99639408);
new Uint8Array(bytes)[0] = 80;

function setup(query, response) {
  const calls = { fetch: [], added: [], removed: [], files: [], failures: [] };
  const module = {
    addRunDependency: value => calls.added.push(value),
    removeRunDependency: value => calls.removed.push(value),
    FS_createPath: (...args) => calls.directory = args,
    FS_createDataFile: (...args) => calls.files.push(args),
    FS: {
      open: path => ({ path }), read: () => 123,
      readFile: () => 'terrainMode=2\n'
    }
  };
  const window = { BlockNightAndroid: { graphicsFailed: message => calls.failures.push(message) } };
  vm.runInNewContext(source, { window, location: { search: query }, URLSearchParams, Uint8Array,
    fetch: (...args) => { calls.fetch.push(args); return response(); } });
  return { calls, module, graphics: window.WarzoneGraphics };
}

(async () => {
  const normal = setup('?graphics=normal', () => { throw Error('Normal must not fetch HQ'); });
  normal.graphics.prepare(normal.module);
  assert.equal(normal.calls.fetch.length, 0);
  assert.equal(normal.calls.added.length, 0);
  assert.equal(normal.graphics.report().archiveLoaded, false);

  const high = setup('?graphics=high&graphics_probe=1', async () => ({ ok: true, arrayBuffer: async () => bytes }));
  high.graphics.prepare(high.module);
  assert.equal(high.calls.added.length, 1);
  assert.equal(high.calls.removed.length, 0, 'main waits for the archive');
  await tick();
  assert.equal(high.calls.fetch[0][0], '/warzone/optional/high-v3.wz');
  assert.equal(high.calls.files.length, 1);
  const [directory, name, data, read, write, own] = high.calls.files[0];
  assert.equal(directory + '/' + name, '/data/terrain_overrides/high.wz');
  assert.equal(data.buffer, bytes, 'mount the original bytes without rewriting the archive');
  assert.equal(data[0], 80);
  assert.ok(read && write && own);
  assert.deepEqual(high.calls.removed, high.calls.added);
  const stream = high.module.FS.open('/data/terrain_overrides/high.wz');
  high.module.FS.read(stream);
  high.module.FS.read({ path: '/unrelated' });
  assert.equal(high.graphics.report().nativeArchiveOpens, 1);
  assert.equal(high.graphics.report().nativeArchiveReadBytes, 123);

  for (const response of [
    async () => ({ ok: false }),
    async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) }),
    async () => { throw Error('Network failed'); }
  ]) {
    const failed = setup('?graphics=high', response);
    failed.graphics.prepare(failed.module); await tick();
    assert.equal(failed.calls.files.length, 0);
    assert.equal(failed.calls.removed.length, 0, 'failed High cannot silently launch Normal');
    assert.equal(failed.calls.failures.length, 1);
    assert.ok(failed.graphics.report().error);
  }
  console.log('Graphics loader: Normal, original HQ mount, native read probe, unavailable/truncated/network failure passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
