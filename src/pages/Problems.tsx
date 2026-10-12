import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, bytes, patch, post, time } from '../lib/api';
import { useAuth } from '../lib/authContext';
import type { Problem } from '../lib/types';
import { Badge, Empty, Icon, Modal, Notice } from '../components/ui';
export default function Problems() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Problem[]>([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [create, setCreate] = useState(false);
  const [importing, setImporting] = useState(false);
  const refresh = useCallback(() => {
    setLoading(true);
    api<Problem[]>(`/problems?deleted=${filter === 'deleted'}`)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter]);
  useEffect(() => {
    let active = true;
    api<Problem[]>(`/problems?deleted=${filter === 'deleted'}`)
      .then((values) => {
        if (active) setRows(values);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter]);
  const visible = rows.filter(
    (p) =>
      (filter !== 'mine' || p.owner === user?.handle) &&
      (filter !== 'shared' || p.owner !== user?.handle) &&
      `${p.name} ${p.slug} ${p.tags.join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h1>문제 작업 공간</h1>
          <p>문제를 작성하고, 테스트하고, 함께 완성하세요.</p>
        </div>
        <div className="actions">
          <button className="button" onClick={() => setImporting(true)}>
            <Icon name="upload" />
            패키지 가져오기
          </button>
          <button className="button primary" onClick={() => setCreate(true)}>
            <Icon name="plus" />새 문제
          </button>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="problem-toolbar">
        <div className="segmented" aria-label="문제 분류">
          {[
            ['all', '전체 문제'],
            ['mine', '내 문제'],
            ['shared', '공유받은 문제'],
            ['deleted', '휴지통'],
          ].map(([key, label]) => (
            <button
              aria-pressed={filter === key}
              className={filter === key ? 'selected' : ''}
              key={key}
              onClick={() => {
                setLoading(true);
                setFilter(key);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Icon name="search" />
          <input
            aria-label="문제 검색"
            placeholder="문제 이름, 태그 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <section className="card problem-list">
        <div className="list-caption">
          <span>{visible.length}개의 문제</span>
          <button className="text-button" onClick={refresh}>
            새로고침
          </button>
        </div>
        {loading ? (
          <div className="loading">문제를 불러오고 있습니다.</div>
        ) : visible.length ? (
          <div className="table-scroll">
            <table className="data-table problems-table">
              <thead>
                <tr>
                  <th>문제</th>
                  <th>소유자</th>
                  <th>접근 권한</th>
                  <th>리비전</th>
                  <th>마지막 수정</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((problem) => (
                  <tr key={problem.id}>
                    <td>
                      {problem.deleted ? (
                        <strong className="problem-title">
                          {problem.name}
                        </strong>
                      ) : (
                        <Link
                          className="problem-title"
                          to={`/problems/${problem.id}/overview`}
                        >
                          {problem.name}
                        </Link>
                      )}
                      <div className="subtext">
                        {problem.slug}
                        {problem.note && ` · ${problem.note}`}
                      </div>
                      <div className="inline-tags">
                        {problem.tags.map((tag) => (
                          <Badge key={tag}>{tag}</Badge>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span>{problem.owner_name}</span>
                      <div className="subtext">@{problem.owner}</div>
                    </td>
                    <td>
                      <Badge
                        tone={problem.role === 'OWNER' ? 'accent' : 'neutral'}
                      >
                        {problem.role === 'OWNER'
                          ? '소유자'
                          : problem.role === 'WRITE'
                            ? '편집 가능'
                            : '읽기 전용'}
                      </Badge>
                    </td>
                    <td>
                      <div className="revision-cell">
                        <Icon name="branch" size={14} />r{problem.revision}
                      </div>
                      {problem.modified && (
                        <div className="subtext amber">작업 사본 변경됨</div>
                      )}
                    </td>
                    <td className="subtext">{time(problem.updated_at)}</td>
                    <td>
                      {problem.deleted ? (
                        <button
                          className="button small"
                          disabled={problem.role !== 'OWNER'}
                          onClick={() =>
                            void patch(`/problems/${problem.id}/deleted`, {
                              deleted: false,
                            })
                              .then(refresh)
                              .catch((e) => setError(e.message))
                          }
                        >
                          복원
                        </button>
                      ) : (
                        <Link
                          className="icon-button"
                          aria-label={`${problem.name} 열기`}
                          to={`/problems/${problem.id}/overview`}
                        >
                          <Icon name="arrow" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              filter === 'deleted'
                ? '휴지통이 비어 있습니다.'
                : '첫 문제를 만들어 보세요.'
            }
            description="문제 지문부터 테스트 생성, 풀이 검증, 패키지 생성까지 한곳에서 관리합니다."
            action={
              filter !== 'deleted' && (
                <button
                  className="button primary"
                  onClick={() => setCreate(true)}
                >
                  <Icon name="plus" />새 문제 만들기
                </button>
              )
            }
          />
        )}
      </section>
      <div className="workspace-guide">
        <Icon name="branch" />
        <div>
          <strong>개인 작업 사본에서 안전하게 작성하세요.</strong>
          <p>
            저장은 내 작업 사본에, 커밋은 동료가 확인할 공유 리비전에
            반영됩니다.
          </p>
        </div>
        <Link to="/help">
          작업 흐름 보기
          <Icon name="arrow" size={15} />
        </Link>
      </div>
      {create && (
        <CreateProblem
          onClose={() => setCreate(false)}
          onCreated={(id) => navigate(`/problems/${id}/overview`)}
        />
      )}{' '}
      {importing && (
        <ImportProblem
          onClose={() => setImporting(false)}
          onCreated={(id) => navigate(`/problems/${id}/overview`)}
        />
      )}
    </div>
  );
}
function CreateProblem({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const p = await post<Problem>('/problems', { name, slug });
      onCreated(p.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="새 문제 만들기"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            취소
          </button>
          <button
            className="button primary"
            disabled={busy || !name || !slug}
            onClick={() => void submit()}
          >
            문제 만들기
          </button>
        </>
      }
    >
      <p className="muted">
        빈 작업 사본을 만들고 필요한 자료를 차례로 추가합니다.
      </p>
      <label>
        문제 이름
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 두 수의 합"
          maxLength={200}
        />
      </label>
      <label>
        문제 식별자
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="a-plus-b"
          pattern="[a-z][a-z0-9-]{1,63}"
        />
        <small>영문 소문자·숫자·하이픈으로 지정하세요.</small>
      </label>
      {error && <Notice tone="error">{error}</Notice>}
    </Modal>
  );
}
function ImportProblem({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (!file) return;
    setBusy(true);
    try {
      const result = await api<{ id: string }>(
        `/imports?name=${encodeURIComponent(name)}&slug=${encodeURIComponent(slug)}`,
        { method: 'POST', body: file },
      );
      onCreated(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="문제 패키지 가져오기"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            취소
          </button>
          <button
            className="button primary"
            disabled={busy || !file || !name || !slug}
            onClick={() => void submit()}
          >
            {busy ? '가져오는 중…' : '문제 등록'}
          </button>
        </>
      }
    >
      <p className="muted">
        Editor 패키지 또는 problem.xml과 생성된 테스트가 포함된 Polygon Linux
        ZIP을 올리세요.
      </p>
      <label>
        문제 이름
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        문제 식별자
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="a-plus-b"
        />
      </label>
      <label className="upload-area">
        <Icon name="upload" size={25} />
        <strong>{file?.name || 'ZIP 파일 선택'}</strong>
        <small>{file ? bytes(file.size) : '최대 128MiB'}</small>
        <input
          type="file"
          accept=".zip"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      {error && <Notice tone="error">{error}</Notice>}
    </Modal>
  );
}
