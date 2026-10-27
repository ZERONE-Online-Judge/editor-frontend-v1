import { useState } from 'react';
import type { RevisionHead } from '../lib/useRevisionUpdates';
import { Icon } from './ui';
import RevisionPreview from './RevisionPreview';

export default function RevisionNotice({
  problemId,
  revision,
  baseRevision,
  head,
  dirty,
  busy,
  onUpdate,
}: {
  problemId: string;
  revision: number;
  baseRevision: number;
  head: RevisionHead | null;
  dirty: boolean;
  busy: boolean;
  onUpdate: () => void;
}) {
  const [dismissed, setDismissed] = useState({ problemId: '', revision: -1 });
  if (
    revision <= baseRevision ||
    (dismissed.problemId === problemId && dismissed.revision >= revision)
  )
    return null;
  return (
    <aside
      className="revision-update-notice"
      role="status"
      aria-label="새 커밋 안내"
    >
      <span className="revision-update-icon" aria-hidden="true">
        <Icon name="branch" />
      </span>
      <div className="revision-update-copy">
        <strong>새로운 변경사항이 있습니다.</strong>
        <p>
          {head?.revision === revision && head.author
            ? `${head.author}님이 공유 r${revision}을 커밋했습니다. `
            : `공유 r${revision}이 도착했습니다. `}
          업데이트를 눌러 가져올 수 있습니다.
        </p>
        {dirty && (
          <small>
            작성 중인 변경은 먼저 저장한 뒤 함께 반영합니다. 같은 항목이 겹치면
            충돌 해결을 안내합니다.
          </small>
        )}
      </div>
      <button
        className="button primary small"
        disabled={busy}
        onClick={onUpdate}
      >
        <Icon name="download" size={16} />
        업데이트
      </button>
      <button
        className="icon-button revision-update-close"
        aria-label="새 커밋 안내 닫기"
        onClick={() => setDismissed({ problemId, revision })}
      >
        <Icon name="close" size={16} />
      </button>
      <div className="revision-update-preview">
        <RevisionPreview
          key={`${problemId}/${baseRevision}/${revision}`}
          problemId={problemId}
          from={baseRevision}
          to={revision}
        />
      </div>
    </aside>
  );
}
