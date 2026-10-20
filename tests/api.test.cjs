const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../src/lib/api.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
const helperName = path.resolve(__dirname, '../src/lib/largeText.ts');
const helper = new Module(helperName, module);
helper.paths = module.paths;
helper._compile(
  ts.transpileModule(fs.readFileSync(helperName, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  helperName,
);
const originalRequire = loaded.require.bind(loaded);
loaded.require = (id) =>
  id === './largeText' ? helper.exports : originalRequire(id);
loaded._compile(compiled, filename);
const { api, upload, ApiError } = loaded.exports;
test('Mutation requests keep same-origin credentials and the CSRF header', async () => {
  const previous = global.fetch;
  let actual;
  global.fetch = async (url, opts) => {
    actual = { url, opts };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  try {
    await api('/problems', {
      method: 'POST',
      body: JSON.stringify({ name: 'sum' }),
    });
    assert.equal(actual.url, '/api/problems');
    assert.equal(actual.opts.credentials, 'same-origin');
    assert.equal(actual.opts.headers.get('X-Editor-Request'), '1');
    assert.equal(actual.opts.headers.get('Content-Type'), 'application/json');
  } finally {
    global.fetch = previous;
  }
});
test('Binary uploads retain the body and do not declare JSON', async () => {
  const previous = global.fetch;
  let actual;
  global.fetch = async (url, opts) => {
    actual = { url, opts };
    return {
      ok: true,
      json: async () => ({ sha256: '0'.repeat(64), size: 3 }),
    };
  };
  try {
    const body = new Blob(['abc']);
    await upload('problem', body);
    assert.equal(actual.opts.body, body);
    assert.equal(actual.opts.headers.get('Content-Type'), null);
    assert.equal(actual.opts.headers.get('X-Editor-Request'), '1');
  } finally {
    global.fetch = previous;
  }
});
test('Conflict details are retained for explicit resolution', async () => {
  const previous = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 409,
    json: async () => ({
      error: {
        code: 'revision_conflict',
        message: 'Conflict',
        conflicts: ['info/name'],
      },
    }),
  });
  try {
    await assert.rejects(
      api('/problems'),
      (e) =>
        e instanceof ApiError &&
        e.status === 409 &&
        e.code === 'revision_conflict' &&
        e.details.conflicts[0] === 'info/name',
    );
  } finally {
    global.fetch = previous;
  }
});
