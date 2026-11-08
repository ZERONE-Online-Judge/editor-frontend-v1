import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../../lib/api';
import { Notice } from '../../components/ui';

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string =>
              typeof item === 'string' && Boolean(item.trim()),
          ),
        ),
      ]
    : [];
}

export default function ZojPackageCompatibilityNotice({
  error,
  problemId,
}: {
  error: ApiError;
  problemId: string;
}) {
  const notice = useRef<HTMLElement>(null);
  useEffect(() => {
    notice.current?.focus({ preventScroll: true });
    notice.current?.scrollIntoView?.({ block: 'start' });
  }, [error]);
  const validators = strings(error.details.unsupported_extra_validators);
  const graders = strings(error.details.unsupported_solution_files);
  const issues = strings(error.details.issues);
  // Older servers do not identify the files. Keep their full explanation rather
  // than guessing which current working-copy settings caused the rejection.
  const reasons = issues.length
    ? issues.filter((issue) => {
        if (validators.length && issue.startsWith('추가 Validator('))
          return false;
        if (graders.length && issue.startsWith('풀이 결합 파일(')) return false;
        return true;
      })
    : [error.message];
  const legacyConfigurationIssue =
    !validators.length &&
    !graders.length &&
    reasons.some((issue) => /추가 validator|풀이 결합/i.test(issue));
  return (
    <section
      ref={notice}
      tabIndex={-1}
      className="judge-compatibility package-compatibility"
      aria-label="ZOJ 패키지 호환성 안내"
    >
      <Notice tone="error">
        <strong>ZOJ 패키지를 생성할 수 없습니다</strong>
        <p>작업 생성 전 호환성 검사에서 중단되었습니다.</p>
        <p className="small">
          패키지 생성에 사용한 커밋본 기준의 안내입니다. 현재 작업 사본과 다를
          수 있습니다.
        </p>
        {validators.length > 0 && (
          <div>
            <strong>추가 Validator · {validators.length}개</strong>
            <ul
              className="package-compatibility-files"
              tabIndex={0}
              aria-label="지원하지 않는 추가 Validator 파일"
            >
              {validators.map((name) => (
                <li key={name}>
                  <code>{name}</code>
                </li>
              ))}
            </ul>
            <p>
              필요한 검사를 기본 Validator 하나에 통합한 뒤{' '}
              <Link to={`/problems/${problemId}/validator`}>
                Validator &gt; 추가 Validator
              </Link>
              에서 선택을 해제하세요. 불필요한 검사만 제외하세요.
            </p>
          </div>
        )}
        {graders.length > 0 && (
          <div>
            <strong>풀이와 함께 컴파일하는 파일 · {graders.length}개</strong>
            <ul
              className="package-compatibility-files"
              tabIndex={0}
              aria-label="지원하지 않는 풀이 결합 파일"
            >
              {graders.map((name) => (
                <li key={name}>
                  <Link
                    to={`/problems/${problemId}/files?file=${encodeURIComponent(name)}`}
                  >
                    <code>{name}</code>
                  </Link>
                </li>
              ))}
            </ul>
            <p>
              파일 · 리소스에서 위 파일을 열어 ‘풀이와 함께 컴파일 (grader)’을
              확인하세요. 불필요한 결합만 해제하세요. 필수 grader라면 해제하지
              말고, ZOJ에서 독립 실행할 수 있는 풀이 구성으로 변경해야 합니다.
            </p>
          </div>
        )}
        {reasons.length > 0 && (
          <ul>
            {reasons.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        {legacyConfigurationIssue && (
          <p>
            현재 작업 사본의{' '}
            <Link to={`/problems/${problemId}/validator`}>
              Validator &gt; 추가 Validator
            </Link>
            {' 및 '}
            <Link to={`/problems/${problemId}/files`}>
              파일 · 리소스 &gt; 풀이와 함께 컴파일 (grader)
            </Link>
            설정을 확인하세요. 필요한 검사는 기본 Validator에 통합하고, 필수
            grader는 무작정 해제하지 마세요.
          </p>
        )}
        <p className="small">
          수정 후 작업 사본을 저장·커밋하고 다시 생성하세요. 검증을 끄더라도
          호환성 검사는 적용됩니다.
        </p>
      </Notice>
    </section>
  );
}
