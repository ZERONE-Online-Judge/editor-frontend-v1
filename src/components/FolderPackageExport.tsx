import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, post, time } from '../lib/api';
import type { Folder } from '../lib/types';
import { PaginatedList } from './Pagination';
import Select from './Select';
import { Badge, Icon, Modal, Notice } from './ui';
import './FolderPackageExport.css';
import {
  MotionNumber,
  MotionProgress,
  ResultTransition,
} from './ProgressMotion';

type ExportFormat = 'zoj' | 'editor' | 'linux';
type ExportStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';
type ExportItem = {
  problem_id: string;
  name: string;
  slug: string;
  revision: number;
  folder_path: string[];
  archive_path: string;
  status: 'pending' | 'queued' | 'running' | 'ready' | 'failed';
  job_id: string | null;
  reused: boolean;
  progress: number;
  error: { code: string; message: string } | null;
};
type ExportSummary = {
  id: string;
  folder_id: string;
  folder_name: string;
  include_descendants: boolean;
  options: {
    export_format: ExportFormat;
    verify: boolean;
    reuse?: boolean;
    statement_language: string;
  };
  status: ExportStatus;
  created_at: number;
  finished_at: number | null;
  total: number;
  ready: number;
  failed: number;
  pending: number;
  progress: number;
  download_url: string | null;
};
type PackageExport = ExportSummary & { items: ExportItem[] };

const formats = { zoj: 'ZOJ', editor: 'Editor / Polygon', linux: 'Linux' };
const statuses: Record<ExportStatus, string> = {
  queued: '대기 중',
  running: '준비 중',
  completed: '완료',
  partial: '일부 완료',
  failed: '실패',
};
const itemStatuses: Record<ExportItem['status'], string> = {
  pending: '준비 대기',
  queued: '생성 대기',
  running: '생성 중',
  ready: '준비 완료',
  failed: '실패',
};
const active = (status: ExportStatus) =>
  status === 'queued' || status === 'running';
const denied = (error: unknown) =>
  error instanceof ApiError && [401, 403, 404].includes(error.status);
function policy(options: ExportSummary['options']) {
  return options.reuse === false
    ? options.verify
      ? '재검증 후 생성'
      : '새 검증 없이 재생성'
    : options.verify
      ? '필요 시 검증 후 생성'
      : '새 검증 생략';
}

