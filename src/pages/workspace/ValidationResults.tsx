import { PaginatedList } from '../../components/Pagination';
import { Badge, Icon, Notice } from '../../components/ui';
import type { Job } from '../../lib/types';
import {
  isInputCheck,
  validationExplanation,
  validationVerdict,
} from '../../lib/validationResults';

export default function ValidationResults({ job }: { job: Job }) {
  const inputs = isInputCheck(job);
  const rows = job.result.unit_tests || [];
  const tests = Object.entries(job.result.testsets || {}).flatMap(
    ([setName, tests]) => tests.map((test) => ({ ...test, setName })),
  );
  const total = inputs ? tests.length : rows.length;
  const passed = inputs
    ? tests.filter((test) => test.validator === 'VALID').length
    : rows.filter((test) => test.matched).length;
  const invalid = tests.filter((test) => test.validator === 'INVALID').length;
  const crashed = tests.filter((test) => test.validator === 'CRASHED').length;
  const completed = job.status === 'completed';
  const success =
    completed && total > 0 && passed === total && !job.result.error;
  const mismatch = completed && total > 0 && passed < total;
  const failed = job.status === 'failed' || Boolean(job.result.error);
  const interrupted = job.status === 'cancelled';
  const label = inputs
    ? '입력 검사'
    : job.kind === 'validator-tests'
      ? 'Validator 자체 테스트'
      : job.kind === 'checker-tests'
        ? 'Checker 자체 테스트'
        : '구성요소 자체 테스트';
  const title = success
    ? inputs
      ? `입력 ${total}개가 검사에 통과했습니다.`
      : `${total}개 테스트가 모두 예상대로 동작했습니다.`
    : mismatch
      ? inputs
        ? '입력 검사 결과를 확인해 주세요.'
        : '예상과 다른 검사 결과가 있습니다.'
      : failed
        ? inputs && job.result.error?.includes('입력 조건 위반')
          ? '입력 조건을 위반한 테스트가 있습니다.'
          : `${label}를 완료하지 못했습니다.`
        : interrupted
          ? `${label}가 중단되었습니다.`
          : completed
            ? '확인할 수 있는 검사 결과가 없습니다.'
            : job.status === 'queued'
              ? `${label}를 기다리고 있습니다.`
              : `${label}를 진행하고 있습니다.`;
  return (
    <section className="validation-results" aria-label={label}>
      <div
        className={`verification-summary ${success ? 'passed' : failed || mismatch ? 'mismatch' : 'pending'}`}
      >
        <Icon
          name={success ? 'check' : failed || mismatch ? 'issue' : 'clock'}
        />
        <div>
          <strong>{title}</strong>
          <p>
            {success
              ? inputs
                ? '등록 입력과 생성 입력이 Validator 조건을 통과했습니다. 정답·오답 판정이나 풀이 검증은 포함하지 않습니다.'
                : job.kind === 'validator-tests'
                  ? '무효 입력을 거부하는 것도 해당 테스트의 기대 판정과 같으면 정상입니다.'
                  : '테스트에 설정한 기대 판정과 프로그램의 실제 판정을 비교한 결과입니다.'
              : mismatch
                ? inputs
                  ? '세트와 테스트별 검사 결과를 확인하고, 조건 위반 또는 실행 오류를 수정하세요.'
                  : '아래에서 기대한 동작과 실제 동작을 비교하고, 예상과 다른 테스트를 확인하세요.'
                : failed || interrupted
                  ? '검사 전체가 완료된 결과가 아닙니다. 확인된 결과와 실행 메시지를 확인하세요.'
                  : completed
                    ? '실행된 테스트가 없거나 이 기록에 판정이 남아 있지 않습니다. 테스트 등록 상태를 확인한 뒤 다시 검사하세요.'
                    : '검사가 끝나면 전체 통과 여부를 확인할 수 있습니다.'}
          </p>
          {total > 0 && (
            <p className="validation-totals">
              {completed ? '전체' : '확인된 결과'} {total}개 ·{' '}
              {inputs ? '입력 조건 통과' : '예상대로 동작'} {passed}개 ·{' '}
              {inputs ? (
                <>
                  {invalid > 0 && <>입력 조건 위반 {invalid}개 · </>}
                  {crashed > 0 && <>실행 오류 {crashed}개 · </>}
                  미확인 {total - passed - invalid - crashed}개
                </>
              ) : (
                <>예상과 다름 {total - passed}개</>
              )}
            </p>
          )}
        </div>
      </div>
      {job.result.error && (
        <Notice tone="error">
          <pre className="validation-message">{job.result.error}</pre>
        </Notice>
      )}
      {inputs && tests.length > 0 ? (
        <PaginatedList items={tests} resetKey={job.id} label="입력 검사 결과">
          {(page) => (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>세트</th>
                    <th>테스트</th>
                    <th>검사 결과</th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((test) => (
                    <tr key={`${test.setName}/${test.index}`}>
                      <td>{test.setName}</td>
                      <td>#{test.index}</td>
                      <td>
                        <Badge
                          tone={
                            test.validator === 'VALID'
                              ? 'success'
                              : ['INVALID', 'CRASHED'].includes(test.validator)
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {test.validator === 'VALID'
                            ? '입력 조건 통과'
                            : test.validator === 'INVALID'
                              ? '입력 조건 위반'
                              : test.validator === 'CRASHED'
                                ? 'Validator 실행 오류'
                                : '검사 결과 미확인'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PaginatedList>
      ) : !inputs && rows.length > 0 ? (
        <PaginatedList items={rows} resetKey={job.id} label="자체 테스트 결과">
          {(page, offset) => (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>테스트</th>
                    <th>기대한 동작</th>
                    <th>실제 동작</th>
                    <th>검사 결과</th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((test, index) => (
                    <tr key={`${test.id}/${offset + index}`}>
                      <td title={test.id}>#{offset + index + 1}</td>
                      <td>{validationVerdict(test.expected)}</td>
                      <td>{validationVerdict(test.actual)}</td>
                      <td>
                        <Badge tone={test.matched ? 'success' : 'danger'}>
                          {test.matched ? '예상대로 동작' : '예상과 다름'}
                        </Badge>
                        <p className="subtext">{validationExplanation(test)}</p>
                        {test.comment && (
                          <details className="validation-diagnostic">
                            <summary>실행 메시지</summary>
                            <pre className="validation-message">
                              {test.comment}
                            </pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PaginatedList>
      ) : null}
    </section>
  );
}
