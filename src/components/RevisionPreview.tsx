import { lazy, Suspense, useEffect, useState } from 'react';
import { api, time } from '../lib/api';
import type { ProblemDocument } from '../lib/types';
import { Badge, Modal, Notice } from './ui';
import './RevisionPreview.css';
const RevisionChanges = lazy(() => import('./RevisionChanges'));

export type ChangeSummary = {
  total: number;
  items: {
    path: string;
    label: string;
    kind: 'added' | 'removed' | 'changed';
  }[];
};
type Preview = {
  from_revision: number;
  to_revision: number;
  commits: {
    total: number;
    items: {
      number: number;
      message: string;
      author: string;
      created_at: number;
    }[];
  };
  changes: {
    total: number;
    items: (ChangeSummary['items'][number] & {
      content_label: string | null;
      lines: { kind: 'add' | 'remove' | 'same' | 'hunk'; text: string }[];
      truncated: boolean;
      binary: boolean;
      unavailable: boolean;
      additional_contents: number;
    })[];
  };
};
const labels = { added: '추가', changed: '수정', removed: '삭제' };

function FullComparison({
  problemId,
  from,
  to,
  onClose,
}: {
  problemId: string;
  from: number;
  to: number;
  onClose: () => void;
}) {
  const [result, setResult] = useState<{
    before: ProblemDocument | null;
    after: ProblemDocument;
  } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      from < 0
        ? Promise.resolve(null)
        : api<ProblemDocument>(`/problems/${problemId}/revisions/${from}`, {
            signal: controller.signal,
          }),
      api<ProblemDocument>(`/problems/${problemId}/revisions/${to}`, {
        signal: controller.signal,
      }),
    ])
      .then(([before, after]) => {
        if (!controller.signal.aborted) {
          setResult({ before, after });
          setError('');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [problemId, from, to, retry]);
  return (
    <Modal
      wide
      className="revision-review-modal"
      title={from < 0 ? 'r0 · 최초 등록 자료' : `r${from} → r${to} · 전체 변경`}
      onClose={onClose}
      footer={
        <button className="button" onClick={onClose}>
          닫기
        </button>
      }
    >
      {error ? (
        <Notice tone="error">
          {error}
          <button
            className="button small"
            onClick={() => setRetry((n) => n + 1)}
          >
            다시 불러오기
          </button>
        </Notice>
      ) : result ? (
        <Suspense
          fallback={<p role="status">전체 변경을 불러오고 있습니다.</p>}
        >
          <RevisionChanges
            problemId={problemId}
            before={result.before}
            after={result.after}
          />
        </Suspense>
      ) : (
        <p role="status">리비전 자료를 비교하고 있습니다.</p>
      )}
    </Modal>
  );
}

export default function RevisionPreview({
  problemId,
  from,
  to,
}: {
  problemId: string;
  from: number;
  to: number;
}) {
  const key = `${problemId}/${from}/${to}`;
  const [state, setState] = useState<{
    key: string;
    data?: Preview;
    error?: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<Preview>(
      `/problems/${problemId}/revision-preview?from_revision=${from}&to_revision=${to}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ key, error: error.message });
      });
    return () => controller.abort();
  }, [problemId, from, to, key, retry]);
  const current = state?.key === key ? state : null;
  const data = current?.data;
  return (
    <section
      className="revision-preview"
      aria-label="커밋 내용과 간단한 변경 비교"
      aria-live="off"
    >
      {!current ? (
        <p role="status">커밋 내용과 변경된 파일을 불러오고 있습니다.</p>
      ) : current.error ? (
        <Notice tone="error">
          변경 미리보기를 불러오지 못했습니다. {current.error}
          <button
            className="button small"
            onClick={() => setRetry((n) => n + 1)}
          >
            다시 불러오기
          </button>
        </Notice>
      ) : (
        data && (
          <>
            <ol className="revision-preview-commits" aria-label="가져올 커밋">
              {data.commits.items.map((commit) => (
                <li key={commit.number}>
                  <span>r{commit.number}</span>
                  <div>
                    <strong>{commit.message}</strong>
                    <small>
                      {commit.author} · {time(commit.created_at)}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
            {data.commits.total > data.commits.items.length && (
              <p className="revision-preview-note">
                전체 {data.commits.total}개 커밋 중 최근{' '}
                {data.commits.items.length}개를 표시합니다.
              </p>
            )}
            <div className="revision-preview-heading">
              <strong>
                {from < 0 ? '최초 등록' : `r${from} → r${to} 누적 변경`} ·{' '}
                {data.changes.total}개 항목
              </strong>
              <button className="text-button" onClick={() => setFull(true)}>
                전체 변경 보기
              </button>
            </div>
            <div className="revision-preview-files">
              {data.changes.items.map((change) => (
                <article key={change.path}>
                  <header>
                    <Badge
                      tone={
                        change.kind === 'added'
                          ? 'success'
                          : change.kind === 'removed'
                            ? 'danger'
                            : 'accent'
                      }
                    >
                      {labels[change.kind]}
                    </Badge>
                    <strong title={change.path}>{change.label}</strong>
                    {change.content_label && (
                      <small>{change.content_label}</small>
                    )}
                  </header>
                  {change.binary ? (
                    <p>바이너리 파일이 변경되었습니다.</p>
                  ) : change.unavailable ? (
                    <p>
                      파일 내용을 불러올 수 없습니다. 전체 변경에서 확인해
                      주세요.
                    </p>
                  ) : change.lines.length ? (
                    <pre aria-label={`${change.label} 간단한 diff`}>
                      {change.lines.map((line, i) => (
                        <span key={i} className={`preview-diff-${line.kind}`}>
                          {line.text}
                        </span>
                      ))}
                    </pre>
                  ) : (
                    <p>
                      {change.truncated
                        ? '미리보기 범위 밖에 변경이 있습니다.'
                        : '파일 속성이 변경되었습니다.'}
                    </p>
                  )}
                  {(change.truncated || change.additional_contents > 0) && (
                    <p className="revision-preview-note">
                      일부 변경만 표시합니다. 전체 변경에서 나머지 내용을
                      확인하세요.
                    </p>
                  )}
                </article>
              ))}
            </div>
            {data.changes.total > data.changes.items.length && (
              <p className="revision-preview-note">
                변경 {data.changes.total}개 중 {data.changes.items.length}개를
                미리 보여줍니다.
              </p>
            )}
            {!data.changes.total && (
              <p>이 구간의 최종 자료는 기준 리비전과 같습니다.</p>
            )}
          </>
        )
      )}
      {full && (
        <FullComparison
          key={key}
          problemId={problemId}
          from={from}
          to={to}
          onClose={() => setFull(false)}
        />
      )}
    </section>
  );
}
