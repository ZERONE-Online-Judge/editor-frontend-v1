import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useWorkspace } from '../../lib/workspace';
import { blobText } from '../../lib/api';
import { effectiveStatement } from '../../lib/sharedStatements';
import {
  CodeEditor,
  Empty,
  Modal,
  Notice,
  SectionHeading,
} from '../../components/ui';
import Markdown from '../../components/Markdown';
import { statementAssets } from '../../lib/statementAssets';
import './Review.css';

const printSections = [
  { key: 'title', label: '문제 제목' },
  { key: 'limits', label: '시간 · 메모리 제한' },
  { key: 'files', label: '입출력 파일 정보' },
  { key: 'legend', label: '문제 지문' },
  { key: 'input', label: '입력 형식' },
  { key: 'output', label: '출력 형식' },
  { key: 'scoring', label: '부분 점수 안내' },
  { key: 'interaction', label: '인터랙션 프로토콜' },
  { key: 'samples', label: '예제 입력 · 출력' },
  { key: 'notes', label: '노트' },
  { key: 'tutorial', label: '해설 · 검수용' },
] as const;
type PrintSection = (typeof printSections)[number]['key'];
const defaultPrintSections: Record<PrintSection, boolean> = {
  title: true,
  limits: true,
  files: true,
  legend: true,
  input: true,
  output: true,
  scoring: true,
  interaction: true,
  samples: true,
  notes: true,
  tutorial: false,
};

