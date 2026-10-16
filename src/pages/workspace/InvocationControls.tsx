import { useEffect, useState } from 'react';
import { api, tags } from '../../lib/api';
import { parseTestIndices } from '../../lib/invocationOptions';
import type {
  ExecutionLimits,
  Language,
  ProblemDocument,
  SolutionTag,
} from '../../lib/types';
import { CodeEditor, Icon, Notice } from '../../components/ui';

export default function InvocationControls({
  problemId,
  document: doc,
  revision,
  limits,
  allowed,
  writer,
  busy,
  start,
}: {
  problemId: string;
  document: ProblemDocument;
  revision: number;
  limits?: ExecutionLimits;
  allowed: boolean;
  writer: boolean;
  busy: boolean;
  start: (options: Record<string, unknown>) => void;
}) {
  const [chosenSnapshot, setSnapshot] = useState(
    writer ? 'working_copy' : 'committed',
  );
  const snapshot = writer ? chosenSnapshot : 'committed';
  const [committed, setCommitted] = useState<{
    id: string;
    revision: number;
    document: ProblemDocument;
  } | null>(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (snapshot !== 'committed') return;
    let active = true;
    void api<ProblemDocument>(`/problems/${problemId}/revisions/${revision}`)
      .then((value) => {
        if (active) {
          setCommitted({ id: problemId, revision, document: value });
          setLoadError('');
        }
      })
      .catch((e) => {
        if (active) setLoadError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [snapshot, problemId, revision]);
  const source =
    snapshot === 'working_copy'
      ? doc
      : committed?.id === problemId && committed.revision === revision
        ? committed.document
        : null;
  const [chosenSet, setTestset] = useState(
    Object.keys(doc.testsets)[0] || 'tests',
  );
  const [allTestsets, setAllTestsets] = useState(false);
  const testset = source?.testsets[chosenSet]
    ? chosenSet
    : Object.keys(source?.testsets || {})[0] || '';
  const [solutionMode, setSolutionMode] = useState('all');
  const [solutions, setSolutions] = useState<string[]>([]);
  const [testMode, setTestMode] = useState('all');
  const [range, setRange] = useState('');
  const [indices, setIndices] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [forcePrepare, setForcePrepare] = useState(false);
  const [reviewName, setReviewName] = useState('review.py');
  const [reviewLanguage, setReviewLanguage] = useState<Language>('python3');
  const [reviewTag, setReviewTag] = useState<SolutionTag>('OK');
  const [reviewCode, setReviewCode] = useState('');
  const availableSolutions = Object.keys(source?.solutions || {}).filter(
    (key) => source!.solutions[key].tag !== 'NR',
  );
  const selectedSolutions = solutions.filter((key) =>
    availableSolutions.includes(key),
  );
  const tests = Object.values(source?.testsets[testset]?.tests || {}).sort(
    (a, b) => a.index - b.index,
  );
  let selectedIndices: number[] = [];
  let scopeError = '';
  if (!allTestsets && testMode === 'range') {
    try {
      selectedIndices = parseTestIndices(range, limits?.tests_per_set || 0);
    } catch (e) {
      scopeError = (e as Error).message;
    }
  } else if (!allTestsets && testMode === 'selected') {
    selectedIndices = indices.filter((index) =>
      tests.some((test) => test.index === index),
    );
    if (!selectedIndices.length)
      scopeError = '실행할 테스트를 하나 이상 선택하세요.';
  }
  const blocked =
    !allowed || busy || !source || !testset || Boolean(scopeError);
  const scope = {
    name,
    note,
    snapshot,
    testset: allTestsets ? Object.keys(source?.testsets || {})[0] : testset,
    ...(allTestsets ? { all_testsets: true } : {}),
    test_indices: selectedIndices,
    verify: true,
    force_prepare: forcePrepare,
  };
  return (
    <div className="section-stack invocation-controls">
      <h3>풀이 검증 실행</h3>
      <p className="muted small">
        실행할 자료와 범위를 지정합니다. 기존 풀이의 기대 판정은 저장된 태그를
        사용합니다. NR 풀이는 실행하지 않습니다.
      </p>
      <fieldset disabled={!allowed || busy} className="form-grid">
        <label>
          실행 이름
          <input
            value={name}
            maxLength={120}
            placeholder="예: 정렬 경계 검수"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          실행할 자료
          <select
            value={snapshot}
            onChange={(e) => setSnapshot(e.target.value)}
          >
            <option value="working_copy" disabled={!writer}>
              내 작업 사본 · 실행 전에 저장
            </option>
            <option value="committed">커밋된 리비전 r{revision}</option>
          </select>
        </label>
        <label>
          검증 테스트 세트
          <select
            value={allTestsets ? '' : testset}
            onChange={(e) => {
              setAllTestsets(e.target.value === '');
              if (e.target.value) setTestset(e.target.value);
              setIndices([]);
              setRange('');
              setTestMode('all');
            }}
          >
            {Object.keys(source?.testsets || {}).map((key) => (
              <option key={key}>{key}</option>
            ))}
            <option value="">
              전체 세트 · {Object.keys(source?.testsets || {}).length}개
            </option>
          </select>
        </label>
        <label>
          대상 풀이
          <select
            value={solutionMode}
            onChange={(e) => setSolutionMode(e.target.value)}
          >
            <option value="all">전체 풀이</option>
            <option value="selected">선택한 풀이</option>
          </select>
        </label>
        {solutionMode === 'selected' && (
          <div className="span-2 invocation-select-list">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={
                  selectedSolutions.length === availableSolutions.length &&
                  availableSolutions.length > 0
                }
                onChange={(e) =>
                  setSolutions(e.target.checked ? availableSolutions : [])
                }
              />
              전체 선택
            </label>
            {availableSolutions.map((key) => (
              <label className="checkbox" key={key}>
                <input
                  type="checkbox"
                  checked={selectedSolutions.includes(key)}
                  onChange={(e) =>
                    setSolutions(
                      e.target.checked
                        ? [...selectedSolutions, key]
                        : selectedSolutions.filter((item) => item !== key),
                    )
                  }
                />
                {key}
                <span className="muted small">
                  {tags[source!.solutions[key].tag]}
                </span>
              </label>
            ))}
          </div>
        )}
        <label>
          테스트 범위
          <select
            value={testMode}
            disabled={allTestsets}
            onChange={(e) => setTestMode(e.target.value)}
          >
            <option value="all">전체 테스트</option>
            <option value="range">번호 범위</option>
            <option value="selected">선택한 등록 테스트</option>
          </select>
        </label>
        {allTestsets && (
          <p className="muted small span-2">
            포함할 세트: {Object.keys(source?.testsets || {}).join(', ')}.
            세트·그룹별 기대 판정을 각각 확인합니다. 번호 범위는 한 세트를
            선택했을 때 지정할 수 있습니다.
          </p>
        )}
        {testMode === 'range' && (
          <label>
            테스트 번호·범위
            <input
              value={range}
              maxLength={4000}
              placeholder="1-10, 15, 20-25"
              onChange={(e) => setRange(e.target.value)}
            />
            <small>
              현재 세트에 존재하는 번호만 지정하세요. 생성 스크립트로 만들
              예정인 번호도 지정할 수 있습니다.
            </small>
          </label>
        )}
        {testMode === 'selected' && (
          <div className="span-2 invocation-select-list">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={
                  selectedIndices.length === tests.length && tests.length > 0
                }
                onChange={(e) =>
                  setIndices(
                    e.target.checked ? tests.map((test) => test.index) : [],
                  )
                }
              />
              등록 테스트 전체 선택
            </label>
            {tests.map((test) => (
              <label className="checkbox" key={test.index}>
                <input
                  type="checkbox"
                  checked={selectedIndices.includes(test.index)}
                  onChange={(e) =>
                    setIndices(
                      e.target.checked
                        ? [...selectedIndices, test.index]
                        : selectedIndices.filter(
                            (index) => index !== test.index,
                          ),
                    )
                  }
                />
                #{test.index} ·{' '}
                {test.description ||
                  (test.command ? '생성기 입력' : '직접 입력')}
              </label>
            ))}
            {!tests.length && (
              <p className="muted small">
                등록된 테스트가 없습니다. 생성 스크립트는 번호 범위 또는 전체
                테스트로 실행하세요.
              </p>
            )}
          </div>
        )}
        <details className="span-2 invocation-preparation-options">
          <summary>테스트 준비 옵션</summary>
          <p className="muted small">
            변경되지 않은 입력·정답과 검사 결과는 자동으로 재사용합니다. 풀이의
            판정·시간·메모리는 매번 실제 채점으로 확인합니다.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={forcePrepare}
              onChange={(e) => setForcePrepare(e.target.checked)}
            />
            준비 결과를 재사용하지 않고 다시 실행
          </label>
          {snapshot === 'committed' && (
            <p className="muted small">
              커밋된 리비전은 저장된 입력·정답을 유지하고 검사를 다시
              실행합니다.
            </p>
          )}
        </details>
        <label className="span-2">
          실행 메모
          <textarea
            value={note}
            maxLength={8000}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            placeholder="검수 목적과 확인할 부분을 기록하세요."
          />
        </label>
      </fieldset>
      {loadError && snapshot === 'committed' && (
        <Notice tone="error">{loadError}</Notice>
      )}
      {testMode !== 'all' && scopeError && (
        <p className="muted small">{scopeError}</p>
      )}
      <button
        className="button primary"
        disabled={
          blocked || (solutionMode === 'selected' && !selectedSolutions.length)
        }
        onClick={() =>
          start({
            ...scope,
            solutions: solutionMode === 'all' ? [] : selectedSolutions,
          })
        }
      >
        <Icon name="play" />
        {solutionMode === 'all' && testMode === 'all'
          ? '전체 풀이 검증 시작'
          : '선택 범위 검증 시작'}
      </button>
      {allowed && (
        <details className="invocation-review-code">
          <summary>내 임시 검수 코드 실행</summary>
          <p className="muted small">
            위에서 지정한 자료·테스트 범위를 사용합니다. 기존 파일을 덮어쓰지
            않으며 코드는 이 실행에만 포함됩니다.
          </p>
          <div className="form-grid">
            <label>
              임시 코드 파일명
              <input
                value={reviewName}
                onChange={(e) => setReviewName(e.target.value)}
              />
            </label>
            <label>
              임시 코드 언어
              <select
                value={reviewLanguage}
                onChange={(e) => setReviewLanguage(e.target.value as Language)}
              >
                {[
                  'python3',
                  'cpp17',
                  'cpp20',
                  'c99',
                  'c17',
                  'java8',
                  'java17',
                ].map((language) => (
                  <option key={language}>{language}</option>
                ))}
              </select>
            </label>
            <label>
              임시 코드의 기대 판정
              <select
                value={reviewTag}
                onChange={(e) => setReviewTag(e.target.value as SolutionTag)}
              >
                {Object.entries(tags)
                  .filter(([tag]) => tag !== 'MA')
                  .map(([tag, title]) => (
                    <option value={tag} key={tag}>
                      {title}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <CodeEditor
            label="임시 검수 코드"
            value={reviewCode}
            onChange={setReviewCode}
            readOnly={!allowed}
            rows={10}
          />
          <button
            className="button"
            disabled={blocked || !reviewCode.trim() || !reviewName}
            onClick={() =>
              start({
                ...scope,
                solutions: [reviewName],
                temporary_solutions: [
                  {
                    name: reviewName,
                    language: reviewLanguage,
                    tag: reviewTag,
                    content: reviewCode,
                  },
                ],
              })
            }
          >
            임시 코드 검증 시작
          </button>
        </details>
      )}
    </div>
  );
}
