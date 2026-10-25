import type { Permission } from './permissions';
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
  | 'cpp17'
  | 'cpp20'
  | 'c17'
  | 'c99'
  | 'python3'
  | 'pypy3'
  | 'kotlin'
  | 'java17'
  | 'java8'
  | 'text';
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
export type LanguageResourceLimit = {
  time_limit_ms?: number;
  memory_limit_mb?: number;
  disable_auto_adjustment?: boolean;
};
export type LanguageResourceLimits = Partial<
  Record<
    'cpp17' | 'python3' | 'java8' | 'c99' | 'pypy3' | 'kotlin',
    LanguageResourceLimit
  >
>;
export type ProblemDocument = {
  language_resource_limits?: LanguageResourceLimits;
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
export type FolderRole =
  | 'OWNER'
  | 'ADMIN'
  | 'EDITOR'
  | 'REVIEWER'
  | 'TRANSLATOR'
  | 'VIEWER'
  | 'CUSTOM';
export type Problem = {
  workspace_id?: string | null;
  workspace_name?: string | null;
  workspace_role?: FolderRole | null;
  can_manage_access?: boolean;
  permissions?: Permission[];
  direct_permissions?: Permission[];
  inherited_permissions?: Permission[];
  workspace_permissions?: Permission[];
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
  workspace_id?: string | null;
  workspace_role?: FolderRole | null;
  permissions?: Permission[];
  can_create?: boolean;
  can_edit?: boolean;
  can_manage?: boolean;
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
  iteration?: number;
  seed?: number;
  command?: string;
  pattern_name?: string;
  range_values?: { expression: string; value: number }[];
  output_truncated?: boolean;
  output_size?: number | null;
  output_total_bytes?: number | null;
  output_error?: string | null;
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
export type StressSolutionResult = {
  name: string;
  tag: string;
  role: 'reference' | 'candidate';
  cases: CaseResult[];
  max_cpu_ms: number | null;
  max_memory_kb: number | null;
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
  test_parallelism?: number;
  execution_concurrency?: number;
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
  output_truncated?: boolean;
  output_total_bytes?: number | null;
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
  all_testsets?: boolean;
  testsets?: string[];
  testset_counts?: Record<string, number>;
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
export type JobAssessment = {
  kind:
    | 'pending'
    | 'expectations'
    | 'component'
    | 'input'
    | 'preparation'
    | 'stress'
    | 'render'
    | 'none';
  status:
    | 'pending'
    | 'passed'
    | 'failed'
    | 'incomplete'
    | 'not_run'
    | 'unknown'
    | 'found'
    | 'not_found'
    | 'empty';
  code: string;
  partial: boolean;
  counts?: {
    total: number;
    passed: number;
    failed: number;
    unconfirmed: number;
  };
  found?: number;
  iterations?: number;
  uncovered?: number;
};
export type Job = {
  category?: string;
  discarded_at?: number | null;
  application?: {
    applied_at: number;
    workspace_version: number;
    document_hash: string;
  } | null;
  id: string;
  problem_id: string;
  requested_by?: string;
  requester?: { id: string; display_name: string; handle: string } | null;
  kind: JobKind;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  outcome?: { execution: Job['status']; assessment: JobAssessment };
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
    preparation_total?: number;
    unit_test_totals?: Record<string, number>;
    prepare_mode?: 'full' | 'inputs' | 'validate' | 'answers';
    stress_results_version?: number;
    stress_results?: StressSolutionResult[];
    stress_result_summary?: {
      executions: number;
      testcase_count: number;
      max_cpu_ms: number | null;
      max_memory_kb: number | null;
    };
    preparation_cache?: {
      enabled: boolean;
      reused: Record<
        'input' | 'validator' | 'answer' | 'checker' | 'sample',
        number
      >;
      executed: Record<
        'input' | 'validator' | 'answer' | 'checker' | 'sample',
        number
      >;
    };
    verification_progress?: {
      phase: 'preparing' | 'judging' | 'complete';
      current: number;
      total: number;
      percent: number;
      preparation?: {
        current: number;
        total: number;
        percent: number;
        stages?: Record<
          string,
          { current: number; total: number; percent: number }
        >;
      };
      judging?: { current: number; total: number; percent: number };
      completed_solutions?: number;
      total_solutions?: number;
      testsets?: Record<
        string,
        {
          current: number;
          total: number;
          percent: number;
          preparation?: { current: number; total: number; percent: number };
          judging?: { current: number; total: number; percent: number };
        }
      >;
    };
    stress_configuration?: StressConfiguration;
    scope?: InvocationScope;
    auto_apply?: { status: 'applied' | 'blocked'; message?: string };
    runtime?: {
      backend?: 'editor' | 'zoj' | 'agent' | 'archive';
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
    error_code?: string;
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
      state?: 'queued' | 'running' | 'completed';
      completed_tests?: number;
      total_tests?: number;
      name: string;
      tag: string;
      matched: boolean;
      skipped: boolean;
      cases: CaseResult[];
      expectations_complete?: boolean;
      expectations?: {
        testset: string;
        testsets?: string[];
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
      iterations_scheduled?: number;
      last_scheduled_seed?: number;
      parallelism?: number;
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
      testset?: string;
      testsets?: string[];
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
  requester?: Job['requester'];
  operation_id: string;
  job_id: string;
  contest_id: string;
  division_id: string;
  problem_code: string;
  created_at: number;
  result: {
    problem_id: string;
    title: string;
    revision: number;
    url: string;
    kind?: 'update';
  };
};
export type ZojPackageUpdatePreview = {
  contest_title: string;
  division_name: string;
  target_problem_id: string;
  problem_code: string;
  title: string;
  target_hash: string;
  archive_sha256: string;
  contest_running: boolean;
  current_testcase_count: number;
  incoming_testcase_count: number;
  testcase_changes: { added: number; removed: number; changed: number };
  next_testcase_version: number;
  submission_count: number;
  preserved: string;
  changes: {
    field: string;
    label: string;
    changed: boolean;
    truncated?: boolean;
    before: string | number | null;
    after: string | number | null;
  }[];
  files: {
    filename: string;
    category: string;
    change: 'added' | 'removed' | 'changed';
  }[];
  changed_file_count: number;
};
export type Access = {
  permissions?: Permission[];
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
