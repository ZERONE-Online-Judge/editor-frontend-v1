import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  lazy,
  Suspense,
} from 'react';
import { Link, NavLink, useBlocker, useParams } from 'react-router-dom';
import { api, post, put, ApiError } from '../lib/api';
import type {
  Job,
  JobKind,
  ProblemDocument,
  WorkspaceData,
} from '../lib/types';
import { WorkspaceContext } from '../lib/workspace';
import { Badge, Icon, Modal, Notice } from '../components/ui';
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
const sections = [
  {
    label: '문제 작성',
    items: [
      ['overview', '개요', 'settings'],
      ['statements', '지문', 'file'],
      ['files', '파일 · 리소스', 'folder'],
      ['checker', 'Checker', 'shield'],
      ['validator', 'Validator', 'shield'],
      ['interactor', 'Interactor', 'code'],
    ],
  },
  {
    label: '테스트 · 검증',
    items: [
      ['tests', '테스트 · 생성 스크립트', 'tests'],
      ['solutions', '풀이', 'code'],
      ['invocations', '실행 결과', 'play'],
      ['stress', '스트레스 테스트', 'spark'],
    ],
  },
  {
    label: '검수 · 배포',
    items: [
      ['review', '문제 미리보기', 'file'],
      ['issues', '이슈', 'issue'],
      ['access', '협업 권한', 'users'],
      ['revisions', '리비전', 'history'],
      ['materials', '공개 자료', 'folder'],
      ['packages', '패키지', 'box'],
    ],
  },
];
export default function ProblemWorkspace() {
  const { problemId = '', tab = 'overview' } = useParams();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [doc, setDoc] = useState<ProblemDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [commitModal, setCommitModal] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
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
  const reload = useCallback(async () => {
    const value = await api<WorkspaceData>(`/problems/${problemId}`);
    setData(value);
    setDoc(structuredClone(value.document));
  }, [problemId]);
  useEffect(() => {
    let active = true;
    api<WorkspaceData>(`/problems/${problemId}`)
      .then((value) => {
        if (active) {
          setData(value);
          setDoc(structuredClone(value.document));
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
  const notify = useCallback((value: string, error = false) => {
    setMessage(value);
    setIsError(error);
  }, []);
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
      }>(`/problems/${problemId}/working-copy`, {
        version: current.data.version,
        document: current.doc,
      });
      const next = {
        ...current.data,
        ...result,
        document: structuredClone(current.doc),
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
    async (kind: JobKind, options: Record<string, unknown> = {}) => {
      const version = await save();
      const result = await post<Job>(`/problems/${problemId}/jobs`, {
        kind,
        version,
        options,
        reuse: false,
      });
      notify(
        `${kind === 'package' ? '패키지 생성' : '검증 작업'}을 요청했습니다. 실행 결과에서 진행을 확인하세요.`,
      );
      return result;
    },
    [problemId, save, notify],
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
            busy,
            editable: data.problem.role !== 'READ',
            mutate,
            save,
            reload,
            run,
            notify,
          }
        : null,
    [data, doc, dirty, busy, mutate, save, reload, run, notify],
  );
  async function workingAction(
    action: string,
    body: Record<string, unknown> = {},
  ) {
    setBusy(true);
    try {
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
  if (!data || !doc || !context)
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
    invocations: <Executions />,
    stress: <Executions stress />,
    packages: <Executions packages />,
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
                  : data.problem.role === 'WRITE'
                    ? '편집자'
                    : data.problem.translator
                      ? '번역자'
                      : '읽기 전용'}
              </Badge>
            </div>
            <div className="working-state">
              <Icon name="branch" size={15} />
              <span>공유 r{data.problem.revision}</span>
              <span className="separator">·</span>
              <span>내 작업 사본 r{data.base_revision}</span>
              <span
                className={`working-dot ${dirty ? 'warning' : data.problem.modified ? 'accent' : 'success'}`}
              />
              <span>
                {dirty
                  ? '저장하지 않은 변경'
                  : data.problem.modified
                    ? '커밋하지 않은 변경'
                    : '최신 상태'}
              </span>
            </div>
          </div>
          <div className="actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => void workingAction('update')}
            >
              <Icon name="download" />
              업데이트
            </button>
            {(context.editable || data.problem.translator) && (
              <>
                <button
                  className="button"
                  disabled={busy || !dirty}
                  onClick={() => void save().catch(() => {})}
                >
                  <Icon name="save" />
                  {busy ? '저장 중…' : '작업 사본 저장'}
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => setCommitModal(true)}
                >
                  <Icon name="branch" />
                  커밋
                </button>
              </>
            )}
          </div>
        </div>
        <div className="workspace-layout">
          <aside className="problem-sidebar" aria-label="문제 작업 메뉴">
            {sections.map((group) => (
              <div className="sidebar-group" key={group.label}>
                <div>{group.label}</div>
                {group.items.map(([id, label, icon]) => (
                  <NavLink
                    key={id}
                    to={`/problems/${problemId}/${id}`}
                    className={({ isActive }) => (isActive ? 'active' : '')}
                  >
                    <Icon name={icon} size={17} />
                    <span>{label}</span>
                    {id === 'overview' && data.cautions.length > 0 && (
                      <span className="nav-count">{data.cautions.length}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
            <div className="sidebar-bottom">
              <span>작업 사본은 나에게만 보입니다.</span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setDiscardModal(true)}
              >
                작업 사본 되돌리기
              </button>
            </div>
          </aside>
          <div className="workspace-main">
            {message && (
              <Notice tone={isError ? 'error' : 'success'}>
                {message}
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
                  onClick={() => setMessage('')}
                >
                  <Icon name="close" size={15} />
                </button>
              </Notice>
            )}
            <fieldset disabled={busy} className="workspace-content">
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
                  <pre>{atPath(doc, path)}</pre>
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
                  <pre>{atPath(resolution.shared, path)}</pre>
                </label>
              </div>
            </fieldset>
          ))}
        </Modal>
      )}
      {commitModal && (
        <Modal
          title="변경사항 커밋"
          onClose={() => setCommitModal(false)}
          footer={
            <>
              <button className="button" onClick={() => setCommitModal(false)}>
                취소
              </button>
              <button
                className="button primary"
                disabled={busy || !commitMessage.trim()}
                onClick={() =>
                  void workingAction('commit', {
                    message: commitMessage,
                    minor,
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
