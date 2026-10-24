import { BoundedText } from '../components/ui';
import { can, canEdit, permissionsOf, tabEditable } from '../lib/permissions';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
  lazy,
  Suspense,
} from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { api, post, put, ApiError, jobLabels } from '../lib/api';
import type {
  Job,
  JobKind,
  ProblemDocument,
  WorkspaceData,
} from '../lib/types';
import { WorkspaceContext } from '../lib/workspace';
import type { NoticeAction } from '../lib/workspace';
import { Badge, Icon, Modal, Notice } from '../components/ui';
import PreparationNotice from '../components/PreparationNotice';
import RevisionNotice from '../components/RevisionNotice';
import WorkspaceNavigation from '../components/WorkspaceNavigation';
import { useRevisionUpdates } from '../lib/useRevisionUpdates';
import { preparationCautions } from '../lib/readiness';
import { executionResultPath } from '../lib/executionNavigation';
const CommitChanges = lazy(() => import('../components/CommitChanges'));
import Overview from './workspace/Overview';
import Statements from './workspace/Statements';
import Files from './workspace/Files';
import ComponentTests from './workspace/ComponentTests';
import Tests from './workspace/Tests';
const Executions = lazy(() => import('./workspace/Executions'));
import Collaboration from './workspace/Collaboration';
import Revisions from './workspace/Revisions';
import Review from './workspace/Review';
import Materials from './workspace/Materials';
export default function ProblemWorkspace() {
  const { problemId = '', tab = 'overview' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [doc, setDoc] = useState<ProblemDocument | null>(null);
  const revisionHead = useRevisionUpdates(
    problemId,
    data?.problem.id === problemId ? data.problem.revision : null,
  );
  const sharedRevision = Math.max(
    data?.problem.revision ?? 0,
    revisionHead?.revision ?? 0,
  );
  const displayedRevision =
    data && !canEdit(data.problem)
      ? data.problem.revision
      : (data?.base_revision ?? 0);
  const hasNewRevision = sharedRevision > displayedRevision;
  const dirtyRef = useRef(false);
  const activeProblem = useRef(problemId);
  const [busy, setBusy] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const requestInFlight = useRef<{
    problemId: string;
    promise: Promise<Job>;
  } | null>(null);
  const pending = busy || requesting;
  const [message, setMessage] = useState('');
  const [messageAction, setMessageAction] = useState<NoticeAction | null>(null);
  const [isError, setIsError] = useState(false);
  const [commitModal, setCommitModal] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitPreview, setCommitPreview] = useState<{
    revision: number;
    before: ProblemDocument;
    after: ProblemDocument;
    conflicts: string[];
  } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [minor, setMinor] = useState(false);
  const [discardModal, setDiscardModal] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [resolution, setResolution] = useState<{
    revision: number;
    shared: ProblemDocument;
  } | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  function atPath(document: ProblemDocument, path: string) {
    const value = path
      .split('/')
      .reduce<unknown>(
        (node, key) =>
          node && typeof node === 'object'
            ? (node as Record<string, unknown>)[key]
            : undefined,
        document,
      );
    return value === undefined
      ? '(삭제됨)'
      : typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2);
  }
  const reload = useCallback(
    async (preserveEdits = false) => {
      const value = await api<WorkspaceData>(`/problems/${problemId}`);
      if (preserveEdits && dirtyRef.current) return;
      setData(value);
      setDoc(structuredClone(value.document));
    },
    [problemId],
  );
  useEffect(() => {
    let active = true;
    api<WorkspaceData>(`/problems/${problemId}`)
      .then((value) => {
        if (active) {
          setData(value);
          setDoc(structuredClone(value.document));
          setMessage('');
          setMessageAction(null);
        }
      })
      .catch((e) => {
        if (active) {
          setMessage(e.message);
          setIsError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [problemId]);
  const dirty = Boolean(
    data && doc && JSON.stringify(doc) !== JSON.stringify(data.document),
  );
  useLayoutEffect(() => {
    dirtyRef.current = dirty;
    activeProblem.current = problemId;
  }, [dirty, problemId]);
  const cautions = useMemo(() => (doc ? preparationCautions(doc) : []), [doc]);
  const required = cautions.filter((c) => c.blocking).length;
  const recommended = cautions.length - required;
  useEffect(() => {
    if (!commitModal || !data || !doc) return;
    let active = true;
    void post<{
      revision: number;
      before: ProblemDocument;
      after: ProblemDocument;
      conflicts: string[];
    }>(`/problems/${problemId}/commit-preview`, {
      version: data.version,
      document: doc,
    })
      .then((value) => {
        if (active) setCommitPreview(value);
      })
      .catch((e) => {
        if (active) setPreviewError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [commitModal, data, doc, problemId]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const blocker = useBlocker(
    ({ nextLocation }) =>
      dirty && nextLocation.pathname.split('/')[2] !== problemId,
  );
  const notify = useCallback(
    (value: string, error = false, action?: NoticeAction) => {
      setMessage(value);
      setIsError(error);
      setMessageAction(error ? null : action || null);
    },
    [],
  );
  const updatePreparations = useCallback(
    (rows: NonNullable<WorkspaceData['pending_preparations']>) => {
      setData((previous) =>
        previous &&
        JSON.stringify(previous.pending_preparations || []) !==
          JSON.stringify(rows)
          ? { ...previous, pending_preparations: rows }
          : previous,
      );
    },
    [],
  );
  const save = useCallback(async () => {
    const current = { data, doc };
    if (!current.data || !current.doc)
      throw new Error('자료를 불러오고 있습니다.');
    if (JSON.stringify(current.data.document) === JSON.stringify(current.doc))
      return current.data.version;
    setBusy(true);
    try {
      const result = await put<{
        version: number;
        document_hash: string;
        cautions: WorkspaceData['cautions'];
        modified: boolean;
      }>(`/problems/${problemId}/working-copy`, {
        version: current.data.version,
        document: current.doc,
      });
      const next = {
        ...current.data,
        ...result,
        document: structuredClone(current.doc),
        problem: { ...current.data.problem, modified: result.modified },
      };
      setData(next);
      notify('내 작업 사본에 저장했습니다. 공유하려면 커밋하세요.');
      return result.version;
    } catch (e) {
      notify((e as Error).message, true);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [problemId, notify, data, doc]);
  const run = useCallback(
    (kind: JobKind, options: Record<string, unknown> = {}) => {
      if (requestInFlight.current?.problemId === problemId)
        return requestInFlight.current.promise;
      setRequesting(true);
      const submission = (async () => {
        const committed =
          options.snapshot === 'committed' ||
          (data &&
            (!canEdit(data.problem) ||
              (kind === 'render' &&
                !can(data.problem, 'edit_statements') &&
                !can(data.problem, 'translate'))));
        const version = committed ? data!.version : await save();
        const result = await post<Job>(`/problems/${problemId}/jobs`, {
          kind,
          version,
          ...(committed ? { revision: data!.problem.revision } : {}),
          options: {
            ...options,
            ...(committed ? { snapshot: 'committed' } : {}),
          },
          reuse: false,
        });
        if (activeProblem.current === problemId) {
          notify(
            `${jobLabels[kind]} 요청을 접수했습니다. 아래에서 진행 상황과 결과를 확인하세요.`,
          );
          navigate(executionResultPath(problemId, result.id));
        }
        return result;
      })();
      const request = submission.finally(() => {
        if (requestInFlight.current?.promise === request) {
          requestInFlight.current = null;
          setRequesting(false);
        }
      });
      requestInFlight.current = { problemId, promise: request };
      return request;
    },
    [problemId, save, notify, data, navigate],
  );
  async function openResolution() {
    try {
      const state = await api<WorkspaceData>(`/problems/${problemId}`);
      const shared = await api<ProblemDocument>(
        `/problems/${problemId}/revisions/${state.problem.revision}`,
      );
      setChoices({});
      setResolution({ revision: state.problem.revision, shared });
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function resolve() {
    setBusy(true);
    try {
      const version = await save();
      setBusy(true);
      await post(`/problems/${problemId}/resolve`, {
        version,
        revision: resolution!.revision,
        choices,
      });
      await reload();
      setResolution(null);
      setConflicts([]);
      notify('충돌을 해결한 작업 사본을 저장했습니다. 확인 후 커밋하세요.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const mutate = useCallback((fn: (d: ProblemDocument) => void) => {
    setDoc((previous) => {
      if (!previous) return previous;
      const next = structuredClone(previous);
      fn(next);
      return next;
    });
  }, []);
  const context = useMemo(
    () =>
      data && doc
        ? {
            data,
            document: doc,
            dirty,
            busy: pending,
            editable: tabEditable(data.problem, tab),
            mutate,
            save,
            reload,
            run,
            notify,
          }
        : null,
    [data, doc, dirty, pending, mutate, save, reload, run, notify, tab],
  );
  async function workingAction(
    action: string,
    body: Record<string, unknown> = {},
  ) {
    setBusy(true);
    try {
      if (action === 'update' && data && !canEdit(data.problem)) {
        await reload();
        notify('최신 공유 리비전을 불러왔습니다.');
        return;
      }
      const version = await save();
      setBusy(true);
      await post(`/problems/${problemId}/${action}`, { version, ...body });
      await reload();
      notify(
        action === 'commit'
          ? '공유 리비전에 커밋했습니다.'
          : action === 'discard'
            ? '작업 사본을 공유 리비전으로 되돌렸습니다.'
            : '최신 리비전을 작업 사본에 반영했습니다.',
      );
      setConflicts([]);
      setCommitModal(false);
      setDiscardModal(false);
    } catch (e) {
      notify((e as Error).message, true);
      if (e instanceof ApiError && Array.isArray(e.details.conflicts))
        setConflicts(e.details.conflicts as string[]);
    } finally {
      setBusy(false);
    }
  }
  if (!data || !doc)
    return (
      <div className="page-container">
        {isError ? (
          <Notice tone="error">{message}</Notice>
        ) : (
          <div className="loading">작업 사본을 불러오고 있습니다.</div>
        )}
      </div>
    );
  const components: Record<string, React.ReactNode> = {
    overview: <Overview />,
    statements: <Statements />,
    files: <Files />,
    solutions: <Files solutions />,
    checker: <ComponentTests kind="checker" />,
    validator: <ComponentTests kind="validator" />,
    interactor: <ComponentTests kind="interactor" />,
    tests: <Tests />,
    invocations: <Executions key="invocations" />,
    verification: <Executions key="verification" verification />,
    stress: <Executions key="stress" stress />,
    packages: <Executions key="packages" packages />,
    issues: <Collaboration />,
    access: <Collaboration access />,
    revisions: <Revisions />,
    review: <Review />,
    materials: <Materials />,
  };
  return (
    <WorkspaceContext.Provider value={context}>
      <div className="workspace-page">
        <div className="problem-heading">
          <div>
            <div className="breadcrumb">
              <Link to="/problems">문제</Link>
              <Icon name="arrow" size={12} />
              <span>{data.problem.slug}</span>
            </div>
            <div className="problem-heading-title">
              <h1>{doc.info.name}</h1>
              <Badge tone="accent">
                {data.problem.role === 'OWNER'
                  ? '소유자'
                  : permissionsOf(data.problem).length
                    ? '기능별 권한'
                    : '읽기 전용'}
              </Badge>
            </div>
            <div className="working-state">
              <Icon name="branch" size={15} />
              <span>공유 r{sharedRevision}</span>
              <span className="separator">·</span>
              <span>
                {!canEdit(data.problem) ? '현재 보는 리비전' : '내 작업 사본'} r
                {displayedRevision}
              </span>
              <span
                className={`working-dot ${dirty ? 'warning' : data.problem.modified ? 'accent' : 'success'}`}
              />
              <span>
                {dirty
                  ? '저장하지 않은 변경'
                  : data.problem.modified
                    ? '커밋하지 않은 변경'
                    : hasNewRevision
                      ? '새 리비전 도착'
                      : '최신 상태'}
              </span>
              {hasNewRevision && <Badge tone="accent">업데이트 가능</Badge>}
            </div>
          </div>
          <div className="actions">
            <button
              className="button"
              disabled={pending}
              onClick={() => void workingAction('update')}
            >
              <Icon name="download" />
              업데이트
            </button>
            {canEdit(data.problem) && (
              <>
                <button
                  className="button"
                  disabled={pending || !dirty}
                  onClick={() => void save().catch(() => {})}
                >
                  <Icon name="save" />
                  {busy ? '저장 중…' : '작업 사본 저장'}
                </button>
                <button
                  className="button primary"
                  disabled={pending}
                  onClick={() => {
                    setCommitPreview(null);
                    setPreviewError('');
                    setCommitModal(true);
                  }}
                >
                  <Icon name="branch" />
                  커밋
                </button>
              </>
            )}
          </div>
        </div>
        <RevisionNotice
          problemId={problemId}
          revision={sharedRevision}
          baseRevision={displayedRevision}
          head={revisionHead}
          dirty={dirty}
          busy={pending}
          onUpdate={() => void workingAction('update')}
        />
        <div className="workspace-layout">
          <WorkspaceNavigation
            key={`${problemId}/${tab}`}
            problemId={problemId}
            tab={tab}
            required={required}
            recommended={recommended}
            pendingPreparations={
              data.pending_preparations?.filter((r) => !r.stale).length ?? 0
            }
            busy={pending}
            onDiscard={() => setDiscardModal(true)}
          />
          <div className="workspace-main">
            <PreparationNotice onPendingChange={updatePreparations} />
            {requesting && (
              <Notice>
                <span role="status">
                  요청을 접수하고 있습니다. 접수되면 실행 결과로 이동합니다.
                </span>
              </Notice>
            )}
            {message && (
              <Notice tone={isError ? 'error' : 'success'}>
                {message}
                {messageAction && (
                  <div className="notice-action">
                    <Link className="button small" to={messageAction.to}>
                      <Icon name="play" size={15} />
                      {messageAction.label}
                    </Link>
                  </div>
                )}
                {conflicts.length > 0 && (
                  <div>
                    <button
                      className="button small"
                      onClick={() => void openResolution()}
                    >
                      충돌 해결
                    </button>
                    <ul>
                      {conflicts.map((path) => (
                        <li key={path}>
                          <code>{path}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  className="notice-close icon-button"
                  aria-label="안내 닫기"
                  onClick={() => {
                    setMessage('');
                    setMessageAction(null);
                  }}
                >
                  <Icon name="close" size={15} />
                </button>
              </Notice>
            )}
            <fieldset
              disabled={pending}
              aria-busy={requesting}
              className="workspace-content"
            >
              <Suspense
                fallback={
                  <div className="loading">화면을 불러오고 있습니다.</div>
                }
              >
                {components[tab] || <Overview />}
              </Suspense>
            </fieldset>
          </div>
        </div>
      </div>
      {resolution && (
        <Modal
          wide
          title="동료의 변경과 충돌 해결"
          onClose={() => setResolution(null)}
          footer={
            <>
              <button className="button" onClick={() => setResolution(null)}>
                닫기
              </button>
              <button
                className="button primary"
                disabled={busy || conflicts.some((path) => !choices[path])}
                onClick={() => void resolve()}
              >
                선택한 변경으로 해결
              </button>
            </>
          }
        >
          <p className="muted">
            공유 r{resolution.revision}과 내 변경 중 유지할 값을 선택하세요.
            충돌하지 않은 변경은 함께 보존됩니다.
          </p>
          {conflicts.map((path) => (
            <fieldset className="conflict-item" key={path}>
              <legend>
                <code>{path}</code>
              </legend>
              <div className="form-grid">
                <label>
                  <span>
                    <input
                      type="radio"
                      name={path}
                      checked={choices[path] === 'ours'}
                      onChange={() =>
                        setChoices({ ...choices, [path]: 'ours' })
                      }
                    />{' '}
                    내 변경 유지
                  </span>
                  <BoundedText>{atPath(doc, path)}</BoundedText>
                </label>
                <label>
                  <span>
                    <input
                      type="radio"
                      name={path}
                      checked={choices[path] === 'theirs'}
                      onChange={() =>
                        setChoices({ ...choices, [path]: 'theirs' })
                      }
                    />{' '}
                    공유 변경 유지
                  </span>
                  <BoundedText>{atPath(resolution.shared, path)}</BoundedText>
                </label>
              </div>
            </fieldset>
          ))}
        </Modal>
      )}
      {commitModal && (
        <Modal
          wide
          title="변경사항 커밋"
          onClose={() => setCommitModal(false)}
          footer={
            <>
              <button className="button" onClick={() => setCommitModal(false)}>
                취소
              </button>
              <button
                className="button primary"
                disabled={
                  busy ||
                  !commitMessage.trim() ||
                  !commitPreview ||
                  Boolean(commitPreview.conflicts.length)
                }
                onClick={() =>
                  void workingAction('commit', {
                    message: commitMessage,
                    minor,
                    expected_revision: commitPreview?.revision,
                  })
                }
              >
                리비전 생성
              </button>
            </>
          }
        >
          <p className="muted">
            저장한 변경을 공유 리비전에 반영합니다. 동료의 변경과 충돌하면
            커밋이 중단됩니다.
          </p>
          {previewError ? (
            <Notice tone="error">{previewError}</Notice>
          ) : commitPreview ? (
            <>
              <p className="muted small">
                공유 r{commitPreview.revision}에 반영할 변경사항입니다. 아직
                저장하지 않은 편집도 포함됩니다.
              </p>
              {commitPreview.conflicts.length > 0 && (
                <Notice tone="error">
                  동료의 변경과 충돌합니다: {commitPreview.conflicts.join(', ')}
                  . 업데이트하고 충돌을 해결한 뒤 다시 확인하세요.
                </Notice>
              )}
              <Suspense
                fallback={
                  <p className="muted">변경사항을 불러오고 있습니다…</p>
                }
              >
                <CommitChanges
                  problemId={problemId}
                  before={commitPreview.before}
                  after={commitPreview.after}
                />
              </Suspense>
            </>
          ) : (
            <p className="muted">변경사항을 비교하고 있습니다…</p>
          )}
          <label>
            변경 내용
            <textarea
              rows={3}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="무엇을 수정했는지 동료에게 알려 주세요."
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={minor}
              onChange={(e) => setMinor(e.target.checked)}
            />
            작은 변경으로 기록
          </label>
        </Modal>
      )}
      {discardModal && (
        <Modal
          title="작업 사본을 되돌릴까요?"
          onClose={() => setDiscardModal(false)}
          footer={
            <>
              <button className="button" onClick={() => setDiscardModal(false)}>
                계속 편집
              </button>
              <button
                className="button danger"
                onClick={() => void workingAction('discard')}
              >
                작업 사본 되돌리기
              </button>
            </>
          }
        >
          <p>
            내 작업 사본의 커밋하지 않은 변경이 제거되고 공유 리비전 r
            {data.problem.revision}을 다시 불러옵니다. 이미 커밋한 리비전과
            동료의 작업 사본은 유지됩니다.
          </p>
        </Modal>
      )}
      {blocker.state === 'blocked' && (
        <Modal
          title="저장하지 않은 변경이 있습니다."
          onClose={() => blocker.reset()}
          footer={
            <>
              <button className="button" onClick={() => blocker.reset()}>
                계속 편집
              </button>
              <button className="button" onClick={() => blocker.proceed()}>
                저장하지 않고 이동
              </button>
              <button
                className="button primary"
                onClick={() =>
                  void save()
                    .then(() => blocker.proceed())
                    .catch(() => {})
                }
              >
                저장 후 이동
              </button>
            </>
          }
        >
          <p>다른 문제로 이동하기 전에 내 작업 사본에 저장할 수 있습니다.</p>
        </Modal>
      )}
    </WorkspaceContext.Provider>
  );
}
