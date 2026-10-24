import GeneratedTestResults from './GeneratedTestResults';
import ValidationResults from './ValidationResults';
import { isComponentCheck, isInputCheck } from '../../lib/validationResults';
import Select from '../../components/Select';
import Pagination, { PaginatedList } from '../../components/Pagination';
import { useRemotePage } from '../../lib/useRemotePage';
import { jobRelation, requesterName } from '../../lib/jobHistory';
import JudgeCompatibilityNotice from './JudgeCompatibilityNotice';
import { can, canEdit } from '../../lib/permissions';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  executionResultPath,
  matchesExecutionView,
  type ExecutionView,
} from '../../lib/executionNavigation';
import {
  api,
  ApiError,
  blobPreview,
  jobLabels,
  post,
  statusLabels,
  time,
  bytes,
} from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import { BlobDownload } from '../../components/Downloads';
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
import TestsetSelector from './TestsetSelector';
import ExecutionLimitsInfo from './ExecutionLimitsInfo';
import TestVerdictMatrix from './TestVerdictMatrix';
import VerificationProgress from './VerificationProgress';
import SolutionResultPanel from './SolutionResultPanel';
import SolutionJudgeSummary from './SolutionJudgeSummary';
import CaseResultGrid from './CaseResultGrid';
import StressTestResults from './StressTestResults';
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
    run,
    notify,
    reload,
    save,
    dirty,
  } = useWorkspace();
  const { user } = useAuth();
  const canInvoke = can(data.problem, 'execute');
  const canPackage = can(data.problem, 'package');
  const canApply = can(data.problem, 'edit_tests');
  const draft = canEdit(data.problem);
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
  const historyPage = Math.max(
    1,
    Math.min(
      1000000,
      Math.trunc(Number(searchParams.get('history_page'))) || 1,
    ),
  );
  const relation = ['current', 'other'].includes(
    searchParams.get('history_relation') || '',
  )
    ? searchParams.get('history_relation')!
    : 'all';
  const chosenKind = searchParams.get('history_kind') || 'all';
  const historyKind =
    mode === 'all' && Object.hasOwn(jobLabels, chosenKind) ? chosenKind : mode;
  const historyQuery = new URLSearchParams({
    page: String(historyPage),
    page_size: '20',
    kind: historyKind,
    relation,
    current_hash: data.document_hash,
  });
  const {
    data: history,
    error: historyError,
    refresh: fetchRows,
  } = useRemotePage<Job>(
    `/problems/${data.problem.id}/jobs?${historyQuery}`,
    historyPage,
    3000,
    (values) =>
      values.filter(
        (row) =>
          (historyKind === 'all' || row.kind === historyKind) &&
          (relation === 'all' ||
            (jobRelation(row, data.document_hash) === 'other') ===
              (relation === 'other')),
      ),
  );
  const visible = history?.items || [];
  function changeHistory(key: string, value: string) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(key, value);
      if (key !== 'history_page') next.delete('history_page');
      return next;
    });
  }
  const selected = requestedJob || visible[0]?.id || '';
  // Pin the initial result so polling and page changes preserve the detail view.
  useEffect(() => {
    if (!requestedJob && selected)
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (!next.get('job')) next.set('job', selected);
          return next;
        },
        { replace: true },
      );
  }, [requestedJob, selected, setSearchParams]);
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
  const [chosenPackageSets, setPackageSets] = useState<string[]>(
    Object.keys(doc.testsets).slice(0, 1),
  );
  const packageSets = Object.keys(doc.testsets).filter((name) =>
    chosenPackageSets.includes(name),
  );
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [exportFormat, setExportFormat] = useState('zoj');
  const [verifyPackage, setVerifyPackage] = useState(true);
  const [statementLanguage, setStatementLanguage] = useState(
    Object.keys(doc.statements).includes('korean')
      ? 'korean'
      : Object.keys(doc.statements)[0] || 'korean',
  );
  const [caseResult, setCaseResult] = useState<
    (CaseResult & { solution_name?: string }) | null
  >(null);
  const [executionBackend, setExecutionBackend] = useState<'zoj' | null>(null);
  const [startError, setStartError] = useState<{
    problemId: string;
    backend: string | null;
    error: ApiError;
  } | null>(null);
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
          setExecutionBackend('zoj');
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
          if (!matchesExecutionView(value.kind, mode)) {
            const destination = executionResultPath(
              data.problem.id,
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
  }, [selected, data.problem.id, notify, mode, navigate, search]);
  async function start(
    kind: Job['kind'],
    options: Record<string, unknown> = {},
  ) {
    setBusy(true);
    setStartError(null);
    try {
      await run(kind, {
        ...options,
        ...(['verify', 'package', 'stress'].includes(kind)
          ? { execution_backend: 'zoj' }
          : {}),
      });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'judge_incompatible')
        setStartError({
          problemId: data.problem.id,
          backend: executionBackend,
          error: e,
        });
      else notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const sourceRelation = job ? jobRelation(job, data.document_hash) : null;
  const stale = sourceRelation === 'other';
  const validationFeedback =
    job && (isComponentCheck(job) || isInputCheck(job));
  const scope = (job?.result.scope || job?.options.scope) as
    InvocationScope | undefined;
  async function apply() {
    if (!job || deciding) return;
    setDeciding(true);
    try {
      const version = await save();
      await post(`/problems/${data.problem.id}/jobs/${job.id}/apply`, {
        version,
      });
      await reload(true);
      setJob(await api<Job>(`/problems/${data.problem.id}/jobs/${job.id}`));
      await fetchRows();
      notify('생성된 입력과 정답을 작업 사본에 반영했습니다.');
      window.dispatchEvent(new window.Event('editor-preparation-decided'));
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setDeciding(false);
    }
  }
  async function discardGenerated() {
    if (!job || deciding) return;
    setDeciding(true);
    try {
      await post(`/problems/${data.problem.id}/jobs/${job.id}/discard`);
      setJob(await api<Job>(`/problems/${data.problem.id}/jobs/${job.id}`));
      await fetchRows();
      window.dispatchEvent(new window.Event('editor-preparation-decided'));
      notify(
        '생성 결과를 반영하지 않고 버렸습니다. 작업 사본은 그대로 유지됩니다.',
      );
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setDeciding(false);
    }
  }
  const environmentPanel = (
    <section className={verification ? 'verification-environment' : 'card'}>
      <strong>ZOJ 실제 채점기 · 대회와 같은 환경</strong>
      <p className="muted">
        전체 풀이 검증·스트레스 테스트·패키지 검증은 ZOJ 채점기로 실행합니다.
        언어별 설정을 비워두면 자동 보정하며, 개요의 기본 정보에서 지정한 값이나
        자동 보정 끄기를 적용합니다. Main 정답 생성도 같은 ZOJ 채점기와 언어별
        제한을 사용하며 생성기·Validator 등 제작 작업도 ZOJ 에이전트가
        처리합니다.
      </p>
      {environment && !zojConfigured && (
        <Notice tone="error">
          ZOJ 채점기 연결이 설정되지 않았습니다. 관리자에게 문의하세요.
        </Notice>
      )}
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
            ? '커밋된 리비전을 패키지로 내보냅니다. 검증 실행 여부를 선택할 수 있습니다.'
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
              disabled={
                !canPackage ||
                busy ||
                (exportFormat === 'zoj' && !packageSets.length)
              }
              onClick={() =>
                void start('package', {
                  testset: packageSets[0] || Object.keys(doc.testsets)[0],
                  ...(exportFormat === 'zoj' ? { testsets: packageSets } : {}),
                  verify: verifyPackage,
                  export_format: exportFormat,
                  statement_language: statementLanguage,
                })
              }
            >
              <Icon name="play" />
              {verifyPackage ? '검증 후 패키지 생성' : '검증 없이 패키지 생성'}
            </button>
          )
        }
      />
      {startError?.problemId === data.problem.id &&
        startError.backend === executionBackend && (
          <JudgeCompatibilityNotice
            error={startError.error}
            problemId={data.problem.id}
          />
        )}
      <ExecutionLimitsInfo environment={environment} stress={stress} />
      {((packages && verifyPackage) || stress) && environmentPanel}
      {verification && (
        <section
          className="card verification-launcher"
          aria-label="전체 검증 실행"
        >
          {environmentPanel}
          {!draft && canInvoke && (
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
            writer={draft}
            busy={busy || executionBackend === null || !zojConfigured}
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
            <label className="checkbox">
              <input
                type="checkbox"
                aria-label="패키지 생성 전 검증"
                checked={verifyPackage}
                disabled={!canPackage || busy}
                onChange={(event) => setVerifyPackage(event.target.checked)}
              />
              패키지 생성 전 풀이·구성요소 검증 실행
            </label>
            {!verifyPackage && (
              <Notice>
                저장된 자료만 내보내며 생성기·Validator·Main·풀이를 실행하지
                않습니다. ZOJ·Linux 형식은 입력·정답이 모두 저장되어 있어야
                합니다. 작성 중인 자료는 Editor 형식으로 보관할 수 있습니다. ZOJ
                등록·업데이트에는 검증을 완료한 패키지가 필요합니다.
              </Notice>
            )}
            <div className="form-grid">
              <label>
                패키지 형식
                <Select
                  value={exportFormat}
                  onChange={(e) => {
                    setExportFormat(e.target.value);
                  }}
                >
                  <option value="zoj">ZOJ 문제 ZIP · 대회에 등록</option>
                  <option value="editor">
                    Editor / Polygon 형식 · 작업 자료
                  </option>
                  <option value="linux">
                    Linux 재현 패키지 · 오프라인 실행 자료
                  </option>
                </Select>
              </label>
              {exportFormat === 'zoj' && (
                <>
                  <label>
                    ZOJ 기본 지문 언어
                    <Select
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
                    </Select>
                  </label>
                  <TestsetSelector
                    label="ZOJ에서 사용할 테스트 세트"
                    testsets={doc.testsets}
                    value={packageSets}
                    onChange={setPackageSets}
                    disabled={!canPackage || busy}
                  />
                </>
              )}
            </div>
            <p className="muted">
              {exportFormat === 'zoj'
                ? '선택한 세트의 입력·정답을 하나의 활성 채점 데이터로 합칩니다. 선택한 세트의 예제와 모든 번역 지문, 검증 코드·checker·validator 및 원본 Editor 자료를 함께 보관합니다. 그룹·부분 점수 등 지원하지 않는 채점 방식은 생성 전에 안내합니다.'
                : exportFormat === 'linux'
                  ? '전체 생성 테스트·정답·소스·검증 환경과 고정된 실행 코드를 담습니다. Python과 준비된 Docker 이미지로 API 키·서비스 DB 없이 오프라인 재실행할 수 있습니다. Editor 실행 정책을 재현하며, ZOJ 대회 채점기의 언어별 보정과 다른 하드웨어에서의 시간 일치를 보장하는 패키지는 아닙니다.'
                  : 'Editor에서 다시 열 수 있는 작업 자료와 problem.xml, 생성된 테스트, 모든 지문 언어를 포함합니다.'}
            </p>
          </section>
          <div className="workspace-guide">
            <Icon name="branch" />
            <p>
              내 작업 사본을 먼저 커밋하세요. 검증을 선택하면 입력·정답을
              준비하고 풀이 기대 판정과 checker·validator 자체 테스트를
              확인합니다. 선택을 해제하면 저장된 자료를 미검증 패키지로
              내보냅니다.
            </p>
          </div>
          <ZojPublishing
            problemId={data.problem.id}
            editable={can(data.problem, 'publish')}
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
      <div className="history-filters">
        <div
          className="history-relations"
          role="group"
          aria-label="실행 자료 기준"
        >
          {(
            [
              ['all', '전체 기록'],
              ['current', '현재 저장본'],
              ['other', '다른 자료'],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={`button small ${relation === value ? 'primary' : ''}`}
              aria-pressed={relation === value}
              onClick={() => changeHistory('history_relation', value)}
            >
              {label}
              {history?.counts ? ` ${history.counts[value]}` : ''}
            </button>
          ))}
        </div>
        {mode === 'all' && (
          <label>
            작업 종류
            <Select
              aria-label="기록 작업 종류"
              value={historyKind}
              onChange={(event) =>
                changeHistory('history_kind', event.target.value)
              }
            >
              <option value="all">모든 작업</option>
              {Object.entries(jobLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>
      {dirty && (
        <Notice>
          저장하지 않은 변경이 있습니다. 자료 기준 표시는 마지막으로 저장한 작업
          사본과 비교합니다.
        </Notice>
      )}
      {historyError && (
        <Notice tone="error">
          기록을 불러오지 못했습니다. {historyError}
          <button className="button small" onClick={() => void fetchRows()}>
            다시 불러오기
          </button>
        </Notice>
      )}
      <section
        className="execution-layout execution-history"
        aria-label={verification ? '저장된 검증 기록' : '저장된 실행 기록'}
      >
        <section className="card execution-list no-padding">
          <div className="card-heading">
            <h3>
              {verification ? '검증 기록' : '작업 기록'}{' '}
              <span className="count">{history?.total ?? '…'}</span>
            </h3>
          </div>
          {history && (
            <Pagination
              {...history}
              label={verification ? '검증 기록' : '작업 기록'}
              onPageChange={(page) =>
                changeHistory('history_page', String(page))
              }
            />
          )}
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
                      : isInputCheck(row)
                        ? '입력 검사'
                        : jobLabels[row.kind]}
                  </strong>
                  <Badge
                    tone={
                      jobRelation(row, data.document_hash) === 'other'
                        ? 'warning'
                        : 'accent'
                    }
                  >
                    {jobRelation(row, data.document_hash) === 'other'
                      ? '다른 자료'
                      : jobRelation(row, data.document_hash) === 'applied'
                        ? '결과 반영본'
                        : '현재 저장본'}
                  </Badge>
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
                      {row.discarded_at
                        ? '반영하지 않고 버림'
                        : row.application
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
                <div
                  className="job-requester"
                  title={row.requester ? `@${row.requester.handle}` : undefined}
                >
                  <Icon name="users" size={14} />
                  <span>{requesterName(row, user?.id)} 요청</span>
                </div>
                <small>
                  {isInputCheck(row) ? '입력 검사' : jobLabels[row.kind]} · r
                  {row.revision} · {time(row.created_at)}
                </small>
                <span>{row.result.summary || '검증 워커 배정 대기'}</span>
                {row.kind === 'stress' && <StressHistorySummary job={row} />}
              </button>
            ))
          ) : !history && !historyError ? (
            <p className="history-loading" role="status">
              기록을 불러오고 있습니다.
            </p>
          ) : (
            <Empty
              icon="play"
              title={
                verification ? '검증 기록이 없습니다.' : '실행 기록이 없습니다.'
              }
              description={
                relation !== 'all' || historyKind !== 'all'
                  ? '필터를 변경해 다른 기록을 확인하세요.'
                  : '작업을 요청하면 여기에 기록됩니다.'
              }
            />
          )}
          {history && (
            <Pagination
              {...history}
              label={verification ? '검증 기록' : '작업 기록'}
              onPageChange={(page) =>
                changeHistory('history_page', String(page))
              }
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
                      : isInputCheck(job)
                        ? '입력 검사'
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
              {validationFeedback && (
                <ValidationResults key={job.id} job={job} />
              )}
              <section
                className={`execution-source-summary ${sourceRelation === 'other' ? 'different' : 'matching'}`}
                aria-label="실행 자료와 요청자"
              >
                <div className="execution-source-heading">
                  <Icon
                    name={sourceRelation === 'other' ? 'branch' : 'check'}
                  />
                  <div>
                    <strong>
                      {sourceRelation === 'other'
                        ? '현재 작업 사본과 다른 자료'
                        : sourceRelation === 'applied'
                          ? '이 작업의 결과가 현재 저장본에 반영됨'
                          : '현재 저장본과 같은 자료'}
                    </strong>
                    <p>
                      {sourceRelation === 'other'
                        ? '이 결과는 요청 당시 자료에 해당합니다. 현재 자료의 검증 결과로 사용할 수 없습니다.'
                        : sourceRelation === 'applied'
                          ? '실행 당시 원본과 결과를 반영한 저장본을 구분해 보관합니다.'
                          : '마지막으로 저장한 작업 사본을 기준으로 실행한 기록입니다.'}
                    </p>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>요청자</dt>
                    <dd
                      title={
                        job.requester ? `@${job.requester.handle}` : undefined
                      }
                    >
                      {requesterName(job, user?.id)}
                      {job.requester && <small>@{job.requester.handle}</small>}
                    </dd>
                  </div>
                  <div>
                    <dt>작업</dt>
                    <dd>
                      {isInputCheck(job) ? '입력 검사' : jobLabels[job.kind]}
                    </dd>
                  </div>
                  <div>
                    <dt>자료 기준</dt>
                    <dd>
                      {job.options.snapshot === 'committed'
                        ? `커밋 r${job.revision}`
                        : `요청 당시 작업 사본 · r${job.revision}`}
                    </dd>
                  </div>
                  <div>
                    <dt>요청 시각</dt>
                    <dd>{time(job.created_at)}</dd>
                  </div>
                </dl>
              </section>
              <p className="muted small">
                {job.result.runtime?.backend === 'archive'
                  ? '저장된 자료로 ZIP 생성 · 코드 실행 없음'
                  : '저장된 검증 환경 · '}
                {job.result.runtime?.backend === 'archive'
                  ? ''
                  : (job.result.runtime?.backend ??
                        job.options.execution_backend) === 'zoj'
                    ? 'ZOJ 실제 채점기'
                    : job.result.runtime?.backend === 'agent' ||
                        job.options.execution_transport === 'agent'
                      ? 'ZOJ 에이전트 · 제작 작업'
                      : '이전 Editor 실행 기록'}
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
                    : scope.testsets && scope.testsets.length > 1
                      ? `선택 세트 (${scope.testsets.join(', ')})`
                      : scope.testset}{' '}
                  · 풀이 {scope.solutions.length}개 · 테스트 {scope.test_count}
                  개
                  {scope.test_indices.length
                    ? ` (#${scope.test_indices.join(', #')})`
                    : scope.testsets && scope.testsets.length > 1
                      ? ' (선택 세트의 전체 테스트)'
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
                <details className="notice neutral agent-execution-log">
                  <summary>
                    에이전트 실행 기록 · {job.result.execution_runs.length}회
                  </summary>
                  <p className="muted small">
                    컴파일·생성·검증·PDF 실행을 담당한 실제 노드와 실행 자원을
                    확인합니다.
                  </p>
                  <PaginatedList
                    items={job.result.execution_runs}
                    resetKey={job.id}
                    label="에이전트 실행 기록"
                  >
                    {(runs) => (
                      <div
                        className="table-scroll"
                        role="region"
                        aria-label="에이전트 실행 기록 표"
                        tabIndex={0}
                      >
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
                            {runs.map((run) => (
                              <tr key={run.task_id}>
                                <td>
                                  <span
                                    className="agent-execution-node"
                                    title={run.node_name || '채점 노드'}
                                  >
                                    {run.node_name || '채점 노드'}
                                  </span>
                                </td>
                                <td>
                                  {run.runtime === 'renderer'
                                    ? 'PDF 렌더링'
                                    : run.runtime === 'reference'
                                      ? 'Main 정답 생성 · ZOJ 채점기'
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
                    )}
                  </PaginatedList>
                </details>
              ) : null}
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
                  {(draft || job.requested_by === user?.id) &&
                    can(
                      data.problem,
                      job.kind === 'package'
                        ? 'package'
                        : job.kind === 'prepare'
                          ? 'prepare'
                          : job.kind === 'render'
                            ? 'render'
                            : 'execute',
                    ) && (
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
              {job.result.error && !validationFeedback && (
                <Notice tone="error">
                  {job.result.error_code ? (
                    <div className="execution-error-message">
                      <strong>
                        {['invalid_script', 'invalid_script_group'].includes(
                          job.result.error_code,
                        )
                          ? '생성 스크립트를 확인해 주세요.'
                          : '작업을 진행할 수 없습니다.'}
                      </strong>
                      <p>{job.result.error}</p>
                    </div>
                  ) : (
                    <CodeEditor
                      readOnly
                      rows={6}
                      label="실행 오류"
                      value={job.result.error}
                    />
                  )}
                </Notice>
              )}
              {job.result.verified !== undefined && !validationFeedback && (
                <div
                  className={`verification-summary ${job.kind === 'package' && job.options.verify === false ? '' : job.result.verified ? 'passed' : 'mismatch'}`}
                >
                  <Icon name={job.result.verified ? 'check' : 'issue'} />
                  <div>
                    <strong>
                      {job.kind === 'package' && job.options.verify === false
                        ? '검증 없이 생성한 패키지입니다.'
                        : job.result.verified
                          ? '기대 판정과 일치합니다.'
                          : '기대 판정 또는 자체 테스트 확인이 필요합니다.'}
                    </strong>
                    <p>
                      {job.kind === 'package' && job.options.verify === false
                        ? '저장된 자료를 내보냈습니다. 대회 사용 전 검증을 권장합니다.'
                        : job.result.mismatches?.length
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
                    {isInputCheck(job)
                      ? '개 입력 검사 완료'
                      : '개 입력·정답 생성 완료'}
                    {job.application && (
                      <small className="block">
                        내 작업 사본에 반영됨 ·{' '}
                        {time(job.application.applied_at)} · 작업 사본 v
                        {job.application.workspace_version}
                      </small>
                    )}
                  </span>
                  {job.discarded_at && (
                    <small>반영하지 않고 버림 · {time(job.discarded_at)}</small>
                  )}
                  {!job.application && !job.discarded_at && (
                    <div className="actions">
                      <button
                        className="button"
                        disabled={!canApply || deciding}
                        onClick={() => void discardGenerated()}
                      >
                        반영하지 않고 버리기
                      </button>
                      <button
                        className="button primary"
                        disabled={!canApply || stale || dirty || deciding}
                        onClick={() => void apply()}
                      >
                        작업 사본에 반영
                      </button>
                    </div>
                  )}
                </div>
              )}
              {job.result.auto_apply?.status === 'blocked' && (
                <Notice>
                  {job.result.auto_apply.message ||
                    '자동 반영되지 않았습니다. 실행 당시 자료와 작업 사본을 확인하세요.'}
                </Notice>
              )}
              {job.kind === 'prepare' && (
                <GeneratedTestResults
                  key={job.id}
                  job={job}
                  problemId={data.problem.id}
                />
              )}
              {job.kind === 'stress' && (
                <StressTestResults
                  job={job}
                  onSelect={(row, name) =>
                    setCaseResult({ ...row, solution_name: name })
                  }
                />
              )}
              <TestVerdictMatrix job={job} />
              <PaginatedList
                items={job.result.solutions || []}
                resetKey={job.id}
                label="풀이 검증 결과"
              >
                {(solutions) =>
                  solutions.map((solution) => (
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
                                <tr
                                  key={`${scope.origin}/${scope.testset}/${scope.group}`}
                                >
                                  <td>
                                    <ExpectationScopeLabel scope={scope} />
                                  </td>
                                  <td>{scope.tag}</td>
                                  <td>
                                    {scope.tested} / {scope.total}
                                  </td>
                                  <td>
                                    {scope.verdicts.join(' · ') || '미실행'}
                                  </td>
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
                        {[
                          ...new Set(solution.cases.map((row) => row.testset)),
                        ].map((setName) => (
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
                            <CaseResultGrid
                              key={`${job.id}/${solution.name}/${setName}`}
                              cases={solution.cases.filter(
                                (row) => row.testset === setName,
                              )}
                              solutionName={solution.name}
                              onSelect={(row) =>
                                setCaseResult({
                                  ...row,
                                  solution_name: solution.name,
                                })
                              }
                            />
                          </section>
                        ))}
                      </div>
                      {solution.skipped && (
                        <p className="muted">NR 태그로 실행하지 않았습니다.</p>
                      )}
                    </SolutionResultPanel>
                  ))
                }
              </PaginatedList>
              {!validationFeedback && job.result.unit_tests?.length ? (
                <ValidationResults key={job.id} job={job} />
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
                    canApply &&
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
                      outputTruncated={finding.output_truncated}
                      outputTotalBytes={finding.output_total_bytes}
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
                      {bytes(job.result.package.size)} ·{' '}
                      {job.result.package.verified ? '검증된' : '미검증'} 리비전
                      r{job.revision}
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
                {job.result.runtime?.backend === 'archive'
                  ? '패키지는 커밋된 자료 해시와 함께 보관됩니다. 코드 실행·판정·시간·메모리 측정은 하지 않았습니다.'
                  : '결과는 실행 당시 자료 해시·검증 환경과 함께 보관됩니다. 시간·메모리는 해당 실행 환경에서 반환한 값입니다.'}
              </div>
              <InvocationComments
                problemId={data.problem.id}
                jobId={job.id}
                allowed={can(data.problem, 'issues')}
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
          title={`${caseResult.solution_name ? `${caseResult.solution_name} · ` : ''}${caseResult.testset} · ${caseResult.index ? `테스트 #${caseResult.index}` : '컴파일·실행 환경'}`}
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
          {caseResult.seed != null && (
            <p className="muted small">
              반복 {caseResult.iteration} · 시드 {caseResult.seed}
              {caseResult.pattern_name ? ` · ${caseResult.pattern_name}` : ''}
            </p>
          )}
          {caseResult.command && (
            <pre className="stress-command">
              <code>{caseResult.command}</code>
            </pre>
          )}
          <CodeEvidence
            key={`${caseResult.solution_name}/${caseResult.input_sha}/${caseResult.actual_sha}`}
            problemId={data.problem.id}
            answerError={
              caseResult.iteration && !caseResult.answer_sha
                ? '기준 풀이가 완료되지 않아 생성된 기대 출력이 없습니다.'
                : undefined
            }
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
export function ExpectationScopeLabel({
  scope,
}: {
  scope: NonNullable<
    NonNullable<Job['result']['solutions']>[number]['expectations']
  >[number];
}) {
  if (scope.origin === 'default') {
    return scope.testsets && scope.testsets.length > 1
      ? `전체 기본 범위 · ${scope.testsets.join(', ')}`
      : `${scope.testset} · 기본 범위`;
  }
  return scope.group
    ? `${scope.testset} / ${scope.group} · 그룹 지정`
    : `${scope.testset} · 세트 지정`;
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
  answerError,
}: {
  problemId: string;
  input: string;
  answer: string;
  actual: string | null;
  outputTruncated?: boolean;
  outputSize?: number | null;
  outputTotalBytes?: number | null;
  outputError?: string | null;
  answerError?: string;
}) {
  const [values, setValues] = useState<
    { text: string; truncated: boolean; binary: boolean }[]
  >([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    Promise.all(
      [input, answer, actual].map((sha, index) =>
        sha
          ? blobPreview(problemId, sha, abort.signal)
          : Promise.resolve({
              text:
                index === 2
                  ? outputError ||
                    '이 실행 기록에는 저장된 실제 출력이 없습니다. 컴파일·실행 환경 오류 또는 이전 채점 기록인지 확인하세요.'
                  : index === 1 && answerError
                    ? answerError
                    : '개별 테스트가 지정되지 않은 판정입니다.',
              truncated: false,
              binary: false,
            }),
      ),
    )
      .then((value) => {
        if (!abort.signal.aborted) setValues(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => {
      abort.abort();
    };
  }, [problemId, input, answer, actual, outputError, answerError]);
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
          {(values[i]?.truncated || values[i]?.binary) && (
            <Notice>
              {values[i]?.binary
                ? '바이너리 파일입니다.'
                : '큰 파일의 앞부분만 표시합니다.'}{' '}
              원본은 다운로드해 확인하세요.
            </Notice>
          )}
          <CodeEditor
            value={values[i]?.text ?? '불러오는 중…'}
            readOnly
            label={label}
            rows={6}
          />
        </div>
      ))}
    </div>
  );
}
