import type { ExecutionEnvironment } from '../../lib/types';
import { bytes } from '../../lib/api';

function duration(seconds: number) {
  return seconds >= 60 && seconds % 60 === 0
    ? `${seconds / 60}분`
    : `${seconds}초`;
}

export default function ExecutionLimitsInfo({
  environment,
  stress = false,
}: {
  environment: ExecutionEnvironment | null;
  stress?: boolean;
}) {
  const limits = environment?.limits;
  if (!limits)
    return <p className="muted small">서버의 실행 한도를 확인하고 있습니다.</p>;
  return (
    <section
      className="execution-limits-info"
      aria-label="서버 실행 한도와 처리 현황"
    >
      <strong>
        {stress
          ? `스트레스 최대 ${limits.stress_iterations.toLocaleString()}회 · ${duration(limits.stress_seconds)}`
          : `세트당 테스트 최대 ${limits.tests_per_set.toLocaleString()}개`}{' '}
        · 작업 전체 최대 {duration(limits.job_timeout_seconds)}
      </strong>
      <p className="muted small">
        Editor 작업 동시 처리 {limits.worker_concurrency}개 · 진행 중{' '}
        {environment?.capacity?.running_jobs ?? '확인 중'}개 · 대기{' '}
        {environment?.capacity?.queued_jobs ?? '확인 중'}개
      </p>
      <details>
        <summary>생성기와 실행 환경의 상세 한도</summary>
        <dl className="execution-limit-grid">
          <div>
            <dt>생성기 1회 CPU 시간</dt>
            <dd>{duration(limits.generator_cpu_ms / 1000)}</dd>
          </div>
          <div>
            <dt>생성기 메모리</dt>
            <dd>{limits.generator_memory_mb}MiB</dd>
          </div>
          <div>
            <dt>생성기 출력</dt>
            <dd>{bytes(limits.generator_output_bytes)}</dd>
          </div>
          <div>
            <dt>생성기 인자</dt>
            <dd>최대 {limits.generator_arguments}개</dd>
          </div>
          <div>
            <dt>ZOJ 풀이 연결</dt>
            <dd>작업당 동시 {limits.judge_concurrency}개</dd>
          </div>
          <div>
            <dt>계정당 진행 중 요청</dt>
            <dd>최대 {limits.active_jobs_per_user}개</dd>
          </div>
          {environment?.zoj?.execution?.online_nodes != null && (
            <div>
              <dt>Editor 실행 가능 노드</dt>
              <dd>{environment.zoj.execution.online_nodes}대</dd>
            </div>
          )}
        </dl>
        <p className="muted small">
          서버에서 조회한 설정과 처리 현황이며 15초마다 갱신합니다. 경과
          시간에는 컴파일과 채점 대기도 포함됩니다. 풀이별 CPU·메모리 제한은
          문제 설정을 사용합니다.
        </p>
        {environment?.error && (
          <p className="muted small">채점 환경 조회: {environment.error}</p>
        )}
      </details>
    </section>
  );
}
