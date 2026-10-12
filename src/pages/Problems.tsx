import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, bytes, patch, post, put, time } from '../lib/api';
import { useAuth } from '../lib/authContext';
import type { Problem, Folder } from '../lib/types';
import { folderPath, folderDescendants } from '../lib/organization';
import { Badge, Empty, Icon, Modal, Notice } from '../components/ui';

export default function Problems() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const location = params.get('folder') || 'all';
  const folderId = location === 'all' || location === 'root' ? null : location;
  const [rows, setRows] = useState<Problem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [create, setCreate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [folderEdit, setFolderEdit] = useState<Folder | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  async function refresh() {
    setLoading(true);
    try {
      const [problems, tree] = await Promise.all([
        api<Problem[]>(`/problems?deleted=${filter === 'deleted'}`),
        api<Folder[]>('/folders'),
      ]);
      setRows(problems);
      setFolders(tree);
      setSelection([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Problem[]>(`/problems?deleted=${filter === 'deleted'}`),
      api<Folder[]>('/folders'),
    ])
      .then(([problems, tree]) => {
        if (active) {
          setRows(problems);
          setFolders(tree);
          setSelection([]);
          setError('');
        }
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
  const path = folderPath(folders, folderId);
  const current = folders.find((f) => f.id === folderId);
  const visible = rows.filter(
    (p) =>
      (filter !== 'mine' || p.owner === user?.handle) &&
      (filter !== 'shared' || p.owner !== user?.handle) &&
      (filter === 'deleted' ||
        query.trim() ||
        location === 'all' ||
        (p.folder_id || 'root') === location) &&
      `${p.name} ${p.slug} ${p.tags.join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const children = folders.filter((f) => f.parent_id === folderId);
  function chooseFolder(id: string) {
    setParams(id === 'all' ? {} : { folder: id });
    setQuery('');
    setSelection([]);
  }
  async function move(ids: string[], destination: string | null) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await post('/folders/move-problems', {
        problem_ids: ids,
        folder_id: destination,
      });
      setMoveIds(null);
      setMessage(
        `${ids.length}개 문제를 ${
          destination
            ? folderPath(folders, destination)
                .map((f) => f.name)
                .join(' / ')
            : '분류되지 않은 문제'
        }로 옮겼습니다.`,
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setDragging(null);
    }
  }
  function drop(event: React.DragEvent, destination: string | null) {
    event.preventDefault();
    const id = event.dataTransfer.getData('application/x-zoj-problem');
    if (id && rows.some((p) => p.id === id && !p.deleted))
      void move(selection.includes(id) ? selection : [id], destination);
  }
  function tree(parent: string | null, depth = 0): React.ReactNode {
    return folders
      .filter((f) => f.parent_id === parent)
      .map((f) => (
        <div key={f.id}>
          <button
            className={`folder-nav-item ${location === f.id ? 'selected' : ''}`}
            style={{ paddingLeft: 14 + depth * 16 }}
            onClick={() => chooseFolder(f.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(e, f.id)}
          >
            <Icon name="folder" size={17} />
            <span>{f.name}</span>
            <small>{rows.filter((p) => p.folder_id === f.id).length}</small>
          </button>
          {tree(f.id, depth + 1)}
        </div>
      ));
  }
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h1>문제 작업 공간</h1>
          <p>폴더로 정리하고, 함께 완성한 문제를 ZOJ로 보내세요.</p>
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
      {message && <Notice tone="success">{message}</Notice>}
      <div className="project-layout">
        <aside
          className={`card folder-sidebar ${dragging ? 'accepts-drop' : ''}`}
          aria-label="내 프로젝트 폴더"
        >
          <div className="folder-sidebar-heading">
            <strong>내 폴더</strong>
            <button
              className="icon-button"
              aria-label="새 폴더 만들기"
              onClick={() => setFolderEdit('new')}
            >
              <Icon name="plus" />
            </button>
          </div>
          <button
            className={`folder-nav-item ${location === 'all' ? 'selected' : ''}`}
            onClick={() => chooseFolder('all')}
          >
            <Icon name="box" size={17} />
            전체 문제<small>{rows.length}</small>
          </button>
          <button
            className={`folder-nav-item ${location === 'root' ? 'selected' : ''}`}
            onClick={() => chooseFolder('root')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(e, null)}
          >
            <Icon name="folder" size={17} />
            <span>분류되지 않은 문제</span>
          </button>
          <div className="folder-tree">{tree(null)}</div>
          <p className="folder-hint">
            문제를 폴더로 끌어 놓거나 선택 후 이동하세요. 내 폴더 정리는
            동료에게 영향을 주지 않습니다.
          </p>
        </aside>
        <div className="project-content">
          <div className="folder-heading">
            <nav className="folder-breadcrumb" aria-label="폴더 경로">
              <button onClick={() => chooseFolder('all')}>전체 문제</button>
              {location === 'root' && <span> / 분류되지 않은 문제</span>}
              {path.map((f) => (
                <span key={f.id}>
                  {' '}
                  /{' '}
                  <button
                    onClick={() => chooseFolder(f.id)}
                    aria-current={f.id === folderId ? 'page' : undefined}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="actions">
              <button
                className="button small"
                onClick={() => setFolderEdit('new')}
              >
                <Icon name="plus" size={15} />
                폴더 만들기
              </button>
              {current && (
                <>
                  <button
                    className="text-button"
                    onClick={() => setFolderEdit(current)}
                  >
                    폴더 편집
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${current.name} 폴더 삭제`}
                    onClick={() => setDeleting(current)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
          {!query && filter !== 'deleted' && children.length > 0 && (
            <div className="folder-grid">
              {children.map((f) => (
                <button
                  className="folder-tile"
                  key={f.id}
                  onClick={() => chooseFolder(f.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => drop(e, f.id)}
                >
                  <Icon name="folder" size={24} />
                  <span>
                    <strong>{f.name}</strong>
                    <small>
                      {rows.filter((p) => p.folder_id === f.id).length}개 문제
                    </small>
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
              ))}
            </div>
          )}
          <div className="problem-toolbar">
            <div className="segmented" aria-label="문제 분류">
              {[
                ['all', '모두'],
                ['mine', '내 문제'],
                ['shared', '공유받음'],
                ['deleted', '휴지통'],
              ].map(([key, label]) => (
                <button
                  aria-pressed={filter === key}
                  className={filter === key ? 'selected' : ''}
                  key={key}
                  onClick={() => {
                    setLoading(true);
                    setFilter(key);
                    setSelection([]);
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
                placeholder="모든 폴더에서 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <section className="card problem-list">
            <div className="list-caption">
              <span>
                {visible.length}개 문제 {query && '· 모든 폴더 검색'}
              </span>
              <div className="actions">
                {selection.length > 0 && (
                  <>
                    <strong>{selection.length}개 선택</strong>
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={() => setMoveIds(selection)}
                    >
                      <Icon name="folder" size={15} />
                      선택한 문제 이동
                    </button>
                  </>
                )}
                <button className="text-button" onClick={() => void refresh()}>
                  새로고침
                </button>
              </div>
            </div>
            {loading ? (
              <div className="loading">문제를 불러오고 있습니다.</div>
            ) : visible.length ? (
              <div className="table-scroll">
                <table className="data-table problems-table">
                  <thead>
                    <tr>
                      {filter !== 'deleted' && (
                        <th className="check-cell">
                          <input
                            type="checkbox"
                            aria-label="표시된 문제 모두 선택"
                            checked={visible.every((p) =>
                              selection.includes(p.id),
                            )}
                            onChange={(e) =>
                              setSelection(
                                e.target.checked
                                  ? visible.map((p) => p.id)
                                  : [],
                              )
                            }
                          />
                        </th>
                      )}
                      <th>문제</th>
                      <th>소유자 · 권한</th>
                      <th>리비전</th>
                      <th>마지막 수정</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => (
                      <tr
                        key={p.id}
                        draggable={!p.deleted && !busy}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            'application/x-zoj-problem',
                            p.id,
                          );
                          e.dataTransfer.effectAllowed = 'move';
                          setDragging(p.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                      >
                        {!p.deleted && (
                          <td className="check-cell">
                            <input
                              type="checkbox"
                              aria-label={`${p.name} 선택`}
                              checked={selection.includes(p.id)}
                              onChange={(e) =>
                                setSelection((ids) =>
                                  e.target.checked
                                    ? [...ids, p.id]
                                    : ids.filter((id) => id !== p.id),
                                )
                              }
                            />
                          </td>
                        )}
                        <td>
                          {p.deleted ? (
                            <strong className="problem-title">{p.name}</strong>
                          ) : (
                            <Link
                              className="problem-title"
                              to={`/problems/${p.id}/overview`}
                            >
                              {p.name}
                            </Link>
                          )}
                          <div className="subtext">
                            {p.slug}
                            {p.note && ` · ${p.note}`}
                          </div>
                          {(location === 'all' || query) && p.folder_id && (
                            <button
                              className="problem-folder-link"
                              onClick={() => chooseFolder(p.folder_id!)}
                            >
                              <Icon name="folder" size={12} />
                              {folderPath(folders, p.folder_id)
                                .map((f) => f.name)
                                .join(' / ')}
                            </button>
                          )}
                          <div className="inline-tags">
                            {p.tags.map((tag) => (
                              <Badge key={tag}>{tag}</Badge>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span>{p.owner_name}</span>
                          <div className="subtext">@{p.owner}</div>
                          <Badge
                            tone={p.role === 'OWNER' ? 'accent' : 'neutral'}
                          >
                            {p.role === 'OWNER'
                              ? '소유자'
                              : p.role === 'WRITE'
                                ? '편집 가능'
                                : '읽기 전용'}
                          </Badge>
                        </td>
                        <td>
                          <div className="revision-cell">
                            <Icon name="branch" size={14} />r{p.revision}
                          </div>
                          {p.modified && (
                            <div className="subtext amber">
                              작업 사본 변경됨
                            </div>
                          )}
                        </td>
                        <td className="subtext">{time(p.updated_at)}</td>
                        <td>
                          {p.deleted ? (
                            <button
                              className="button small"
                              disabled={p.role !== 'OWNER'}
                              onClick={() =>
                                void patch(`/problems/${p.id}/deleted`, {
                                  deleted: false,
                                })
                                  .then(refresh)
                                  .catch((e) => setError(e.message))
                              }
                            >
                              복원
                            </button>
                          ) : (
                            <div className="actions">
                              <button
                                className="icon-button"
                                aria-label={`${p.name} 폴더 이동`}
                                onClick={() => setMoveIds([p.id])}
                              >
                                <Icon name="folder" size={17} />
                              </button>
                              <Link
                                className="icon-button"
                                aria-label={`${p.name} 열기`}
                                to={`/problems/${p.id}/overview`}
                              >
                                <Icon name="arrow" />
                              </Link>
                            </div>
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
                    : query
                      ? '검색 결과가 없습니다.'
                      : '이 폴더에 아직 문제가 없습니다.'
                }
                description="새 문제를 만들거나 다른 폴더의 문제를 옮겨 보세요."
                action={
                  filter !== 'deleted' &&
                  !query && (
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
        </div>
      </div>
      {create && (
        <CreateProblem
          folderId={folderId}
          onClose={() => setCreate(false)}
          onCreated={(id) => navigate(`/problems/${id}/overview`)}
        />
      )}
      {importing && (
        <ImportProblem
          folderId={folderId}
          onClose={() => setImporting(false)}
          onCreated={(id) => navigate(`/problems/${id}/overview`)}
        />
      )}
      {moveIds && (
        <MoveModal
          folders={folders}
          initial={folderId}
          busy={busy}
          error={error}
          count={moveIds.length}
          onClose={() => setMoveIds(null)}
          onMove={(id) => void move(moveIds, id)}
        />
      )}
      {folderEdit && (
        <FolderModal
          folders={folders}
          folder={folderEdit === 'new' ? null : folderEdit}
          parent={folderId}
          onClose={() => setFolderEdit(null)}
          onSaved={() => {
            setFolderEdit(null);
            void refresh();
          }}
        />
      )}
      {deleting && (
        <Modal
          title="폴더 삭제"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button className="button" onClick={() => setDeleting(null)}>
                취소
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void api(`/folders/${deleting.id}`, { method: 'DELETE' })
                    .then(() => {
                      chooseFolder(deleting.parent_id || 'root');
                      setDeleting(null);
                      return refresh();
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                폴더 삭제
              </button>
            </>
          }
        >
          <p>
            <strong>{deleting.name}</strong> 폴더를 삭제합니다. 문제와 하위
            폴더는 상위 위치로 옮겨지며, 문제 자체는 삭제되지 않습니다.
          </p>
          {error && <Notice tone="error">{error}</Notice>}
        </Modal>
      )}
    </div>
  );
}
function FolderOptions({
  folders,
  exclude,
}: {
  folders: Folder[];
  exclude?: string;
}) {
  const excluded = exclude
    ? folderDescendants(folders, exclude)
    : new Set<string>();
  return (
    <>
      {folders
        .filter((f) => !excluded.has(f.id))
        .map((f) => (
          <option key={f.id} value={f.id}>
            {folderPath(folders, f.id)
              .map((p) => p.name)
              .join(' / ')}
          </option>
        ))}
    </>
  );
}
function MoveModal({
  folders,
  initial,
  busy,
  error,
  count,
  onClose,
  onMove,
}: {
  folders: Folder[];
  initial: string | null;
  busy: boolean;
  error: string;
  count: number;
  onClose: () => void;
  onMove: (id: string | null) => void;
}) {
  const [destination, setDestination] = useState(initial || '');
  return (
    <Modal
      title={`${count}개 문제 이동`}
      onClose={onClose}
      footer={
        <>
          <button className="button" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => onMove(destination || null)}
          >
            {busy ? '옮기는 중…' : '여기로 이동'}
          </button>
        </>
      }
    >
      <label>
        이동할 폴더
        <select
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        >
          <option value="">분류되지 않은 문제</option>
          <FolderOptions folders={folders} />
        </select>
      </label>
      <p className="muted">문제 주소와 공유 권한, 작업 사본은 유지됩니다.</p>
      {error && <Notice tone="error">{error}</Notice>}
    </Modal>
  );
}
function FolderModal({
  folders,
  folder,
  parent,
  onClose,
  onSaved,
}: {
  folders: Folder[];
  folder: Folder | null;
  parent: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(folder?.name || '');
  const [destination, setDestination] = useState(
    folder?.parent_id || (!folder ? parent : null) || '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true);
    try {
      const values = { name, parent_id: destination || null };
      if (folder) await put(`/folders/${folder.id}`, values);
      else await post('/folders', values);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={folder ? '폴더 편집' : '새 폴더 만들기'}
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            취소
          </button>
          <button
            className="button primary"
            disabled={busy || !name.trim()}
            onClick={() => void save()}
          >
            {folder ? '저장' : '폴더 만들기'}
          </button>
        </>
      }
    >
      <label>
        폴더 이름
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 2026 대회"
        />
      </label>
      <label>
        상위 폴더
        <select
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        >
          <option value="">최상위</option>
          <FolderOptions folders={folders} exclude={folder?.id} />
        </select>
      </label>
      {error && <Notice tone="error">{error}</Notice>}
    </Modal>
  );
}
function CreateProblem({
  onClose,
  onCreated,
  folderId,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  folderId: string | null;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const p = await post<Problem>('/problems', {
        name,
        slug,
        folder_id: folderId,
      });
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
  folderId,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  folderId: string | null;
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
        `/imports?name=${encodeURIComponent(name)}&slug=${encodeURIComponent(slug)}${folderId ? `&folder_id=${folderId}` : ''}`,
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
