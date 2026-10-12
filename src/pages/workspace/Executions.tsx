import { useCallback, useEffect, useState } from 'react';
import {
  api,
  blobText,
  jobLabels,
  post,
  statusLabels,
  tags,
  time,
  bytes,
} from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import type { CaseResult, Job } from '../../lib/types';
import ZojPublishing from './ZojPublishing';
import {
  Badge,
  CodeEditor,
  Empty,
  Icon,
  Modal,
  Notice,
  SectionHeading,
} from '../../components/ui';
export default function Executions({
  stress = false,
  packages = false,
}: {
  stress?: boolean;
  packages?: boolean;
}) {
  const {
    data,
    document: doc,
    editable,
    run,
    notify,
    reload,
    save,
    mutate,
    dirty,
  } = useWorkspace();
  const [rows, setRows] = useState<Job[]>([]);
  const [selected, setSelected] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [generator, setGenerator] = useState('');
  const [reference, setReference] = useState(
    Object.keys(doc.solutions).find((n) => doc.solutions[n].tag === 'MA') || '',
  );
  const [candidate, setCandidate] = useState(
    Object.keys(doc.solutions).find((n) => doc.solutions[n].tag !== 'MA') || '',
  );
  const [iterations, setIterations] = useState(50);
  const [setName, setSetName] = useState(
    Object.keys(doc.testsets)[0] || 'tests',
  );
  const [busy, setBusy] = useState(false);
  const [exportFormat, setExportFormat] = useState('zoj');
  const [statementLanguage, setStatementLanguage] = useState(
    Object.keys(doc.statements).includes('korean')
      ? 'korean'
      : Object.keys(doc.statements)[0] || 'korean',
  );
  const [caseResult, setCaseResult] = useState<CaseResult | null>(null);
  const fetchRows = useCallback(async () => {
    const values = await api<Job[]>(`/problems/${data.problem.id}/jobs`);
    setRows(values);
    setSelected(
      (previous) =>
        previous ||
        values.find((j) =>
          packages ? j.kind === 'package' : stress ? j.kind === 'stress' : true,
        )?.id ||
        '',
    );
  }, [data.problem.id, packages, stress]);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const values = await api<Job[]>(`/problems/${data.problem.id}/jobs`);
        if (active) {
          setRows(values);
          setSelected(
            (previous) =>
              previous ||
              values.find((j) =>
                packages
                  ? j.kind === 'package'
                  : stress
                    ? j.kind === 'stress'
                    : true,
              )?.id ||
              '',
          );
        }
      } catch (e) {
        if (active) notify((e as Error).message, true);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [data.problem.id, packages, stress, notify]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    let timer: number | undefined;
    async function refresh() {
      try {
        const value = await api<Job>(
          `/problems/${data.problem.id}/jobs/${selected}`,
        );
        if (active) {
          setJob(value);
          if (value.status === 'queued' || value.status === 'running')
            timer = window.setTimeout(() => void refresh(), 1800);
        }
      } catch (e) {
        if (active) notify((e as Error).message, true);
      }
    }
    void refresh();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [selected, data.problem.id, notify]);
  async function start(
    kind: Job['kind'],
    options: Record<string, unknown> = {},
  ) {
    setBusy(true);
    try {
      const result = await run(kind, options);
      setSelected(result.id);
      setJob(result);
      await fetchRows();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter((row) =>
    packages ? row.kind === 'package' : stress ? row.kind === 'stress' : true,
  );
  const stale = Boolean(job && job.document_hash !== data.document_hash);
  async function apply() {
    if (!job) return;
    try {
      const version = await save();
      await post(`/problems/${data.problem.id}/jobs/${job.id}/apply`, {
        version,
      });
      await reload();
      notify('생성된 입력과 정답을 작업 사본에 반영했습니다.');
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <div className="section-stack">
      <SectionHeading
        title={packages ? '패키지' : stress ? '스트레스 테스트' : '실행 결과'}
        description={
          packages
            ? '커밋된 리비전을 검증하고 배포 가능한 문제 패키지를 생성합니다.'
            : stress
              ? '생성기와 기준 풀이를 사용해 비교할 풀이의 유효한 반례를 찾습니다.'
              : '검증 결과와 자원 사용량을 서버에 보관하고 동료와 공유합니다.'
        }
        actions={
          !stress && (
            <button
              className="button primary"
              disabled={!editable || busy}
              onClick={() =>
                void start(packages ? 'package' : 'verify', {
                  testset: setName,
                  verify: true,
                  ...(packages
                    ? {
                        export_format: exportFormat,
                        statement_language: statementLanguage,
                      }
                    : {}),
                })
              }
            >
              <Icon name="play" />
              {packages ? '검증 후 패키지 생성' : '전체 풀이 검증'}
            </button>
          )
        }
      />
      {stress ? (
        <section className="card">
          <fieldset disabled={!editable || busy} className="form-grid">
            <label className="span-2">
              생성기 명령
              <input
                value={generator}
                onChange={(e) => setGenerator(e.target.value)}
                placeholder="gen 100 {seed}"
              />
              <small>
                {'{seed}'}가 반복 번호로 바뀝니다. 생략하면 마지막 인자로 반복
                번호가 추가됩니다.
              </small>
            </label>
            <label>
              기준 풀이
              <select
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              >
                <option value="">Main 풀이</option>
                {Object.keys(doc.solutions).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              비교할 풀이
              <select
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
              >
                <option value="">선택하세요</option>
                {Object.keys(doc.solutions).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              반복 횟수
              <input
                type="number"
                min={1}
                max={1000}
                value={iterations}
                onChange={(e) => setIterations(Number(e.target.value))}
              />
            </label>
            <button
              className="button primary align-end"
              disabled={!generator || !candidate}
              onClick={() =>
                void start('stress', {
                  generator,
                  reference,
                  candidate,
                  iterations,
                  testset: setName,
                })
              }
            >
              <Icon name="play" />
              스트레스 테스트 시작
            </button>
          </fieldset>
        </section>
      ) : packages ? (
        <>
          <section className="card compact">
            <div className="form-grid">
              <label>
                패키지 형식
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                >
                  <option value="zoj">ZOJ 문제 ZIP · 대회에 등록</option>
                  <option value="editor">
                    Editor / Polygon 형식 · 작업 자료
                  </option>
                </select>
              </label>
              {exportFormat === 'zoj' && (
                <>
                  <label>
                    ZOJ에 표시할 지문
                    <select
                      value={statementLanguage}
                      onChange={(e) => setStatementLanguage(e.target.value)}
                    >
                      {Object.entries(doc.statements).map(
                        ([language, statement]) => (
                          <option key={language} value={language}>
                            {language} · {statement.name || doc.info.name}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    ZOJ에서 사용할 테스트 세트
                    <select
                      value={setName}
                      onChange={(e) => setSetName(e.target.value)}
                    >
                      {Object.keys(doc.testsets).map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <p className="muted">
              {exportFormat === 'zoj'
                ? '지문·예제·전체 입력과 정답·검증 코드·checker·validator를 ZOJ 가져오기 형식으로 내보냅니다. 다른 지문 언어와 원본 Editor 자료도 함께 보관합니다. 그룹·부분 점수 등 ZOJ가 지원하지 않는 채점 방식은 생성 전에 안내합니다.'
                : 'Editor에서 다시 열 수 있는 작업 자료와 problem.xml, 생성된 테스트, 모든 지문 언어를 포함합니다.'}
            </p>
          </section>
          <div className="workspace-guide">
            <Icon name="branch" />
            <p>
              내 작업 사본을 먼저 커밋하세요. 모든 입력을 검증하고 풀이
              태그·checker·validator 자체 테스트를 확인한 뒤 ZIP을 만듭니다.
            </p>
          </div>
          <ZojPublishing
            problemId={data.problem.id}
            owner={data.problem.role === 'OWNER'}
            job={job}
            stale={stale || dirty}
          />
        </>
      ) : (
        <section className="card compact">
          <div className="inline-form">
            <label>
              검증 테스트 세트
              <select
                value={setName}
                onChange={(e) => setSetName(e.target.value)}
              >
                {Object.keys(doc.testsets).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <button
              className="button"
              disabled={!editable || busy}
              onClick={() => void start('prepare', { testset: setName })}
            >
              <Icon name="tests" />
              입력·정답 생성
            </button>
          </div>
        </section>
      )}
      <div className="execution-layout">
        <section className="card execution-list no-padding">
          <div className="card-heading">
            <h3>
              작업 기록 <span className="count">{visible.length}</span>
            </h3>
          </div>
          {visible.length ? (
            visible.map((row) => (
              <button
                className={row.id === selected ? 'job-row selected' : 'job-row'}
                key={row.id}
                onClick={() => setSelected(row.id)}
              >
                <div>
                  <strong>{jobLabels[row.kind]}</strong>
                  <Badge
                    tone={
                      row.status === 'failed'
                        ? 'danger'
                        : row.status === 'completed'
                          ? 'success'
                          : 'neutral'
                    }
                  >
                    {statusLabels[row.status]}
                  </Badge>
                </div>
                <small>
                  r{row.revision} · {time(row.created_at)}
                </small>
                <span>{row.result.summary || '검증 워커 배정 대기'}</span>
              </button>
            ))
          ) : (
            <Empty
              icon="play"
              title="실행 기록이 없습니다."
              description="작업을 요청하면 여기에 기록됩니다."
            />
          )}
        </section>
        <section className="card execution-detail">
          {job ? (
            <>
              <div className="section-heading">
                <div>
                  <h3>{jobLabels[job.kind]}</h3>
                  <p>
                    {time(job.created_at)} · r{job.revision}
                  </p>
                </div>
                <Badge
                  tone={
                    job.status === 'failed'
                      ? 'danger'
                      : job.status === 'completed'
                        ? 'success'
                        : 'accent'
                  }
                >
                  {statusLabels[job.status]}
                </Badge>
              </div>
              {stale && (
                <Notice>
                  현재 작업 사본과 다른 자료의 실행 기록입니다. 이 결과는 당시
                  자료에만 해당합니다.
                </Notice>
              )}
              {dirty && (
                <div className="muted small">
                  저장하지 않은 변경은 이 실행 기록에 포함되지 않습니다.
                </div>
              )}
              {(job.status === 'queued' || job.status === 'running') && (
                <div className="run-progress">
                  <span className="spinner" />
                  <strong>
                    {job.result.summary || '실행 자리를 기다리고 있습니다.'}
                  </strong>
                  {editable && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void post(
                          `/problems/${data.problem.id}/jobs/${job.id}/cancel`,
                        )
                          .then(fetchRows)
                          .catch((e) => notify(e.message, true))
                      }
                    >
                      작업 취소
                    </button>
                  )}
                </div>
              )}
              {job.result.error && (
                <Notice tone="error">
                  <CodeEditor
                    readOnly
                    rows={6}
                    label="실행 오류"
                    value={job.result.error}
                  />
                </Notice>
              )}
              {job.result.verified !== undefined && (
                <div
                  className={`verification-summary ${job.result.verified ? 'passed' : 'mismatch'}`}
                >
                  <Icon name={job.result.verified ? 'check' : 'issue'} />
                  <div>
                    <strong>
                      {job.result.verified
                        ? '기대 판정과 일치합니다.'
                        : '기대 판정 또는 자체 테스트 확인이 필요합니다.'}
                    </strong>
                    <p>
                      {job.result.mismatches?.length
                        ? job.result.mismatches.join(', ')
                        : '아래 실제 실행 범위와 판정을 확인하세요.'}
                    </p>
                  </div>
                </div>
              )}
              {job.kind === 'prepare' && job.status === 'completed' && (
                <div className="result-action">
                  <span>
                    {Object.values(job.result.testsets || {}).reduce(
                      (n, t) => n + t.length,
                      0,
                    )}
                    개 입력·정답 생성 완료
                  </span>
                  <button
                    className="button primary"
                    disabled={!editable || stale || dirty}
                    onClick={() => void apply()}
                  >
                    작업 사본에 반영
                  </button>
                </div>
              )}
              {job.result.solutions?.map((solution) => (
                <div className="solution-result" key={solution.name}>
                  <div className="solution-result-heading">
                    <strong>{solution.name}</strong>
                    <Badge tone="accent">
                      {solution.tag} · {tags[solution.tag as keyof typeof tags]}
                    </Badge>
                    <Badge tone={solution.matched ? 'success' : 'danger'}>
                      {solution.matched ? '기대 판정 일치' : '기대 판정 불일치'}
                    </Badge>
                  </div>
                  {solution.total_score != null && (
                    <p>점수 {solution.total_score.toLocaleString()}</p>
                  )}
                  {solution.groups?.length ? (
                    <div className="inline-tags">
                      {solution.groups.map((g) => (
                        <Badge
                          key={`${g.testset}-${g.name}`}
                          tone={g.passed ? 'success' : 'warning'}
                        >
                          {g.name} · {g.score}점
                          {g.blocked
                            ? ' · 의존 그룹 미통과'
                            : !g.complete
                              ? ' · 전체 실행 필요'
                              : ''}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="case-grid">
                    {solution.cases.map((result) => (
                      <button
                        key={`${result.testset}-${result.index}`}
                        className={`case-chip ${result.verdict === 'AC' ? 'accepted' : result.verdict === 'JUDGE_ERROR' ? 'error' : 'rejected'}`}
                        title={`${result.testset} #${result.index} · ${result.cpu_ms ?? '계측 불가'}ms CPU · ${result.memory_kb ?? '계측 불가'}KiB`}
                        onClick={() => setCaseResult(result)}
                      >
                        <span>#{result.index}</span>
                        <strong>{result.verdict}</strong>
                        <small>
                          {result.cpu_ms === null
                            ? '계측 불가'
                            : `${result.cpu_ms}ms`}
                        </small>
                      </button>
                    ))}
                  </div>
                  {solution.skipped && (
                    <p className="muted">NR 태그로 실행하지 않았습니다.</p>
                  )}
                </div>
              ))}
              {job.result.unit_tests?.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>자체 테스트</th>
                      <th>기대 판정</th>
                      <th>실제 판정</th>
                      <th>결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.result.unit_tests.map((test, i) => (
                      <tr key={test.id}>
                        <td>#{i + 1}</td>
                        <td>{test.expected}</td>
                        <td>{test.actual}</td>
                        <td>
                          <Badge tone={test.matched ? 'success' : 'danger'}>
                            {test.matched ? '일치' : '불일치'}
                          </Badge>
                          <div className="subtext">{test.comment}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {job.kind === 'stress' &&
                job.status === 'completed' &&
                (job.result.counterexample ? (
                  <div className="counterexample">
                    <Notice tone="success">
                      Validator를 통과한 입력에서{' '}
                      {job.result.counterexample.verdict} 반례를 찾았습니다.
                    </Notice>
                    <CodeEvidence
                      problemId={data.problem.id}
                      input={job.result.counterexample.input_sha}
                      answer={job.result.counterexample.answer_sha}
                      actual={job.result.counterexample.actual_sha}
                    />
                    <button
                      className="button primary"
                      disabled={!editable}
                      onClick={() => {
                        const ce = job.result.counterexample!;
                        mutate((d) => {
                          const index =
                            Math.max(
                              0,
                              ...Object.values(d.testsets[setName].tests).map(
                                (t) => t.index,
                              ),
                            ) + 1;
                          d.testsets[setName].tests[String(index)] = {
                            index,
                            input_sha: ce.input_sha,
                            answer_sha: ce.answer_sha,
                            command: '',
                            group: '',
                            points: 0,
                            description: `스트레스 반례 · 반복 ${ce.iteration}`,
                            sample: false,
                          };
                        });
                        notify(
                          '반례를 테스트에 추가했습니다. 작업 사본을 저장하세요.',
                        );
                      }}
                    >
                      반례를 테스트로 추가
                    </button>
                  </div>
                ) : (
                  <p className="muted">
                    {job.result.iterations}회에서 반례를 찾지 못했습니다. 전체
                    입력에 대한 올바름을 보장하지는 않습니다.
                  </p>
                ))}
              {job.result.package && job.status === 'completed' && (
                <div className="package-download">
                  <Icon name="box" size={34} />
                  <div>
                    <strong>{job.result.package.filename}</strong>
                    <p>
                      {bytes(job.result.package.size)} · 검증된 리비전 r
                      {job.revision}
                    </p>
                  </div>
                  <a
                    className="button primary"
                    href={`/api/problems/${data.problem.id}/packages/${job.id}`}
                    download
                  >
                    <Icon name="download" />
                    ZIP 다운로드
                  </a>
                </div>
              )}
              {job.result.statements &&
                Object.entries(job.result.statements).map(
                  ([language, result]) => (
                    <div className="render-row" key={language}>
                      <strong>{language}</strong>
                      <a
                        className="button small"
                        href={`/api/problems/${data.problem.id}/rendered/${job.id}/${language}.html`}
                        download
                      >
                        HTML
                      </a>
                      {result.pdf === 'OK' ? (
                        <a
                          className="button small"
                          href={`/api/problems/${data.problem.id}/rendered/${job.id}/${language}.pdf`}
                          download
                        >
                          PDF
                        </a>
                      ) : (
                        <details>
                          <summary>PDF 오류 확인</summary>
                          <CodeEditor
                            value={result.message || ''}
                            readOnly
                            rows={5}
                          />
                        </details>
                      )}
                    </div>
                  ),
                )}
              {job.result.events?.length ? (
                <details className="execution-log">
                  <summary>
                    <Icon name="history" size={16} />
                    실행 과정 · {job.result.events.length}개 기록
                    <Icon name="down" size={15} />
                  </summary>
                  <ol>
                    {job.result.events.map((event, index) => (
                      <li key={index}>{event.label}</li>
                    ))}
                  </ol>
                </details>
              ) : null}
              <div className="run-footnote">
                CPU 시간과 메모리는 Editor 격리 워커의 실제 실행 값입니다. 실행
                결과는 자료 해시와 함께 보관됩니다.
              </div>
            </>
          ) : (
            <Empty
              icon="play"
              title="기록을 선택하세요."
              description="실제 판정과 실행 과정을 확인할 수 있습니다."
            />
          )}
        </section>
      </div>
      {caseResult && (
        <Modal
          wide
          title={`${caseResult.testset} · 테스트 #${caseResult.index}`}
          onClose={() => setCaseResult(null)}
          footer={
            <button className="button" onClick={() => setCaseResult(null)}>
              닫기
            </button>
          }
        >
          <div className="case-stats">
            <Badge tone={caseResult.verdict === 'AC' ? 'success' : 'danger'}>
              {caseResult.verdict}
            </Badge>
            <span>
              CPU{' '}
              {caseResult.cpu_ms === null
                ? '계측 불가'
                : `${caseResult.cpu_ms}ms`}
            </span>
            <span>
              경과 시간{' '}
              {caseResult.wall_ms === null
                ? '계측 불가'
                : `${caseResult.wall_ms}ms`}
            </span>
            <span>
              메모리{' '}
              {caseResult.memory_kb === null
                ? '계측 불가'
                : bytes(caseResult.memory_kb * 1024)}
            </span>
          </div>
          <CodeEvidence
            problemId={data.problem.id}
            input={caseResult.input_sha}
            answer={caseResult.answer_sha}
            actual={caseResult.actual_sha}
          />
          {caseResult.comment && (
            <CodeEditor
              value={caseResult.comment}
              readOnly
              label="판정 메시지"
              rows={4}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
export function CodeEvidence({
  problemId,
  input,
  answer,
  actual,
}: {
  problemId: string;
  input: string;
  answer: string;
  actual: string;
}) {
  const [values, setValues] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([input, answer, actual].map((sha) => blobText(problemId, sha)))
      .then((value) => {
        if (active) setValues(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [problemId, input, answer, actual]);
  if (error) return <Notice tone="error">{error}</Notice>;
  return (
    <div className="evidence-grid">
      {['입력', '기대 출력', '실제 출력'].map((label, i) => (
        <CodeEditor
          key={label}
          value={values[i] ?? '불러오는 중…'}
          readOnly
          label={label}
          rows={6}
        />
      ))}
    </div>
  );
}
