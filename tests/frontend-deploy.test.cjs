const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const process = require('node:process');
const { spawnSync } = require('node:child_process');

const target = 'a'.repeat(40);
const backend = 'b'.repeat(40);
const previous = 'c'.repeat(40);
const source = fs.readFileSync(
  path.resolve(__dirname, '../deploy/deploy-main.sh'),
  'utf8',
);

function deploy(overrides = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-ui-deploy-'));
  const root = path.join(folder, 'service');
  const repositories = path.join(folder, 'sources');
  const bin = path.join(folder, 'bin');
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.mkdirSync(path.join(repositories, 'editor_backend_v1/deploy'), {
    recursive: true,
  });
  fs.mkdirSync(bin);
  const release = path.join(root, 'config/release.env');
  const before = [
    `EDITOR_API_IMAGE=zoj-editor-api:${backend}`,
    `EDITOR_FRONTEND_IMAGE=zoj-editor-frontend:${previous}`,
    `EDITOR_RUNNER_IMAGE=zoj-editor-runtime:${backend}`,
    `EDITOR_RENDER_IMAGE=zoj-editor-renderer:${backend}`,
    `EDITOR_RUNTIME_REVISION=editor-runtime-${backend}`,
    '',
  ].join('\n');
  fs.writeFileSync(release, before);
  fs.writeFileSync(path.join(root, 'config/editor.env'), '');
  const image = path.join(folder, 'image');
  fs.writeFileSync(image, `zoj-editor-frontend:${previous}`);
  const log = path.join(folder, 'calls');
  fs.writeFileSync(log, '');
  const script = path.join(folder, 'deploy.sh');
  fs.writeFileSync(
    script,
    source
      .replace('root=/srv/zoj-editor', `root=${root}`)
      .replace('source_root=/srv/editor-source', `source_root=${repositories}`),
  );
  function executable(name, code) {
    fs.writeFileSync(path.join(bin, name), code, { mode: 0o755 });
  }
  executable('flock', '#!/bin/sh\nexit 0\n');
  executable(
    'git',
    `#!/usr/bin/env node
const a=process.argv.slice(2), p=a[1]; a.splice(0,2);
if(a.join(' ')==='remote get-url origin') console.log('https://github.com/ZERONE-Online-Judge/editor-'+(p.endsWith('editor_frontend_v1')?'frontend':'backend')+'-v1.git');
if(a[0]==='status' && process.env.DIRTY==='1') console.log(' M unrelated-file');
if(a.join(' ')==='rev-parse origin/main') console.log(process.env.NEWER==='1'?'d'.repeat(40):'${target}');
if(a.join(' ')==='rev-parse HEAD') console.log('${backend}');
`,
  );
  executable(
    'docker',
    `#!/usr/bin/env node
const fs=require('node:fs'),a=process.argv.slice(2),e=process.env;
fs.appendFileSync(e.CALL_LOG,JSON.stringify({args:a,image:e.EDITOR_FRONTEND_IMAGE})+'\\n');
if(a[0]==='compose') {
 const c=a.slice(a.indexOf('-f')+2), service=c.at(-1);
 if(c[0]==='ps') console.log(service==='frontend'?(fs.readFileSync(e.IMAGE,'utf8').endsWith('${previous}')?'frontend-old':'frontend-new'):service+'-fixed');
 if(c[0]==='up') {
  if(e.FAIL_ACTIVATE==='1' && e.EDITOR_FRONTEND_IMAGE.endsWith('${target}')) process.exit(1);
  fs.writeFileSync(e.IMAGE,e.EDITOR_FRONTEND_IMAGE);
 }
}
if(a[0]==='inspect') console.log(fs.readFileSync(e.IMAGE,'utf8'));
if(a[0]==='build' && e.FAIL_BUILD==='1') process.exit(1);
if(a[0]==='exec' && e.FAIL_HEALTH==='1' && a.includes('nginx')) process.exit(1);
`,
  );
  try {
    const result = spawnSync('bash', [script, target], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        CALL_LOG: log,
        IMAGE: image,
        ...overrides,
      },
    });
    return {
      ...result,
      before,
      release: fs.readFileSync(release, 'utf8'),
      image: fs.readFileSync(image, 'utf8'),
      calls: fs
        .readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    };
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

test('Frontend release changes only its image and preserves API, worker and runtime releases', () => {
  const result = deploy();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.image, `zoj-editor-frontend:${target}`);
  assert.equal(
    result.release,
    result.before.replace(
      `EDITOR_FRONTEND_IMAGE=zoj-editor-frontend:${previous}`,
      `EDITOR_FRONTEND_IMAGE=zoj-editor-frontend:${target}`,
    ),
  );
  const ups = result.calls.filter((c) => c.args.includes('up'));
  assert.equal(ups.length, 1);
  assert.deepEqual(ups[0].args.slice(-5), [
    'up',
    '-d',
    '--no-deps',
    '--no-build',
    'frontend',
  ]);
  assert.ok(
    result.calls.every(
      (c) => !/preflight|SIGUSR1|pg_dump|alembic|stop/.test(c.args.join(' ')),
    ),
  );
});

test('Build failures keep the active frontend and release manifest intact', () => {
  const result = deploy({ FAIL_BUILD: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(result.image, `zoj-editor-frontend:${previous}`);
  assert.equal(result.release, result.before);
  assert.ok(result.calls.every((c) => !c.args.includes('up')));
});

for (const failure of ['FAIL_ACTIVATE', 'FAIL_HEALTH']) {
  test(`${failure} restores the old frontend without advancing the release manifest`, () => {
    const result = deploy({ [failure]: '1' });
    assert.notEqual(result.status, 0);
    assert.equal(result.image, `zoj-editor-frontend:${previous}`);
    assert.equal(result.release, result.before);
    const ups = result.calls.filter((c) => c.args.includes('up'));
    assert.equal(ups.length, 2);
    assert.equal(ups.at(-1).image, `zoj-editor-frontend:${previous}`);
    assert.ok(ups.every((c) => c.args.at(-1) === 'frontend'));
  });
}

test('Superseded commits and unrelated dirty server files cannot deploy', () => {
  for (const flag of ['NEWER', 'DIRTY']) {
    const result = deploy({ [flag]: '1' });
    assert.equal(result.status, flag === 'NEWER' ? 0 : 1);
    assert.equal(result.image, `zoj-editor-frontend:${previous}`);
    assert.equal(result.release, result.before);
    assert.equal(result.calls.length, 0);
  }
});
