import { can } from '../../lib/permissions';
import { useEffect, useState } from 'react';
import { useWorkspace } from '../../lib/workspace';
import {
  translationCanonical,
  translationHash,
  statementCanonical,
} from '../../lib/sharedStatements';
import { CodeEditor, Badge } from '../../components/ui';
import Markdown from '../../components/Markdown';

export default function SharedStatements({ language }: { language: string }) {
  const { document: doc, data, mutate, editable, notify } = useWorkspace();
  const canonical = translationCanonical(doc);
  const targets = Object.fromEntries(
    Object.keys(doc.statements).map((name) => [
      name,
      statementCanonical(doc, name),
    ]),
  );
  const snapshot = JSON.stringify({ canonical, targets });
  const [fingerprint, setFingerprint] = useState<{
    key: string;
    hash: string;
    targets: Record<string, string>;
  }>({ key: '', hash: '', targets: {} });
  const [error, setError] = useState('');
  useEffect(() => {
    const { canonical, targets } = JSON.parse(snapshot) as {
      canonical: string | null;
      targets: Record<string, string>;
    };
    let active = true;
    if (canonical)
      void Promise.all([
        translationHash(canonical),
        ...Object.values(targets).map(translationHash),
      ])
        .then(([hash, ...targetHashes]) => {
          if (active) {
            setFingerprint({
              key: snapshot,
              hash,
              targets: Object.fromEntries(
                Object.keys(targets).map((name, index) => [
                  name,
                  targetHashes[index],
                ]),
              ),
            });
            setError('');
          }
        })
        .catch(() => {
          if (active)
            setError('이 브라우저에서 원문 내용을 확인하지 못했습니다.');
        });
    return () => {
      active = false;
    };
  }, [snapshot]);
  const current =
    canonical && fingerprint.key === snapshot ? fingerprint.hash : null;
  return (
    <section className="card shared-statements">
      <details>
        <summary>공통 설명·해설 · 모든 언어에 적용</summary>
        <p className="muted small">
          수식·증명·코드·복잡도 표를 공통으로 작성하고 언어별 문장만 별도
          관리합니다. 공통 해설도 검수용 해설 영역에만 포함됩니다.
        </p>
        {(
          [
            ['common_statement', '공통 설명'],
            ['common_tutorial', '공통 해설 · 검수용'],
          ] as const
        ).map(([key, label]) => (
          <div className="statement-section" key={key}>
            <CodeEditor
              label={label}
              value={doc[key] || ''}
              readOnly={!editable}
              rows={7}
              onChange={(value) =>
                mutate((d) => {
                  d[key] = value;
                })
              }
            />
            <div className="card statement-preview">
              <Markdown>
                {doc[key] ||
                  '공통 내용을 작성하면 모든 언어의 미리보기와 내보내기에 반영됩니다.'}
              </Markdown>
            </div>
          </div>
        ))}
      </details>
      <label>
        번역 기준 원문
        <select
          disabled={!editable}
          value={doc.translation_source || ''}
          onChange={(e) =>
            mutate((d) => {
              d.translation_source = e.target.value || null;
              if (d.translation_reviews && e.target.value)
                delete d.translation_reviews[e.target.value];
            })
          }
        >
          <option value="">원문 언어 지정 안 함</option>
          {Object.keys(doc.statements).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <div className="source-role-badges">
        {Object.keys(doc.statements).map((name) => {
          const review = doc.translation_reviews?.[name];
          const state =
            name === doc.translation_source
              ? '기준 원문'
              : !canonical
                ? '기준 미지정'
                : !current
                  ? '원문 확인 중'
                  : !review
                    ? '검토 전'
                    : review.source_hash !== current
                      ? '원문 변경 · 재검토 필요'
                      : review.target_hash !== fingerprint.targets[name]
                        ? '번역 변경 · 재검토 필요'
                        : '원문과 동기화됨';
          return (
            <Badge
              key={name}
              tone={state.includes('재검토 필요') ? 'warning' : 'accent'}
            >
              {name} · {state}
            </Badge>
          );
        })}
      </div>
      <button
        className="button small"
        disabled={
          !current ||
          language === doc.translation_source ||
          (!editable && !can(data.problem, 'translate'))
        }
        onClick={() => {
          if (current)
            mutate((d) => {
              d.translation_reviews = {
                ...d.translation_reviews,
                [language]: {
                  source_hash: current,
                  target_hash: fingerprint.targets[language],
                },
              };
            });
          notify('현재 원문 내용을 기준으로 번역 검토 표시를 저장했습니다.');
        }}
      >
        현재 언어 번역을 최신 원문 기준으로 검토 완료
      </button>
      <p className="muted small">
        자동 번역 정확도를 보증하는 표시가 아닙니다. 직접 검토한 번역을 기록하며
        원문 내용이 바뀌면 다시 안내합니다.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
