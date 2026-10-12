import { useEffect, useState } from 'react';
import { api, time } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import type { ProblemDocument, Revision } from '../../lib/types';
import {
  Badge,
  CodeEditor,
  Icon,
  Modal,
  SectionHeading,
} from '../../components/ui';
function diff(before: unknown, after: unknown, path = ''): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const a = before as Record<string, unknown>;
    const b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) =>
      diff(a[key], b[key], path ? `${path} / ${key}` : key),
    );
  }
  return [path];
}
export default function Revisions() {
  const { data, notify } = useWorkspace();
  const [rows, setRows] = useState<Revision[]>([]);
  const [selected, setSelected] = useState<{
    revision: Revision;
    document: ProblemDocument;
    before: ProblemDocument | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    api<Revision[]>(`/problems/${data.problem.id}/revisions`)
      .then((values) => {
        if (active) setRows(values);
      })
      .catch((e) => {
        if (active) notify(e.message, true);
      });
    return () => {
      active = false;
    };
  }, [data.problem.id, notify]);
  async function view(row: Revision) {
    try {
      const [d, b] = await Promise.all([
        api<ProblemDocument>(
          `/problems/${data.problem.id}/revisions/${row.number}`,
        ),
        row.number > 0
          ? api<ProblemDocument>(
              `/problems/${data.problem.id}/revisions/${row.number - 1}`,
            )
          : Promise.resolve(null),
      ]);
      setSelected({ revision: row, document: d, before: b });
    } catch (e) {
      notify((e as Error).message, true);
    }
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
          title={`r${selected.revision.number} · ${selected.revision.message}`}
          onClose={() => setSelected(null)}
          footer={
            <button className="button" onClick={() => setSelected(null)}>
              닫기
            </button>
          }
        >
          <h3>이전 리비전에서 변경한 항목</h3>
          <div className="revision-diff">
            {diff(selected.before, selected.document).map((path) => (
              <div key={path}>
                <Icon name="branch" size={15} />
                <code>{path || '새 문제'}</code>
              </div>
            ))}
          </div>
          <details>
            <summary>이 리비전의 전체 자료</summary>
            <CodeEditor
              value={JSON.stringify(selected.document, null, 2)}
              readOnly
              label="리비전 스냅샷"
              rows={20}
            />
          </details>
          <div className="muted small">
            파일 내용은 자료 해시로 고정됩니다. 같은 해시의 파일은 리비전과 실행
            기록에서 재사용합니다.
          </div>
        </Modal>
      )}
    </div>
  );
}
