import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, post, ApiError } from '../lib/api';
import type { Job } from '../lib/types';
import { Badge, Notice } from '../components/ui';
import Select from '../components/Select';
import ZojPublishing from './workspace/ZojPublishing';
import './ZojTransfer.css';

type Project = {
  id: string;
  name: string;
  slug: string;
  revision: number;
  uncommitted: boolean;
  testsets: string[];
  statement_languages: string[];
};
type Library = {
  problems: Project[];
  total: number;
  folders: { id: string; name: string; parent_id: string | null }[];
};

export default function ZojTransfer() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('all');
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [library, setLibrary] = useState<Library | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [sets, setSets] = useState<string[]>([]);
  const [language, setLanguage] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    api<Library>(
      `/zoj-transfer/problems?${new URLSearchParams({ q: query, folder, offset: String(offset), limit: '10' })}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          setLibrary(value);
          setError('');
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error.message);
          setLibrary(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, folder, offset, attempt]);
  const jobId = job?.id || '';
  const active = job?.status === 'queued' || job?.status === 'running';
  useEffect(() => {
    if (!active || !selected || !jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      api<Job>(`/zoj-transfer/problems/${selected.id}/packages/${jobId}`, {
        signal: controller.signal,
      })
        .then((value) => {
          if (!controller.signal.aborted) {
            setJob(value);
            setError('');
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setError(error.message);
            if (
              error instanceof ApiError &&
              [403, 404, 409].includes(error.status)
            )
              setJob(null);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
        });
    };
    timer = setTimeout(poll, 1000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [active, selected, jobId]);
  function choose(project: Project) {
    setSelected(project);
    setSets(
      project.testsets.includes('tests')
        ? ['tests']
        : project.testsets.slice(0, 1),
    );
    setLanguage(
      project.statement_languages.includes('korean')
        ? 'korean'
        : project.statement_languages[0] || '',
    );
    setJob(null);
    setError('');
  }
  async function prepare() {
    if (!selected || busy || active) return;
    setBusy(true);
    setError('');
    try {
      setJob(
        await post<Job>(`/zoj-transfer/problems/${selected.id}/packages`, {
          testsets: sets,
          statement_language: language,
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || active;
  return (
    <div className="page-container zoj-transfer-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ZOJ EDITOR</span>
          <h1>대회에 문제 등록 · 업데이트</h1>
          <p>문제 선택 → 검증 패키지 준비 → 대회에 적용</p>
        </div>
        <Link className="button" to="/problems">
          문제 작업 공간
        </Link>
      </div>
      <Notice>
        전송 권한이 있는 개인·협업·팀 폴더의 문제를 선택하세요. ZOJ에서 넘어온
        대회와 참가 유형은 등록 창에 미리 선택됩니다.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="zoj-transfer-columns">
        <section className="card section-stack">
          <h2>1. 문제 선택</h2>
          <form
            className="actions"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search);
              setOffset(0);
              setLoading(true);
              setAttempt((n) => n + 1);
            }}
          >
            <input
              aria-label="전송할 문제 검색"
              placeholder="문제 이름·식별자"
              value={search}
              disabled={locked}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="button" disabled={locked}>
              검색
            </button>
          </form>
          <label>
            폴더
            <Select
              value={folder}
              disabled={locked}
              onChange={(e) => {
                setFolder(e.target.value);
                setOffset(0);
                setLoading(true);
              }}
            >
              <option value="all">전체 폴더</option>
              <option value="root">분류되지 않은 문제</option>
              {library?.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </label>
          {loading ? (
            <p role="status">문제를 확인하고 있습니다.</p>
          ) : (
            <div className="zoj-transfer-projects">
              {library?.problems.map((p) => (
                <button
                  type="button"
                  className={`zoj-transfer-project ${selected?.id === p.id ? 'selected' : ''}`}
                  key={p.id}
                  disabled={locked}
                  aria-pressed={selected?.id === p.id}
                  onClick={() => choose(p)}
                >
                  <strong>{p.name}</strong>
                  <small>
                    {p.slug} · r{p.revision}
                    {p.uncommitted ? ' · 미커밋 변경 있음' : ''}
                  </small>
                </button>
              ))}
              {!library?.problems.length && (
                <p className="muted">
                  전송할 수 있는 문제가 없습니다. 폴더와 검색어, 협업 권한을
                  확인하세요.
                </p>
              )}
            </div>
          )}
          <div className="actions">
            <button
              className="button small"
              disabled={!offset || locked}
              onClick={() => {
                setOffset((n) => Math.max(0, n - 10));
                setLoading(true);
              }}
            >
              이전
            </button>
            <span>
              {Math.floor(offset / 10) + 1} /{' '}
              {Math.max(1, Math.ceil((library?.total || 0) / 10))}
            </span>
            <button
              className="button small"
              disabled={offset + 10 >= (library?.total || 0) || locked}
              onClick={() => {
                setOffset((n) => n + 10);
                setLoading(true);
              }}
            >
              다음
            </button>
            <button
              className="text-button"
              disabled={locked}
              onClick={() => {
                setLoading(true);
                setAttempt((n) => n + 1);
              }}
            >
              새로고침
            </button>
          </div>
        </section>
        <div className="section-stack">
          <section className="card section-stack">
            <h2>2. 검증 패키지 준비</h2>
            {selected ? (
              <>
                <strong>
                  {selected.name} · r{selected.revision}
                </strong>
                <p className="muted">
                  미커밋 변경이 있으면 작업 공간에서 먼저 커밋하세요. 준비와
                  실제 전송에서 같은 자료·권한 검사를 적용합니다.
                </p>
                <fieldset disabled={locked}>
                  <legend>포함할 테스트 세트</legend>
                  <div className="actions">
                    {selected.testsets.map((name) => (
                      <label className="checkbox" key={name}>
                        <input
                          type="checkbox"
                          checked={sets.includes(name)}
                          onChange={(e) => {
                            setSets((s) =>
                              e.target.checked
                                ? [...s, name]
                                : s.filter((v) => v !== name),
                            );
                            setJob(null);
                          }}
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label>
                  기본 지문 언어
                  <Select
                    value={language}
                    disabled={locked}
                    onChange={(e) => {
                      setLanguage(e.target.value);
                      setJob(null);
                    }}
                  >
                    {selected.statement_languages.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </label>
                <div className="actions">
                  <button
                    className="button primary"
                    disabled={locked || !sets.length || !language}
                    onClick={() => void prepare()}
                  >
                    {locked ? '검증 패키지 준비 중…' : '검증 패키지 준비'}
                  </button>
                  <Link
                    className="button"
                    to={`/problems/${selected.id}/packages`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    문제 작업 공간 열기
                  </Link>
                </div>
                {active && (
                  <progress
                    aria-label="검증 패키지 준비 진행률"
                    max={100}
                    value={job?.result.progress || 0}
                  />
                )}
                {job && (
                  <Link
                    className="text-button"
                    to={`/problems/${selected.id}/invocations?job=${job.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    상세 실행 결과 (새 탭)
                  </Link>
                )}
                {job && (
                  <p role="status">
                    <Badge
                      tone={
                        job.status === 'completed'
                          ? 'success'
                          : job.status === 'failed'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {job.status === 'completed'
                        ? '패키지 준비 완료'
                        : job.status === 'failed'
                          ? '검증 실패'
                          : job.status === 'cancelled'
                            ? '작업 취소'
                            : '검증 진행 중'}
                    </Badge>{' '}
                    {job.result.error || job.result.summary || ''}
                  </p>
                )}
              </>
            ) : (
              <p className="muted">목록에서 문제를 선택하세요.</p>
            )}
          </section>
          {selected && (
            <ZojPublishing
              key={selected.id}
              problemId={selected.id}
              editable={true}
              job={job}
              stale={false}
              initialContestId={params.get('contest') || ''}
              initialDivisionId={params.get('division') || ''}
            />
          )}
        </div>
      </div>
    </div>
  );
}
