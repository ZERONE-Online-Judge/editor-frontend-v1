import { useEffect, useRef, useState } from 'react';
import { api, time } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import type { ProblemDocument, Revision } from '../../lib/types';
import { Badge, Modal, Notice, SectionHeading } from '../../components/ui';
import RevisionChanges from '../../components/RevisionChanges';

type Selection = {
  problemId: string;
  revision: Revision;
  document?: ProblemDocument;
  before: ProblemDocument | null;
  error?: string;
};
export default function Revisions() {
  const { data, notify } = useWorkspace();
  const problemId = data.problem.id;
  const [history, setHistory] = useState<{
    problemId: string;
    rows: Revision[];
  } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const request = useRef({ version: 0 });
  const selected = selection?.problemId === problemId ? selection : null;
  const rows = history?.problemId === problemId ? history.rows : [];
  useEffect(() => {
    let active = true;
    const tracker = request.current;
    api<Revision[]>(`/problems/${problemId}/revisions`)
      .then((values) => {
        if (active) setHistory({ problemId, rows: values });
      })
      .catch((error) => {
        if (active) notify(error.message, true);
      });
    return () => {
      active = false;
      tracker.version++;
    };
  }, [problemId, notify]);
  async function view(row: Revision) {
    const token = ++request.current.version;
    setSelection({ problemId, revision: row, before: null });
    try {
      const [document, before] = await Promise.all([
        api<ProblemDocument>(`/problems/${problemId}/revisions/${row.number}`),
        row.number > 0
          ? api<ProblemDocument>(
              `/problems/${problemId}/revisions/${row.number - 1}`,
            )
          : Promise.resolve(null),
      ]);
      if (request.current.version === token)
        setSelection({ problemId, revision: row, document, before });
    } catch (error) {
      if (request.current.version === token)
        setSelection({
          problemId,
          revision: row,
          before: null,
          error: (error as Error).message,
        });
    }
  }
  function close() {
    request.current.version++;
    setSelection(null);
  }
  return (
    <div className="section-stack">
      <SectionHeading
        title="리비전"
        description="동료와 공유한 변경과 문제 자료의 스냅샷을 확인합니다."
      />
      <section className="card no-padding">
        <table className="data-table">
          <thead>
            <tr>
              <th>리비전</th>
              <th>변경 내용</th>
              <th>작성자</th>
              <th>시각</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.number}>
                <td>
                  <Badge
                    tone={
                      row.number === data.problem.revision
                        ? 'accent'
                        : 'neutral'
                    }
                  >
                    r{row.number}
                  </Badge>
                </td>
                <td>
                  <strong className="small">{row.message}</strong>
                  {row.minor && <div className="subtext">작은 변경</div>}
                </td>
                <td>{row.author}</td>
                <td className="subtext">{time(row.created_at)}</td>
                <td>
                  <button
                    className="button small"
                    aria-label={`r${row.number} 자료 확인`}
                    onClick={() => void view(row)}
                  >
                    자료 확인
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {selected && (
        <Modal
          wide
          className="revision-review-modal"
          title={`${selected.revision.number > 0 ? `r${selected.revision.number - 1} → r${selected.revision.number}` : 'r0 · 최초 등록'} · ${selected.revision.message}`}
          onClose={close}
          footer={
            <>
              <div className="revision-review-meta">
                <strong>{selected.revision.author}</strong>
                <span>{time(selected.revision.created_at)}</span>
              </div>
              <button className="button" onClick={close}>
                닫기
              </button>
            </>
          }
        >
          {selected.error ? (
            <Notice tone="error">
              <p>리비전 자료를 불러오지 못했습니다. {selected.error}</p>
              <button
                className="button small"
                onClick={() => void view(selected.revision)}
              >
                다시 불러오기
              </button>
            </Notice>
          ) : !selected.document ? (
            <p role="status">
              이전 리비전과 현재 리비전의 자료를 비교하고 있습니다.
            </p>
          ) : (
            <>
              <RevisionChanges
                key={`${problemId}-${selected.revision.number}`}
                problemId={problemId}
                before={selected.before}
                after={selected.document}
              />
              <div className="revision-snapshot-downloads">
                <span>전체 자료 보관</span>
                {selected.revision.number > 0 && (
                  <a
                    href={`/api/problems/${problemId}/revisions/${selected.revision.number - 1}`}
                    download={`revision-${selected.revision.number - 1}.json`}
                  >
                    이전 리비전 JSON
                  </a>
                )}
                <a
                  href={`/api/problems/${problemId}/revisions/${selected.revision.number}`}
                  download={`revision-${selected.revision.number}.json`}
                >
                  현재 리비전 JSON
                </a>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
