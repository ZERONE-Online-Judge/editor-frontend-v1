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
  name: string;
  kind: 'source' | 'resource' | 'aux' | 'statement';
  language: Language;
  sha256: string;
  size: number;
  compile_with_solution?: boolean;
  entry_class?: string;
};
export type SolutionTag =
  'MA' | 'OK' | 'RJ' | 'TL' | 'TO' | 'TM' | 'WA' | 'PE' | 'ML' | 'NR' | 'RE';
export type Solution = SourceFile & {
  tag: SolutionTag;
  extra_tags: Record<string, string>;
};
export type Test = {
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
  problem: Problem;
  document: ProblemDocument;
  version: number;
  base_revision: number;
  document_hash: string;
  cautions: Caution[];
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
  validator: string;
  main_cpu_ms: number | null;
  main_wall_ms: number | null;
  main_memory_kb: number | null;
};
export type Job = {
  id: string;
  problem_id: string;
  kind: JobKind;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  document_hash: string;
  workspace_version: number;
  revision: number;
  options: Record<string, unknown>;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  result: {
    runtime?: { backend?: 'editor' | 'zoj'; runtime_revision?: string };
    summary?: string;
    progress?: number;
    error?: string;
    verified?: boolean;
    mismatches?: string[];
    events?: { label: string }[];
    solutions?: {
      name: string;
      tag: string;
      matched: boolean;
      skipped: boolean;
      cases: CaseResult[];
      total_score?: number | null;
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
    unit_tests?: {
      id: string;
      expected: string;
      actual: string;
      matched: boolean;
      comment: string;
    }[];
    counterexample?: {
      iteration: number;
      command: string;
      verdict: string;
      input_sha: string;
      answer_sha: string;
      actual_sha: string;
      comment: string;
    } | null;
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
