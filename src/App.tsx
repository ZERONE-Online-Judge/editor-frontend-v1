import { useEffect, useState, lazy, Suspense } from 'react';
import {
  createBrowserRouter,
  Link,
  Navigate,
  NavLink,
  Outlet,
  RouterProvider,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { api, patch, post, put } from './lib/api';
import { useAuth } from './lib/authContext';
import type { Contest, Problem, User } from './lib/types';
import {
  Badge,
  Empty,
  Icon,
  Modal,
  Notice,
  SectionHeading,
} from './components/ui';
import Login from './pages/Login';
import PasswordForm from './components/PasswordForm';
import PasswordSetupGuidance from './components/PasswordSetupGuidance';
import Problems from './pages/Problems';
const ProblemWorkspace = lazy(() => import('./pages/Workspace'));
function Layout() {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [name, setName] = useState(user?.display_name || '');
  const [handle, setHandle] = useState(user?.handle || '');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  async function saveProfile() {
    try {
      const result = await patch<User>('/auth/profile', {
        display_name: name,
        handle,
      });
      setUser(result);
      setProfile(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="editor-app">
      <header className="app-header">
        <Link className="brand" to="/problems">
          <img src="/zoj-logo.png?v=2" alt="" width="32" height="32" />
          <strong>
            ZOJ <span>Editor</span>
          </strong>
          <span className="brand-label">문제 제작 플랫폼</span>
        </Link>
        <nav aria-label="주 메뉴">
          <NavLink to="/problems">문제</NavLink>
          <NavLink to="/contests">대회</NavLink>
          <NavLink to="/help">도움말</NavLink>
        </nav>
        <div className="account-controls">
          {user ? (
            <>
              <button
                className="account-button"
                onClick={() => {
                  setName(user.display_name);
                  setHandle(user.handle);
                  setError('');
                  setProfile(true);
                }}
              >
                <span>{user.display_name.slice(0, 1).toUpperCase()}</span>
                <strong>{user.display_name}</strong>
              </button>
              <Link className="icon-button" to="/logout" aria-label="로그아웃">
                <Icon name="logout" />
              </Link>
            </>
          ) : (
            <Link className="button small" to="/login">
              로그인
            </Link>
          )}
        </div>
      </header>
      {user && (
        <PasswordSetupGuidance
          key={user.id}
          onSetup={() => {
            setProfile(false);
            setPasswordOpen(true);
          }}
        />
      )}
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>ZOJ Editor · 검증된 문제를 만드는 공간</span>
        <a href="https://zoj.kr" target="_blank" rel="noreferrer">
          ZOJ로 이동
          <Icon name="arrow" size={12} />
        </a>
      </footer>
      {passwordOpen && (
        <Modal
          title="비밀번호 등록 · 변경"
          className="password-modal"
          onClose={() => {
            if (!passwordBusy) setPasswordOpen(false);
          }}
          footer={
            <button
              className="button"
              disabled={passwordBusy}
              onClick={() => setPasswordOpen(false)}
            >
              닫기
            </button>
          }
        >
          <PasswordForm
            mode="set"
            email={user?.email || ''}
            onBusyChange={setPasswordBusy}
            onDone={() => {
              setPasswordOpen(false);
              setUser(null);
              navigate('/login?password=changed');
            }}
          />
        </Modal>
      )}
      {profile && (
        <Modal
          title="내 정보 · 설정"
          onClose={() => setProfile(false)}
          footer={
            <>
              <button className="button" onClick={() => setProfile(false)}>
                취소
              </button>
              <button
                className="button primary"
                onClick={() => void saveProfile()}
              >
                저장
              </button>
            </>
          }
        >
          <label>
            표시 이름
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Editor 아이디
            <input value={handle} onChange={(e) => setHandle(e.target.value)} />
            <small>
              3~40자의 영문·숫자·하이픈·밑줄을 사용하세요. 협업자가 이 아이디로
              권한을 추가할 수 있습니다.
            </small>
          </label>
          <label>
            인증된 이메일
            <input value={user?.email || ''} disabled />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <button
            className="account-security-card"
            type="button"
            onClick={() => {
              setProfile(false);
              setPasswordOpen(true);
            }}
          >
            <span className="account-security-icon" aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <rect x="5" y="10" width="14" height="11" rx="3" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
              </svg>
            </span>
            <span>
              <strong>비밀번호 관리</strong>
              <small>이메일 인증 후 비밀번호 등록·변경</small>
            </span>
            <Icon name="arrow" />
          </button>
        </Modal>
      )}
    </div>
  );
}
function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">계정을 확인하고 있습니다.</div>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
function WorkspaceRoute() {
  const { problemId } = useParams();
  return (
    <Suspense
      fallback={<div className="loading">작업 공간을 불러오고 있습니다.</div>}
    >
      <ProblemWorkspace key={problemId} />
    </Suspense>
  );
}
function Logout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void logout()
      .then(() => {
        if (active) navigate('/login', { replace: true });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [logout, navigate]);
  return (
    <div className="page-container">
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : (
        <div className="loading">로그아웃하고 있습니다.</div>
      )}
    </div>
  );
}
function Contests() {
  const [rows, setRows] = useState<Contest[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api<Contest[]>('/contests'), api<Problem[]>('/problems')])
      .then(([c, p]) => {
        setRows(c);
        setProblems(p);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function create() {
    try {
      const result = await (editing
        ? put<Contest>(`/contests/${editing}`, { title, problem_ids: ids })
        : post<Contest>('/contests', { title, problem_ids: ids }));
      setRows((r) => [result, ...r.filter((c) => c.id !== result.id)]);
      setEditing(null);
      setAdding(false);
      setTitle('');
      setIds([]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PROBLEM COLLECTIONS</span>
          <h1>대회 문제 모음</h1>
          <p>출제 중인 문제를 대회 단위로 모아 관리합니다.</p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setEditing(null);
            setTitle('');
            setIds([]);
            setAdding(true);
          }}
        >
          <Icon name="plus" />
          대회 만들기
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="contest-grid">
        {rows.map((contest) => (
          <section className="card" key={contest.id}>
            <div className="contest-icon">
              <Icon name="folder" size={24} />
            </div>
            <div className="section-heading">
              <h2>{contest.title}</h2>
              <button
                className="text-button"
                onClick={() => {
                  setEditing(contest.id);
                  setTitle(contest.title);
                  setIds(contest.problem_ids);
                  setAdding(true);
                }}
              >
                편집
              </button>
            </div>
            <p className="muted">{contest.problem_ids.length}개 문제</p>
            <div className="contest-problems">
              {contest.problem_ids.map((id, index) => {
                const problem = problems.find((p) => p.id === id);
                return problem ? (
                  <Link key={id} to={`/problems/${id}/overview`}>
                    <Badge tone="accent">
                      {String.fromCharCode(65 + index)}
                    </Badge>
                    <strong>{problem.name}</strong>
                    <span>r{problem.revision}</span>
                    <Icon name="arrow" size={15} />
                  </Link>
                ) : (
                  <div key={id} className="muted">
                    접근 권한이 없는 문제
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {!rows.length && (
        <section className="card">
          <Empty
            title="아직 대회 문제 모음이 없습니다."
            description="여러 문제를 묶어 대회 준비 현황을 관리하세요."
          />
        </section>
      )}
      {adding && (
        <Modal
          title={editing ? '대회 문제 모음 편집' : '대회 문제 모음 만들기'}
          onClose={() => setAdding(false)}
          footer={
            <>
              <button className="button" onClick={() => setAdding(false)}>
                취소
              </button>
              <button
                className="button primary"
                disabled={!title}
                onClick={() => void create()}
              >
                {editing ? '저장' : '만들기'}
              </button>
            </>
          }
        >
          <label>
            대회 이름
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {ids.length > 0 && (
            <div className="checkbox-list">
              {ids.map((id, index) => (
                <div className="section-heading" key={id}>
                  <span>
                    {String.fromCharCode(65 + index)}.{' '}
                    {problems.find((p) => p.id === id)?.name || id}
                  </span>
                  <div className="actions">
                    <button
                      className="button small"
                      disabled={index === 0}
                      onClick={() =>
                        setIds((previous) => {
                          const next = [...previous];
                          [next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ];
                          return next;
                        })
                      }
                    >
                      위로
                    </button>
                    <button
                      className="button small"
                      disabled={index === ids.length - 1}
                      onClick={() =>
                        setIds((previous) => {
                          const next = [...previous];
                          [next[index + 1], next[index]] = [
                            next[index],
                            next[index + 1],
                          ];
                          return next;
                        })
                      }
                    >
                      아래로
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <label>포함할 문제</label>
          <div className="checkbox-list">
            {problems.map((p) => (
              <label className="checkbox" key={p.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(p.id)}
                  onChange={(e) =>
                    setIds(
                      e.target.checked
                        ? [...ids, p.id]
                        : ids.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
function Help() {
  const entries = [
    [
      '01',
      '문제 만들기',
      '기본 정보와 시간·메모리 제한을 정하고, 언어별 지문을 작성합니다. 파일에 생성기·validator·checker를 추가하세요.',
    ],
    [
      '02',
      '입력과 기대 출력 생성',
      'Main 풀이를 지정합니다. 직접 입력이나 생성 스크립트를 실행하면 validator로 입력을 확인하고 Main 풀이로 기대 출력을 생성합니다. 생성 결과를 작업 사본에 반영하세요.',
    ],
    [
      '03',
      '의도한 판정 검증',
      '풀이마다 MA·OK·WA·TL·ML 등의 기대 판정을 설정합니다. 실행 결과에서 테스트별 실제 판정과 CPU 시간·메모리를 확인하세요. 오답 풀이가 정답으로 통과하면 테스트를 보강해야 합니다.',
    ],
    [
      '04',
      '함께 검수하기',
      '권한을 받은 동료는 개인 작업 사본에서 편집합니다. 저장은 개인 작업 사본에, 커밋은 공유 리비전에 반영됩니다. 최신 변경은 업데이트로 가져오고 같은 항목의 충돌은 해결한 뒤 커밋하세요.',
    ],
    [
      '05',
      '패키지 만들기',
      '변경을 커밋한 뒤 검증 후 패키지 생성을 요청합니다. 모든 입력과 기대 판정, 구성요소 자체 테스트를 확인한 후 problem.xml·소스·생성 테스트를 담은 ZIP을 제공합니다.',
    ],
  ];
  return (
    <div className="page-container help-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE. TEST. VERIFY.</span>
          <h1>아이디어에서 검증된 문제까지.</h1>
          <p>Editor의 실제 작업 흐름을 따라 문제를 준비하세요.</p>
        </div>
      </div>
      <section className="card guide-workflow">
        {entries.map(([number, title, desc]) => (
          <div key={number}>
            <span>{number}</span>
            <div>
              <h2>{title}</h2>
              <p>{desc}</p>
            </div>
          </div>
        ))}
      </section>
      <section className="card">
        <SectionHeading title="생성 스크립트와 풀이 태그" />
        <div className="help-columns">
          <div>
            <h3>테스트 생성 명령</h3>
            <pre>gen 100 42 &gt; 1{'\n'}gen 100 43 &gt; $</pre>
            <p>
              첫 토큰은 등록한 생성기 파일명입니다. 마지막의 숫자는 테스트 번호,
              $는 다음 빈 번호입니다. 셸 연산자는 실행하지 않습니다.
            </p>
            <h3>스트레스 테스트</h3>
            <p>
              <code>gen 20 {'{seed}'}</code>와 기준 풀이·비교 풀이를 지정하면
              유효한 입력을 반복 생성합니다. 반례를 찾으면 입력·기대 출력·실제
              출력을 저장하며 테스트로 추가할 수 있습니다.
            </p>
          </div>
          <div>
            <dl>
              <dt>MA · Main</dt>
              <dd>기대 출력 생성에 사용할 기준 정답</dd>
              <dt>OK</dt>
              <dd>선택한 테스트를 모두 통과할 풀이</dd>
              <dt>WA / TL / ML / RE / PE</dt>
              <dd>해당 판정을 실제로 재현해야 하는 풀이</dd>
              <dt>RJ</dt>
              <dd>정답이 아닌 판정이 발생해야 하는 풀이</dd>
              <dt>TO / TM</dt>
              <dd>정답 또는 TLE / TLE 또는 MLE 허용</dd>
              <dt>NR</dt>
              <dd>검증 실행에서 제외하고 소스만 보관</dd>
            </dl>
          </div>
        </div>
      </section>
      <section className="card">
        <SectionHeading title="검증 결과 읽기" />
        <p>
          CPU 시간은 풀이가 계산에 사용한 시간입니다. 경과 시간은 대기 등을
          포함한 실제 흐른 시간입니다. 메모리는 실행 프로세스와 자식 프로세스의
          사용량을 확인합니다.
        </p>
        <p>
          Editor 워커와 대회 채점 서버는 서로 다른 실행 환경입니다. 시간 제한의
          최종 기준은 문제를 배포할 채점 서버에서도 확인하세요.
        </p>
        <p>
          입력·출력·소스·실행 기록은 서버에 저장됩니다. 자료를 수정한 뒤에는
          과거 결과를 현재 자료의 검증으로 간주하지 마세요.
        </p>
      </section>
      <section className="card">
        <SectionHeading title="참고 자료" />
        <p>문제 제작 흐름은 공개된 Polygon 문서에 맞춰 구현했습니다.</p>
        <a
          className="text-link"
          href="https://codeforces.github.io/polygon-misc/API"
          target="_blank"
          rel="noreferrer"
        >
          Polygon 공식 API 문서
          <Icon name="arrow" size={15} />
        </a>
        <a
          className="text-link"
          href="https://github.com/MikeMirzayanov/testlib"
          target="_blank"
          rel="noreferrer"
        >
          공식 testlib 라이브러리
          <Icon name="arrow" size={15} />
        </a>
      </section>
    </div>
  );
}
const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: (
      <div className="page-container">
        <h1>화면을 불러오지 못했습니다.</h1>
        <Link to="/problems">문제 목록으로 이동</Link>
      </div>
    ),
    children: [
      { path: '/', element: <Navigate to="/problems" replace /> },
      { path: '/login', element: <Login /> },
      { path: '/logout', element: <Logout /> },
      { path: '/help', element: <Help /> },
      {
        element: <Protected />,
        children: [
          { path: '/problems', element: <Problems /> },
          { path: '/problems/:problemId/:tab', element: <WorkspaceRoute /> },
          { path: '/problems/:problemId', element: <WorkspaceRoute /> },
          { path: '/contests', element: <Contests /> },
        ],
      },
      {
        path: '*',
        element: (
          <div className="page-container">
            <Empty
              title="페이지를 찾을 수 없습니다."
              action={
                <Link className="button primary" to="/problems">
                  문제 목록
                </Link>
              }
            />
          </div>
        ),
      },
    ],
  },
]);
export default function App() {
  return <RouterProvider router={router} />;
}
