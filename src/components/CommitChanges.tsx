import { useEffect, useMemo, useState } from 'react';
import { blobText } from '../lib/api';
import {
  documentChanges,
  diffLines,
  type DocumentChange,
} from '../lib/documentChanges';
import type { ProblemDocument } from '../lib/types';
import { Badge, Icon } from './ui';

const labels = { added: '추가', removed: '삭제', changed: '수정' };
const valueText = (value: unknown) =>
  value === undefined
    ? ''
    : typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2);

function ChangeDetails({
  problemId,
  change,
}: {
  problemId: string;
  change: DocumentChange;
}) {
  const [opened, setOpened] = useState(false);
  const [text, setText] = useState<[string, string] | null>(null);
  const [error, setError] = useState('');
  const large = Boolean(
    change.source &&
    [change.source.before, change.source.after].some(
      (f) => f && f.size > 262144,
    ),
  );
  useEffect(() => {
    let active = true;
    if (opened && change.source && !large) {
      void Promise.all(
        [change.source.before, change.source.after].map((f) =>
          f ? blobText(problemId, f.sha256) : Promise.resolve(''),
        ),
      )
        .then((values) => {
          if (active) setText(values as [string, string]);
        })
        .catch((e) => {
          if (active) setError((e as Error).message);
        });
    }
    return () => {
      active = false;
    };
  }, [opened, change.source, large, problemId]);
  const lines = useMemo(
    () =>
      diffLines(
        text?.[0] ?? valueText(change.before),
        text?.[1] ?? valueText(change.after),
      ),
    [text, change.before, change.after],
  );
  // Retain context around changes; large text never expands the whole modal.
  const visible = lines.filter(
    (row, i) =>
      row.kind !== 'same' ||
      lines.slice(Math.max(0, i - 3), i + 4).some((r) => r.kind !== 'same'),
  );
  return (
    <details
      className="commit-change"
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary>
        <Icon name="branch" size={15} />
        <span>{change.label}</span>
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
      </summary>
      {opened && (
        <>
          {change.source && (
            <div className="diff-downloads">
              {(['before', 'after'] as const).map(
                (side) =>
                  change.source?.[side] && (
                    <a
                      key={side}
                      href={`/api/problems/${problemId}/blobs/${change.source[side].sha256}`}
                      download={change.source[side].name}
                    >
                      {side === 'before' ? '이전 코드' : '새 코드'} 다운로드
                    </a>
                  ),
              )}
            </div>
          )}
          {large ? (
            <p className="muted small">
              256KiB를 넘는 소스는 다운로드해 비교하세요.
            </p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : change.source && !text ? (
            <p className="muted">코드를 불러오고 있습니다…</p>
          ) : (
            <div className="line-diff" aria-label={`${change.label} 변경사항`}>
              {visible.slice(0, 240).map((row, i) => (
                <div key={i} className={`diff-line ${row.kind}`}>
                  <span className="line-number">{row.old ?? ''}</span>
                  <span className="line-number">{row.next ?? ''}</span>
                  <span>
                    {row.kind === 'add'
                      ? '+'
                      : row.kind === 'remove'
                        ? '−'
                        : ' '}
                  </span>
                  <code>{row.text || ' '}</code>
                </div>
              ))}
              {visible.length > 240 && (
                <p className="muted small">
                  변경 구간의 처음 240행을 표시합니다. 전체 내용은 다운로드해
                  확인하세요.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </details>
  );
}

export default function CommitChanges({
  problemId,
  before,
  after,
}: {
  problemId: string;
  before: ProblemDocument;
  after: ProblemDocument;
}) {
  const changes = useMemo(
    () => documentChanges(before, after),
    [before, after],
  );
  const groups = [...new Set(changes.map((c) => c.group))];
  if (!changes.length)
    return (
      <div className="readiness-complete">
        <Icon name="check" />
        공유 리비전에 반영할 변경사항이 없습니다.
      </div>
    );
  return (
    <div className="commit-changes">
      <div className="commit-change-totals">
        {(['added', 'changed', 'removed'] as const).map((kind) => (
          <Badge
            key={kind}
            tone={
              kind === 'removed'
                ? 'danger'
                : kind === 'added'
                  ? 'success'
                  : 'accent'
            }
          >
            {labels[kind]} {changes.filter((c) => c.kind === kind).length}
          </Badge>
        ))}
      </div>
      {groups.map((group) => (
        <section key={group}>
          <h3>
            {group}{' '}
            <span className="count">
              {changes.filter((c) => c.group === group).length}
            </span>
          </h3>
          {changes
            .filter((c) => c.group === group)
            .map((change) => (
              <ChangeDetails
                key={change.key}
                problemId={problemId}
                change={change}
              />
            ))}
        </section>
      ))}
    </div>
  );
}
