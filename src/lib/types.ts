export type User = {
  id: string;
  account_id?: string | null;
  email: string;
  handle: string;
  display_name: string;
};
export type Info = {
  name: string;
  input_file: string;
  output_file: string;
  time_limit_ms: number;
  memory_limit_mb: number;
  interactive: boolean;
  well_formed: boolean;
  skip_duplicate_validation: boolean;
  points_enabled: boolean;
  checker_percent: boolean;
  tags: string[];
  description: string;
};
export type Statement = {
  name: string;
  legend: string;
  input: string;
  output: string;
  scoring: string;
  interaction: string;
  notes: string;
  tutorial: string;
  show_in_review: boolean;
};
export type Language =
  'cpp17' | 'cpp20' | 'c17' | 'c99' | 'python3' | 'java17' | 'java8' | 'text';
export type SourceFile = {
  resource_policy?: ResourcePolicy | null;
  attach_to_build?: boolean | null;
  roles?: SourceRole[];
  name: string;
  kind: 'source' | 'resource' | 'aux' | 'statement';
  language: Language;
  sha256: string;
  size: number;
  compile_with_solution?: boolean;
  entry_class?: string;
};
export type ResourcePolicy = {
  languages: Language[];
  targets: ['SOLUTION'];
  stages: ['COMPILE'];
};
export type SourceRole = 'validator' | 'checker' | 'generator' | 'interactor';
export type SolutionTag =
  'MA' | 'OK' | 'RJ' | 'TL' | 'TO' | 'TM' | 'WA' | 'PE' | 'ML' | 'NR' | 'RE';
export type Solution = SourceFile & {
  tag: SolutionTag;
  extra_tags: Record<string, string>;
  group_tags?: Record<string, Record<string, string>>;
};
export type Test = {
  statement_input?: string | null;
  statement_output?: string | null;
  verify_statement_io?: boolean;
  index: number;
  input_sha: string | null;
  answer_sha: string | null;
  command: string;
  group: string;
  points: number;
  description: string;
  sample: boolean;
};
export type TestGroup = {
  points_policy: 'COMPLETE_GROUP' | 'EACH_TEST';
  feedback_policy: 'NONE' | 'POINTS' | 'ICPC' | 'COMPLETE';
  dependencies: string[];
};
export type TestSet = {
  script: string;
  tests: Record<string, Test>;
  groups_enabled: boolean;
  groups: Record<string, TestGroup>;
};
export type UnitTest = {
  input_sha: string;
  output_sha: string | null;
  answer_sha: string | null;
  expected: string;
};
export type Material = {
  strategy: 'NONE' | 'WITH_STATEMENT' | 'WITH_TUTORIAL';
  files: string[];
  solutions: string[];
  testsets: string[];
};
export type ProblemDocument = {
  common_statement?: string;
  common_tutorial?: string;
  translation_source?: string | null;
  translation_reviews?: Record<
    string,
    { source_hash: string; target_hash: string }
  >;
  info: Info;
  statements: Record<string, Statement>;
  files: Record<string, SourceFile>;
  solutions: Record<string, Solution>;
  checker: string;
  validator: string;
  extra_validators: string[];
  interactor: string;
  testsets: Record<string, TestSet>;
  validator_tests: Record<string, UnitTest>;
  checker_tests: Record<string, UnitTest>;
  materials: Record<string, Material>;
};
export type Problem = {
  folder_id: string | null;
  id: string;
  slug: string;
  name: string;
  owner: string;
  owner_name: string;
  role: 'READ' | 'WRITE' | 'OWNER';
  reviewer: boolean;
  translator: boolean;
  revision: number;
  working_revision: number;
  modified: boolean;
  tags: string[];
  note: string;
  deleted: boolean;
  created_at: number;
  updated_at: number;
};
export type Caution = {
  code: string;
  message: string;
  section: string;
  blocking: boolean;
};
export type Folder = {
  id: string;
  parent_id: string | null;
  name: string;
};
export type WorkspaceData = {
  limits?: ExecutionLimits;
  problem: Problem;
  document: ProblemDocument;
  version: number;
  base_revision: number;
  document_hash: string;
  cautions: Caution[];
  pending_preparations?: { id: string; created_at: number; stale: boolean }[];
};
export type JobKind =
  | 'prepare'
  | 'verify'
  | 'validator-tests'
  | 'checker-tests'
  | 'stress'
  | 'package'
  | 'render';