export default function FolderPackageExport({
  folder,
  exportId,
  onSelect,
  onClose,
}: {
  folder: Folder;
  exportId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>('zoj');
  const [verify, setVerify] = useState(true);
  const [rebuild, setRebuild] = useState(false);
  const [descendants, setDescendants] = useState(true);
  const [language, setLanguage] = useState('korean');
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState('');
  const [loaded, setLoaded] = useState<PackageExport | null>(null);
  const [detailError, setDetailError] = useState('');
  const [recent, setRecent] = useState<ExportSummary[]>([]);
  const [recentError, setRecentError] = useState('');
  const [retry, setRetry] = useState(0);
  const [accessError, setAccessError] = useState('');
  const access = useRef({ epoch: 0, denied: false });
  const starting = useRef(false);
  const mounted = useRef({ active: false });
  const scope = useRef({ active: false });
  useLayoutEffect(() => {
    const current = { active: true };
    mounted.current = current;
    return () => {
      current.active = false;
    };
  }, []);
  useLayoutEffect(() => {
    const current = { active: true };
    scope.current = current;
    return () => {
      current.active = false;
    };
  }, [folder.id, exportId]);
  const detail = loaded?.id === exportId ? loaded : null;
  const revoke = useCallback((message: string) => {
    access.current = { epoch: access.current.epoch + 1, denied: true };
    setAccessError(message);
    setLoaded(null);
    setRecent([]);
  }, []);
  function tryAgain() {
    access.current = { epoch: access.current.epoch + 1, denied: false };
    setDetailError('');
    setRecentError('');
    setStartError('');
    setRetry((n) => n + 1);
  }

  useEffect(() => {
    let live = true;
    const epoch = access.current.epoch;
    const controller = new AbortController();
    api<{ items: ExportSummary[] }>(`/folders/${folder.id}/package-exports`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (live && epoch === access.current.epoch && !access.current.denied) {
          setRecent(value.items);
          setRecentError('');
          if (!exportId) setAccessError('');
        }
      })
      .catch((error: Error) => {
        if (!live || epoch !== access.current.epoch) return;
        if (denied(error)) revoke(error.message);
        else setRecentError(error.message);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [folder.id, exportId, retry, revoke]);

  useEffect(() => {
    if (!exportId) return;
    let live = true;
    const epoch = access.current.epoch;
    let timer: number | undefined;
    const controller = new AbortController();
    async function refresh() {
      if (access.current.denied || epoch !== access.current.epoch) return;
      try {
        const value = await api<PackageExport>(
          `/folder-package-exports/${encodeURIComponent(exportId!)}`,
          { signal: controller.signal },
        );
        if (!live || epoch !== access.current.epoch || access.current.denied)
          return;
        if (value.folder_id !== folder.id) {
          revoke('이 폴더의 내보내기 기록이 아닙니다.');
          return;
        }
        setLoaded(value);
        setDetailError('');
        setAccessError('');
        if (active(value.status))
          timer = window.setTimeout(() => void refresh(), 2000);
      } catch (error) {
        if (!live || epoch !== access.current.epoch) return;
        if (denied(error)) {
          revoke((error as Error).message);
          return;
        }
        setDetailError((error as Error).message);
        if (
          !(error instanceof ApiError) ||
          error.status >= 500 ||
          error.status === 408 ||
          error.status === 429
        )
          timer = window.setTimeout(() => void refresh(), 5000);
      }
    }
    void refresh();
    return () => {
      live = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [folder.id, exportId, retry, revoke]);

  async function start() {
    if (starting.current || access.current.denied) return;
    starting.current = true;
    const current = scope.current;
    const lifecycle = mounted.current;
    const epoch = access.current.epoch;
    setBusy(true);
    setStartError('');
    try {
      const value = await post<PackageExport>(
        `/folders/${folder.id}/package-exports`,
        {
          include_descendants: descendants,
          export_format: format,
          verify,
          reuse: !rebuild,
          statement_language: language.trim() || 'korean',
        },
      );
      if (
        current.active &&
        epoch === access.current.epoch &&
        !access.current.denied
      ) {
        setLoaded(value);
        onSelect(value.id);
      }
    } catch (error) {
      if (current.active && epoch === access.current.epoch) {
        if (denied(error)) revoke((error as Error).message);
        else setStartError((error as Error).message);
      }
    } finally {
      starting.current = false;
      if (lifecycle.active) setBusy(false);
    }
  }

  return (
    <Modal
      title={`${folder.name} · 패키지 일괄 다운로드`}
      wide
      className="folder-package-export"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            닫기
          </button>
          {!accessError &&
            (exportId ? (
              <>
                {detail && !active(detail.status) && (
                  <button className="button" onClick={() => onSelect(null)}>
                    새로 내보내기
                  </button>
                )}
                {detail?.download_url && (
                  <a
                    className="button primary"
                    href={detail.download_url}
                    download
                  >
                    <Icon name="download" />
                    {detail.status === 'partial'
                      ? '완료된 패키지 ZIP'
                      : '전체 ZIP 다운로드'}
                  </a>
                )}
              </>
            ) : (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void start()}
              >
                <Icon name="box" />
                {busy ? '요청 중…' : '패키지 준비'}
              </button>
            ))}
        </>
      }
    >
      {accessError ? (
        <Notice tone="error">
          내보내기 기록에 접근할 수 없습니다. {accessError}{' '}
          <button className="text-button" onClick={tryAgain}>
            다시 시도
          </button>
        </Notice>
      ) : !exportId ? (
        <div className="section-stack">
          <p>
            이 폴더의 모든 문제를 최신 커밋 기준으로 묶습니다. 작업 사본의
            변경사항은 먼저 커밋하세요.
          </p>
          <p className="muted">
            {rebuild
              ? '기존 패키지를 재사용하지 않고 모든 문제의 패키지를 새로 생성합니다.'
              : '같은 조건의 패키지는 재사용하고, 없는 패키지는 자동으로 생성합니다.'}{' '}
            검색·필터·선택한 문제와 관계없이 폴더 전체가 대상입니다.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={descendants}
              disabled={busy}
              onChange={(event) => setDescendants(event.target.checked)}
            />
            하위 폴더 포함
          </label>
          <div className="form-grid">
            <label>
              패키지 형식
              <Select
                value={format}
                disabled={busy}
                onChange={(event) =>
                  setFormat(event.target.value as ExportFormat)
                }
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
            {format === 'zoj' && (
              <label>
                ZOJ 기본 지문 언어 · korean / english 등
                <input
                  value={language}
                  maxLength={100}
                  disabled={busy}
                  placeholder="korean"
                  onChange={(event) => setLanguage(event.target.value)}
                />
              </label>
            )}
          </div>
          {format === 'zoj' && (
            <p className="muted">
              지정한 언어의 지문이 없는 문제는 결과에 오류로 표시됩니다.
            </p>
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={verify}
              aria-label="패키지 생성 전 검증"
              disabled={busy}
              onChange={(event) => setVerify(event.target.checked)}
            />
            새 패키지 생성 전 풀이·구성요소 검증 실행
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              aria-label="기존 패키지 다시 생성"
              checked={rebuild}
              disabled={busy}
              onChange={(event) => setRebuild(event.target.checked)}
            />
            {verify
              ? '기존 패키지도 재검증 후 생성'
              : '기존 패키지도 다시 생성'}
          </label>
          <p className="muted">
            각 문제의 모든 테스트 세트를 사용합니다. 패키지 내보내기 권한이
            없거나 생성에 실패한 문제는 결과에 표시됩니다.
          </p>
          {!verify && (
            <Notice>
              새 패키지가 필요하면 저장된 자료를 새 검증 없이 내보냅니다. 기존
              패키지의 검증 상태는 유지됩니다. ZOJ·Linux 형식은 입력·정답이 모두
              저장되어 있어야 합니다. ZOJ 등록·업데이트에는 검증된 패키지가
              필요합니다.
            </Notice>
          )}
          {startError && <Notice tone="error">{startError}</Notice>}
          <section className="folder-export-recent" aria-label="최근 내보내기">
            <div className="folder-export-heading">
              <h3>최근 내보내기</h3>
              <button
                className="text-button"
                onClick={() => setRetry((n) => n + 1)}
              >
                새로고침
              </button>
            </div>
            {recentError && <Notice tone="error">{recentError}</Notice>}
            {!recent.length && !recentError && (
              <p className="muted">최근 기록이 없습니다.</p>
            )}
            <ol>
              {recent.map((row) => (
                <li key={row.id}>
                  <button
                    className="folder-export-reopen"
                    onClick={() => onSelect(row.id)}
                  >
                    <span>
                      {time(row.created_at)} ·{' '}
                      {formats[row.options.export_format]} ·{' '}
                      {policy(row.options)}
                    </span>
                    <span>
                      {statuses[row.status]} · {row.ready}/{row.total}개{' '}
                      <Icon name="arrow" size={15} />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : (
        <div className="section-stack">
          {detailError && (
            <Notice tone="error">
              상태를 불러오지 못했습니다. {detailError}{' '}
              <button
                className="text-button"
                onClick={() => setRetry((n) => n + 1)}
              >
                다시 시도
              </button>
            </Notice>
          )}
          {!detail && !detailError && (
            <p role="status">내보내기 상태를 불러오고 있습니다.</p>
          )}
          {detail && (
            <>
              <div className="folder-export-heading">
                <div>
                  <h3>
                    <ResultTransition
                      stateKey={`${detail.id}/${detail.status}`}
                    >
                      {statuses[detail.status]}
                    </ResultTransition>
                  </h3>
                  <p className="muted">
                    {formats[detail.options.export_format]} ·{' '}
                    {policy(detail.options)} ·{' '}
                    {detail.include_descendants
                      ? '하위 폴더 포함'
                      : '현재 폴더만'}
                  </p>
                </div>
                <span role="status">
                  완료{' '}
                  <MotionNumber
                    value={detail.ready}
                    max={detail.total}
                    scope={`${detail.id}/ready`}
                  />{' '}
                  / {detail.total}개 · 실패{' '}
                  <MotionNumber
                    value={detail.failed}
                    max={detail.total}
                    scope={`${detail.id}/failed`}
                  />
                  개
                </span>
              </div>
              <MotionProgress
                scope={detail.id}
                max={100}
                value={detail.progress}
                aria-label="폴더 패키지 준비 진행률"
              />
              {active(detail.status) && (
                <p className="muted">
                  창을 닫아도 준비가 계속됩니다. 이 폴더의 최근 내보내기에서
                  다시 열 수 있습니다.
                </p>
              )}
              {detail.status === 'partial' && (
                <Notice>
                  일부 문제를 준비하지 못했습니다. 완료된 패키지와 문제별 결과
                  목록을 ZIP으로 받을 수 있습니다.
                </Notice>
              )}
              {detail.status === 'failed' && (
                <Notice tone="error">
                  다운로드할 패키지를 준비하지 못했습니다. 아래 문제별 오류를
                  확인하세요.
                </Notice>
              )}
              <PaginatedList
                items={detail.items}
                resetKey={detail.id}
                size={10}
                label="폴더 패키지 결과"
              >
                {(items) => (
                  <ol className="folder-export-items">
                    {items.map((item) => (
                      <li key={item.problem_id}>
                        <div className="folder-export-heading">
                          <strong>
                            {item.name}{' '}
                            <span className="muted">· r{item.revision}</span>
                          </strong>
                          <ResultTransition
                            stateKey={`${detail.id}/${item.problem_id}/${item.status}`}
                          >
                            <Badge
                              tone={
                                item.status === 'failed'
                                  ? 'danger'
                                  : item.status === 'ready'
                                    ? 'success'
                                    : 'neutral'
                              }
                            >
                              {item.reused && item.status === 'ready'
                                ? '기존 패키지 재사용'
                                : itemStatuses[item.status]}
                            </Badge>
                          </ResultTransition>
                        </div>
                        <p className="subtext">
                          {item.folder_path.join(' / ')} · {item.slug}
                        </p>
                        {item.error && (
                          <p className="folder-export-error">
                            {item.error.message}
                          </p>
                        )}
                        {item.job_id && (
                          <Link
                            className="text-link"
                            to={`/problems/${item.problem_id}/invocations?job=${encodeURIComponent(item.job_id)}`}
                          >
                            실행 결과 <Icon name="arrow" size={13} />
                          </Link>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </PaginatedList>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
