import { useState } from 'react';
import type { ProblemDocument, StressPattern } from '../../lib/types';
import { composeStressPatterns } from '../../lib/stressOptions';

export default function StressPatterns({
  patterns,
  onChange,
  document: doc,
  limit,
}: {
  patterns: StressPattern[];
  onChange: (patterns: StressPattern[]) => void;
  document: ProblemDocument;
  limit?: number;
}) {
  const generator =
    Object.values(doc.files).find((file) => file.roles?.includes('generator'))
      ?.name || 'gen';
  const [template, setTemplate] = useState(
    `${generator} {mode} {N} {lo} {hi} {seed}`,
  );
  const [modes, setModes] = useState('');
  const [nMin, setNMin] = useState(1),
    [nMax, setNMax] = useState(100);
  const [valueMin, setValueMin] = useState(-100),
    [valueMax, setValueMax] = useState(100);
  const [error, setError] = useState('');
  function update(index: number, values: Partial<StressPattern>) {
    onChange(
      patterns.map((pattern, i) =>
        i === index ? { ...pattern, ...values } : pattern,
      ),
    );
  }
  return (
    <div className="span-2 stress-patterns">
      {patterns.map((pattern, index) => (
        <div className="stress-pattern-row" key={index}>
          {limit && patterns.length > 1 ? (
            <label>
              패턴 이름 {index + 1}
              <input
                value={pattern.name}
                maxLength={80}
                onChange={(event) =>
                  update(index, { name: event.target.value })
                }
              />
            </label>
          ) : null}
          <label>
            생성기 명령{index ? ` ${index + 1}` : ''}
            <input
              value={pattern.command}
              maxLength={4096}
              placeholder={
                limit ? 'gen [1..10] [50..100] {seed}' : 'gen 100 {seed}'
              }
              onChange={(event) =>
                update(index, { command: event.target.value })
              }
            />
          </label>
          {limit && patterns.length > 1 ? (
            <button
              type="button"
              className="text-button danger"
              onClick={() => onChange(patterns.filter((_, i) => i !== index))}
            >
              패턴 {index + 1} 제거
            </button>
          ) : null}
        </div>
      ))}
      <p className="muted small">
        {limit ? '[a..b]는 매 반복에 범위 안의 정수로 치환합니다. ' : ''}
        {'{seed}'}는 반복 시드로 치환하며, 생략하면 마지막 인자로 추가합니다.
      </p>
      {limit ? (
        <>
          <div className="actions">
            <button
              type="button"
              className="button small"
              disabled={patterns.length >= limit}
              onClick={() =>
                onChange([
                  ...patterns,
                  { name: `패턴 ${patterns.length + 1}`, command: '' },
                ])
              }
            >
              패턴 추가
            </button>
            <span className="muted small">
              여러 패턴은 순서대로 번갈아 실행합니다.
            </span>
          </div>
          <details className="stress-pattern-builder">
            <summary>mode · N · 값 범위로 패턴 조합</summary>
            <div className="form-grid">
              <label className="span-2">
                명령 템플릿
                <input
                  value={template}
                  onChange={(event) => setTemplate(event.target.value)}
                />
              </label>
              <label className="span-2">
                mode 목록
                <input
                  value={modes}
                  onChange={(event) => setModes(event.target.value)}
                  placeholder="0, 1, 2 또는 random, sorted"
                />
                <small>
                  생성기가 지원하는 값만 쉼표로 구분하세요.{' '}
                  {'{mode} {N} {lo} {hi}'}를 생성기의 인자 순서에 맞춰
                  배치합니다.
                </small>
              </label>
              <label>
                N 최솟값
                <input
                  type="number"
                  value={nMin}
                  onChange={(event) => setNMin(Number(event.target.value))}
                />
              </label>
              <label>
                N 최댓값
                <input
                  type="number"
                  value={nMax}
                  onChange={(event) => setNMax(Number(event.target.value))}
                />
              </label>
              <label>
                값 범위 하한
                <input
                  type="number"
                  value={valueMin}
                  onChange={(event) => setValueMin(Number(event.target.value))}
                />
              </label>
              <label>
                값 범위 상한
                <input
                  type="number"
                  value={valueMax}
                  onChange={(event) => setValueMax(Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                className="button small"
                onClick={() => {
                  try {
                    onChange(
                      composeStressPatterns({
                        template,
                        modes,
                        nMin,
                        nMax,
                        valueMin,
                        valueMax,
                        limit,
                      }),
                    );
                    setError('');
                  } catch (failure) {
                    setError((failure as Error).message);
                  }
                }}
              >
                조합을 패턴에 적용
              </button>
              {error && (
                <p role="alert" className="muted small">
                  {error}
                </p>
              )}
              <p className="muted small span-2">
                각 mode마다 패턴을 만들며 N은 지정한 범위에서 뽑습니다.
                하한·상한은 생성기로 넘기는 값입니다. 생성기 자체의 분포·모드
                구현은 그대로 사용합니다.
              </p>
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
