import { useEffect, useRef, useState } from 'react';
import { api, ApiError, languages, tags } from '../../lib/api';
import { can, canEdit } from '../../lib/permissions';
import { parseTestIndices } from '../../lib/invocationOptions';
import {
  singleVerificationFilename,
  singleVerificationLanguages,
  singleVerificationTags,
  type SingleVerificationLanguage,
  type SingleVerificationTag,
} from '../../lib/singleVerification';
import type { ExecutionEnvironment, ProblemDocument } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { CodeEditor, Icon, Notice, SectionHeading } from '../../components/ui';
import Select from '../../components/Select';
import RecentExecutions from '../../components/RecentExecutions';
import TestsetSelector from './TestsetSelector';
import JudgeCompatibilityNotice from './JudgeCompatibilityNotice';
import './SingleVerification.css';

export default function SingleVerification() {
  const { data } = useWorkspace();
  return (
    <SingleVerificationForm
      key={`${data.problem.id}/${canEdit(data.problem)}/${can(data.problem, 'execute')}`}
    />
  );
}

function SingleVerificationForm() {
  const { data, document: doc, busy, run } = useWorkspace();
  const problemId = data.problem.id;
  const revision = data.problem.revision;
  const allowed = can(data.problem, 'execute');
  const writer = canEdit(data.problem);
  const [snapshot, setSnapshot] = useState(
    writer ? 'working_copy' : 'committed',
  );
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const [committed, setCommitted] = useState<{
    key: string;
    document?: ProblemDocument;
    error?: string;
  } | null>(null);
  const sourceKey = `${problemId}/${revision}/${sourceAttempt}`;
  useEffect(() => {
    if (snapshot !== 'committed') return;
    let active = true;
    void api<ProblemDocument>(`/problems/${problemId}/revisions/${revision}`)
      .then((document) => {
        if (active) setCommitted({ key: sourceKey, document });
      })
      .catch((error) => {
        if (active)
          setCommitted({ key: sourceKey, error: (error as Error).message });
      });
    return () => {
      active = false;
    };
  }, [snapshot, problemId, revision, sourceKey]);
  const source =
    snapshot === 'working_copy'
      ? doc
      : committed?.key === sourceKey
        ? committed.document
        : undefined;
  const sourceError =
    snapshot === 'committed' && committed?.key === sourceKey
      ? committed.error
      : '';
  const [chosenSets, setSets] = useState(Object.keys(doc.testsets).slice(0, 1));
  const selectedSets = Object.keys(source?.testsets || {}).filter((name) =>
    chosenSets.includes(name),
  );
  const [testMode, setTestMode] = useState('all');
  const [range, setRange] = useState('');
  const [forcePrepare, setForcePrepare] = useState(false);
  const [base, setBase] = useState('review');
  const [language, setLanguage] =
    useState<SingleVerificationLanguage>('python3');
  const [tag, setTag] = useState<SingleVerificationTag>('OK');
  const [code, setCode] = useState('');
  const [environment, setEnvironment] = useState<ExecutionEnvironment | null>(
    null,
  );
  const [environmentError, setEnvironmentError] = useState('');
  const [environmentAttempt, setEnvironmentAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [startError, setStartError] = useState<Error | null>(null);
  const lifecycle = useRef({ active: true });
  useEffect(() => {
    const scope = { active: true };
    lifecycle.current = scope;
    return () => {
      scope.active = false;
    };
  }, []);
  useEffect(() => {
    let active = true,
      pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const value = await api<ExecutionEnvironment>('/execution-environment');
        if (active) {
          setEnvironment(value);
          setEnvironmentError('');
        }
      } catch (error) {
        if (active) {
          setEnvironment(null);
          setEnvironmentError((error as Error).message);
        }
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (window.document.visibilityState !== 'hidden') void refresh();
    }, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [environmentAttempt]);
  let filename = '',
    filenameError = '',
    scopeError = '';
  let selectedIndices: number[] = [];
  try {
    filename = singleVerificationFilename(base, language);
  } catch (error) {
    filenameError = (error as Error).message;
  }
  if (selectedSets.length === 1 && testMode === 'range') {
    try {
      selectedIndices = parseTestIndices(
        range,
        environment?.limits?.tests_per_set || 0,
      );
    } catch (error) {
      scopeError = (error as Error).message;
    }
  }
  const environmentReady = Boolean(
    environment?.zoj_configured && !environment.error,
  );
  const locked = busy || submitting;
  const blocked =
    !allowed ||
    locked ||
    !source ||
    !selectedSets.length ||
    !code.trim() ||
    Boolean(filenameError || scopeError) ||
    !environmentReady ||
    !singleVerificationTags.includes(tag);
  async function start() {
    if (blocked || submittingRef.current) return;
    const scope = lifecycle.current;
    submittingRef.current = true;
    setSubmitting(true);
    setStartError(null);
    try {
      await run('verify', {
        single_verification: true,
        execution_backend: 'zoj',
        snapshot,
        testset: selectedSets[0],
        testsets: selectedSets,
        test_indices: selectedIndices,
        verify: true,
        force_prepare: forcePrepare,
        solutions: [filename],
        temporary_solutions: [{ name: filename, language, tag, content: code }],
      });
    } catch (error) {
      if (scope.active)
        setStartError(
          error instanceof Error
            ? error
            : new Error('단일 검증을 시작하지 못했습니다.'),
        );
    } finally {
      if (scope.active) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }
  return (
    <div className="section-stack single-verification">
      <SectionHeading
        title="단일 검증"
        description="코드를 붙여넣고 선택한 테스트에서 한 개의 풀이를 검증합니다."
      />
      <section
        className="card single-verification-launcher"
        aria-label="단일 코드 검증 실행"
      >
        <div className="single-verification-environment">
          <strong>ZOJ 실제 채점기</strong>
          <p className="muted small">
            테스트 준비에는 선택한 자료의 생성기·Main 정답·검사기를 사용합니다.
            붙여넣은 코드는 이 실행에 보관됩니다.
          </p>
        </div>
        {!allowed && (
          <Notice>단일 검증을 실행하려면 실행 권한이 필요합니다.</Notice>
        )}
        <fieldset
          disabled={!allowed || locked}
          className="single-verification-fields"
        >
          <div className="form-grid">
            <label>
              파일명 · 확장자 제외
              <input
                aria-label="단일 검증 파일명"
                value={base}
                maxLength={104}
                placeholder="예: review 또는 Main"
                onChange={(event) => setBase(event.target.value)}
              />
            </label>
            <label>
              언어
              <Select
                aria-label="단일 검증 언어"
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as SingleVerificationLanguage)
                }
              >
                {singleVerificationLanguages.map((value) => (
                  <option key={value} value={value}>
                    {languages[value]}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              기대 판정
              <Select
                aria-label="단일 검증 기대 판정"
                value={tag}
                onChange={(event) =>
                  setTag(event.target.value as SingleVerificationTag)
                }
              >
                {singleVerificationTags.map((value) => (
                  <option value={value} key={value}>
                    {tags[value]}
                  </option>
                ))}
              </Select>
            </label>
            <div className="single-verification-filename">
              <span className="muted small">실행 파일명</span>
              <code>{filename || '파일명을 확인하세요'}</code>
            </div>
          </div>
          {filenameError && (
            <p className="small single-verification-error" role="alert">
              {filenameError}
            </p>
          )}
          <p className="muted small">
            확장자는 언어에 맞춰 자동으로 붙습니다. Java 코드가{' '}
            <code>public class Main</code>이면 파일명을 <code>Main</code>으로
            입력하세요.
          </p>
          <CodeEditor
            label="검증할 코드"
            value={code}
            onChange={setCode}
            readOnly={!allowed || locked}
            rows={14}
          />
          <details className="single-verification-scope" open>
            <summary>검증 자료와 테스트 범위</summary>
            <div className="form-grid">
              <label>
                실행할 자료
                <Select
                  aria-label="단일 검증 자료"
                  value={snapshot}
                  onChange={(event) => {
                    setSnapshot(event.target.value);
                    setTestMode('all');
                    setRange('');
                  }}
                >
                  <option value="working_copy" disabled={!writer}>
                    내 작업 사본 · 실행 전에 저장
                  </option>
                  <option value="committed">커밋된 리비전 r{revision}</option>
                </Select>
              </label>
              <label>
                테스트 범위
                <Select
                  aria-label="단일 검증 테스트 범위"
                  disabled={selectedSets.length !== 1}
                  value={selectedSets.length === 1 ? testMode : 'all'}
                  onChange={(event) => setTestMode(event.target.value)}
                >
                  <option value="all">전체 테스트</option>
                  <option value="range">번호 범위</option>
                </Select>
              </label>
              <TestsetSelector
                label="단일 검증 테스트 세트"
                testsets={source?.testsets || {}}
                value={selectedSets}
                onChange={(names) => {
                  setSets(names);
                  setTestMode('all');
                  setRange('');
                }}
              />
              {selectedSets.length === 1 && testMode === 'range' && (
                <label>
                  테스트 번호·범위
                  <input
                    aria-label="단일 검증 테스트 번호"
                    value={range}
                    maxLength={4000}
                    placeholder="1-10, 15, 20-25"
                    onChange={(event) => setRange(event.target.value)}
                  />
                  <small>
                    생성 스크립트로 만들 예정인 번호도 지정할 수 있습니다.
                  </small>
                </label>
              )}
              <label className="checkbox span-2">
                <input
                  type="checkbox"
                  checked={forcePrepare}
                  onChange={(event) => setForcePrepare(event.target.checked)}
                />
                테스트 준비 결과를 재사용하지 않고 다시 실행
              </label>
            </div>
          </details>
        </fieldset>
        {snapshot === 'committed' && !source && !sourceError && (
          <p className="muted small" role="status">
            커밋된 자료를 불러오고 있습니다.
          </p>
        )}
        {sourceError && (
          <Notice tone="error">
            {sourceError}{' '}
            <button
              className="text-button"
              onClick={() => setSourceAttempt((value) => value + 1)}
            >
              다시 불러오기
            </button>
          </Notice>
        )}
        {scopeError && <Notice tone="error">{scopeError}</Notice>}
        {environmentError ? (
          <Notice tone="error">
            채점 환경을 확인하지 못했습니다. {environmentError}{' '}
            <button
              className="text-button"
              onClick={() => setEnvironmentAttempt((value) => value + 1)}
            >
              다시 확인
            </button>
          </Notice>
        ) : !environment ? (
          <p className="muted small" role="status">
            ZOJ 채점 환경을 확인하고 있습니다.
          </p>
        ) : !environmentReady ? (
          <Notice tone="error">
            {environment.error ||
              'ZOJ 채점기 연결이 설정되지 않았습니다. 관리자에게 문의하세요.'}
          </Notice>
        ) : null}
        {startError &&
          (startError instanceof ApiError &&
          startError.code === 'judge_incompatible' ? (
            <JudgeCompatibilityNotice
              error={startError}
              problemId={problemId}
            />
          ) : (
            <Notice tone="error">{startError.message}</Notice>
          ))}
        <button
          className="button primary"
          disabled={blocked}
          onClick={() => void start()}
        >
          <Icon name="play" />
          {submitting ? '검증 요청 중…' : '이 코드만 검증'}
        </button>
      </section>
      <RecentExecutions category="verify-single" />
    </div>
  );
}
