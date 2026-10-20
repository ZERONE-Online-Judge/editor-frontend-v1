import { BoundedText } from '../../components/ui';
import type { Job, StressConfiguration } from '../../lib/types';
import { tags } from '../../lib/api';

function conditions(job: Job): Partial<StressConfiguration> {
  const saved =
    job.result.stress_configuration || job.options.stress_configuration;
  if (saved) return saved;
  const options = job.options;
  const names =
    Array.isArray(options.candidates) && options.candidates.length
      ? options.candidates.filter(
          (name): name is string => typeof name === 'string',
        )
      : typeof options.candidate === 'string' && options.candidate
        ? [options.candidate]
        : [];
  const generator =
    typeof options.generator === 'string' ? options.generator : '';
  return {
    generator,
    seed_start: 1,
    seed_step: 1,
    seed_mode: generator.includes('{seed}') ? 'placeholder' : 'append',
    reference: typeof options.reference === 'string' ? options.reference : '',
    candidates: names.map((name) => ({
      name,
      tag: job.result.candidate_summaries?.find((row) => row.name === name)
        ?.tag,
    })),
    testset: typeof options.testset === 'string' ? options.testset : undefined,
    iterations:
      typeof options.iterations === 'number' ? options.iterations : undefined,
    duration_seconds:
      typeof options.duration_seconds === 'number'
        ? options.duration_seconds
        : options.duration_seconds === null
          ? null
          : undefined,
    stop_on_first:
      typeof options.stop_on_first === 'boolean'
        ? options.stop_on_first
        : undefined,
    counterexample_limit:
      typeof options.counterexample_limit === 'number'
        ? options.counterexample_limit
        : undefined,
    counterexample_verdicts: Array.isArray(options.counterexample_verdicts)
      ? options.counterexample_verdicts.filter(
          (value): value is string => typeof value === 'string',
        )
      : undefined,
  };
}

export function StressHistorySummary({ job }: { job: Job }) {
  const config = conditions(job);
  const summary = `${config.patterns && config.patterns.length > 1 ? `패턴 ${config.patterns.length}개 · ` : ''}${config.generator || '생성기 명령 미기록'}${config.iterations ? ` · 최대 ${config.iterations}회` : ''}${config.duration_seconds ? ` · ${config.duration_seconds}초` : ''}`;
  return (
    <span className="job-stress-context" title={summary}>
      {summary}
    </span>
  );
}

