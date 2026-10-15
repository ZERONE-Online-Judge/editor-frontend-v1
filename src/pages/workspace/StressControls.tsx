import { useState } from 'react';
import type {
  ExecutionLimits,
  ProblemDocument,
  StressPattern,
} from '../../lib/types';
import { tags } from '../../lib/api';
import { Icon } from '../../components/ui';
import StressPatterns from './StressPatterns';

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
  const [patterns, setPatterns] = useState<StressPattern[]>([
    { name: '패턴 1', command: '' },
  ]);
  const generator = patterns[0].command;
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
  const [allCandidates, setAllCandidates] = useState(false);
  const [focus, setFocus] = useState(false);
  const [seedStart, setSeedStart] = useState(1),
    [seedStep, setSeedStep] = useState(1);
  const [group, setGroup] = useState('');
  const [minimize, setMinimize] = useState(false);
  const [minimizeAttempts, setMinimizeAttempts] = useState(40),
    [minimizeSeconds, setMinimizeSeconds] = useState(10);
  const advanced = Boolean(limits?.stress_patterns);
  const [target, setTarget] = useState(5);
  const [collect, setCollect] = useState(['WA', 'TLE', 'MLE', 'RE']);
  const selectedSeconds = Math.min(seconds, limits?.stress_seconds || seconds);
  const durations = [...new Set([10, 30, 60, 300, selectedSeconds])]
    .filter((value) => !limits || value <= limits.stress_seconds)
    .sort((a, b) => a - b);
  const comparisonNames = Object.keys(doc.solutions).filter(
    (name) => name !== reference && doc.solutions[name].tag !== 'NR',
  );
  const groups = doc.testsets[testset]?.groups_enabled
    ? Object.keys(doc.testsets[testset].groups)
    : [];
  return (
    <section className="card stress-controls">
      <fieldset disabled={!allowed || busy || !limits} className="form-grid">
        <StressPatterns
          document={doc}
          patterns={patterns}
          onChange={setPatterns}
          limit={limits?.stress_patterns}
        />
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
            {Object.keys(doc.solutions)
              .filter((name) => doc.solutions[name].tag !== 'NR')
              .map((name) => (
                <option key={name}>{name}</option>
              ))}
          </select>
        </label>
        <label>
          테스트 세트
          <select
            value={testset}
            onChange={(e) => {
              setTestset(e.target.value);
              setGroup('');
            }}
          >
            {Object.keys(doc.testsets).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        {advanced && (
          <>
            <label>
              시작 시드
              <input
                type="number"
                min={0}
                step={1}
                value={seedStart}
                onChange={(event) => setSeedStart(Number(event.target.value))}
              />
            </label>
            <label>
              시드 증가량
              <input
                type="number"
                min={1}
                step={1}
                value={seedStep}
                onChange={(event) => setSeedStep(Number(event.target.value))}
              />
            </label>
            {groups.length > 0 && (
              <label>
                검증·등록 그룹
                <select
                  value={group}
                  onChange={(event) => setGroup(event.target.value)}
                >
                  <option value="">그룹 없음</option>
                  {groups.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <small>
                  Validator에 전달하며 반례를 등록할 때 기본 그룹으로
                  사용합니다.
                </small>
              </label>
            )}
          </>
        )}
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
            value={allCandidates ? 'all' : stopFirst ? 'first' : 'collect'}
            onChange={(e) => {
              setStopFirst(e.target.value === 'first');
              setAllCandidates(e.target.value === 'all');
            }}
          >
            <option value="first">첫 반례 입력의 비교를 마치고 종료</option>
            <option value="collect">목표 개수까지 계속 수집</option>
            {advanced && (
              <option value="all">모든 비교 풀이에서 최소 1개씩 발견</option>
            )}
          </select>
        </label>
        {!stopFirst && !allCandidates && (
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
        {advanced && !stopFirst && (
          <label className="checkbox span-2">
            <input
              type="checkbox"
              checked={allCandidates || focus}
              disabled={allCandidates}
              onChange={(event) => setFocus(event.target.checked)}
            />
            미검출 풀이에 집중
            <small>
              반례가 확인된 풀이는 이후 입력에서 제외합니다. 모두 발견하면
              종료하며, 시간·반복 한도는 계속 적용됩니다.
            </small>
          </label>
        )}
        {advanced && (
          <div className="span-2 stress-reduction-control">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={minimize}
                disabled={doc.info.interactive}
                onChange={(event) => setMinimize(event.target.checked)}
              />
              발견한 반례 자동 축소
            </label>
            <p className="muted small">
              N과 N개의 정수 배열은 길이부터 줄이고, 다른 텍스트 입력은 정수
              값을 줄여 봅니다. Validator와 기준 풀이를 실행하고 원래 모든 실패
              판정이 유지된 후보만 저장합니다. 원본은 유지됩니다.
            </p>
            {doc.info.interactive && (
              <p className="muted small">
                인터랙티브 문제는 자동 축소 대상에서 제외합니다.
              </p>
            )}
            {minimize && !doc.info.interactive && (
              <details>
                <summary>반례별 축소 한도</summary>
                <div className="form-grid">
                  <label>
                    최대 축소 시도
                    <input
                      type="number"
                      min={1}
                      max={limits?.minimize_attempts}
                      value={minimizeAttempts}
                      onChange={(event) =>
                        setMinimizeAttempts(Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    최대 축소 시간(초)
                    <input
                      type="number"
                      min={1}
                      max={limits?.minimize_seconds}
                      value={minimizeSeconds}
                      onChange={(event) =>
                        setMinimizeSeconds(Number(event.target.value))
                      }
                    />
                  </label>
                </div>
                <p className="muted small">
                  반례 탐색 후 남은 작업 시간 안에서 축소합니다. 전체 입력 중
                  수학적인 최소 반례를 보장하는 기능은 아닙니다.
                </p>
              </details>
            )}
          </div>
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
            patterns.some((pattern) => !pattern.command.trim()) ||
            !candidates.length ||
            !reference ||
            !collect.length ||
            !limits ||
            iterations < 1 ||
            iterations > limits.stress_iterations ||
            !Number.isInteger(iterations) ||
            (advanced &&
              (!Number.isSafeInteger(seedStart) ||
                seedStart < 0 ||
                !Number.isSafeInteger(seedStep) ||
                seedStep < 1 ||
                !Number.isSafeInteger(
                  seedStart + (iterations - 1) * seedStep,
                ) ||
                (minimize &&
                  (!Number.isInteger(minimizeAttempts) ||
                    minimizeAttempts < 1 ||
                    minimizeAttempts > (limits?.minimize_attempts || 0) ||
                    !Number.isInteger(minimizeSeconds) ||
                    minimizeSeconds < 1 ||
                    minimizeSeconds > (limits?.minimize_seconds || 0)))))
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
              ...(advanced
                ? {
                    patterns,
                    seed_start: seedStart,
                    seed_step: seedStep,
                    group,
                    stop_mode: allCandidates
                      ? 'all_candidates'
                      : stopFirst
                        ? 'first'
                        : 'target',
                    focus_uncovered: !stopFirst && (allCandidates || focus),
                    minimize: minimize && !doc.info.interactive,
                    minimize_attempts: minimizeAttempts,
                    minimize_seconds: minimizeSeconds,
                  }
                : {}),
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
