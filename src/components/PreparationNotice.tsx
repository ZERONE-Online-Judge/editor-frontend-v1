import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, post } from '../lib/api';
import type { WorkspaceData } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { Icon } from './ui';

export default function PreparationNotice({
  onPendingChange,
}: {
  onPendingChange: (
    rows: NonNullable<WorkspaceData['pending_preparations']>,
  ) => void;
}) {
  const { data, dirty, editable, save, reload, notify } = useWorkspace();
  const [state, setState] = useState({
    version: data.version,
    pending_preparations: data.pending_preparations || [],
  });
  const [applying, setApplying] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: number;
    async function poll() {
      try {
        const value = await api<{
          version: number;
          pending_preparations: NonNullable<
            WorkspaceData['pending_preparations']
          >;
        }>(`/problems/${data.problem.id}/preparation-status`);
        if (active) {
          setState(value);
          onPendingChange(value.pending_preparations);
          if (value.version !== data.version && !dirty) await reload(true);
        }
      } catch {
        /* The main workspace reports connection and save errors. */
      }
      if (active) timer = window.setTimeout(() => void poll(), 5000);
    }
    if (editable) void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [data.problem.id, data.version, dirty, editable, reload, onPendingChange]);
  const rows = state.pending_preparations.filter((row) => !row.stale);
  const changed = state.version !== data.version;
  if (!editable || (!rows.length && !changed)) return null;
  return (
    <aside
      className="preparation-banner"
      role="status"
      aria-label="입력·정답 생성 결과"
    >
      <Icon name={changed ? 'issue' : 'tests'} />
      <div>
        <strong>
          {changed
            ? '다른 창 또는 자동 반영으로 작업 사본이 변경되었습니다.'
            : `입력·정답 생성 완료 · 미반영 결과 ${rows.length}개`}
        </strong>
        <p>
          {changed
            ? '저장하지 않은 내용은 현재 화면에 유지됩니다. 최신 자료를 확인한 뒤 변경을 다시 반영하세요.'
            : '작업은 성공했지만 입력과 정답은 아직 내 작업 사본에 반영되지 않았습니다. 새 검증을 실행하기 전에 결과를 확인하거나 반영하세요.'}
        </p>
      </div>
      <div className="actions">
        {changed ? (
          <button
            className="button"
            disabled={dirty}
            title={dirty ? '저장하지 않은 내용을 먼저 복사해 보관하세요.' : ''}
            onClick={() => void reload()}
          >
            최신 자료 불러오기
          </button>
        ) : (
          <>
            <Link
              className="button"
              to={`/problems/${data.problem.id}/invocations?job=${rows[0].id}`}
            >
              실행 결과로 이동
            </Link>
            <button
              className="button primary"
              disabled={dirty || applying}
              title={
                dirty
                  ? '실행 이후 편집한 내용이 있습니다. 저장 후 다시 생성하세요.'
                  : ''
              }
              onClick={async () => {
                setApplying(true);
                try {
                  const version = await save();
                  await post(
                    `/problems/${data.problem.id}/jobs/${rows[0].id}/apply`,
                    { version },
                  );
                  await reload(true);
                  setState({ ...state, pending_preparations: [] });
                  notify('생성된 입력과 정답을 내 작업 사본에 반영했습니다.');
                } catch (e) {
                  notify((e as Error).message, true);
                } finally {
                  setApplying(false);
                }
              }}
            >
              {applying ? '반영 중…' : '작업 사본에 반영'}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