export default function StressRunConditions({ job }: { job: Job }) {
  const config = conditions(job);
  const stats = job.result.stress;
  const lastSeed = stats?.last_seed;
  return (
    <section
      className="stress-run-conditions"
      aria-label="실행 당시 스트레스 테스트 조건"
    >
      <div>
        <h4>실행 조건</h4>
        <p className="muted small">
          이 기록을 요청했을 때 저장한 조건입니다. 현재 입력창을 바꿔도
          유지됩니다.
        </p>
      </div>
      <div className="stress-command-block">
        {config.patterns && config.patterns.length > 1 ? (
          <>
            <strong>생성기 패턴 · 순서대로 순환</strong>
            {config.patterns.map((pattern, index) => (
              <div className="stress-saved-pattern" key={index}>
                <small>{pattern.name}</small>
                <BoundedText className="stress-command">
                  <code>{pattern.command}</code>
                </BoundedText>
              </div>
            ))}
          </>
        ) : (
          <>
            <strong>생성기 명령</strong>
            <BoundedText className="stress-command">
              <code>{config.generator || '기록되지 않았습니다.'}</code>
            </BoundedText>
          </>
        )}
      </div>
      <dl className="stress-condition-grid">
        <div>
          <dt>시드 규칙</dt>
          <dd>
            {config.seed_start}부터 {config.seed_step}씩 증가 · 반복 번호 사용
          </dd>
          <dd className="muted small">
            {config.patterns && config.patterns.length > 1
              ? '각 패턴의 {seed}를 치환하며 생략하면 마지막 인자로 추가'
              : config.seed_mode === 'placeholder'
                ? '{seed}를 시드로 치환'
                : '마지막 인자로 시드 추가'}
          </dd>
        </div>
        <div>
          <dt>기준 풀이</dt>
          <dd>{config.reference || '요청 당시 Main (파일명 미기록)'}</dd>
        </div>
        <div>
          <dt>비교 풀이 · {config.candidates?.length || 0}개</dt>
          <dd className="stress-candidate-list">
            {config.candidates?.length
              ? config.candidates.map((candidate) => (
                  <span key={candidate.name}>
                    {candidate.name}
                    {candidate.tag
                      ? ` · ${tags[candidate.tag as keyof typeof tags] || candidate.tag}`
                      : ''}
                  </span>
                ))
              : '기록되지 않았습니다.'}
          </dd>
        </div>
        <div>
          <dt>Validator 테스트 세트</dt>
          <dd>{config.testset || '미기록'}</dd>
          {config.group && <dd>그룹 · {config.group}</dd>}
        </div>
        <div>
          <dt>반복·시간 한도</dt>
          <dd>
            {config.iterations
              ? `최대 ${config.iterations.toLocaleString()}회`
              : '반복 횟수 미기록'}{' '}
            ·{' '}
            {config.duration_seconds
              ? `${config.duration_seconds}초`
              : config.duration_seconds === null
                ? '개별 시간 조건 없음'
                : '시간 조건 미기록'}
          </dd>
        </div>
        <div>
          <dt>반례 종료 조건</dt>
          <dd>
            {config.stop_mode === 'all_candidates'
              ? '모든 비교 풀이에서 최소 1개씩 발견'
              : config.stop_on_first === true
                ? '첫 반례 입력의 모든 비교를 마치고 종료'
                : config.stop_on_first === false
                  ? `반례 입력 ${config.counterexample_limit ?? '?'}개까지 수집`
                  : '기록되지 않았습니다.'}
          </dd>
        </div>
        {config.focus_uncovered && (
          <div>
            <dt>비교 대상 정책</dt>
            <dd>반례가 확인된 풀이는 제외 · 미검출 풀이만 계속 검사</dd>
          </div>
        )}
        {config.minimize && (
          <div>
            <dt>자동 축소</dt>
            <dd>
              반례별 최대 {config.minimize_attempts}회 ·{' '}
              {config.minimize_seconds}초
            </dd>
          </div>
        )}
        <div className="stress-condition-wide">
          <dt>수집할 판정</dt>
          <dd>
            {config.counterexample_verdicts?.join(' · ') ||
              '기록되지 않았습니다.'}
          </dd>
        </div>
      </dl>
      <p className="muted small">
        반복·시간·반례 조건 중 먼저 도달하면 종료합니다. 작업 전체에는 서버 실행
        한도가 별도로 적용되며, 중복 입력은 다시 비교하지 않습니다.
      </p>
      {stats && (
        <div className="stress-seed-progress">
          <strong>
            {stats.iterations_started > 0
              ? `${stats.parallelism && stats.parallelism > 1 ? '결과 확인 시드' : '생성 요청 시드'}: ${config.seed_start} ~ ${lastSeed ?? stats.iterations_started}`
              : stats.iterations_scheduled
                ? `${stats.iterations_scheduled}회 병렬 배정`
                : '생성 요청 전'}{' '}
            · {stats.iterations_completed}회 완료
          </strong>
          {stats.parallelism && stats.parallelism > 1 && (
            <p className="muted small">
              최대 {stats.parallelism}개 병렬 ·{' '}
              {stats.iterations_scheduled ?? 0}회 배정
              {stats.last_scheduled_seed != null
                ? ` · 마지막 배정 시드 ${stats.last_scheduled_seed}`
                : ''}
              . 결과는 시드 순서로 반영하며 종료 후 남은 실행은 취소합니다.
            </p>
          )}
          {stats.last_command && (
            <details>
              <summary>
                {stats.parallelism && stats.parallelism > 1
                  ? '마지막 확인 명령'
                  : '마지막 생성 요청 명령'}{' '}
                · 시드 {lastSeed}
              </summary>
              <BoundedText className="stress-command">
                <code>{stats.last_command}</code>
              </BoundedText>
              {stats.last_range_values?.length ? (
                <p className="muted small">
                  범위 치환 ·{' '}
                  {stats.last_range_values
                    .map((value) => `${value.expression} → ${value.value}`)
                    .join(' · ')}
                </p>
              ) : null}
              <p className="muted small">
                생성 요청 기준입니다. 생성·검증·비교 중 중단된 반복은 완료
                횟수에 포함되지 않습니다.
              </p>
            </details>
          )}
        </div>
      )}
      {config.time_limit_ms != null && (
        <details>
          <summary>실행 당시 자원 제한·검증 파일</summary>
          <dl className="stress-condition-grid">
            <div>
              <dt>풀이별 입력당 제한</dt>
              <dd>
                {config.time_limit_ms}ms · {config.memory_limit_mb}MiB
              </dd>
            </div>
            <div>
              <dt>Validator</dt>
              <dd>
                {[config.validator, ...(config.extra_validators || [])]
                  .filter(Boolean)
                  .join(' · ') || '미지정'}
              </dd>
            </div>
            <div>
              <dt>Checker</dt>
              <dd>{config.checker || '미지정'}</dd>
            </div>
            {config.interactor && (
              <div>
                <dt>Interactor</dt>
                <dd>{config.interactor}</dd>
              </div>
            )}
          </dl>
        </details>
      )}
    </section>
  );
}
