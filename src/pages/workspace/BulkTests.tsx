import Select from '../../components/Select';
import { useState } from 'react';
import { Modal } from '../../components/ui';
import { useWorkspace } from '../../lib/workspace';
import { bulkTests, type BulkAction } from '../../lib/bulkTests';
import { executionCategories } from '../../lib/executionCategories';

export default function BulkTests({
  setName,
  indices,
  reset,
}: {
  setName: string;
  indices: number[];
  reset: () => void;
}) {
  const { document: doc, data, mutate, editable, run, notify } = useWorkspace();
  const [action, setAction] = useState<BulkAction>('group'),
    [group, setGroup] = useState(''),
    [description, setDescription] = useState(''),
    [target, setTarget] = useState('');
  const [confirm, setConfirm] = useState<BulkAction | null>(null),
    [busy, setBusy] = useState(false);
  const destination =
    action === 'copy' || action === 'move'
      ? doc.testsets[target]
      : doc.testsets[setName];
  const scripted = !!doc.testsets[setName].script.trim();
  function apply(kind = action) {
    if (!editable || busy || scripted) return;
    try {
      const ids =
        kind === 'renumber'
          ? Object.values(doc.testsets[setName].tests).map((t) => t.index)
          : indices;
      const next = bulkTests(doc, setName, ids, kind, {
        group,
        description,
        target,
        limit: data.limits?.tests_per_set,
      });
      mutate((d) => {
        d.testsets = next.testsets;
      });
      reset();
      setConfirm(null);
      notify(`${ids.length}개 테스트를 작업 사본에 반영했습니다.`);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function prepare(mode: 'full' | 'inputs' | 'validate' | 'answers') {
    setBusy(true);
    try {
      await run('prepare', {
        testset: setName,
        test_indices: indices,
        prepare_mode: mode,
        name: `${executionCategories.find((category) => category.id === `prepare-${mode}`)?.label} · 선택 ${indices.length}개`,
      });
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="test-bulk-actions">
      <strong>선택한 테스트 {indices.length}개</strong>
      {scripted && (
        <p className="muted small">
          전체 입력·정답을 생성하고 결과를 반영하면 일괄 작업과 부분 재생성을
          사용할 수 있습니다.
        </p>
      )}
      <fieldset className="form-grid" disabled={!editable || busy || scripted}>
        <label>
          일괄 작업
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value as BulkAction);
              setGroup('');
            }}
          >
            {Object.entries({
              group: '그룹 변경',
              description: '설명 변경',
              'sample-on': '예제 지정',
              'sample-off': '예제 해제',
              copy: '다른 세트로 복사',
              move: '다른 세트로 이동',
              delete: '삭제',
            }).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </Select>
        </label>
        {(action === 'copy' || action === 'move') && (
          <label>
            대상 테스트 세트
            <Select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setGroup('');
              }}
            >
              <option value="">다른 세트 선택</option>
              {Object.keys(doc.testsets)
                .filter((name) => name !== setName)
                .map((name) => (
                  <option key={name}>{name}</option>
                ))}
            </Select>
          </label>
        )}
        {(action === 'group' || action === 'copy' || action === 'move') && (
          <label>
            적용할 그룹
            <Select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">그룹 없음</option>
              {destination?.groups_enabled &&
                Object.keys(destination.groups).map((name) => (
                  <option key={name}>{name}</option>
                ))}
            </Select>
          </label>
        )}
        {action === 'description' && (
          <label>
            공통 설명
            <input
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        )}
        <div className="actions span-2">
          <button
            className="button"
            disabled={!indices.length}
            onClick={() =>
              action === 'delete' ? setConfirm('delete') : apply()
            }
          >
            선택 테스트에 적용
          </button>
          <button
            className="button"
            onClick={() => setConfirm('renumber')}
            disabled={!Object.keys(doc.testsets[setName].tests).length}
          >
            전체 번호 다시 정렬
          </button>
        </div>
        <div className="actions span-2">
          {(
            [
              ['full', '선택 테스트 입력·정답 재생성'],
              ['inputs', '선택 입력만 재생성'],
              ['validate', '선택 입력 Validator 검사'],
              ['answers', '선택 정답만 재생성'],
            ] as const
          ).map(([mode, label]) => (
            <button
              className="button small"
              key={mode}
              disabled={!indices.length}
              onClick={() => void prepare(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="muted small">
        입력만 재생성해 내용이 바뀌면 기존 정답을 비웁니다. 정답만 재생성할 때는
        저장된 입력을 검사하고 Main을 실행합니다. 실행 결과는 확인 후
        반영하세요.
      </p>
      {confirm && (
        <Modal
          title={
            confirm === 'delete'
              ? '선택 테스트를 제거할까요?'
              : '전체 테스트 번호를 다시 정렬할까요?'
          }
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="button" onClick={() => setConfirm(null)}>
                취소
              </button>
              <button className="button danger" onClick={() => apply(confirm)}>
                작업 사본에 반영
              </button>
            </>
          }
        >
          <p>
            {confirm === 'delete'
              ? `${indices.length}개 테스트를 작업 사본에서 제거합니다.`
              : '현재 순서를 유지하며 전체 테스트 번호를 1부터 이어 붙입니다.'}{' '}
            기존 리비전과 실행 기록은 보존됩니다.
          </p>
        </Modal>
      )}
    </div>
  );
}
