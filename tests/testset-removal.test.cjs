const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/lib/testsetRemoval.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  filename,
);
const { removeTestset, testsetRemovalImpact, testsetRemovalIssue } =
  loaded.exports;
const group = () => ({
  points_policy: 'COMPLETE_GROUP',
  feedback_policy: 'COMPLETE',
  dependencies: [],
});
const set = (groups = {}) => ({
  tests: {},
  script: '',
  groups_enabled: true,
  groups,
});
const permissions = {
  editTests: true,
  editSolutions: true,
  editMaterials: true,
};
function fixture() {
  return {
    info: { name: 'Keep original data' },
    statements: { korean: { legend: 'Original statement' } },
    testsets: {
      tests: {
        ...set({
          small: group(),
          large: { ...group(), dependencies: ['small'] },
        }),
        script: 'generator > 2',
        order: [7, 1],
        tests: {
          1: {
            index: 1,
            input_sha: 'input',
            answer_sha: 'answer',
            group: 'small',
            sample: true,
          },
          7: {
            index: 7,
            input_sha: 'other',
            answer_sha: 'answer',
            group: 'large',
            sample: false,
          },
        },
      },
      samples: {
        ...set({ public: group() }),
        script: 'keep-generator > $',
        order: [9],
        tests: { 9: { index: 9, group: 'public' } },
      },
    },
    solutions: {
      'main.cpp': {
        name: 'main.cpp',
        sha256: 'source',
        extra_tags: { tests: 'WA', small: 'TL', samples: 'OK', public: 'OK' },
        group_tags: { tests: { small: 'WA' }, samples: { public: 'OK' } },
      },
      'unchanged.cpp': {
        name: 'unchanged.cpp',
        sha256: 'other-source',
        extra_tags: { samples: 'OK' },
        group_tags: { samples: { public: 'OK' } },
      },
    },
    files: {
      'generator.cpp': { sha256: 'generator-source' },
      'diagram.png': { sha256: 'picture' },
    },
    validator_tests: { 1: { input_sha: 'original-unit' } },
    checker_tests: {},
    materials: {
      handout: {
        strategy: 'WITH_STATEMENT',
        files: ['diagram.png'],
        solutions: ['main.cpp'],
        testsets: ['samples', 'tests'],
      },
      onlyRemoved: {
        strategy: 'NONE',
        files: [],
        solutions: [],
        testsets: ['tests'],
      },
      untouched: {
        strategy: 'NONE',
        files: ['diagram.png'],
        solutions: [],
        testsets: ['samples'],
      },
    },
  };
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

test('removes the selected set and its references while preserving files and every surviving setting', () => {
  const document = freeze(fixture());
  const before = JSON.stringify(document);
  const next = removeTestset(document, 'tests');
  assert.deepEqual(Object.keys(next.testsets), ['samples']);
  assert.deepEqual(next.testsets.samples, document.testsets.samples);
  assert.deepEqual(next.solutions['main.cpp'].extra_tags, {
    samples: 'OK',
    public: 'OK',
  });
  assert.deepEqual(next.solutions['main.cpp'].group_tags, {
    samples: { public: 'OK' },
  });
  assert.deepEqual(
    next.solutions['unchanged.cpp'],
    document.solutions['unchanged.cpp'],
  );
  assert.deepEqual(next.materials.handout, {
    ...document.materials.handout,
    testsets: ['samples'],
  });
  assert.deepEqual(next.materials.onlyRemoved, {
    ...document.materials.onlyRemoved,
    testsets: [],
  });
  assert.deepEqual(next.materials.untouched, document.materials.untouched);
  for (const key of [
    'files',
    'info',
    'statements',
    'validator_tests',
    'checker_tests',
  ])
    assert.deepEqual(next[key], document[key]);
  assert.equal(
    JSON.stringify(document),
    before,
    'existing revision/job copies must not be mutated',
  );
});

test('counts the actual impacted solutions and materials rather than the number of overrides', () => {
  assert.deepEqual(testsetRemovalImpact(fixture(), 'tests'), {
    tests: 2,
    groups: 2,
    script: true,
    solutions: 1,
    materials: 2,
  });
  assert.deepEqual(testsetRemovalImpact(fixture(), 'samples'), {
    tests: 1,
    groups: 1,
    script: true,
    solutions: 2,
    materials: 2,
  });
});

test('removes a set override before its name could be reinterpreted as a surviving group', () => {
  const document = fixture();
  document.testsets.samples.groups.tests = group();
  document.solutions['main.cpp'].group_tags.samples.tests = 'OK';
  const next = removeTestset(document, 'tests');
  assert.equal(next.solutions['main.cpp'].extra_tags.tests, undefined);
  assert.equal(next.solutions['main.cpp'].group_tags.samples.tests, 'OK');
});

test('preserves an override for a surviving set whose name equals a removed group', () => {
  const document = fixture();
  document.testsets.tests.groups.samples = group();
  const next = removeTestset(document, 'tests');
  assert.equal(next.solutions['main.cpp'].extra_tags.samples, 'OK');
  assert.deepEqual(next.testsets.samples, document.testsets.samples);
});

test('preserves qualified overrides for duplicate group names in other sets', () => {
  const document = fixture();
  document.testsets.samples.groups.small = group();
  delete document.solutions['main.cpp'].extra_tags.small;
  document.solutions['main.cpp'].group_tags.samples.small = 'TL';
  const next = removeTestset(document, 'tests');
  assert.deepEqual(next.solutions['main.cpp'].group_tags, {
    samples: { public: 'OK', small: 'TL' },
  });
});

test('requires only the permissions for fields that actually change', () => {
  const document = fixture();
  assert.equal(testsetRemovalIssue(document, 'tests', permissions), null);
  assert.match(
    testsetRemovalIssue(document, 'tests', {
      ...permissions,
      editTests: false,
    }),
    /테스트 편집/,
  );
  assert.match(
    testsetRemovalIssue(document, 'tests', {
      ...permissions,
      editSolutions: false,
    }),
    /풀이·기대 판정 편집/,
  );
  assert.match(
    testsetRemovalIssue(document, 'tests', {
      ...permissions,
      editMaterials: false,
    }),
    /공개 자료 편집/,
  );
  const issue = testsetRemovalIssue(document, 'tests', {
    editTests: true,
    editSolutions: false,
    editMaterials: false,
  });
  assert.match(issue, /풀이·기대 판정 편집 및 공개 자료 편집/);
  document.testsets.unreferenced = set();
  assert.equal(
    testsetRemovalIssue(document, 'unreferenced', {
      editTests: true,
      editSolutions: false,
      editMaterials: false,
    }),
    null,
  );
  assert.deepEqual(
    removeTestset(document, 'unreferenced').solutions,
    document.solutions,
  );
});

test('protects the final set and missing or inherited keys without touching the document', () => {
  const document = fixture();
  delete document.testsets.samples;
  const before = JSON.stringify(document);
  assert.throws(() => removeTestset(document, 'tests'), /최소 1개/);
  assert.match(testsetRemovalIssue(document, 'tests', permissions), /최소 1개/);
  assert.equal(JSON.stringify(document), before);
  assert.throws(
    () => removeTestset(fixture(), 'missing'),
    /삭제할 테스트 세트가 없습니다/,
  );
  assert.throws(
    () => removeTestset(fixture(), 'constructor'),
    /삭제할 테스트 세트가 없습니다/,
  );
});

test('can delete the default-named or an empty scripted set when another set remains', () => {
  const document = fixture();
  document.testsets.tests = { ...set(), script: 'generator > $' };
  delete document.solutions['main.cpp'].extra_tags.small;
  delete document.solutions['main.cpp'].group_tags.tests;
  assert.equal(testsetRemovalIssue(document, 'tests', permissions), null);
  assert.equal(testsetRemovalImpact(document, 'tests').tests, 0);
  assert.equal(testsetRemovalImpact(document, 'tests').script, true);
  assert.equal(removeTestset(document, 'tests').testsets.tests, undefined);
});
