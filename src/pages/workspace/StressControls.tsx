import { useState } from 'react';
import type { ExecutionLimits, ProblemDocument } from '../../lib/types';
import { tags } from '../../lib/api';
import { Icon } from '../../components/ui';

const verdicts = [
  ['WA', '오답'],
  ['TLE', '시간 초과'],
  ['MLE', '메모리 초과'],
  ['RE', '실행 오류'],
  ['PE', '출력 형식'],
  ['OLE', '출력 초과'],
  ['IDLENESS_LIMIT', '응답 대기 초과'],
  ['PARTIAL', '부분 점수'],
];

export default function StressControls({
  document: doc,
  limits,
  allowed,
  busy,
  start,
}: {
  document: ProblemDocument;
  limits?: ExecutionLimits;
  allowed: boolean;
  busy: boolean;
  start: (options: Record<string, unknown>) => void;
}) {
  const main =
    Object.keys(doc.solutions).find(
      (name) => doc.solutions[name].tag === 'MA',
    ) || '';
  const [generator, setGenerator] = useState('');
  const [reference, setReference] = useState(main);
  const [candidates, setCandidates] = useState<string[]>(
    Object.keys(doc.solutions).filter(
      (name) => name !== main && doc.solutions[name].tag !== 'NR',
    ),
  );
  const [testset, setTestset] = useState(
    Object.keys(doc.testsets)[0] || 'tests',
  );
  const [mode, setMode] = useState('iterations');
  const [iterations, setIterations] = useState(50);
  const [seconds, setSeconds] = useState(30);
  const [stopFirst, setStopFirst] = useState(true);
  const [target, setTarget] = useState(5);
  const [collect, setCollect] = useState(['WA', 'TLE', 'MLE', 'RE']);
  const selectedSeconds = Math.min(seconds, limits?.stress_seconds || seconds);
  const durations = [...new Set([10, 30, 60, 300, selectedSeconds])]
    .filter((value) => !limits || value <= limits.stress_seconds)
    .sort((a, b) => a - b);
  const comparisonNames = Object.keys(doc.solutions).filter(
    (name) => name !== reference,
  );
  return (
    <section className="card stress-controls">
      <fieldset disabled={!allowed || busy || !limits} className="form-grid">
        <label className="span-2">
          생성기 명령
          <input
            value={generator}
            onChange={(e) => setGenerator(e.target.value)}
            placeholder="gen 100 {seed}"
          />
          <small>
            {'{seed}'}를 반복 번호로 바꿉니다. 생략하면 마지막 인자로 반복
            번호를 추가합니다.
          </small>
        </label>
        <label>
          기준 풀이
          <select
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              setCandidates((previous) =>
                previous.filter((name) => name !== e.target.value),
              );
            }}
          >
            {Object.keys(doc.solutions).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          테스트 세트
          <select value={testset} onChange={(e) => setTestset(e.target.value)}>
            {Object.keys(doc.testsets).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <div className="span-2 invocation-select-list">
          <div className="section-heading">
            <h4>비교할 풀이 · {candidates.length}개</h4>
            <button
              type="button"
              className="button small"
              onClick={() =>
                setCandidates(
                  comparisonNames.filter(
                    (name) => name !== main && doc.solutions[name].tag !== 'NR',
                  ),
                )
              }
            >
              Main 이외 전체
            </button>
          </div>
          {comparisonNames.map((name) => (
            <label className="checkbox" key={name}>
              <input
                type="checkbox"
                checked={candidates.includes(name)}
                onChange={(e) =>
                  setCandidates((previous) =>
                    e.target.checked
                      ? [...previous, name]
                      : previous.filter((item) => item !== name),
                  )
                }
              />
              {name}
              <span className="muted small">
                {tags[doc.solutions[name].tag]}
              </span>
            </label>
          ))}
          <small>
            같은 입력을 모든 선택 풀이에 실행합니다. 기대 판정은 저장된 태그를
            사용하며 변경하지 않습니다.
          </small>
        </div>
        <label>
          실행 기준
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="iterations">반복 횟수</option>
            <option value="duration">실행 시간 + 반복 횟수</option>
          </select>
        </label>
        <label>
          최대 반복 횟수
          <input
            type="number"
            min={1}
            max={limits?.stress_iterations}
            value={iterations}
            onChange={(e) => setIterations(Number(e.target.value))}
          />
        </label>
        {mode === 'duration' && (
          <label>
            최대 실행 시간
            <select
              value={selectedSeconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
            >
              {durations.map((value) => (
                <option value={value} key={value}>
                  {value < 60 ? `${value}초` : `${value / 60}분`}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          반례 발견 후
          <select
            value={stopFirst ? 'first' : 'collect'}
            onChange={(e) => setStopFirst(e.target.value === 'first')}
          >
            <option value="first">첫 반례 입력의 비교를 마치고 종료</option>
            <option value="collect">목표 개수까지 계속 수집</option>
          </select>
        </label>
        {!stopFirst && (
          <label>
            목표 반례 수
            <select
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            >
              {limits?.counterexample_targets.map((value) => (
                <option key={value} value={value}>
                  {value}개
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="span-2 invocation-select-list">
          <h4>수집할 판정</h4>
          <div className="stress-verdict-options">
            {verdicts.map(([code, title]) => (
              <label className="checkbox" key={code}>
                <input
                  type="checkbox"
                  checked={collect.includes(code)}
                  onChange={(e) =>
                    setCollect((previous) =>
                      e.target.checked
                        ? [...previous, code]
                        : previous.filter((item) => item !== code),
                    )
                  }
                />
                {title} · {code}
              </label>
            ))}
          </div>
        </div>
        <p className="muted small span-2">
          {mode === 'duration'
            ? `${selectedSeconds}초·${iterations}회`
            : `${iterations}회`}
          와 반례 종료 조건 중 먼저 도달한 조건에서 멈춥니다. 경과 시간에는
          컴파일과 채점 대기도 포함됩니다. 중복 입력은 다시 비교하지 않습니다.
        </p>
        <button
          className="button primary align-end"
          disabled={
            !generator.trim() ||
            !candidates.length ||
            !reference ||
            !collect.length ||
            !limits ||
            iterations < 1 ||
            iterations > limits.stress_iterations ||
            !Number.isInteger(iterations)
          }
          onClick={() =>
            start({
              generator,
              reference,
              candidates,
              iterations,
              testset,
              duration_seconds: mode === 'duration' ? selectedSeconds : null,
              stop_on_first: stopFirst,
              counterexample_limit: stopFirst ? 1 : target,
              counterexample_verdicts: collect,
            })
          }
        >
          <Icon name="play" />
          스트레스 테스트 시작
        </button>
      </fieldset>
    </section>
  );
}
