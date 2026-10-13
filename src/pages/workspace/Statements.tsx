import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../lib/workspace';
import { Icon, SectionHeading, CodeEditor } from '../../components/ui';
import Markdown from '../../components/Markdown';
import type { Statement } from '../../lib/types';
const fields: { key: keyof Statement; title: string; rows: number }[] = [
  { key: 'legend', title: '문제 지문', rows: 12 },
  { key: 'input', title: '입력 형식', rows: 6 },
  { key: 'output', title: '출력 형식', rows: 6 },
  { key: 'scoring', title: '부분 점수 안내', rows: 5 },
  { key: 'interaction', title: '인터랙션 프로토콜', rows: 6 },
  { key: 'notes', title: '노트', rows: 5 },
  { key: 'tutorial', title: '해설', rows: 10 },
];
export default function Statements() {
  const {
    data,
    document: doc,
    mutate,
    editable,
    busy,
    notify,
    run,
  } = useWorkspace();
  const [language, setLanguage] = useState(
    Object.keys(doc.statements)[0] || 'korean',
  );
  const [newLanguage, setNewLanguage] = useState('english');
  const [preview, setPreview] = useState(true);
  const statement = doc.statements[language];
  const canEdit = editable || data.problem.translator;
  return (
    <div className="section-stack">
      <SectionHeading
        title="문제 지문"
        description="언어별 지문과 해설을 작성합니다. 수식은 LaTeX 문법을 사용하세요."
        actions={
          <>
            <button className="button" onClick={() => setPreview(!preview)}>
              <Icon name="file" />
              {preview ? '편집만 보기' : '미리보기 함께 보기'}
            </button>
            <button
              className="button"
              disabled={(!canEdit && !data.problem.reviewer) || busy}
              onClick={() =>
                void run('render').catch((e) => notify(e.message, true))
              }
            >
              <Icon name="download" />
              HTML · PDF 렌더링
            </button>
          </>
        }
      />
      <div className="card language-toolbar">
        <div className="tabs">
          {Object.keys(doc.statements).map((lang) => (
            <button
              className={lang === language ? 'active' : ''}
              key={lang}
              onClick={() => setLanguage(lang)}
            >
              {lang === 'korean'
                ? '한국어'
                : lang === 'english'
                  ? 'English'
                  : lang}
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="inline-form">
            <input
              aria-label="추가할 지문 언어"
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value)}
              placeholder="english"
            />
            <button
              className="button small"
              disabled={
                !/^[a-z][a-z0-9-]*$/.test(newLanguage) ||
                Boolean(doc.statements[newLanguage])
              }
              onClick={() => {
                mutate((d) => {
                  d.statements[newLanguage] = {
                    name: d.info.name,
                    legend: '',
                    input: '',
                    output: '',
                    scoring: '',
                    interaction: '',
                    notes: '',
                    tutorial: '',
                    show_in_review: true,
                  };
                });
                setLanguage(newLanguage);
              }}
            >
              언어 추가
            </button>
          </div>
        )}
      </div>
      {statement && (
        <>
          <section className="card">
            <label>
              이 언어의 문제 제목
              <input
                disabled={!canEdit || busy}
                value={statement.name}
                maxLength={200}
                onChange={(e) =>
                  mutate((d) => {
                    d.statements[language].name = e.target.value;
                  })
                }
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={statement.show_in_review}
                disabled={!canEdit}
                onChange={(e) =>
                  mutate((d) => {
                    d.statements[language].show_in_review = e.target.checked;
                  })
                }
              />
              문제 검수 화면에 표시
            </label>
          </section>
          {fields
            .filter(
              (field) => field.key !== 'interaction' || doc.info.interactive,
            )
            .map((field) => (
              <section className="statement-section" key={field.key}>
                <div className="card">
                  <h3>{field.title}</h3>
                  <CodeEditor
                    label={`${field.title} · LaTeX`}
                    rows={field.rows}
                    value={String(statement[field.key])}
                    readOnly={!canEdit || busy}
                    onChange={(value) =>
                      mutate((d) => {
                        d.statements[language] = {
                          ...d.statements[language],
                          [field.key]: value,
                        };
                      })
                    }
                  />
                </div>
                {preview && (
                  <div className="card statement-preview">
                    <span className="eyebrow">미리보기</span>
                    <Markdown>
                      {String(statement[field.key]) ||
                        '내용을 입력하면 여기에서 확인할 수 있습니다.'}
                    </Markdown>
                  </div>
                )}
              </section>
            ))}
          <div className="workspace-guide">
            <Icon name="help" />
            <p>
              수식은 <code>$a+b$</code> 또는 <code>$$…$$</code>로 작성합니다.
              예제는 테스트 목록에서 ‘지문 예제’를 선택하세요.
            </p>
            <Link to={`/problems/${data.problem.id}/tests`}>테스트로 이동</Link>
          </div>
        </>
      )}
    </div>
  );
}
