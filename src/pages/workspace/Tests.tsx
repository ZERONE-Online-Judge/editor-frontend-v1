import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { blobText, upload } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import type { Test } from '../../lib/types';
import {
  Badge,
  CodeEditor,
  Empty,
  Icon,
  Modal,
  Notice,
  SectionHeading,
} from '../../components/ui';
export default function Tests() {
  const { data, document: doc, mutate, editable, run, notify } = useWorkspace();
  const [selected, setSelected] = useState(
    Object.keys(doc.testsets)[0] || 'tests',
  );
  const [newSet, setNewSet] = useState('');
  const [editing, setEditing] = useState<Test | null | false>(false);
  const [groups, setGroups] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoApply, setAutoApply] = useState(false);
  const set = doc.testsets[selected];
  const rows = Object.values(set?.tests || {}).sort(
    (a, b) => a.index - b.index,
  );
  async function importFiles(files: File[]) {
    setBusy(true);
    try {
      const pairs = new Map<string, { input?: File; answer?: File }>();
      for (const file of files) {
        const match = file.name.match(/^(.*)\.(in|out|a)$/i);
        if (!match)
          throw new Error(
            '같은 이름의 .in 입력과 .out 또는 .a 출력을 선택하세요.',
          );
        const pair = pairs.get(match[1]) || {};
        if (match[2].toLowerCase() === 'in') pair.input = file;
        else pair.answer = file;
        pairs.set(match[1], pair);
      }
      let index = Math.max(0, ...rows.map((t) => t.index)) + 1;
      for (const [name, pair] of pairs) {
        if (!pair.input) throw new Error(`${name}: 입력 파일이 없습니다.`);
        const inp = await upload(data.problem.id, pair.input);
        const ans = pair.answer
          ? await upload(data.problem.id, pair.answer)
          : null;
        const test: Test = {
          index: index++,
          input_sha: inp.sha256,
          answer_sha: ans?.sha256 || null,
          command: '',
          group: '',
          points: 0,
          description: name,
          sample: false,
        };
        mutate((d) => {
          d.testsets[selected].tests[String(test.index)] = test;
        });
      }
      notify('테스트 파일을 작업 사본에 추가했습니다.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="section-stack">
      <SectionHeading
        title="테스트 · 생성 스크립트"
        description="직접 입력과 생성기로 테스트를 준비하고, validator와 Main 풀이로 입력·정답을 확인합니다."
        actions={
          <>
            <button
              className="button primary"
              disabled={!editable || busy}
              onClick={() =>
                void run('prepare', {
                  testset: selected,
                  auto_apply: autoApply,
                }).catch((e) => notify(e.message, true))
              }
            >
              <Icon name="play" />
              입력·정답 생성
            </button>
            {Object.keys(doc.testsets).length > 1 && (
              <button
                className="button"
                disabled={!editable || busy}
                onClick={() =>
                  void run('prepare', {
                    testset: selected,
                    all_testsets: true,
                    auto_apply: autoApply,
                  }).catch((e) => notify(e.message, true))
                }
              >
                전체 테스트 세트 생성
              </button>
            )}
            <Link
              className="button"
              to={`/problems/${data.problem.id}/invocations`}
            >
              실행 결과
            </Link>
          </>
        }
      />
      <p className="muted small">
        ‘입력·정답 생성’은 현재 선택한 <strong>{selected}</strong> 세트만
        처리합니다.
      </p>
      <label className="checkbox generation-auto-apply">
        <input
          type="checkbox"
          checked={autoApply}
          disabled={!editable || busy}
          onChange={(e) => setAutoApply(e.target.checked)}
        />
        성공하면 내 작업 사본에 자동 반영
        <small>실행 이후 저장된 자료가 바뀌면 반영하지 않습니다.</small>
      </label>
      <div className="card language-toolbar">
        <div className="tabs">
          {Object.keys(doc.testsets).map((name) => (
            <button
              className={name === selected ? 'active' : ''}
              key={name}
              onClick={() => setSelected(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="inline-form">
          <input
            aria-label="새 테스트 세트 이름"
            value={newSet}
            onChange={(e) => setNewSet(e.target.value)}
            placeholder="새 테스트 세트"
          />
          <button
            className="button small"
            disabled={
              !editable ||
              !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(newSet) ||
              Boolean(doc.testsets[newSet])
            }
            onClick={() => {
              mutate((d) => {
                d.testsets[newSet] = {
                  tests: {},
                  script: '',
                  groups_enabled: false,
                  groups: {},
                };
              });
              setSelected(newSet);
              setNewSet('');
            }}
          >
            세트 추가
          </button>
        </div>
      </div>
      {set && (
        <>
          <section className="card">
            <SectionHeading
              title="생성 스크립트"
              description={
                <>
                  <code>gen 100 42 &gt; 1</code>은 1번 테스트를,{' '}
                  <code>gen 100 43 &gt; $</code>는 다음 빈 번호를 생성합니다.
                </>
              }
            />
            <CodeEditor
              value={set.script}
              onChange={(value) =>
                mutate((d) => {
                  d.testsets[selected].script = value;
                })
              }
              label={`${selected} · 생성 스크립트`}
              rows={7}
              readOnly={!editable}
            />
            <p className="muted small">
              파일에 등록한 생성기를 사용하세요. 이 스크립트는 셸 명령이 아닌
              테스트 생성 규칙으로 처리합니다.
            </p>
          </section>
          <section className="card no-padding">
            <div className="card-heading">
              <div>
                <h3>
                  등록 테스트 <span className="count">{rows.length}</span>
                </h3>
                <p>
                  각 테스트의 ‘입력·출력 보기’ 버튼에서 내용을 확인할 수
                  있습니다.
                </p>
              </div>
              <div className="actions">
                <button className="button" onClick={() => setGroups(true)}>
                  <Icon name="folder" />
                  그룹 관리
                </button>
                <label
                  className={`button ${!editable || busy ? 'disabled' : ''}`}
                >
                  <Icon name="upload" />
                  입출력 파일
                  <input
                    className="sr-only"
                    type="file"
                    accept=".in,.out,.a"
                    multiple
                    disabled={!editable || busy}
                    onChange={(e) => {
                      void importFiles(Array.from(e.target.files || []));
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  className="button"
                  disabled={!editable}
                  onClick={() => setEditing(null)}
                >
                  <Icon name="plus" />
                  직접 입력
                </button>
              </div>
            </div>
            {rows.length ? (
              <div className="table-scroll">
                <table className="data-table tests-table">
                  <thead>
                    <tr>
                      <th>번호</th>
                      <th>테스트 내용</th>
                      <th>그룹</th>
                      {doc.info.points_enabled && <th>점수</th>}
                      <th>지문 예제</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((test) => (
                      <tr key={test.index}>
                        <td>
                          <Badge>#{test.index}</Badge>
                        </td>
                        <td>
                          <strong className="small">
                            {test.description || '등록 테스트'}
                          </strong>
                          <div className="subtext code-text">
                            {test.command || '직접 입력'}
                            {test.answer_sha && ' · 기대 출력 있음'}
                          </div>
                          <button
                            className="button small test-content-button"
                            aria-label={`테스트 ${test.index} 입력·출력 보기`}
                            aria-haspopup="dialog"
                            onClick={() => setEditing(test)}
                          >
                            <Icon name="file" size={15} />
                            입력·출력 보기
                          </button>
                        </td>
                        <td>
                          <select
                            disabled={!editable || !set.groups_enabled}
                            aria-label={`테스트 ${test.index} 그룹`}
                            value={test.group}
                            onChange={(e) =>
                              mutate((d) => {
                                const item = Object.values(
                                  d.testsets[selected].tests,
                                ).find((t) => t.index === test.index);
                                if (item) item.group = e.target.value;
                              })
                            }
                          >
                            <option value="">미지정</option>
                            {Object.keys(set.groups).map((g) => (
                              <option key={g}>{g}</option>
                            ))}
                          </select>
                        </td>
                        {doc.info.points_enabled && (
                          <td>
                            <input
                              aria-label={`테스트 ${test.index} 점수`}
                              className="tiny-input"
                              type="number"
                              min={0}
                              step={0.01}
                              value={test.points}
                              disabled={!editable}
                              onChange={(e) =>
                                mutate((d) => {
                                  const item = Object.values(
                                    d.testsets[selected].tests,
                                  ).find((t) => t.index === test.index);
                                  if (item)
                                    item.points = Number(e.target.value);
                                })
                              }
                            />
                          </td>
                        )}
                        <td>
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={test.sample}
                              disabled={!editable}
                              onChange={(e) =>
                                mutate((d) => {
                                  const item = Object.values(
                                    d.testsets[selected].tests,
                                  ).find((t) => t.index === test.index);
                                  if (item) item.sample = e.target.checked;
                                })
                              }
                            />
                            {test.sample && <Badge tone="accent">예제</Badge>}
                          </label>
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            disabled={!editable}
                            aria-label={`테스트 ${test.index} 제거`}
                            onClick={() =>
                              mutate((d) => {
                                for (const [key, value] of Object.entries(
                                  d.testsets[selected].tests,
                                ))
                                  if (value.index === test.index)
                                    delete d.testsets[selected].tests[key];
                              })
                            }
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                icon="tests"
                title="아직 등록한 테스트가 없습니다."
                description="직접 입력, 파일 업로드 또는 생성 스크립트로 테스트를 준비하세요."
              />
            )}
          </section>
        </>
      )}
      {editing !== false && (
        <TestEditor
          test={editing}
          testset={selected}
          onClose={() => setEditing(false)}
        />
      )}{' '}
      {groups && (
        <GroupEditor testset={selected} onClose={() => setGroups(false)} />
      )}
    </div>
  );
}
function TestEditor({
  test,
  testset,
  onClose,
}: {
  test: Test | null;
  testset: string;
  onClose: () => void;
}) {
  const { data, document: doc, editable, mutate } = useWorkspace();
  const [index, setIndex] = useState(
    test?.index ||
      Math.max(
        0,
        ...Object.values(doc.testsets[testset].tests).map((t) => t.index),
      ) + 1,
  );
  const [input, setInput] = useState('');
  const [answer, setAnswer] = useState('');
  const [description, setDescription] = useState(test?.description || '');
  const [sample, setSample] = useState(test?.sample || false);
  const [busy, setBusy] = useState(Boolean(test));
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (test) {
      Promise.all([
        test.input_sha
          ? blobText(data.problem.id, test.input_sha)
          : Promise.resolve(''),
        test.answer_sha
          ? blobText(data.problem.id, test.answer_sha)
          : Promise.resolve(''),
      ])
        .then(([inp, ans]) => {
          if (active) {
            setInput(inp);
            setAnswer(ans);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }
    return () => {
      active = false;
    };
  }, [test, data.problem.id]);
  async function submit() {
    if (!Number.isInteger(index) || index < 1 || index > 1000) {
      setError('테스트 번호는 1~1000의 정수여야 합니다.');
      return;
    }
    if (
      Object.values(doc.testsets[testset].tests).some(
        (t) => t.index === index && t.index !== test?.index,
      )
    ) {
      setError('같은 번호의 테스트가 있습니다.');
      return;
    }
    setBusy(true);
    try {
      const inp = await upload(data.problem.id, input);
      const ans = answer ? await upload(data.problem.id, answer) : null;
      const item: Test = {
        index,
        input_sha: inp.sha256,
        answer_sha: ans?.sha256 || null,
        command: changed ? '' : test?.command || '',
        group: test?.group || '',
        points: test?.points || 0,
        description,
        sample,
      };
      mutate((d) => {
        if (test)
          for (const [key, value] of Object.entries(d.testsets[testset].tests))
            if (value.index === test.index)
              delete d.testsets[testset].tests[key];
        d.testsets[testset].tests[String(index)] = item;
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={test ? `테스트 #${test.index} · 입력·출력` : '직접 입력 테스트'}
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            닫기
          </button>
          {editable && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void submit()}
            >
              작업 사본에 반영
            </button>
          )}
        </>
      }
    >
      <fieldset disabled={!editable || busy} className="form-grid">
        <label>
          테스트 번호
          <input
            type="number"
            min={1}
            max={1000}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          />
        </label>
        <label>
          설명
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={sample}
            onChange={(e) => setSample(e.target.checked)}
          />
          문제 지문에 예제로 표시
        </label>
      </fieldset>
      {test?.command && (
        <p className="muted code-text">생성 명령: {test.command}</p>
      )}
      <div className="form-grid">
        <CodeEditor
          value={input}
          onChange={(value) => {
            setInput(value);
            setChanged(true);
          }}
          label="테스트 입력"
          rows={10}
          readOnly={!editable || busy}
        />
        <CodeEditor
          value={answer}
          onChange={setAnswer}
          label={
            doc.info.interactive
              ? 'Interactor 참고 자료 · 선택'
              : '기대 출력 · 작성 중 참고용 (선택)'
          }
          rows={10}
          readOnly={!editable || busy}
        />
      </div>
      <p className="muted small">
        {doc.info.interactive
          ? '이 값은 Interactor가 읽는 참고 자료로 전달됩니다. 입력·정답 생성에서도 이 자료를 유지하며, Main과 Interactor의 대화 내용을 기대 출력으로 덮어쓰지 않습니다. Interactor가 참고 자료를 사용하지 않으면 비워 두세요.'
          : '입력한 기대 출력은 작성 중 참고용입니다. ‘입력·정답 생성’을 실행하면 validator 검사 후 Main 풀이 출력으로 교체됩니다. 생성 결과를 작업 사본에 반영하면 교체한 기대 출력이 저장됩니다.'}
      </p>
      {error && <Notice tone="error">{error}</Notice>}
    </Modal>
  );
}
function GroupEditor({
  testset,
  onClose,
}: {
  testset: string;
  onClose: () => void;
}) {
  const { document: doc, mutate, editable } = useWorkspace();
  const [name, setName] = useState('');
  const groups = doc.testsets[testset].groups;
  return (
    <Modal
      wide
      title="테스트 그룹"
      onClose={onClose}
      footer={
        <button className="button primary" onClick={onClose}>
          확인
        </button>
      }
    >
      <label className="checkbox">
        <input
          type="checkbox"
          disabled={!editable}
          checked={doc.testsets[testset].groups_enabled}
          onChange={(e) =>
            mutate((d) => {
              d.testsets[testset].groups_enabled = e.target.checked;
              if (!e.target.checked)
                for (const test of Object.values(d.testsets[testset].tests))
                  test.group = '';
            })
          }
        />
        테스트 그룹 사용
      </label>
      <p className="muted">
        점수 정책과 피드백 범위, 선행 그룹 의존성을 지정합니다. 그룹별 점수는
        등록 테스트 점수에서 결정합니다.
      </p>
      <div className="inline-form">
        <input
          aria-label="새 그룹 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="subtask-1"
        />
        <button
          className="button"
          disabled={!editable || !name || Boolean(groups[name])}
          onClick={() => {
            mutate((d) => {
              d.testsets[testset].groups[name] = {
                points_policy: 'COMPLETE_GROUP',
                feedback_policy: 'COMPLETE',
                dependencies: [],
              };
            });
            setName('');
          }}
        >
          그룹 추가
        </button>
      </div>
      {Object.entries(groups).map(([key, g]) => (
        <div className="group-row" key={key}>
          <strong>{key}</strong>
          <div className="form-grid">
            <label>
              점수 정책
              <select
                value={g.points_policy}
                disabled={!editable}
                onChange={(e) =>
                  mutate((d) => {
                    d.testsets[testset].groups[key].points_policy = e.target
                      .value as 'COMPLETE_GROUP' | 'EACH_TEST';
                  })
                }
              >
                <option value="COMPLETE_GROUP">그룹 전체 통과</option>
                <option value="EACH_TEST">테스트별 점수</option>
              </select>
            </label>
            <label>
              피드백
              <select
                value={g.feedback_policy}
                disabled={!editable}
                onChange={(e) =>
                  mutate((d) => {
                    d.testsets[testset].groups[key].feedback_policy = e.target
                      .value as 'NONE' | 'POINTS' | 'ICPC' | 'COMPLETE';
                  })
                }
              >
                {['NONE', 'POINTS', 'ICPC', 'COMPLETE'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              의존 그룹
              <input
                value={g.dependencies.join(', ')}
                disabled={!editable}
                onChange={(e) =>
                  mutate((d) => {
                    d.testsets[testset].groups[key].dependencies =
                      e.target.value
                        .split(',')
                        .map((n) => n.trim())
                        .filter(Boolean);
                  })
                }
                placeholder="subtask-1, subtask-2"
              />
            </label>
            <button
              className="button danger"
              disabled={!editable}
              onClick={() =>
                mutate((d) => {
                  delete d.testsets[testset].groups[key];
                  for (const source of Object.values(d.solutions)) {
                    if (source.group_tags?.[testset]) {
                      delete source.group_tags[testset][key];
                      if (!Object.keys(source.group_tags[testset]).length)
                        delete source.group_tags[testset];
                    }
                    if (!d.testsets[key]) delete source.extra_tags[key];
                  }
                  for (const test of Object.values(d.testsets[testset].tests))
                    if (test.group === key) test.group = '';
                  for (const group of Object.values(d.testsets[testset].groups))
                    group.dependencies = group.dependencies.filter(
                      (n) => n !== key,
                    );
                })
              }
            >
              그룹 제거
            </button>
          </div>
        </div>
      ))}
    </Modal>
  );
}
