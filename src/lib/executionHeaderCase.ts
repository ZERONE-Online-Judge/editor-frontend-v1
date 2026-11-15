import type { JobKind, ProblemDocument, SourceFile } from './types';

export type HeaderCaseSource = {
  name: string;
  language: string;
  sha256?: string;
  content?: string;
};

export class ExecutionCancelledError extends Error {
  constructor() {
    super('실행을 취소했습니다.');
    this.name = 'ExecutionCancelledError';
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function names(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((name): name is string => typeof name === 'string')
    : [];
}

function cFamily(language: string) {
  return /^(?:c(?:99|11|17|23)?|cpp(?:11|14|17|20|23|26)?|c\+\+(?:11|14|17|20|23|26)?)$/i.test(
    language,
  );
}

/** Only sources that can participate in this requested execution. */
export function executionHeaderSources(
  kind: JobKind,
  document: ProblemDocument,
  options: Record<string, unknown>,
): HeaderCaseSource[] {
  if (kind === 'render' || (kind === 'package' && options.verify === false))
    return [];
  const selected = new Map<string, HeaderCaseSource>();
  const add = (source?: SourceFile | HeaderCaseSource) => {
    if (source && cFamily(source.language)) selected.set(source.name, source);
  };
  const file = (name: unknown) => {
    if (typeof name === 'string') add(document.files[name]);
  };
  const solutionLanguages = new Set<string>();
  const temporary = new Map(
    (Array.isArray(options.temporary_solutions)
      ? options.temporary_solutions
      : []
    )
      .map(object)
      .filter((source) => typeof source.name === 'string')
      .map((source) => [String(source.name), source]),
  );
  const solution = (name?: string) => {
    if (!name) return;
    const pasted = temporary.get(name);
    const saved = document.solutions[name];
    if ((pasted?.tag ?? saved?.tag) === 'NR') return;
    const source =
      pasted &&
      typeof pasted.language === 'string' &&
      typeof pasted.content === 'string'
        ? { name, language: pasted.language, content: pasted.content }
        : saved;
    add(source);
    if (source && cFamily(source.language))
      solutionLanguages.add(source.language.startsWith('cpp') ? 'cpp' : 'c');
    if (document.info.interactive) file(document.interactor);
  };
  const main = () =>
    solution(
      Object.values(document.solutions).find((source) => source.tag === 'MA')
        ?.name,
    );
  const validator = () => {
    file(document.validator);
    document.extra_validators.forEach(file);
  };
  const checker = () => file(document.checker);
  const command = (value: unknown) => {
    if (typeof value !== 'string') return;
    const token = value.trim().match(/^(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
    const first = token?.[1] || token?.[2] || token?.[3];
    if (!first) return;
    const exact = document.files[first];
    if (exact) add(exact);
    else {
      const matches = Object.values(document.files).filter(
        (source) => source.name.replace(/\.[^.]+$/, '') === first,
      );
      if (matches.length === 1) add(matches[0]);
    }
  };
  const generators = () => {
    const requested = names(options.testsets);
    const selectedSets =
      options.all_testsets ||
      (kind === 'package' && options.export_format !== 'zoj')
        ? Object.keys(document.testsets)
        : requested.length
          ? requested
          : [
              typeof options.testset === 'string'
                ? options.testset
                : Object.keys(document.testsets)[0],
            ];
    for (const name of selectedSets) {
      const set = document.testsets[name];
      if (!set) continue;
      if (set.script.trim()) {
        set.script.split('\n').forEach(command);
        continue;
      }
      const indices = Array.isArray(options.test_indices)
        ? options.test_indices
        : [];
      for (const test of Object.values(set.tests))
        if (!indices.length || indices.includes(test.index))
          command(test.command);
    }
  };
  if (kind === 'validator-tests') validator();
  else if (kind === 'checker-tests') file(document.checker);
  else if (kind === 'stress') {
    validator();
    checker();
    command(options.generator);
    for (const pattern of Array.isArray(options.patterns)
      ? options.patterns
      : [])
      command(object(pattern).command);
    if (options.reference) solution(String(options.reference));
    else main();
    for (const name of names(options.candidates)) solution(name);
    if (
      !names(options.candidates).length &&
      typeof options.candidate === 'string'
    )
      solution(options.candidate);
  } else {
    validator();
    const mode = options.prepare_mode || 'full';
    const frozen = kind === 'verify' && options.snapshot === 'committed';
    if (kind !== 'prepare' || mode === 'full' || mode === 'answers') {
      if (!frozen) main();
      checker();
    }
    if (!frozen && (kind !== 'prepare' || mode === 'full' || mode === 'inputs'))
      generators();
    if (kind === 'verify' || kind === 'package') {
      const requested = names(options.solutions);
      const solutions =
        kind === 'package' || !requested.length
          ? [...Object.keys(document.solutions), ...temporary.keys()]
          : requested;
      for (const name of solutions) solution(name);
    }
  }
  // Only explicitly compiled units; unrelated uploaded headers are not executed.
  if (solutionLanguages.size) {
    for (const source of Object.values(document.files)) {
      if (
        source.compile_with_solution &&
        solutionLanguages.has(source.language.startsWith('cpp') ? 'cpp' : 'c')
      )
        add(source);
    }
  }
  return [...selected.values()];
}
