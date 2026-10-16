import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  executionResultPath,
  matchesExecutionView,
  type ExecutionView,
} from '../../lib/executionNavigation';
import {
  api,
  blobText,
  jobLabels,
  post,
  statusLabels,
  time,
  bytes,
} from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import { BlobDownload, DownloadActions } from '../../components/Downloads';
import { testDownloads } from '../../lib/downloads';
import type { CaseResult, Job } from '../../lib/types';
import ZojPublishing from './ZojPublishing';
import InvocationComments from './InvocationComments';
import StressControls from './StressControls';
import StressCounterexamples from './StressCounterexamples';
import { retryStressOptions } from '../../lib/stressOptions';
import StressRunConditions, {
  StressHistorySummary,
} from './StressRunConditions';
import InvocationControls from './InvocationControls';
import ExecutionLimitsInfo from './ExecutionLimitsInfo';
import TestVerdictMatrix from './TestVerdictMatrix';
import VerificationProgress from './VerificationProgress';
import SolutionResultPanel from './SolutionResultPanel';
import SolutionJudgeSummary from './SolutionJudgeSummary';
import { useAuth } from '../../lib/authContext';
import type { ExecutionEnvironment, InvocationScope } from '../../lib/types';
import {
  Badge,
  CodeEditor,
  Empty,
  Icon,
  Modal,
  Notice,
  SectionHeading,
} from '../../components/ui';
export default function Executions({
  stress = false,
  packages = false,
  verification = false,
}: {
  stress?: boolean;
  packages?: boolean;
  verification?: boolean;
}) {
  const {
    data,
    document: doc,
    editable,
    run,
    notify,
    reload,
    save,
    dirty,
  } = useWorkspace();
  const { user } = useAuth();
  const canInvoke = editable || data.problem.reviewer;
  const [rows, setRows] = useState<Job[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const search = searchParams.toString();
  const requestedJob = searchParams.get('job') || '';
  const mode: ExecutionView = packages
    ? 'package'
    : stress
      ? 'stress'
      : verification
        ? 'verify'
        : 'all';
  const [defaultSelection, setDefaultSelection] = useState({
    problemId: data.problem.id,
    mode,
    id: '',
  });
  const visible = rows.filter((row) => matchesExecutionView(row.kind, mode));
  const selected =
    requestedJob ||
    (defaultSelection.problemId === data.problem.id &&
    defaultSelection.mode === mode &&
    visible.some((row) => row.id === defaultSelection.id)
      ? defaultSelection.id
      : visible[0]?.id) ||
    '';
  const [loadedJob, setJob] = useState<Job | null>(null);
  const job = loadedJob?.id === selected ? loadedJob : null;
  const [jobError, setJobError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  function selectJob(id: string) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('job', id);
      return next;
    });
  }
  const [setName, setSetName] = useState(
    Object.keys(doc.testsets)[0] || 'tests',
  );
  const [busy, setBusy] = useState(false);
  const [exportFormat, setExportFormat] = useState('zoj');
  const [statementLanguage, setStatementLanguage] = useState(
    Object.keys(doc.statements).includes('korean')
      ? 'korean'
      : Object.keys(doc.statements)[0] || 'korean',
  );
  const [caseResult, setCaseResult] = useState<CaseResult | null>(null);
  const [executionBackend, setExecutionBackend] = useState<
    'editor' | 'zoj' | null
  >(null);
  const [zojConfigured, setZojConfigured] = useState(false);
  const [environment, setEnvironment] = useState<ExecutionEnvironment | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    let pending = false;
    async function refreshEnvironment() {
      if (pending) return;
      pending = true;
      try {
        const value = await api<ExecutionEnvironment>('/execution-environment');
        if (active) {
          setExecutionBackend((previous) => previous ?? value.default_backend);
          setZojConfigured(value.zoj_configured);
          setEnvironment(value);
        }
      } catch (e) {
        if (active) notify((e as Error).message, true);
      } finally {
        pending = false;
      }
    }
    void refreshEnvironment();
    const timer = window.setInterval(() => {
      if (window.document.visibilityState !== 'hidden')
        void refreshEnvironment();
    }, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [notify]);
  const fetchRows = useCallback(async () => {
    const values = await api<Job[]>(`/problems/${data.problem.id}/jobs`);
    setRows(values);
  }, [data.problem.id]);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const values = await api<Job[]>(`/problems/${data.problem.id}/jobs`);
        if (active) {
          setRows(values);
          const candidates = values.filter((row) =>
            matchesExecutionView(row.kind, mode),
          );
          setDefaultSelection((previous) =>
            previous.problemId === data.problem.id &&
            previous.mode === mode &&
            candidates.some((row) => row.id === previous.id)
              ? previous
              : {
                  problemId: data.problem.id,
                  mode,
                  id: candidates[0]?.id || '',
                },
          );
        }
      } catch (e) {
        if (active) notify((e as Error).message, true);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [data.problem.id, mode, notify]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    let timer: number | undefined;
    async function refresh() {
      try {
        const value = await api<Job>(
          `/problems/${data.problem.id}/jobs/${encodeURIComponent(selected)}`,
        );
        if (active) {
          if ((value.kind === 'verify') !== verification) {
            const destination = executionResultPath(
              data.problem.id,
              value.kind,
              value.id,
            ).split('?')[0];
            navigate(
              { pathname: destination, search: `?${search}` },
              { replace: true },
            );
            return;
          }
          setJobError(null);
          setJob(value);
          if (
            value.status === 'queued' ||
            value.status === 'running' ||
            (value.kind === 'prepare' &&
              value.status === 'completed' &&
              !value.application)
          )
            timer = window.setTimeout(() => void refresh(), 1800);
        }
      } catch (e) {
        if (active) {
          setJobError({ id: selected, message: (e as Error).message });
          notify((e as Error).message, true);
        }
      }
    }
    void refresh();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [selected, data.problem.id, notify, verification, navigate, search]);
  async function start(
    kind: Job['kind'],
    options: Record<string, unknown> = {},
  ) {
    setBusy(true);
    try {
      const result = await run(kind, {
        ...options,
        ...(executionBackend && (kind === 'verify' || kind === 'package')
          ? { execution_backend: executionBackend }
          : {}),
      });
      selectJob(result.id);
      setJob(result);
      await fetchRows();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const stale = Boolean(
    job &&
    (job.options.source_document_hash || job.document_hash) !==
      data.document_hash,
  );
  const scope = (job?.result.scope || job?.options.scope) as
    InvocationScope | undefined;
  async function apply() {
    if (!job) return;
    try {
      const version = await save();
      await post(`/problems/${data.problem.id}/jobs/${job.id}/apply`, {
        version,
      });
      await reload(true);
      setJob(await api<Job>(`/problems/${data.problem.id}/jobs/${job.id}`));
      await fetchRows();
      notify('생성된 입력과 정답을 작업 사본에 반영했습니다.');
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  const environmentPanel = (
    <section className={verification ? 'verification-environment' : 'card'}>
      <label>
        풀이 검증 환경
        <select
          value={executionBackend ?? ''}
          onChange={(e) =>
            setExecutionBackend(e.target.value as 'editor' | 'zoj')
          }
        >
          <option value="" disabled>
            검증 환경 확인 중…
          </option>
          <option value="zoj" disabled={!zojConfigured}>
            ZOJ 실제 채점기 · 대회와 같은 환경
          </option>
          <option value="editor">
            에이전트 격리 실행 · 제작 기능 전체 지원
          </option>
        </select>
      </label>
      <p className="muted">
        {executionBackend === null
          ? '서버에서 기본 검증 환경을 확인하고 있습니다.'
          : executionBackend === 'zoj'
            ? '풀이를 기존 ZOJ 채점 큐에 보내 판정과 시간·메모리를 기록합니다. C++17·C99·Python 3.13·Java 8을 지원하고, 대회와 같은 언어별 보정을 적용합니다. 입력 생성·Validator·Checker·PDF 실행도 Editor 작업이 허용된 채점 에이전트에서 처리합니다.'
            : 'Editor 실행이 허용된 채점 VM의 제작용 격리 환경에서 실행합니다. 대화형·그룹 점수 등 제작 기능을 검증합니다. ZOJ 대회의 언어별 시간·메모리 보정은 ‘ZOJ 실제 채점기’ 선택에서 적용됩니다.'}
      </p>
    </section>
  );
  return (
    <div className="section-stack">
      <SectionHeading
        title={
          packages
            ? '패키지'
            : stress
              ? '스트레스 테스트'
              : verification
                ? '전체 검증'
                : '실행 결과'
        }
        description={
          packages
            ? '커밋된 리비전을 검증하고 배포 가능한 문제 패키지를 생성합니다.'
            : stress
              ? '생성기와 기준 풀이를 사용해 비교할 풀이의 유효한 반례를 찾습니다.'
              : verification
                ? '풀이와 테스트 범위를 선택해 검증하고, 진행 상황과 저장된 검증 결과를 확인합니다.'
                : '각 탭에서 요청한 작업의 진행 상황과 완료 결과를 확인합니다. 아래 작업 기록에서 확인할 실행을 선택하세요.'
        }
        actions={
          packages && (
            <button
              className="button primary"
              disabled={!editable || busy}
              onClick={() =>
                void start('package', {
                  testset: setName,
                  verify: true,
                  export_format: exportFormat,
                  statement_language: statementLanguage,
                })
              }
            >
              <Icon name="play" />
              검증 후 패키지 생성
            </button>
          )
        }
      />
      <ExecutionLimitsInfo environment={environment} stress={stress} />
      {packages && environmentPanel}
      {verification && (
        <section
          className="card verification-launcher"
          aria-label="전체 검증 실행"
        >
          {environmentPanel}
          {!editable && data.problem.reviewer && (
            <Notice>
              검수 실행은 커밋된 리비전 r{data.problem.revision}의 입력·기대
              출력과 판정 태그를 사용합니다. 결과와 임시 코드는 검증 기록에
              보관됩니다.
            </Notice>
          )}
          <InvocationControls
            problemId={data.problem.id}
            document={doc}
            revision={data.problem.revision}
            limits={environment?.limits}
            allowed={canInvoke}
            writer={editable}
            busy={busy || executionBackend === null}
            start={(options) => void start('verify', options)}
          />
        </section>
      )}
      {stress ? (
        <StressControls
          document={doc}
          limits={environment?.limits}
          allowed={canInvoke}
          busy={busy}
          start={(options) => void start('stress', options)}
        />
      ) : packages ? (
        <>
          <section className="card compact">
            <div className="form-grid">
              <label>
                패키지 형식
                <select
                  value={exportFormat}
                  onChange={(e) => {
                    setExportFormat(e.target.value);
                    if (e.target.value === 'linux')
                      setExecutionBackend('editor');
                  }}
                >
                  <option value="zoj">ZOJ 문제 ZIP · 대회에 등록</option>
                  <option value="editor">
                    Editor / Polygon 형식 · 작업 자료
                  </option>
                  <option value="linux">
                    Linux 재현 패키지 · Editor 격리 환경
                  </option>
                </select>
              </label>
              {exportFormat === 'zoj' && (
                <>
                  <label>
                    ZOJ 기본 지문 언어
                    <select
                      value={statementLanguage}
                      onChange={(e) => setStatementLanguage(e.target.value)}
                    >
                      {Object.entries(doc.statements).map(
                        ([language, statement]) => (
                          <option key={language} value={language}>
                            {language} · {statement.name || doc.info.name}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    ZOJ에서 사용할 테스트 세트
                    <select
                      value={setName}
                      onChange={(e) => setSetName(e.target.value)}
                    >
                      {Object.keys(doc.testsets).map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <p className="muted">
              {exportFormat === 'zoj'
                ? '선택한 언어를 ZOJ의 기본 지문으로 지정하고, 작성한 다른 번역 지문도 함께 내보냅니다. 참가자는 지문 화면에서 언어를 선택할 수 있습니다. 예제·전체 입력과 정답·검증 코드·checker·validator와 원본 Editor 자료를 함께 보관합니다. 그룹·부분 점수 등 지원하지 않는 채점 방식은 생성 전에 안내합니다.'
                : exportFormat === 'linux'
                  ? '전체 생성 테스트·정답·소스·검증 환경과 고정된 실행 코드를 담습니다. Python과 준비된 Docker 이미지로 API 키·서비스 DB 없이 오프라인 재실행할 수 있습니다. Editor 실행 정책을 재현하며, ZOJ 대회 채점기의 언어별 보정과 다른 하드웨어에서의 시간 일치를 보장하는 패키지는 아닙니다.'
                  : 'Editor에서 다시 열 수 있는 작업 자료와 problem.xml, 생성된 테스트, 모든 지문 언어를 포함합니다.'}
            </p>
          </section>
          <div className="workspace-guide">
            <Icon name="branch" />
            <p>
              내 작업 사본을 먼저 커밋하세요. 모든 입력을 검증하고 풀이
              태그·checker·validator 자체 테스트를 확인한 뒤 ZIP을 만듭니다.
            </p>
          </div>
          <ZojPublishing
            problemId={data.problem.id}
            owner={data.problem.role === 'OWNER'}
            job={job}
            stale={stale || dirty}
          />
        </>
      ) : null}
      <div className="execution-history-heading">
        <Icon name="history" />
        <div>
          <h3>
            {verification ? '검증 기록 · 결과 보기' : '작업 기록 · 결과 보기'}
          </h3>
          <p>기록을 선택하면 해당 작업의 진행 상황과 결과가 표시됩니다.</p>
        </div>
      </div>
      <section
        className="execution-layout execution-history"
        aria-label={verification ? '저장된 검증 기록' : '저장된 실행 기록'}
      >
        <section className="card execution-list no-padding">
          <div className="card-heading">
            <h3>
              {verification ? '검증 기록' : '작업 기록'}{' '}
              <span className="count">{visible.length}</span>
            </h3>
          </div>
          {visible.length ? (
            visible.map((row) => (
              <button
                className={row.id === selected ? 'job-row selected' : 'job-row'}
                key={row.id}
                aria-pressed={row.id === selected}
                onClick={() => selectJob(row.id)}
              >
                <div>
                  <strong>
                    {typeof row.options.name === 'string' && row.options.name
                      ? row.options.name
                      : jobLabels[row.kind]}
                  </strong>
                  {row.kind === 'prepare' && row.status === 'completed' && (
                    <Badge
                      tone={
                        row.application
                          ? 'success'
                          : row.document_hash === data.document_hash
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {row.application
                        ? '내 사본에 반영됨'
                        : row.document_hash === data.document_hash
                          ? '미반영'
                          : '이전 자료'}
                    </Badge>
                  )}
                  <Badge
                    tone={
                      row.status === 'failed'
                        ? 'danger'
                        : row.status === 'completed'
                          ? 'success'
                          : 'neutral'
                    }
                  >
                    {statusLabels[row.status]}
                  </Badge>
                </div>
                <small>
                  r{row.revision} · {time(row.created_at)}
                </small>
                <span>{row.result.summary || '검증 워커 배정 대기'}</span>
                {row.kind === 'stress' && <StressHistorySummary job={row} />}
              </button>
            ))
          ) : (
            <Empty
              icon="play"
              title={
                verification ? '검증 기록이 없습니다.' : '실행 기록이 없습니다.'
              }
              description="작업을 요청하면 여기에 기록됩니다."
            />
          )}
        </section>
        <section className="card execution-detail">
          {job ? (
            <>
              <div className="section-heading">
                <div>
                  <h3>
                    {typeof job.options.name === 'string' && job.options.name
                      ? job.options.name
                      : jobLabels[job.kind]}
                  </h3>
                  <p>
                    {time(job.created_at)} · r{job.revision}
                  </p>
                </div>
                <Badge
                  tone={
                    job.status === 'failed'
                      ? 'danger'
                      : job.status === 'completed'
                        ? 'success'
                        : 'accent'
                  }
                >
                  {statusLabels[job.status]}
                </Badge>
              </div>
              <p className="muted small">
                저장된 검증 환경 ·{' '}
                {(job.result.runtime?.backend ??
                  job.options.execution_backend) === 'zoj'
                  ? 'ZOJ 실제 채점기'
                  : job.result.runtime?.backend === 'agent' ||
                      job.options.execution_transport === 'agent'
                    ? '채점 에이전트 제작용 격리 실행'
                    : 'Editor 격리 실행 (이전 기록)'}
              </p>
              <p className="muted small">
                자료 기준:{' '}
                {job.options.snapshot === 'committed'
                  ? `커밋된 리비전 r${job.revision}`
                  : '요청 당시 작업 사본'}
              </p>
              {scope && (
                <p className="muted small">
                  요청 범위:{' '}
                  {scope.all_testsets
                    ? `전체 세트 (${scope.testsets?.join(', ') || scope.testset})`
                    : scope.testset}{' '}
                  · 풀이 {scope.solutions.length}개 · 테스트 {scope.test_count}
                  개
                  {scope.test_indices.length
                    ? ` (#${scope.test_indices.join(', #')})`
                    : scope.all_testsets
                      ? ' (모든 세트 전체)'
                      : ' (세트 전체)'}
                </p>
              )}
              {typeof job.options.note === 'string' && job.options.note && (
                <p
                  className="notice neutral"
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {job.options.note}
                </p>
              )}
              {job.kind === 'stress' && <StressRunConditions job={job} />}
              <VerificationProgress job={job} />
              {job.status !== 'queued' &&
                job.status !== 'running' &&
                job.result.summary && (
                  <p className="execution-result-summary">
                    {job.result.summary}
                  </p>
                )}
              {job.result.processed_testsets?.length ? (
                <p className="muted small">
                  실제 처리한 테스트 세트:{' '}
                  {job.result.processed_testsets.join(', ')}
                </p>
              ) : null}
              {job.result.execution_runs?.length ? (
                <details className="notice neutral">
                  <summary>
                    에이전트 실행 기록 · {job.result.execution_runs.length}회
                  </summary>
                  <p className="muted small">
                    컴파일·생성·검증·PDF 실행을 담당한 실제 노드와 실행 자원을
                    확인합니다.
                  </p>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>채점 노드</th>
                          <th>환경</th>
                          <th>실행 결과</th>
                          <th>CPU 시간</th>
                          <th>메모리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {job.result.execution_runs.map((run) => (
                          <tr key={run.task_id}>
                            <td>{run.node_name || '채점 노드'}</td>
                            <td>
                              {run.runtime === 'renderer'
                                ? 'PDF 렌더링'
                                : '제작용 실행'}
                            </td>
                            <td>
                              {{
                                ok: '실행 완료',
                                'time-limit': '시간 초과',
                                'memory-limit': '메모리 초과',
                                'output-limit': '출력 초과',
                                'wall-limit': '실행 응답 시간 초과',
                              }[run.status] || run.status}
                            </td>
                            <td>
                              {run.cpu_ms == null
                                ? '미제공'
                                : `${run.cpu_ms}ms`}
                            </td>
                            <td>
                              {run.memory_kb == null
                                ? '미제공'
                                : `${(run.memory_kb / 1024).toFixed(1)}MiB`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
              {stale && (
                <Notice>
                  현재 작업 사본과 다른 자료의 실행 기록입니다. 이 결과는 당시
                  자료에만 해당합니다.
                </Notice>
              )}
              {dirty && (
                <div className="muted small">
                  저장하지 않은 변경은 이 실행 기록에 포함되지 않습니다.
                </div>
              )}
              {(job.status === 'queued' || job.status === 'running') && (
                <div className="run-progress">
                  <span className="spinner" />
                  <strong>
                    {job.result.summary || '실행 자리를 기다리고 있습니다.'}
                  </strong>
                  {(editable ||
                    (data.problem.reviewer &&
                      job.requested_by === user?.id)) && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void post(
                          `/problems/${data.problem.id}/jobs/${job.id}/cancel`,
                        )
                          .then(fetchRows)
                          .catch((e) => notify(e.message, true))
                      }
                    >
                      작업 취소
                    </button>
                  )}
                </div>
              )}
              {job.result.error && (
                <Notice tone="error">
                  <CodeEditor
                    readOnly
                    rows={6}
                    label="실행 오류"
                    value={job.result.error}
                  />
                </Notice>
              )}
              {job.result.verified !== undefined && (
                <div
                  className={`verification-summary ${job.result.verified ? 'passed' : 'mismatch'}`}
                >
                  <Icon name={job.result.verified ? 'check' : 'issue'} />
                  <div>
                    <strong>
                      {job.result.verified
                        ? '기대 판정과 일치합니다.'
                        : '기대 판정 또는 자체 테스트 확인이 필요합니다.'}
                    </strong>
                    <p>
                      {job.result.mismatches?.length
                        ? job.result.mismatches.join(', ')
                        : '아래 실제 실행 범위와 판정을 확인하세요.'}
                    </p>
                  </div>
                </div>
              )}
              {job.kind === 'prepare' && job.status === 'completed' && (
                <div className="result-action">
                  <span>
                    {Object.values(job.result.testsets || {}).reduce(
                      (n, t) => n + t.length,
                      0,
                    )}
                    개 입력·정답 생성 완료
                    {job.application && (
                      <small className="block">
                        내 작업 사본에 반영됨 ·{' '}
                        {time(job.application.applied_at)} · 작업 사본 v
                        {job.application.workspace_version}
                      </small>
                    )}
                  </span>
                  {!job.application && (
                    <button
                      className="button primary"
                      disabled={!editable || stale || dirty}
                      onClick={() => void apply()}
                    >
                      작업 사본에 반영
                    </button>
                  )}
                </div>
              )}
              {job.result.auto_apply?.status === 'blocked' && (
                <Notice>
                  {job.result.auto_apply.message ||
                    '자동 반영되지 않았습니다. 실행 당시 자료와 작업 사본을 확인하세요.'}
                </Notice>
              )}
              {job.kind === 'prepare' &&
                Object.entries(job.result.testsets || {}).map(
                  ([name, tests]) => (
                    <DownloadActions
                      key={name}
                      problemId={data.problem.id}
                      files={testDownloads(name, tests)}
                      filename={`${name.slice(0, 85)}-tests.zip`}
                      allLabel={`${name} 생성 파일 다운로드`}
                      selectable={false}
                      note="이 실행에서 저장된 실제 입력·기대 출력을 받습니다. 작업 사본에 반영하기 전에도 다운로드할 수 있습니다."
                    />
                  ),
                )}
              <TestVerdictMatrix job={job} />
              {job.result.solutions?.map((solution) => (
                <SolutionResultPanel
                  key={`${job.id}/${solution.name}`}
                  solution={solution}
                  jobStatus={job.status}
                >
                  {solution.expectations?.length ? (
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>기대 판정 범위</th>
                            <th>기대</th>
                            <th>실행 / 전체</th>
                            <th>관측</th>
                            <th>검증</th>
                          </tr>
                        </thead>
                        <tbody>
                          {solution.expectations.map((scope) => (
                            <tr key={`${scope.testset}/${scope.group}`}>
                              <td>
                                {scope.testset}
                                {scope.group
                                  ? ` / ${scope.group}`
                                  : ' · 기본 범위'}
                              </td>
                              <td>{scope.tag}</td>
                              <td>
                                {scope.tested} / {scope.total}
                              </td>
                              <td>{scope.verdicts.join(' · ') || '미실행'}</td>
                              <td>
                                {scope.skipped
                                  ? '실행 제외'
                                  : scope.matched === false
                                    ? '불일치'
                                    : !scope.complete
                                      ? '부분 실행 · 미확인'
                                      : '일치'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {solution.total_score != null && (
                    <p>점수 {solution.total_score.toLocaleString()}</p>
                  )}
                  {solution.score_scope_complete === false && (
                    <p className="muted small">
                      일부 테스트만 실행했으므로 세트 전체 점수는 계산하지
                      않았습니다.
                    </p>
                  )}
                  <SolutionJudgeSummary solution={solution} />
                  {solution.groups?.length ? (
                    <div className="inline-tags">
                      {solution.groups.map((g) => (
                        <Badge
                          key={`${g.testset}-${g.name}`}
                          tone={g.passed ? 'success' : 'warning'}
                        >
                          {g.name} · {g.score}점
                          {g.blocked
                            ? ' · 의존 그룹 미통과'
                            : !g.complete
                              ? ' · 전체 실행 필요'
                              : ''}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="solution-testsets">
                    {[...new Set(solution.cases.map((row) => row.testset))].map(
                      (setName) => (
                        <section
                          key={setName}
                          className="solution-testset-cases"
                          aria-label={`${setName} 테스트 결과`}
                        >
                          {(scope?.all_testsets ||
                            new Set(solution.cases.map((row) => row.testset))
                              .size > 1) && (
                            <h4 className="muted small">{setName}</h4>
                          )}
                          <div className="case-grid">
                            {solution.cases
                              .filter((row) => row.testset === setName)
                              .map((result) => (
                                <button
                                  key={`${result.testset}-${result.index}`}
                                  className={`case-chip ${result.verdict === 'AC' ? 'accepted' : result.verdict === 'JUDGE_ERROR' ? 'error' : 'rejected'}`}
                                  title={`${result.testset} · ${result.index ? `#${result.index}` : '컴파일·실행 환경'} · CPU ${result.cpu_ms == null ? '개별 값 미제공' : `${result.cpu_ms}ms`} · 메모리 ${result.memory_kb == null ? '개별 값 미제공' : `${result.memory_kb}KiB`}`}
                                  onClick={() => setCaseResult(result)}
                                >
                                  <span>
                                    {result.index ? `#${result.index}` : '환경'}
                                  </span>
                                  <strong>{result.verdict}</strong>
                                  <small>
                                    {result.cpu_ms === null
                                      ? solution.judge_runs?.length
                                        ? '개별 시간 미제공'
                                        : '계측 불가'
                                      : `${result.cpu_ms}ms`}
                                  </small>
                                </button>
                              ))}
                          </div>
                        </section>
                      ),
                    )}
                  </div>
                  {solution.skipped && (
                    <p className="muted">NR 태그로 실행하지 않았습니다.</p>
                  )}
                </SolutionResultPanel>
              ))}
              {job.result.unit_tests?.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>자체 테스트</th>
                      <th>기대 판정</th>
                      <th>실제 판정</th>
                      <th>결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.result.unit_tests.map((test, i) => (
                      <tr key={test.id}>
                        <td>#{i + 1}</td>
                        <td>{test.expected}</td>
                        <td>{test.actual}</td>
                        <td>
                          <Badge tone={test.matched ? 'success' : 'danger'}>
                            {test.matched ? '일치' : '불일치'}
                          </Badge>
                          <div className="subtext">{test.comment}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {job.kind === 'stress' && (
                <StressCounterexamples
                  job={job}
                  problemId={data.problem.id}
                  testsets={Object.keys(doc.testsets)}
                  testsetGroups={Object.fromEntries(
                    Object.entries(doc.testsets).map(([name, set]) => [
                      name,
                      set.groups_enabled ? Object.keys(set.groups) : [],
                    ]),
                  )}
                  advanced={Boolean(environment?.limits?.stress_patterns)}
                  retryBusy={busy}
                  retryUncovered={
                    canInvoke && environment?.limits?.stress_patterns
                      ? (names) => {
                          try {
                            const options = retryStressOptions(job, names);
                            if (
                              names.some((name) => !doc.solutions[name]) ||
                              (typeof options.reference === 'string' &&
                                options.reference &&
                                !doc.solutions[options.reference])
                            )
                              throw new Error(
                                '현재 문제에서 사라진 풀이가 있습니다. 실행 조건을 새로 선택하세요.',
                              );
                            void start('stress', options);
                          } catch (error) {
                            notify((error as Error).message, true);
                          }
                        }
                      : undefined
                  }
                  allowed={
                    editable &&
                    !dirty &&
                    (!stale ||
                      job.application?.document_hash === data.document_hash)
                  }
                  save={save}
                  applied={async () => {
                    await reload(true);
                    setJob(
                      await api<Job>(
                        `/problems/${data.problem.id}/jobs/${job.id}`,
                      ),
                    );
                    await fetchRows();
                  }}
                  evidence={(example, finding) => (
                    <CodeEvidence
                      problemId={data.problem.id}
                      input={example.input_sha}
                      answer={example.answer_sha}
                      actual={finding.actual_sha}
                    />
                  )}
                />
              )}
              {job.result.package && job.status === 'completed' && (
                <div className="package-download">
                  <Icon name="box" size={34} />
                  <div>
                    <strong>{job.result.package.filename}</strong>
                    <p>
                      {bytes(job.result.package.size)} · 검증된 리비전 r
                      {job.revision}
                    </p>
                  </div>
                  <a
                    className="button primary"
                    href={`/api/problems/${data.problem.id}/packages/${job.id}`}
                    download
                  >
                    <Icon name="download" />
                    ZIP 다운로드
                  </a>
                </div>
              )}
              {job.result.statements &&
                Object.entries(job.result.statements).map(
                  ([language, result]) => (
                    <div className="render-row" key={language}>
                      <strong>{language}</strong>
                      <a
                        className="button small"
                        href={`/api/problems/${data.problem.id}/rendered/${job.id}/${language}.html`}
                        download
                      >
                        HTML
                      </a>
                      {result.pdf === 'OK' ? (
                        <a
                          className="button small"
                          href={`/api/problems/${data.problem.id}/rendered/${job.id}/${language}.pdf`}
                          download
                        >
                          PDF
                        </a>
                      ) : (
                        <details>
                          <summary>PDF 오류 확인</summary>
                          <CodeEditor
                            value={result.message || ''}
                            readOnly
                            rows={5}
                          />
                        </details>
                      )}
                    </div>
                  ),
                )}
              {job.result.events?.length ? (
                <details className="execution-log">
                  <summary>
                    <Icon name="history" size={16} />
                    실행 과정 · {job.result.events.length}개 기록
                    <Icon name="down" size={15} />
                  </summary>
                  <ol>
                    {job.result.events.map((event, index) => (
                      <li key={index}>{event.label}</li>
                    ))}
                  </ol>
                </details>
              ) : null}
              <div className="run-footnote">
                결과는 실행 당시 자료 해시·검증 환경과 함께 보관됩니다.
                시간·메모리는 해당 실행 환경에서 반환한 값입니다.
              </div>
              <InvocationComments
                problemId={data.problem.id}
                jobId={job.id}
                allowed={canInvoke}
              />
            </>
          ) : jobError?.id === selected ? (
            <Notice tone="error">{jobError.message}</Notice>
          ) : (
            <Empty
              icon="play"
              title={
                selected
                  ? '실행 결과를 불러오는 중입니다.'
                  : '기록을 선택하세요.'
              }
              description="기록을 선택하면 저장된 결과를 표시합니다."
            />
          )}
        </section>
      </section>
      {caseResult && (
        <Modal
          wide
          title={`${caseResult.testset} · ${caseResult.index ? `테스트 #${caseResult.index}` : '컴파일·실행 환경'}`}
          onClose={() => setCaseResult(null)}
          footer={
            <button className="button" onClick={() => setCaseResult(null)}>
              닫기
            </button>
          }
        >
          <div className="case-stats">
            <Badge tone={caseResult.verdict === 'AC' ? 'success' : 'danger'}>
              {caseResult.verdict}
            </Badge>
            <span>
              CPU{' '}
              {caseResult.cpu_ms === null
                ? '개별 값 미제공'
                : `${caseResult.cpu_ms}ms`}
            </span>
            <span>
              경과 시간{' '}
              {caseResult.wall_ms === null
                ? '개별 값 미제공'
                : `${caseResult.wall_ms}ms`}
            </span>
            <span>
              메모리{' '}
              {caseResult.memory_kb === null
                ? '개별 값 미제공'
                : bytes(caseResult.memory_kb * 1024)}
            </span>
          </div>
          <CodeEvidence
            problemId={data.problem.id}
            input={caseResult.input_sha}
            answer={caseResult.answer_sha}
            actual={caseResult.actual_sha}
            outputTruncated={caseResult.output_truncated}
            outputSize={caseResult.output_size}
            outputTotalBytes={caseResult.output_total_bytes}
            outputError={caseResult.output_error}
          />
          {caseResult.comment && (
            <CodeEditor
              value={caseResult.comment}
              readOnly
              label="판정 메시지"
              rows={4}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
export function CodeEvidence({
  problemId,
  input,
  answer,
  actual,
  outputTruncated = false,
  outputSize,
  outputTotalBytes,
  outputError,
}: {
  problemId: string;
  input: string;
  answer: string;
  actual: string | null;
  outputTruncated?: boolean;
  outputSize?: number | null;
  outputTotalBytes?: number | null;
  outputError?: string | null;
}) {
  const [values, setValues] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all(
      [input, answer, actual].map((sha, index) =>
        sha
          ? blobText(problemId, sha)
          : Promise.resolve(
              index === 2
                ? outputError ||
                    '이 실행 기록에는 저장된 실제 출력이 없습니다. 컴파일·실행 환경 오류 또는 이전 채점 기록인지 확인하세요.'
                : '개별 테스트가 지정되지 않은 판정입니다.',
            ),
      ),
    )
      .then((value) => {
        if (active) setValues(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [problemId, input, answer, actual, outputError]);
  if (error) return <Notice tone="error">{error}</Notice>;
  return (
    <div className="evidence-grid">
      {['입력', '기대 출력', '실제 출력'].map((label, i) => (
        <div key={label} className="evidence-file">
          {i === 2 && outputTruncated && (
            <Notice>
              실제 출력 중 {outputSize == null ? '일부' : bytes(outputSize)}
              {outputTotalBytes == null
                ? ''
                : ` / 전체 ${bytes(outputTotalBytes)}`}
              만 보관했습니다. 화면과 다운로드 파일 모두 보관된 부분입니다.
            </Notice>
          )}
          {i === 2 && outputError && (
            <Notice tone="error">{outputError}</Notice>
          )}
          <BlobDownload
            problemId={problemId}
            sha={[input, answer, actual][i]}
            filename={
              [
                'input.in',
                'expected.out',
                outputTruncated ? 'actual.partial.out' : 'actual.out',
              ][i]
            }
            label={`${label}${i === 2 && outputTruncated ? '(일부)' : ''} 다운로드`}
          />
          <CodeEditor
            value={values[i] ?? '불러오는 중…'}
            readOnly
            label={label}
            rows={6}
          />
        </div>
      ))}
    </div>
  );
}
