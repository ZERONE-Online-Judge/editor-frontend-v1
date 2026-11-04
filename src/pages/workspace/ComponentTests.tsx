import Pagination from '../../components/Pagination';
import { usePagination } from '../../lib/pagination';
import Select from '../../components/Select';
import { can } from '../../lib/permissions';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { blobText, upload } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import type { UnitTest } from '../../lib/types';
import { sourceRoles } from '../../lib/sourceRoles';
import {
  normalizeBlobLf,
  type BlobTextFormat,
} from '../../lib/componentTextFormats';
import { useComponentTextFormats } from '../../lib/useComponentTextFormats';
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
  const { data } = useWorkspace();
  return <ComponentTestsPage key={`${data.problem.id}/${kind}`} kind={kind} />;
}
function ComponentTestsPage({
  kind,
}: {
  kind: 'checker' | 'validator' | 'interactor';
}) {
  const { data, document: doc, mutate, editable, run, notify } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<{
    id: string;
    test: UnitTest;
    number: number;
  } | null>(null);
  const sources = Object.values(doc.files).filter(
    (f) =>
      f.kind === 'source' &&
      f.language !== 'text' &&
      sourceRoles(doc, f.name).includes(kind),
  );
  const unitKey = kind === 'checker' ? 'checker_tests' : 'validator_tests';
  const tests = Object.entries(doc[unitKey]);
  const fields =
    kind === 'checker'
      ? ([
          ['input_sha', '입력'],
          ['answer_sha', '기대 출력'],
          ['output_sha', '참가자 출력'],
        ] as const)
      : ([['input_sha', '입력']] as const);
  const hashKey =
    kind === 'interactor'
      ? ''
      : [
          ...new Set(
            tests.flatMap(([, test]) =>
              fields
                .map(([field]) => test[field])
                .filter((hash): hash is string => !!hash),
            ),
          ),
        ]
          .sort()
          .join(',');
  const formats = useComponentTextFormats(data.problem.id, hashKey);
  const signature = JSON.stringify([
    doc[kind],
    doc.extra_validators,
    doc[unitKey],
  ]);
  const latestSignature = useRef(signature);
  useLayoutEffect(() => {
    latestSignature.current = signature;
  }, [signature]);
  const active = useRef(true);
  const actionLocked = useRef(false);
  const actionController = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      actionController.current?.abort();
    };
  }, []);
  const [prompt, setPrompt] = useState<'convert' | 'run' | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [pendingConversion, setPendingConversion] = useState<{
    before: string;
    after: string;
    run: boolean;
    count: number;
  } | null>(null);
  const candidates = Object.values(formats.values).filter(
    (file) => file.needs_lf_conversion && !file.binary,
  );
  const nonLfTests = tests.filter(([, test]) =>
    fields.some(([field]) => {
      const hash = test[field];
      return !!hash && formats.values[hash]?.needs_lf_conversion;
    }),
  );
  const missingFinal =
    kind === 'validator'
      ? tests.filter(
          ([, test]) =>
            test.expected === 'VALID' &&
            formats.values[test.input_sha]?.has_final_newline === false,
        )
      : [];
  const unknown = Object.values(formats.values).some((file) => file.binary);
  const needsWarning =
    formats.loading ||
    !!formats.error ||
    unknown ||
    nonLfTests.length > 0 ||
    missingFinal.length > 0;
  const execute = useCallback(async () => {
    if (actionLocked.current || !active.current) return;
    actionLocked.current = true;
    setActionBusy(true);
    setActionError('');
    try {
      await run(kind === 'checker' ? 'checker-tests' : 'validator-tests');
    } catch (error) {
      if (active.current) {
        setActionError((error as Error).message);
        notify((error as Error).message, true);
      }
    } finally {
      actionLocked.current = false;
      if (active.current) setActionBusy(false);
    }
  }, [run, kind, notify, setActionBusy, setActionError]);
  // Confirm the updated document before reporting success or executing it.
  // Calling run() immediately after mutate() would submit the old hashes.
  useEffect(() => {
    if (!pendingConversion || pendingConversion.before === signature) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || !active.current) return;
      setPendingConversion(null);
      if (pendingConversion.after !== signature) {
        setActionError(
          '자료가 변경되어 LF 변환을 반영하지 않았습니다. 새 자료를 확인하고 다시 변환하세요.',
        );
        return;
      }
      setPrompt(null);
      if (pendingConversion.run) void execute();
      else
        notify(
          `자체 테스트 ${pendingConversion.count}개의 줄바꿈을 LF로 변환했습니다. 작업 사본을 저장하거나 테스트를 실행하세요.`,
        );
    });
    return () => {
      cancelled = true;
    };
  }, [pendingConversion, signature, execute, notify]);
  async function convert(thenRun: boolean) {
    if (
      !editable ||
      actionLocked.current ||
      formats.loading ||
      formats.error ||
      !candidates.length
    )
      return;
    actionLocked.current = true;
    setActionBusy(true);
    setActionError('');
    const controller = new AbortController();
    actionController.current = controller;
    try {
      const mapping = await normalizeBlobLf(
        data.problem.id,
        candidates.map((file) => file.sha256),
        controller.signal,
      );
      if (!active.current || controller.signal.aborted) return;
      if (latestSignature.current !== signature)
        throw new Error(
          '변환 중 자체 테스트 자료가 변경되었습니다. 새 자료를 확인하고 다시 변환하세요.',
        );
      const updated = structuredClone(doc[unitKey]);
      for (const test of Object.values(updated))
        for (const [field] of fields) {
          const hash = test[field];
          if (hash && mapping[hash]) test[field] = mapping[hash];
        }
      mutate((document) => {
        if (
          JSON.stringify([
            document[kind],
            document.extra_validators,
            document[unitKey],
          ]) !== signature
        )
          return;
        document[unitKey] = updated;
      });
      setPendingConversion({
        before: signature,
        after: JSON.stringify([doc[kind], doc.extra_validators, updated]),
        run: thenRun,
        count: nonLfTests.length,
      });
    } catch (error) {
      if (active.current && !controller.signal.aborted)
        setActionError(
          `LF 변환을 반영하지 못했습니다. ${(error as Error).message}`,
        );
    } finally {
      actionLocked.current = false;
      if (active.current) setActionBusy(false);
    }
  }
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
      <section className="card form-section">
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
          <div className="component-extra-validators">
            <h3>추가 Validator</h3>
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
          </div>
        )}
        <div className="component-source-help">
          <Link className="text-link" to={`/problems/${data.problem.id}/files`}>
            <Icon name="code" size={15} />
            소스 파일 관리
          </Link>
          <p className="muted small">
            파일 · 리소스에서 {title} 역할을 지정한 소스만 표시합니다. 기존에
            연결한 프로그램은 그대로 표시됩니다.
          </p>
        </div>
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
                disabled={
                  !can(data.problem, 'execute') ||
                  !doc[kind] ||
                  actionBusy ||
                  !!pendingConversion
                }
                onClick={() => {
                  setActionError('');
                  if (needsWarning) setPrompt('run');
                  else void execute();
                }}
              >
                <Icon name="play" />
                테스트 실행
              </button>
              <button
                className="button"
                disabled={
                  !editable ||
                  actionBusy ||
                  !!pendingConversion ||
                  formats.loading ||
                  !!formats.error ||
                  !candidates.length
                }
                onClick={() => {
                  setActionError('');
                  setPrompt('convert');
                }}
              >
                전체 LF 변환
              </button>
              <button
                className="button primary"
                disabled={!editable || actionBusy || !!pendingConversion}
                onClick={() => setAdding(true)}
              >
                <Icon name="plus" />
                테스트 추가
              </button>
            </div>
          </div>
          {tests.length > 0 &&
            (formats.error ||
              nonLfTests.length > 0 ||
              missingFinal.length > 0) && (
              <div className="component-format-warning" role="status">
                <Icon name="issue" />
                <div>
                  {formats.error ? (
                    <>
                      <strong>줄바꿈 형식을 확인하지 못했습니다.</strong>
                      <p>{formats.error}</p>
                      <button
                        className="text-link"
                        type="button"
                        onClick={formats.reload}
                      >
                        다시 확인
                      </button>
                    </>
                  ) : (
                    <>
                      <strong>실행 전에 입력의 줄바꿈을 확인하세요.</strong>
                      <p>
                        {nonLfTests.length > 0 && (
                          <>
                            CRLF·CR 또는 혼합 줄바꿈이 있는 테스트{' '}
                            {nonLfTests.length}개가 있습니다.{' '}
                          </>
                        )}
                        {missingFinal.length > 0 && (
                          <>
                            마지막 줄바꿈이 없는 정상 입력 {missingFinal.length}
                            개가 있습니다.{' '}
                          </>
                        )}
                        {kind === 'validator'
                          ? 'Linux Validator의 엄격한 검사에서 Expected EOLN으로 거부될 수 있습니다. 정상 입력은 LF로 변환하고 마지막 줄바꿈을 확인하세요.'
                          : '줄바꿈을 구분하는 Checker에서는 비교 결과가 달라질 수 있습니다. 의도한 입력·출력 형식인지 확인하세요.'}
                      </p>
                      <p>
                        {kind === 'validator'
                          ? 'INVALID 자체 테스트는 형식 오류를 의도한 입력일 수 있으므로 변환 여부를 확인하세요.'
                          : '출력 형식 오류를 검사하려는 테스트는 원래 줄바꿈을 유지해야 할 수 있습니다.'}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          {tests.length ? (
            <div className="table-scroll">
              <table className="data-table component-tests-table">
                <thead>
                  <tr>
                    <th>테스트</th>
                    <th>기대 판정</th>
                    <th>입력 자료</th>
                    <th>줄바꿈</th>
                    <th>내용</th>
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
                              test.expected === 'VALID' ||
                              test.expected === 'OK'
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
                          <div
                            className="component-test-formats"
                            aria-label={`자체 테스트 ${index + 1} 줄바꿈`}
                          >
                            {fields.map(([field, label]) => {
                              const hash = test[field];
                              return (
                                <TestFormat
                                  key={field}
                                  label={label}
                                  format={
                                    hash ? formats.values[hash] : undefined
                                  }
                                  loading={formats.loading}
                                />
                              );
                            })}
                          </div>
                        </td>
                        <td>
                          <button
                            className="button small"
                            disabled={actionBusy || !!pendingConversion}
                            onClick={() =>
                              setSelected({ id, test, number: index + 1 })
                            }
                          >
                            {editable ? '내용 보기·수정' : '내용 보기'}
                          </button>
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            disabled={
                              !editable || actionBusy || !!pendingConversion
                            }
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
            </div>
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
      {selected && (
        <UnitModal
          key={`${kind}/${selected.id}`}
          kind={kind as 'checker' | 'validator'}
          existing={selected}
          onClose={() => setSelected(null)}
        />
      )}
      {prompt && (
        <Modal
          title={
            prompt === 'convert'
              ? '전체 자체 테스트를 LF로 변환'
              : '자체 테스트 실행 전 줄바꿈 확인'
          }
          onClose={() => {
            if (!actionBusy && !pendingConversion) setPrompt(null);
          }}
          footer={
            <>
              <button
                className="button"
                disabled={actionBusy || !!pendingConversion}
                onClick={() => setPrompt(null)}
              >
                취소
              </button>
              {prompt === 'run' && (
                <button
                  className="button"
                  disabled={actionBusy || !!pendingConversion}
                  onClick={() => {
                    setPrompt(null);
                    void execute();
                  }}
                >
                  원본으로 실행
                </button>
              )}
              {editable &&
                candidates.length > 0 &&
                !formats.loading &&
                !formats.error && (
                  <button
                    className="button primary"
                    disabled={actionBusy || !!pendingConversion}
                    onClick={() => void convert(prompt === 'run')}
                  >
                    {actionBusy || pendingConversion
                      ? 'LF 변환 중…'
                      : prompt === 'run'
                        ? 'LF로 변환 후 실행'
                        : 'LF로 변환하기'}
                  </button>
                )}
            </>
          }
        >
          {prompt === 'convert' ? (
            <>
              <p>
                현재 페이지와 관계없이 전체 {tests.length}개 자체 테스트에
                적용합니다. 변환이 필요한 테스트는 {nonLfTests.length}개입니다.
              </p>
              <p>
                {kind === 'checker' ? '입력·기대 출력·참가자 출력' : '입력'}의
                CRLF·CR을 LF로 바꾸며, 숫자·공백·마지막 줄바꿈 유무와 기대
                판정은 유지합니다.
              </p>
              <Notice>
                {kind === 'validator'
                  ? 'INVALID 자체 테스트가 잘못된 줄바꿈을 거부하는지 확인하려는 입력이라면 전체 변환하지 말고 필요한 항목만 변환하세요.'
                  : '줄바꿈에 따른 출력 형식 오류를 확인하려는 테스트라면 전체 변환하지 말고 필요한 항목만 변환하세요.'}
              </Notice>
            </>
          ) : (
            <>
              {formats.loading ? (
                <p>
                  줄바꿈 형식을 확인하고 있습니다. 확인이 끝난 뒤 변환하거나
                  원본으로 실행할 수 있습니다.
                </p>
              ) : formats.error ? (
                <Notice>
                  줄바꿈 형식을 확인하지 못했습니다. 원본으로 실행하면 형식
                  오류가 발생할 수 있습니다. {formats.error}
                </Notice>
              ) : (
                <>
                  <p>
                    CRLF·CR 또는 혼합 줄바꿈이 있는 테스트 {nonLfTests.length}개
                    {kind === 'validator' && (
                      <>
                        , 마지막 줄바꿈이 없는 정상 입력 {missingFinal.length}개
                      </>
                    )}
                    가 있습니다.
                  </p>
                  <p>
                    {kind === 'validator'
                      ? 'Linux Validator에서 Expected EOLN 오류가 나면 입력을 LF로 변환하고 마지막 줄바꿈을 확인하세요. 값 개수·공백 문제도 같은 오류를 낼 수 있습니다.'
                      : '줄바꿈을 구분하는 Checker에서는 비교 결과가 달라질 수 있습니다. 입력·기대 출력·참가자 출력의 형식을 확인하세요.'}
                  </p>
                  {unknown && (
                    <p>
                      텍스트로 확인할 수 없는 자료가 있습니다. 해당 원본 파일을
                      별도로 확인하세요.
                    </p>
                  )}
                  <p>
                    LF 변환은 마지막 줄바꿈을 자동으로 추가하지 않습니다.
                    의도적으로 만든 형식 오류도 바뀔 수 있습니다.
                  </p>
                </>
              )}
            </>
          )}
          {actionError && <Notice tone="error">{actionError}</Notice>}
        </Modal>
      )}
    </div>
  );
}
function TestFormat({
  label,
  format,
  loading,
}: {
  label: string;
  format?: BlobTextFormat;
  loading: boolean;
}) {
  const names = {
    none: '줄바꿈 없음',
    lf: 'LF',
    crlf: 'CRLF',
    cr: 'CR',
    mixed: '혼합',
  };
  return (
    <div className="component-test-format">
      <span>{label}</span>
      <div>
        <Badge tone={format?.needs_lf_conversion ? 'warning' : 'neutral'}>
          {loading
            ? '확인 중'
            : !format
              ? '확인 불가'
              : format.binary || !format.line_ending
                ? '바이너리'
                : names[format.line_ending]}
        </Badge>
        {format && format.has_final_newline !== null && (
          <small>
            마지막 줄바꿈 {format.has_final_newline ? '있음' : '없음'}
          </small>
        )}
      </div>
    </div>
  );
}
function UnitModal({
  kind,
  existing,
  onClose,
}: {
  kind: 'checker' | 'validator';
  existing?: { id: string; test: UnitTest; number: number };
  onClose: () => void;
}) {
  const { data, mutate, editable } = useWorkspace();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [answer, setAnswer] = useState('');
  const [expected, setExpected] = useState(
    existing?.test.expected || (kind === 'checker' ? 'OK' : 'VALID'),
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!existing);
  const [loaded, setLoaded] = useState(!existing);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!existing) return;
    let active = true;
    const read = (sha: string | null) =>
      sha ? blobText(data.problem.id, sha) : Promise.resolve('');
    void Promise.all([
      read(existing.test.input_sha),
      kind === 'checker' ? read(existing.test.output_sha) : '',
      kind === 'checker' ? read(existing.test.answer_sha) : '',
    ]).then(
      ([input, output, answer]) => {
        if (!active) return;
        setInput(input);
        setOutput(output);
        setAnswer(answer);
        setLoaded(true);
        setLoading(false);
      },
      (e: Error) => {
        if (!active) return;
        setError(e.message);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [data.problem.id, existing, kind, retry]);
  async function submit() {
    if (!editable || busy || loading || !loaded) return;
    setBusy(true);
    setError('');
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
          existing?.id || crypto.randomUUID()
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
      title={
        existing
          ? `자체 테스트 #${existing.number}${editable ? ' 수정' : ' 내용'}`
          : '자체 테스트 추가'
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <button className="button" disabled={busy} onClick={onClose}>
            {editable ? '취소' : '닫기'}
          </button>
          {editable && (
            <button
              className="button primary"
              disabled={busy || loading || !loaded}
              onClick={() => void submit()}
            >
              {busy ? '저장 중…' : existing ? '수정' : '추가'}
            </button>
          )}
        </>
      }
    >
      {loading && <Notice>기존 테스트 내용을 불러오고 있습니다.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {!loading && !loaded && (
        <button
          className="button"
          onClick={() => {
            setLoading(true);
            setError('');
            setRetry((value) => value + 1);
          }}
        >
          다시 불러오기
        </button>
      )}
      {loaded && (
        <>
          <label>
            기대 판정
            <Select
              disabled={!editable || busy}
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
            >
              {(kind === 'checker'
                ? ['OK', 'WRONG_ANSWER', 'PRESENTATION_ERROR', 'CRASHED']
                : ['VALID', 'INVALID']
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </label>
          <CodeEditor
            textFormatTools
            value={input}
            onChange={setInput}
            label="테스트 입력"
            readOnly={!editable || busy}
            rows={6}
          />
          {kind === 'checker' && (
            <div className="form-grid">
              <CodeEditor
                textFormatTools
                value={answer}
                onChange={setAnswer}
                label="기대 출력"
                readOnly={!editable || busy}
                rows={6}
              />
              <CodeEditor
                textFormatTools
                value={output}
                onChange={setOutput}
                label="검사할 참가자 출력"
                readOnly={!editable || busy}
                rows={6}
              />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
