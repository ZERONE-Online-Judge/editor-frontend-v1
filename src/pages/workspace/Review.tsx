import { useEffect, useState } from 'react';
import { useWorkspace } from '../../lib/workspace';
import { blobText } from '../../lib/api';
import { CodeEditor, Empty, SectionHeading } from '../../components/ui';
import Markdown from '../../components/Markdown';
export default function Review() {
  const { data, document: doc } = useWorkspace();
  const langs = Object.keys(doc.statements).filter(
    (l) => doc.statements[l].show_in_review,
  );
  const [language, setLanguage] = useState(
    langs[0] || Object.keys(doc.statements)[0],
  );
  const [samples, setSamples] = useState<{ input: string; answer: string }[]>(
    [],
  );
  const statement = doc.statements[language];
  const sampleKey = JSON.stringify(
    Object.values(doc.testsets).flatMap((set) =>
      Object.values(set.tests)
        .filter((t) => t.sample && t.input_sha)
        .map((t) => [t.input_sha, t.answer_sha]),
    ),
  );
  useEffect(() => {
    let active = true;
    const items = JSON.parse(sampleKey) as (string | null)[][];
    Promise.all(
      items.map(async ([inp, ans]) => ({
        input: inp ? await blobText(data.problem.id, inp) : '',
        answer: ans
          ? await blobText(data.problem.id, ans)
          : 'Main 풀이로 기대 출력을 생성하세요.',
      })),
    )
      .then((values) => {
        if (active) setSamples(values);
      })
      .catch(() => {
        if (active)
          setSamples([
            {
              input: '예제를 불러오지 못했습니다. 화면을 다시 열어 주세요.',
              answer: '',
            },
          ]);
      });
    return () => {
      active = false;
    };
  }, [data.problem.id, sampleKey]);
  return (
    <div className="section-stack">
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
            <button className="button" onClick={() => window.print()}>
              인쇄
            </button>
          </>
        }
      />
      {statement ? (
        <article className="card problem-preview">
          <header>
            <span className="eyebrow">PROBLEM STATEMENT</span>
            <h1>{statement.name || doc.info.name}</h1>
            <div>
              시간 제한 {doc.info.time_limit_ms / 1000}초 · 메모리 제한{' '}
              {doc.info.memory_limit_mb}MiB
            </div>
            <div>
              입력 {doc.info.input_file} · 출력 {doc.info.output_file}
            </div>
          </header>
          {[
            ['', 'legend'],
            ['입력', 'input'],
            ['출력', 'output'],
            ['부분 점수', 'scoring'],
            ['인터랙션', 'interaction'],
          ].map(([title, key]) =>
            statement[key as keyof typeof statement] ? (
              <section key={key}>
                {title && <h2>{title}</h2>}
                <Markdown>
                  {String(statement[key as keyof typeof statement])}
                </Markdown>
              </section>
            ) : null,
          )}
          {samples.map((sample, i) => (
            <section className="sample-pair" key={i}>
              <CodeEditor
                value={sample.input}
                readOnly
                label={`예제 입력 ${i + 1}`}
                rows={4}
              />
              <CodeEditor
                value={sample.answer}
                readOnly
                label={`예제 출력 ${i + 1}`}
                rows={4}
              />
            </section>
          ))}
          {statement.notes && (
            <section>
              <h2>노트</h2>
              <Markdown>{statement.notes}</Markdown>
            </section>
          )}
        </article>
      ) : (
        <Empty title="지문을 먼저 작성하세요." />
      )}
      {statement?.tutorial && (
        <article className="card">
          <h2>해설 · 검수용</h2>
          <Markdown>{statement.tutorial}</Markdown>
        </article>
      )}
    </div>
  );
}