export type CaseResult = {
  group?: string;
  testset: string;
  index: number;
  verdict: string;
  cpu_ms: number | null;
  wall_ms: number | null;
  memory_kb: number | null;
  comment: string;
  input_sha: string;
  answer_sha: string;
  actual_sha: string | null;
};
export type PreparedTest = Test & {
  statement_io_validation?: 'VALID' | 'NOT_REQUESTED';
  validator: string;
  main_cpu_ms: number | null;
  main_wall_ms: number | null;
  main_memory_kb: number | null;
};
export type ExecutionLimits = {
  tests_per_set: number;
  stress_iterations: number;
  stress_seconds: number;
  counterexample_targets: number[];
  stress_patterns?: number;
  stress_counterexamples?: number;
  stress_evidence_bytes?: number;
  minimize_attempts?: number;
  minimize_seconds?: number;
  minimize_input_bytes?: number;
  generator_arguments: number;
  generator_cpu_ms: number;
  generator_memory_mb: number;
  generator_output_bytes: number;
  job_timeout_seconds: number;
  worker_concurrency: number;
  judge_concurrency: number;
  active_jobs_per_user: number;
};
export type ExecutionEnvironment = {
  default_backend: 'editor' | 'zoj';
  zoj_configured: boolean;
  limits?: ExecutionLimits;
  capacity?: { running_jobs: number; queued_jobs: number };
  execution_transport?: 'local' | 'agent';
  error?: string;
  updated_at?: number;
  zoj?: { execution?: { online_nodes: number }; online_nodes?: number } | null;
};
export type CounterexampleFinding = {
  solution: string;
  tag?: string;
  verdict: string;
  actual_sha: string;
  comment: string;
  cpu_ms?: number | null;
  memory_kb?: number | null;
};
export type Counterexample = {
  id: string;
  iteration: number;
  seed?: number;
  command: string;
  input_sha: string;
  answer_sha: string;
  findings: CounterexampleFinding[];
  input_bytes?: number;
  pattern_index?: number;
  pattern_name?: string;
  range_values?: { expression: string; value: number }[];
  minimized?: {
    input_sha: string;
    answer_sha: string;
    input_bytes: number;
    findings: CounterexampleFinding[];
  };
  minimization?: {
    status:
      | 'running'
      | 'finished'
      | 'budget'
      | 'input_limit'
      | 'unsupported'
      | 'interrupted'
      | 'evidence_limit';
    attempts: number;
    accepted_steps: number;
    original_bytes: number;
    final_bytes: number;
    elapsed_seconds: number;
    strategy?: 'integer_array' | 'integer_values';
  };
};
export type StressPattern = { name: string; command: string };
export type InvocationScope = {
  testset: string;
  solutions: string[];
  test_indices: number[];
  test_count: number;
};
export type StressConfiguration = {
  generator: string;
  seed_start: number;
  seed_step: number;
  seed_mode: 'placeholder' | 'append';
  reference: string;
  candidates: { name: string; tag?: string }[];
  testset: string;
  iterations: number;
  duration_seconds: number | null;
  stop_on_first: boolean;
  counterexample_limit: number;
  counterexample_verdicts: string[];
  time_limit_ms: number;
  memory_limit_mb: number;
  validator: string;
  extra_validators: string[];
  checker: string;
  interactor: string;
  patterns?: StressPattern[];
  sampling_version?: string;
  stop_mode?: 'first' | 'target' | 'all_candidates';
  focus_uncovered?: boolean;
  group?: string;
  minimize?: boolean;
  minimize_attempts?: number;
  minimize_seconds?: number;
};
export type Job = {
  application?: {
    applied_at: number;
    workspace_version: number;
    document_hash: string;
  } | null;
  id: string;
  problem_id: string;
  requested_by?: string;
  kind: JobKind;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  document_hash: string;
  workspace_version: number;
  revision: number;
  options: Record<string, unknown> & {
    stress_configuration?: StressConfiguration;
  };
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  result: {
    stress_configuration?: StressConfiguration;
    scope?: InvocationScope;
    auto_apply?: { status: 'applied' | 'blocked'; message?: string };
    runtime?: {
      backend?: 'editor' | 'zoj' | 'agent';
      runtime_revision?: string;
    };
    execution_runs?: {
      task_id: string;
      runtime: string;
      node_name?: string | null;
      agent_version?: string;
      status: string;
      cpu_ms?: number | null;
      wall_ms?: number | null;
      memory_kb?: number | null;
    }[];
    summary?: string;
    progress?: number;
    error?: string;
    verified?: boolean;
    mismatches?: string[];
    test_matrix?: {
      version: number;
      solutions: string[];
      targets: string[];
      uncovered_solutions: string[];
      rows: {
        id: string;
        testset: string;
        index: number;
        group: string;
        detected: string[];
        missing_targets: string[];
        no_detection: boolean;
        max_cpu_ms: number | null;
        max_memory_kb: number | null;
        same_pattern_as: string[];
        same_pattern_count: number;
        skipped: string[];
        exclusive_detections: string[];
      }[];
      cover: {
        test_ids: string[];
        method: 'exact' | 'greedy';
        covered_solutions: number;
      };
      unassigned_errors: { solution: string; verdict: string }[];
    };
    events?: { label: string }[];
    solutions?: {
      name: string;
      tag: string;
      matched: boolean;
      skipped: boolean;
      cases: CaseResult[];
      expectations_complete?: boolean;
      expectations?: {
        testset: string;
        group: string;
        tag: string;
        tested: number;
        total: number;
        complete: boolean;
        matched: boolean | null;
        skipped: boolean;
        origin: string;
        verdicts: string[];
      }[];
      total_score?: number | null;
      score_scope_complete?: boolean;
      groups?: {
        name: string;
        testset: string;
        score: number;
        passed: boolean;
        blocked: boolean;
        complete: boolean;
        policy: string;
      }[];
      complete?: boolean;
      judge_runs?: {
        id: string;
        testset: string;
        status: string;
        node_name: string | null;
        agent_version: string | null;
        testcase_count: number;
        runtime_ms: number | null;
        memory_kb: number | null;
        failed_testcase_order: number | null;
        compile_message: string | null;
        judge_message: string | null;
      }[];
    }[];
    testsets?: Record<string, PreparedTest[]>;
    processed_testsets?: string[];
    unit_tests?: {
      id: string;
      expected: string;
      actual: string;
      matched: boolean;
      comment: string;
    }[];
    counterexample?: {
      iteration: number;
      seed?: number;
      command: string;
      verdict: string;
      input_sha: string;
      answer_sha: string;
      actual_sha: string;
      comment: string;
    } | null;
    counterexamples?: Counterexample[];
    stress?: {
      iterations_started: number;
      iterations_completed: number;
      elapsed_seconds: number;
      duplicates_skipped: number;
      counterexample_count: number;
      stop_reason: string | null;
      last_seed?: number | null;
      last_command?: string | null;
      last_pattern_index?: number | null;
      last_range_values?: { expression: string; value: number }[];
      phase?: 'search' | 'minimize' | 'finished';
      evidence_bytes?: number;
      search_stop_reason?: string | null;
    };
    pattern_summaries?: (StressPattern & {
      index: number;
      attempts: number;
      valid_inputs: number;
      duplicates_skipped: number;
      compared_inputs: number;
      counterexample_inputs: number;
      findings: number;
      solution_findings: Record<string, number>;
    })[];
    coverage?: {
      example_ids: string[];
      method: 'exact' | 'greedy';
      covered_pairs: number;
      pairs: { solution: string; verdict: string }[];
    };
    uncovered_candidates?: string[];
    counterexample_categories?: {
      solution: string;
      tag: string;
      verdict: string;
      example_ids: string[];
    }[];
    candidate_summaries?: {
      name: string;
      tag: string;
      tested: number;
      verdicts: Record<string, number>;
      first_counterexample_id: string | null;
      counterexamples?: number;
    }[];
    iterations?: number;
    package?: {
      format?: 'editor' | 'zoj';
      filename: string;
      size: number;
      verified: boolean;
      sha256: string;
    };
    statements?: Record<
      string,
      { html: string; pdf: string; pdf_size?: number; message?: string }
    >;
  };
};
export type ZojContest = {
  id: string;
  title: string;
  status: string;
  locked: boolean;
  divisions: { id: string; name: string; code: string }[];
};
export type Publication = {
  operation_id: string;
  job_id: string;
  contest_id: string;
  division_id: string;
  problem_code: string;
  created_at: number;
  result: { problem_id: string; title: string; revision: number; url: string };
};
export type Access = {
  user_id: string;
  handle: string;
  display_name: string;
  role: 'OWNER' | 'WRITE' | 'READ';
  reviewer: boolean;
  translator: boolean;
};
export type Issue = {
  id: string;
  title: string;
  content: string;
  kind: 'BUG' | 'DISCUSSION' | 'ENHANCEMENT';
  status: string;
  author: string;
  assignee: string;
  comments: {
    author: string;
    content: string;
    changes: string[];
    created_at: number;
  }[];
  created_at: number;
  updated_at: number;
};
export type Revision = {
  number: number;
  message: string;
  minor: boolean;
  author: string;
  created_at: number;
  hash: string;
};
export type Contest = {
  id: string;
  title: string;
  problem_ids: string[];
  created_at: number;
};
