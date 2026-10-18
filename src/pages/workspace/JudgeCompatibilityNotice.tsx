import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../../lib/api';
import { Notice } from '../../components/ui';

type Source = { name: string; label: string };
function sources(value: unknown): Source[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Source =>
    Boolean(
      item &&
      typeof item === 'object' &&
      typeof item.name === 'string' &&
      typeof item.label === 'string',
    ),
  );
}
export default function JudgeCompatibilityNotice({
  error,
  problemId,
  changeBackend,
}: {
  error: ApiError;
  problemId: string;
  changeBackend: () => void;
}) {
  const notice = useRef<HTMLElement>(null);
  useEffect(() => {
    notice.current?.focus({ preventScroll: true });
    notice.current?.scrollIntoView?.({ block: 'start' });
  }, []);
  const files = sources(error.details.unsupported_solutions);
  const checker = sources([error.details.unsupported_checker])[0];
  const checkerLanguages = error.details.unsupported_checker;
  const supportedChecker =
    checkerLanguages &&
    typeof checkerLanguages === 'object' &&
    'supported_languages' in checkerLanguages &&
    Array.isArray(checkerLanguages.supported_languages)
      ? checkerLanguages.supported_languages.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
  const supported = Array.isArray(error.details.supported_languages)
    ? error.details.supported_languages
        .filter(
          (item) =>
            item && typeof item === 'object' && typeof item.label === 'string',
        )
        .map((item) => item.label as string)
    : [];
  const issues = Array.isArray(error.details.issues)
    ? [
        ...new Set(
          error.details.issues.filter(
            (value): value is string => typeof value === 'string',
          ),
        ),
      ]
    : [];
  return (
    <section
      ref={notice}
      tabIndex={-1}
      className="judge-compatibility"
      aria-label="ZOJ 채점 환경 호환성 안내"
    >
      <Notice tone="error">
        <strong>{error.message}</strong>
        {checker && (
          <div className="compatibility-checker">
            <p>
              <strong>Checker 파일</strong> · <code>{checker.name}</code>
              {' · '}현재 언어: {checker.label}
            </p>
            {supportedChecker.length > 0 && (
              <p className="small">
                Checker 지원 언어: {supportedChecker.join(' · ')}
              </p>
            )}
          </div>
        )}
        {files.length > 0 && supported.length > 0 && (
          <p className="small">ZOJ 지원 언어: {supported.join(' · ')}</p>
        )}
        {files.length > 0 && (
          <div
            className="compatibility-files"
            tabIndex={0}
            role="region"
            aria-label="지원하지 않는 풀이 언어"
          >
            <table>
              <thead>
                <tr>
                  <th>풀이</th>
                  <th>현재 언어 설정</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.name}>
                    <td>
                      <code>{file.name}</code>
                    </td>
                    <td>{file.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {issues.length > 0 && (
          <ul>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        <p className="small">
          {typeof error.details.guidance === 'string'
            ? error.details.guidance
            : '풀이의 언어 설정 또는 검증 환경을 확인하세요. 언어 표준을 자동으로 변경하지 않습니다.'}
        </p>
        <div className="actions">
          {checker && (
            <Link
              className="button small"
              to={`/problems/${problemId}/files?file=${encodeURIComponent(checker.name)}`}
            >
              Checker 파일 언어 설정
            </Link>
          )}
          {files.length > 0 && (
            <Link
              className="button small"
              to={`/problems/${problemId}/solutions`}
            >
              풀이 언어 설정
            </Link>
          )}
          <button className="button small" onClick={changeBackend}>
            에이전트 격리 실행으로 변경
          </button>
        </div>
      </Notice>
    </section>
  );
}
