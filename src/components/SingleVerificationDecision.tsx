import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, blobPreview, languages, post, time } from '../lib/api';
import { useAuth } from '../lib/authContext';
import { jobRelation } from '../lib/jobHistory';
import { can } from '../lib/permissions';
import type { Job, Language } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { CodeEditor, Notice } from './ui';
import './SingleVerificationDecision.css';

type DecisionProps = {
  job: Job;
  onUpdated: (job: Job) => void;
  onRefreshHistory: () => Promise<unknown>;
};

export default function SingleVerificationDecision(props: DecisionProps) {
  const { data } = useWorkspace();
  const { user } = useAuth();
  return (
    <SingleVerificationAction
      key={`${user?.id || ''}/${data.problem.id}/${props.job.id}`}
      {...props}
    />
  );
}

function SingleVerificationAction({
  job,
  onUpdated,
  onRefreshHistory,
}: DecisionProps) {
  const { data, document: doc, dirty, reload, notify } = useWorkspace();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const locked = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const scope = useRef({ active: true });
  useEffect(() => {
    const current = { active: true };
    scope.current = current;
    return () => {
      current.active = false;
      controller.current?.abort();
    };
  }, [data.problem.id, job.id, user?.id]);
  const sources = Array.isArray(job.options.temporary_solutions)
    ? job.options.temporary_solutions
    : [];
  const source: Record<string, unknown> =
    sources.length === 1 && sources[0] && typeof sources[0] === 'object'
      ? sources[0]
      : {};
  const filename = typeof source.name === 'string' ? source.name : '';
  const content = typeof source.content === 'string' ? source.content : '';
  const sha = typeof source.sha256 === 'string' ? source.sha256 : '';
  const expected = typeof source.tag === 'string' ? source.tag : '';
  const language = typeof source.language === 'string' ? source.language : '';
  const terminal = !['queued', 'running'].includes(job.status);
  const allowed = can(data.problem, 'edit_solutions');
  const assessment = job.outcome?.assessment;
  const matched =
    job.status === 'completed' &&
    assessment?.code === 'expectations_match' &&
    assessment.status === 'passed' &&
    assessment.partial === false;
  const stale = jobRelation(job, data.document_hash) === 'other';
  const collision = Boolean(
    filename && (doc.solutions[filename] || doc.files[filename]),
  );
  const decided = Boolean(job.application || job.discarded_at);
  const eligible =
    matched &&
    !!filename &&
    (!!content || !!sha) &&
    !stale &&
    !dirty &&
    !collision;

  async function decide(action: 'apply' | 'discard') {
    if (
      locked.current ||
      !terminal ||
      !allowed ||
      decided ||
      (action === 'apply' && !eligible)
    )
      return;
    locked.current = true;
    setBusy(true);
    setError('');
    const current = scope.current;
    const request = new AbortController();
    controller.current = request;
    const path = `/problems/${encodeURIComponent(data.problem.id)}/jobs/${encodeURIComponent(job.id)}`;
    let confirmed = false;
    try {
      const receipt = await post<{
        application?: Job['application'];
        discarded_at?: number;
      }>(
        action === 'apply' ? `${path}/solution/apply` : `${path}/discard`,
        action === 'apply' ? { version: data.version } : {},
        request.signal,
      );
      if (!current.active) return;
      if (action === 'apply' && receipt.application) {
        confirmed = true;
        onUpdated({ ...job, application: receipt.application });
      } else if (action === 'discard' && receipt.discarded_at) {
        confirmed = true;
        onUpdated({ ...job, discarded_at: receipt.discarded_at });
      }
      if (action === 'apply') await reload(true);
      if (!current.active) return;
      const refreshed = await api<Job>(path, { signal: request.signal });
      if (!current.active) return;
      onUpdated(refreshed);
      await onRefreshHistory();
      if (current.active)
        notify(
          action === 'apply'
            ? `${filename}을 내 작업 사본의 풀이에 추가했습니다. 공유하려면 커밋하세요.`
            : '코드를 풀이에 추가하지 않고 버렸습니다. 실행 기록은 보관됩니다.',
        );
    } catch (failure) {
      if (current.active && !request.signal.aborted)
        setError(
          `${confirmed ? (action === 'apply' ? '풀이 추가는 완료됐지만 화면을 갱신하지 못했습니다. ' : '버리기는 완료됐지만 화면을 갱신하지 못했습니다. ') : ''}${(failure as Error).message}`,
        );
    } finally {
      if (current.active) {
        locked.current = false;
        setBusy(false);
      }
    }
  }

  if (
    job.kind !== 'verify' ||
    job.options.single_verification !== true ||
    !terminal
  )
    return null;
  return (
    <section
      className="single-verification-decision"
      aria-label="단일 검증 코드 반영"
    >
      <div className="single-verification-decision-heading">
        <div>
          <h4>
            {job.application
              ? '내 풀이에 추가한 코드입니다.'
              : job.discarded_at
                ? '풀이에 추가하지 않고 버린 코드입니다.'
                : matched
                  ? '검증한 코드를 풀이에 추가할까요?'
                  : '검증한 코드'}
          </h4>
          <p className="muted small">
            {filename || '파일명 정보 없음'}
            {language
              ? ` · ${languages[language as Language] || language}`
              : ''}
            {expected ? ` · 기대 ${expected}` : ''}
          </p>
        </div>
        {job.application ? (
          <Link
            className="button small"
            to={`/problems/${data.problem.id}/solutions`}
          >
            풀이에서 확인
          </Link>
        ) : !job.discarded_at ? (
          <div className="actions">
            <button
              className="button"
              disabled={!allowed || busy}
              onClick={() => void decide('discard')}
            >
              반영하지 않고 버리기
            </button>
            {matched && (
              <button
                className="button primary"
                disabled={!allowed || !eligible || busy}
                onClick={() => void decide('apply')}
              >
                {busy ? '처리 중…' : '풀이에 추가'}
              </button>
            )}
          </div>
        ) : null}
      </div>
      {job.application ? (
        <p className="muted small">
          {time(job.application.applied_at)} · 작업 사본 v
          {job.application.workspace_version}에 추가했습니다. 공유하려면
          커밋하세요.
        </p>
      ) : job.discarded_at ? (
        <p className="muted small">
          {time(job.discarded_at)} · 실행 기록은 보관됩니다.
        </p>
      ) : (
        <p className="muted small">
          {!allowed
            ? '풀이 편집 권한이 있어야 추가하거나 버릴 수 있습니다.'
            : !matched
              ? '기대 판정과 일치한 검증이 완료되어야 풀이에 추가할 수 있습니다.'
              : dirty
                ? '저장하지 않은 변경이 있습니다. 저장 후 자료 기준을 다시 확인하세요.'
                : stale
                  ? '현재 저장본과 다른 자료로 검증했습니다. 현재 자료로 다시 검증하세요.'
                  : collision
                    ? '같은 이름의 파일이 있습니다. 다른 파일명으로 다시 검증하세요.'
                    : '검증한 코드와 기대 판정을 내 작업 사본에 추가합니다. 공유하려면 커밋하세요.'}
        </p>
      )}
      {(content || sha) && (
        <details
          className="single-verification-source"
          onToggle={(event) => setPreview(event.currentTarget.open)}
        >
          <summary>검증한 코드 보기</summary>
          {preview && (
            <VerifiedCodePreview
              key={sha || content}
              problemId={data.problem.id}
              content={content}
              sha={sha}
            />
          )}
        </details>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}

function VerifiedCodePreview({
  problemId,
  content,
  sha,
}: {
  problemId: string;
  content: string;
  sha: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    text?: string;
    truncated?: boolean;
    binary?: boolean;
    error?: string;
  } | null>(content ? { text: content } : null);
  useEffect(() => {
    if (content) return;
    const controller = new AbortController();
    void blobPreview(problemId, sha, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ error: (error as Error).message });
      });
    return () => controller.abort();
  }, [problemId, content, sha, attempt]);
  if (!result)
    return (
      <p className="muted small" role="status">
        코드를 불러오는 중입니다.
      </p>
    );
  if (result.error)
    return (
      <Notice tone="error">
        {result.error}
        <button
          className="button small"
          onClick={() => setAttempt(attempt + 1)}
        >
          다시 불러오기
        </button>
      </Notice>
    );
  if (result.binary)
    return <Notice>텍스트로 표시할 수 없는 코드입니다.</Notice>;
  return (
    <>
      {result.truncated && (
        <p className="muted small">
          큰 코드의 앞부분만 표시합니다. 풀이에는 검증한 원본 전체가 추가됩니다.
        </p>
      )}
      <CodeEditor
        label="검증한 코드"
        readOnly
        value={result.text || ''}
        rows={10}
      />
    </>
  );
}