export default function Review() {
  const { data, document: doc } = useWorkspace();
  const langs = Object.keys(doc.statements).filter(
    (l) => doc.statements[l].show_in_review,
  );
  const [language, setLanguage] = useState(
    langs[0] || Object.keys(doc.statements)[0],
  );
  const [printOptionsOpen, setPrintOptionsOpen] = useState(false);
  const [printChoices, setPrintChoices] = useState(defaultPrintSections);
  const [watermark, setWatermark] = useState(true);
  const [sampleResult, setSampleResult] = useState<{
    key: string;
    items: { input: string; answer: string }[];
    error: string;
  }>({ key: '', items: [], error: '' });
  const statement = effectiveStatement(doc, language);
  const sampleKey = JSON.stringify(
    Object.values(doc.testsets).flatMap((set) =>
      Object.values(set.tests)
        .filter((t) => t.sample && (t.input_sha || t.statement_input != null))
        .map((t) => [
          t.input_sha,
          t.answer_sha,
          t.statement_input ?? null,
          t.statement_output ?? null,
        ]),
    ),
  );
  const sampleRequestKey = `${data.problem.id}:${sampleKey}`;
  const samples =
    sampleResult.key === sampleRequestKey ? sampleResult.items : [];
  const hasSamples = sampleKey !== '[]';
  const samplesLoading = hasSamples && sampleResult.key !== sampleRequestKey;
  const sampleError =
    sampleResult.key === sampleRequestKey ? sampleResult.error : '';
  const available: Record<PrintSection, boolean> = {
    title: Boolean(statement),
    limits: Boolean(statement),
    files: Boolean(statement),
    legend: Boolean(statement?.legend),
    input: Boolean(statement?.input),
    output: Boolean(statement?.output),
    scoring: Boolean(statement?.scoring),
    interaction: Boolean(statement?.interaction),
    samples: hasSamples,
    notes: Boolean(statement?.notes),
    tutorial: Boolean(statement?.tutorial),
  };
  const selectedCount = printSections.filter(
    ({ key }) => available[key] && printChoices[key],
  ).length;
  const canPrint =
    selectedCount > 0 &&
    !(printChoices.samples && hasSamples && (samplesLoading || sampleError));
  const languageLabel =
    language === 'korean'
      ? '한국어'
      : language === 'english'
        ? 'English'
        : language;
  useEffect(() => {
    let active = true;
    const items = JSON.parse(sampleKey) as (string | null)[][];
    Promise.all(
      items.map(async ([inp, ans, displayInput, displayOutput]) => ({
        input:
          displayInput ?? (inp ? await blobText(data.problem.id, inp) : ''),
        answer:
          displayOutput ??
          (ans
            ? await blobText(data.problem.id, ans)
            : 'Main 풀이로 기대 출력을 생성하세요.'),
      })),
    )
      .then((values) => {
        if (active)
          setSampleResult({ key: sampleRequestKey, items: values, error: '' });
      })
      .catch(() => {
        if (active)
          setSampleResult({
            key: sampleRequestKey,
            items: [],
            error: '예제를 불러오지 못했습니다. 화면을 다시 열어 주세요.',
          });
      });
    return () => {
      active = false;
    };
  }, [data.problem.id, sampleKey, sampleRequestKey]);
  return (
    <div className="section-stack review-page">
      <SectionHeading
        title="문제 미리보기"
        description="현재 작업 사본의 지문과 예제를 참가자 화면처럼 확인합니다."
        actions={
          <>
            <select
              aria-label="미리보기 언어"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {Object.keys(doc.statements).map((lang) => (
                <option key={lang}>{lang}</option>
              ))}
            </select>
            <button
              className="button"
              disabled={!statement}
              onClick={() => setPrintOptionsOpen(true)}
            >
              인쇄
            </button>
          </>
        }
      />
      {statement ? (
        <article className="card problem-preview">
          <header
            data-print-included={
              printChoices.title || printChoices.limits || printChoices.files
            }
          >
            <span className="eyebrow review-screen-only">
              PROBLEM STATEMENT
            </span>
            <h1 data-print-included={printChoices.title}>
              {statement.name || doc.info.name}
            </h1>
            <div data-print-included={printChoices.limits}>
              시간 제한 {doc.info.time_limit_ms / 1000}초 · 메모리 제한{' '}
              {doc.info.memory_limit_mb}MiB
            </div>
            <div data-print-included={printChoices.files}>
              입력 {doc.info.input_file} · 출력 {doc.info.output_file}
            </div>
          </header>
          {(
            [
              ['', 'legend'],
              ['입력', 'input'],
              ['출력', 'output'],
              ['부분 점수', 'scoring'],
              ['인터랙션', 'interaction'],
            ] as const
          ).map(([title, key]) =>
            statement[key as keyof typeof statement] ? (
              <section key={key} data-print-included={printChoices[key]}>
                {title && <h2>{title}</h2>}
                <Markdown assets={statementAssets(data.problem.id, doc.files)}>
                  {String(statement[key as keyof typeof statement])}
                </Markdown>
              </section>
            ) : null,
          )}
          {samplesLoading && (
            <div className="review-screen-only">
              <Notice>예제를 불러오고 있습니다.</Notice>
            </div>
          )}
          {sampleError && (
            <div className="review-screen-only">
              <Notice tone="error">{sampleError}</Notice>
            </div>
          )}
          {samples.map((sample, i) => (
            <section
              className="sample-pair review-sample-pair"
              key={i}
              data-print-included={printChoices.samples}
            >
              <div className="review-screen-only">
                <CodeEditor
                  value={sample.input}
                  readOnly
                  label={`예제 입력 ${i + 1}`}
                  rows={4}
                />
              </div>
              <div className="review-screen-only">
                <CodeEditor
                  value={sample.answer}
                  readOnly
                  label={`예제 출력 ${i + 1}`}
                  rows={4}
                />
              </div>
              <div className="review-sample-print">
                <h3>예제 입력 {i + 1}</h3>
                <pre>{sample.input}</pre>
              </div>
              <div className="review-sample-print">
                <h3>예제 출력 {i + 1}</h3>
                <pre>{sample.answer}</pre>
              </div>
            </section>
          ))}
          {statement.notes && (
            <section data-print-included={printChoices.notes}>
              <h2>노트</h2>
              <Markdown assets={statementAssets(data.problem.id, doc.files)}>
                {statement.notes}
              </Markdown>
            </section>
          )}
        </article>
      ) : (
        <Empty title="지문을 먼저 작성하세요." />
      )}
      {statement?.tutorial && (
        <article
          className="card review-editorial"
          data-print-included={printChoices.tutorial}
        >
          <h2>
            해설<span className="review-screen-only"> · 검수용</span>
          </h2>
          <Markdown assets={statementAssets(data.problem.id, doc.files)}>
            {statement.tutorial}
          </Markdown>
        </article>
      )}
      <footer
        className="review-print-watermark"
        data-print-included={watermark}
      >
        <strong>ZOJ</strong>
        <span> · editor.zoj.kr</span>
      </footer>
      {printOptionsOpen && (
        <Modal
          title="인쇄 옵션"
          className="review-print-options"
          onClose={() => setPrintOptionsOpen(false)}
          footer={
            <>
              <button
                className="button"
                onClick={() => setPrintOptionsOpen(false)}
              >
                취소
              </button>
              <button
                className="button primary"
                disabled={!canPrint}
                onClick={() => {
                  flushSync(() => setPrintOptionsOpen(false));
                  window.print();
                }}
              >
                선택한 범위 인쇄
              </button>
            </>
          }
        >
          <p className="review-print-description">
            <strong>{statement?.name || doc.info.name}</strong> ·{' '}
            {languageLabel}
            <br />
            선택한 항목만 인쇄합니다. 화면의 미리보기는 그대로 유지됩니다.
          </p>
          <fieldset className="review-print-range">
            <legend>
              인쇄 범위 <span>{selectedCount}개 선택</span>
            </legend>
            <div className="review-print-checks">
              {printSections.map(({ key, label }) => (
                <label key={key} className="review-print-choice">
                  <input
                    type="checkbox"
                    checked={available[key] && printChoices[key]}
                    disabled={!available[key]}
                    onChange={(e) =>
                      setPrintChoices((current) => ({
                        ...current,
                        [key]: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    {label}
                    {!available[key] && <small>내용 없음</small>}
                    {key === 'tutorial' && available[key] && (
                      <small>기본 제외</small>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="review-print-branding">
            <label className="review-print-choice">
              <input
                type="checkbox"
                checked={watermark}
                onChange={(e) => setWatermark(e.target.checked)}
              />
              <span>
                하단 ZOJ 워터마크
                <small>문서 하단에 작은 ZOJ 표시를 넣습니다.</small>
              </span>
            </label>
          </div>
          <div className="review-print-summary">
            <span>
              {samplesLoading && printChoices.samples
                ? '예제를 불러온 뒤 인쇄할 수 있습니다.'
                : sampleError && printChoices.samples
                  ? '예제를 다시 불러오거나 인쇄 범위에서 제외해 주세요.'
                  : selectedCount
                    ? `${selectedCount}개 항목 · 워터마크 ${watermark ? '포함' : '제외'}`
                    : '인쇄할 항목을 하나 이상 선택하세요.'}
            </span>
            <button
              className="button small"
              onClick={() => {
                setPrintChoices(defaultPrintSections);
                setWatermark(true);
              }}
            >
              기본값 복원
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
