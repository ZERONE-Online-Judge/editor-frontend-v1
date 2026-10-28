import Pagination from '../../components/Pagination';
import { useRemotePage } from '../../lib/useRemotePage';
import { requesterName } from '../../lib/jobHistory';
import Select from '../../components/Select';
import { useEffect, useState } from 'react';
import { api, post, time } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import type { Job, Publication, ZojContest } from '../../lib/types';
import { Badge, Icon, Modal, Notice } from '../../components/ui';
import ZojPackageUpdate, { type ZojUpdateTarget } from './ZojPackageUpdate';

export default function ZojPublishing({
  problemId,
  editable,
  job,
  stale,
  initialContestId = '',
  initialDivisionId = '',
}: {
  problemId: string;
  editable: boolean;
  job: Job | null;
  stale: boolean;
  initialContestId?: string;
  initialDivisionId?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [contests, setContests] = useState<ZojContest[]>([]);
  const [contestId, setContestId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [code, setCode] = useState('');
  const [targetId, setTargetId] = useState('');
  const [targets, setTargets] = useState<
    { id: string; title: string; code: string; division_id: string }[]
  >([]);
  const [targetsReady, setTargetsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [published, setPublished] = useState<Publication | null>(null);
  const [pagination, setPagination] = useState({ problemId, page: 1 });
  const page = pagination.problemId === problemId ? pagination.page : 1;
  const {
    data: historyPage,
    error: historyError,
    refresh: refreshHistory,
  } = useRemotePage<Publication>(
    `/problems/${problemId}/zoj-publications?page=${page}&page_size=20`,
    page,
  );
  const history = historyPage?.items || [];
  const [updateTarget, setUpdateTarget] = useState<ZojUpdateTarget | null>(
    null,
  );
  const ready =
    job?.status === 'completed' &&
    job.result.package?.format === 'zoj' &&
    job.result.package.verified &&
    !stale;
  const contest = contests.find((c) => c.id === contestId);
  useEffect(() => {
    if (!open || !contestId) return;
    const controller = new AbortController();
    api<{ problems: typeof targets }>(`/zoj/contests/${contestId}/problems`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) {
          setTargets(value.problems);
          setTargetsReady(true);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error.message);
          setTargetsReady(false);
        }
      });
    return () => controller.abort();
  }, [open, contestId]);
  const target = targets.find((p) => p.id === targetId);
  const duplicate =
    !targetId &&
    targets.some((p) => p.division_id === divisionId && p.code === code.trim());
  async function show() {
    setOpen(true);
    setBusy(true);
    setError('');
    setPublished(null);
    setConfigured(null);
    setContests([]);
    setContestId('');
    setDivisionId('');
    setTargetId('');
    setTargets([]);
    setTargetsReady(false);
    setCode('');
    try {
      const result = await api<{
        configured: boolean;
        email: string;
        contests: ZojContest[];
      }>('/zoj/contests');
      setConfigured(result.configured);
      setContests(result.contests);
      const initial = result.contests.find((c) => c.id === initialContestId);
      if (initial) {
        setContestId(initial.id);
        if (initial.divisions.some((d) => d.id === initialDivisionId))
          setDivisionId(initialDivisionId);
      } else if (initialContestId) {
        setError(
          '연결된 대회의 문제 등록 권한이 없거나 대회를 찾을 수 없습니다. 등록할 대회를 다시 선택하세요.',
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (
      !job ||
      !ready ||
      !contest ||
      (contest.locked && !targetId) ||
      !targetsReady ||
      duplicate ||
      !divisionId ||
      !code.trim()
    )
      return;
    if (target) {
      setOpen(false);
      setUpdateTarget({
        contest_id: contestId,
        problem_code: target.code,
        result: {
          problem_id: target.id,
          title: target.title,
          url: `https://zoj.kr/operator/contests/${contestId}/problems`,
        },
      });
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await post<Publication>(
        `/problems/${problemId}/publish-zoj`,
        {
          job_id: job.id,
          contest_id: contestId,
          division_id: divisionId,
          problem_code: code,
        },
      );
      setPublished(result);
      setPagination({ problemId, page: 1 });
      await refreshHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card zoj-publish-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">READY FOR ZOJ</span>
          <h2>대회에 문제 등록 · 업데이트</h2>
          <p>
            같은 이메일의 ZOJ 운영자 계정으로 등록할 수 있는 대회를 선택하세요.
          </p>
        </div>
        <button
          className="button primary"
          disabled={!editable || !ready}
          onClick={() => void show()}
        >
          <Icon name="upload" />
          대회 등록 · 업데이트
        </button>
      </div>
      {!editable ? (
        <p className="muted">
          협업 권한에서 ‘ZOJ로 문제 전송’을 허용받아야 합니다. ZOJ에서도 본인의
          대회 문제 등록 권한을 확인합니다.
        </p>
      ) : !ready ? (
        <p className="muted">
          변경사항을 커밋한 뒤, 검증을 완료한 ZOJ 형식 패키지를 생성하고 실행
          기록에서 선택하세요.
        </p>
      ) : (
        <div className="zoj-publish-ready">
          <Badge tone="success">검증 완료 · 전송 준비</Badge>
          <span>
            리비전 r{job?.revision} · {job?.result.package?.filename}
          </span>
          {history.length > 0 && (
            <span>
              기존 대회 문제는 아래 전송 기록의 ‘새 패키지로 업데이트’에서
              변경할 수 있습니다.
            </span>
          )}
        </div>
      )}
      {historyError && (
        <Notice tone="error">
          전송 기록을 불러오지 못했습니다. {historyError}
        </Notice>
      )}
      {history.length > 0 && (
        <details className="publication-history">
          <summary>ZOJ 전송 기록 {historyPage?.total || 0}개</summary>
          {history.map((row) => (
            <div className="publication-row" key={row.operation_id}>
              <div>
                <strong>
                  {row.problem_code}. {row.result.title}
                </strong>
                <small>
                  {requesterName(row, user?.id)} ·{' '}
                  {row.result.kind === 'update' ? '문제 업데이트' : '문제 등록'}{' '}
                  · r{row.result.revision} · {time(row.created_at)}
                </small>
              </div>
              <div className="actions">
                <button
                  className="button small"
                  disabled={!editable || !ready}
                  onClick={() => setUpdateTarget(row)}
                >
                  새 패키지로 업데이트
                </button>
                <a
                  className="button small"
                  href={row.result.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  ZOJ에서 보기
                  <Icon name="arrow" size={14} />
                </a>
              </div>
            </div>
          ))}
          {historyPage && (
            <Pagination
              {...historyPage}
              label="ZOJ 전송 기록"
              onPageChange={(page) => setPagination({ problemId, page })}
            />
          )}
        </details>
      )}
      {updateTarget && job && (
        <ZojPackageUpdate
          key={`${problemId}:${job.id}:${updateTarget.contest_id}:${updateTarget.result.problem_id}`}
          problemId={problemId}
          jobId={job.id}
          target={updateTarget}
          onClose={() => setUpdateTarget(null)}
          onUpdated={() => {
            void refreshHistory();
          }}
        />
      )}
      {open && (
        <Modal
          title="ZOJ 대회에 문제 등록 · 업데이트"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          footer={
            published ? (
              <>
                <button className="button" onClick={() => setOpen(false)}>
                  닫기
                </button>
                <a
                  className="button primary"
                  href={published.result.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  ZOJ에서 확인
                </a>
              </>
            ) : (
              <>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  취소
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    !configured ||
                    !contest ||
                    (contest.locked && !targetId) ||
                    !targetsReady ||
                    duplicate ||
                    !divisionId ||
                    !code.trim() ||
                    !ready
                  }
                  onClick={() => void publish()}
                >
                  {busy
                    ? '처리 중…'
                    : targetId
                      ? '변경 내용 확인'
                      : '이 대회에 새 문제 등록'}
                </button>
              </>
            )
          }
        >
          {published ? (
            <Notice tone="success">
              {published.problem_code}. {published.result.title} 문제를
              등록했습니다. 입력·정답·checker·validator를 전송했으며 채점 번들
              준비가 자동으로 요청되었습니다.
            </Notice>
          ) : (
            <>
              <div className="zoj-account">
                <Icon name="shield" />
                <div>
                  <strong>{user?.email}</strong>
                  <small>
                    Editor에서 인증한 같은 이메일 · ZOJ의 현재 문제 등록 권한
                    확인
                  </small>
                </div>
              </div>
              {busy && configured === null && (
                <p className="muted">
                  등록할 수 있는 대회를 확인하고 있습니다.
                </p>
              )}
              {configured === false && (
                <Notice>
                  ZOJ 연결을 아직 설정하지 않았습니다. 서비스 관리자가 양쪽
                  서버의 연동 설정을 완료하면 바로 전송할 수 있습니다. 지금은
                  ZOJ ZIP을 다운로드해 기존 문제 가져오기로 등록할 수 있습니다.
                </Notice>
              )}
              {configured && contests.length === 0 && (
                <Notice>
                  문제 등록 권한이 있는 대회가 없습니다. ZOJ에서 대회 운영자
                  권한을 확인해 주세요.
                </Notice>
              )}
              {configured && contests.length > 0 && (
                <>
                  <label>
                    대회
                    <Select
                      value={contestId}
                      disabled={busy}
                      onChange={(e) => {
                        setContestId(e.target.value);
                        setDivisionId('');
                        setTargetId('');
                        setTargets([]);
                        setTargetsReady(false);
                        setError('');
                      }}
                    >
                      <option value="">대회를 선택하세요</option>
                      {contests.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                          {c.locked ? ' · 진행 중, 업데이트만 가능' : ''}
                        </option>
                      ))}
                    </Select>
                  </label>
                  {contest && (
                    <label>
                      등록 방식
                      <Select
                        aria-label="등록 방식"
                        value={targetId}
                        disabled={busy || !targetsReady}
                        onChange={(e) => {
                          setTargetId(e.target.value);
                          const item = targets.find(
                            (p) => p.id === e.target.value,
                          );
                          if (item) {
                            setDivisionId(item.division_id);
                            setCode(item.code);
                          } else setCode('');
                        }}
                      >
                        <option value="">새 문제로 등록</option>
                        {targets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {contest.divisions.find(
                              (d) => d.id === p.division_id,
                            )?.name || '참가 유형 확인'}{' '}
                            · {p.code}. {p.title} 업데이트
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  {contest && !targetsReady && (
                    <p className="muted">
                      대회 문제 목록을 확인하고 있습니다. 오류가 발생했다면 창을
                      닫고 다시 시도하세요.
                    </p>
                  )}
                  {duplicate && (
                    <Notice tone="error">
                      같은 참가 유형에 해당 문제 번호가 있습니다. 다른 번호를
                      입력하거나 기존 문제 업데이트를 선택하세요.
                    </Notice>
                  )}
                  {contest?.locked && !targetId && (
                    <Notice>
                      진행 중에는 새 문제를 등록할 수 없습니다. 기존 문제
                      업데이트를 선택하세요.
                    </Notice>
                  )}
                  <label>
                    참가 유형
                    <Select
                      value={divisionId}
                      disabled={busy || !contest || !!targetId}
                      onChange={(e) => setDivisionId(e.target.value)}
                    >
                      <option value="">참가 유형을 선택하세요</option>
                      {contest?.divisions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </Select>
                  </label>
                  {contest && !contest.divisions.length && (
                    <Notice>이 대회에 참가 유형을 먼저 추가해 주세요.</Notice>
                  )}
                  <label>
                    문제 번호
                    <input
                      value={code}
                      disabled={busy || !!targetId}
                      maxLength={16}
                      placeholder="예: A"
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </label>
                  <p className="muted">
                    {targetId
                      ? '기존 문제의 변경 내용을 먼저 확인하고, 이유를 입력한 뒤 적용합니다. 기존 제출·판정과 이전 패키지는 보존됩니다.'
                      : `선택한 대회에 리비전 r${job?.revision}을 새 문제로 등록합니다. 같은 요청을 재시도해도 중복 생성하지 않습니다.`}
                  </p>
                  <Notice>
                    {job?.result.package?.verified
                      ? 'Editor 검증을 거친 패키지입니다.'
                      : '검증을 거치지 않은 패키지입니다. 정답과 테스트의 올바름을 확인하지 않았습니다.'}{' '}
                    등록 권한은 현재 로그인한 계정으로 다시 확인합니다. 대회
                    사용 전 ZOJ 채점기로 풀이 검증을 실행하세요.
                  </Notice>
                </>
              )}
            </>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </Modal>
      )}
    </section>
  );
}
