import Pagination from '../../components/Pagination';
import { usePagination } from '../../lib/pagination';
import Select from '../../components/Select';
import { can } from '../../lib/permissions';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { upload } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import type { UnitTest } from '../../lib/types';
import { sourceRoles } from '../../lib/sourceRoles';
import {
  Badge,
  CodeEditor,
  Empty,
  Icon,
  Modal,
  Notice,
  SectionHeading,
} from '../../components/ui';
export default function ComponentTests({
  kind,
}: {
  kind: 'checker' | 'validator' | 'interactor';
}) {
  const { data, document: doc, mutate, editable, run, notify } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const sources = Object.values(doc.files).filter(
    (f) =>
      f.kind === 'source' &&
      f.language !== 'text' &&
      sourceRoles(doc, f.name).includes(kind),
  );
  const unitKey = kind === 'checker' ? 'checker_tests' : 'validator_tests';
  const tests = Object.entries(doc[unitKey]);
  const paging = usePagination(tests, `${data.problem.id}/${kind}`);
  const title = kind[0].toUpperCase() + kind.slice(1);
  return (
    <div className="section-stack">
      <SectionHeading
        title={title}
        description={
          kind === 'validator'
            ? '테스트 입력이 문제의 조건과 형식에 맞는지 검사합니다.'
            : kind === 'checker'
              ? '참가자 출력과 기대 출력을 비교해 정답 여부를 판정합니다.'
              : '채점 프로그램과 풀이 사이의 양방향 대화를 처리합니다.'
        }
      />
      <section className="card">
        <label>
          사용할 {title} 프로그램
          <Select
            value={doc[kind]}
            disabled={!editable}
            onChange={(e) =>
              mutate((d) => {
                d[kind] = e.target.value;
              })
            }
          >
            <option value="">선택하지 않음</option>
            {kind === 'checker' &&
              [
                ['std::wcmp', 'wcmp · 공백을 무시하고 토큰 비교'],
                ['std::fcmp', 'fcmp · 줄 단위 비교'],
                ['std::ncmp', 'ncmp · 정수 비교'],
                ['std::rcmp4', 'rcmp4 · 실수 오차 10⁻⁴'],
                ['std::rcmp6', 'rcmp6 · 실수 오차 10⁻⁶'],
                ['std::rcmp9', 'rcmp9 · 실수 오차 10⁻⁹'],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            {sources.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </Select>
        </label>
        {kind === 'validator' && (
          <>
            <h3 className="mt-section">추가 Validator</h3>
            <div className="checkbox-list">
              {sources
                .filter((f) => f.name !== doc.validator)
                .map((file) => (
                  <label className="checkbox" key={file.name}>
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={doc.extra_validators.includes(file.name)}
                      onChange={(e) =>
                        mutate((d) => {
                          d.extra_validators = e.target.checked
                            ? [...d.extra_validators, file.name]
                            : d.extra_validators.filter((n) => n !== file.name);
                        })
                      }
                    />
                    {file.name}
                  </label>
                ))}
            </div>
            <p className="muted small">
              기본 validator에 더해 모두 통과해야 유효한 테스트가 됩니다.
            </p>
          </>
        )}
        <Link className="text-link" to={`/problems/${data.problem.id}/files`}>
          <Icon name="code" size={15} />
          소스 파일 관리
        </Link>
        <p className="muted small">
          파일 · 리소스에서 {title} 역할을 지정한 소스만 표시합니다. 기존에
          연결한 프로그램은 그대로 표시됩니다.
        </p>
      </section>
      {kind !== 'interactor' && (
        <section className="card no-padding">
          <div className="card-heading">
            <div>
              <h3>{title} 자체 테스트</h3>
              <p>
                프로그램 자체가 유효·무효 자료를 정확히 구분하는지 확인합니다.
              </p>
            </div>
            <div className="actions">
              <button
                className="button"
                disabled={!can(data.problem, 'execute') || !doc[kind]}
                onClick={() =>
                  void run(
                    kind === 'checker' ? 'checker-tests' : 'validator-tests',
                  ).catch((e) => notify(e.message, true))
                }
              >
                <Icon name="play" />
                테스트 실행
              </button>
              <button
                className="button primary"
                disabled={!editable}
                onClick={() => setAdding(true)}
              >
                <Icon name="plus" />
                테스트 추가
              </button>
            </div>
          </div>
          {tests.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>테스트</th>
                  <th>기대 판정</th>
                  <th>입력 자료</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {paging.items.map(([id, test], position) => {
                  const index = paging.offset + position;
                  return (
                    <tr key={id}>
                      <td>#{index + 1}</td>
                      <td>
                        <Badge
                          tone={
                            test.expected === 'VALID' || test.expected === 'OK'
                              ? 'success'
                              : 'warning'
                          }
                        >
                          {test.expected}
                        </Badge>
                      </td>
                      <td>
                        <a
                          className="text-link"
                          href={`/api/problems/${data.problem.id}/blobs/${test.input_sha}`}
                          download={`unit-${index + 1}.in`}
                        >
                          입력 다운로드
                        </a>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          disabled={!editable}
                          aria-label={`자체 테스트 ${index + 1} 제거`}
                          onClick={() =>
                            mutate((d) => {
                              delete d[unitKey][id];
                            })
                          }
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Empty
              icon="tests"
              title="자체 테스트를 추가하세요."
              description={
                kind === 'validator'
                  ? '조건에 맞는 입력과 조건을 벗어나는 입력을 모두 준비하세요.'
                  : '같은 입력에 올바른 출력과 틀린 출력을 넣어 검사하세요.'
              }
            />
          )}
        </section>
      )}
      <Pagination {...paging} label={`${title} 자체 테스트`} />
      {kind === 'interactor' && (
        <div className="workspace-guide">
          <Icon name="help" />
          <p>
            Interactor와 풀이를 별도 사용자 권한으로 실행하고 표준 입력·출력
            파이프를 연결합니다. 대화가 종료된 후 checker로 기록을 확인합니다.
          </p>
        </div>
      )}
      {adding && (
        <UnitModal
          kind={kind as 'checker' | 'validator'}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
function UnitModal({
  kind,
  onClose,
}: {
  kind: 'checker' | 'validator';
  onClose: () => void;
}) {
  const { data, mutate } = useWorkspace();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [answer, setAnswer] = useState('');
  const [expected, setExpected] = useState(kind === 'checker' ? 'OK' : 'VALID');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true);
    try {
      const inp = await upload(data.problem.id, input);
      const out =
        kind === 'checker' ? await upload(data.problem.id, output) : null;
      const ans =
        kind === 'checker' ? await upload(data.problem.id, answer) : null;
      const test: UnitTest = {
        input_sha: inp.sha256,
        output_sha: out?.sha256 || null,
        answer_sha: ans?.sha256 || null,
        expected,
      };
      mutate((d) => {
        d[kind === 'checker' ? 'checker_tests' : 'validator_tests'][
          crypto.randomUUID()
        ] = test;
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
      title="자체 테스트 추가"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            취소
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            추가
          </button>
        </>
      }
    >
      <label>
        기대 판정
        <Select value={expected} onChange={(e) => setExpected(e.target.value)}>
          {(kind === 'checker'
            ? ['OK', 'WRONG_ANSWER', 'PRESENTATION_ERROR', 'CRASHED']
            : ['VALID', 'INVALID']
          ).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
      </label>
      <CodeEditor
        value={input}
        onChange={setInput}
        label="테스트 입력"
        rows={6}
      />
      {kind === 'checker' && (
        <div className="form-grid">
          <CodeEditor
            value={answer}
            onChange={setAnswer}
            label="기대 출력"
            rows={6}
          />
          <CodeEditor
            value={output}
            onChange={setOutput}
            label="검사할 참가자 출력"
            rows={6}
          />
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </Modal>
  );
}
