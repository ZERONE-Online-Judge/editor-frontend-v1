import type { HeaderCaseFile } from '../lib/useCHeaderCaseWarning';
import { Modal } from './ui';
import './CHeaderCaseWarning.css';

export default function CHeaderCaseWarning({
  files,
  confirm,
  cancel,
}: {
  files: HeaderCaseFile[];
  confirm: () => void;
  cancel: () => void;
}) {
  return (
    <Modal
      title={
        files.some((file) => file.findings.length)
          ? '헤더 이름의 대소문자를 확인하세요'
          : '소스 헤더를 확인하지 못했습니다'
      }
      className="c-header-case-warning"
      onClose={cancel}
      footer={
        <>
          <button className="button" onClick={cancel}>
            코드 수정
          </button>
          <button className="button primary" onClick={confirm}>
            그대로 실행
          </button>
        </>
      }
    >
      <p className="muted">
        리눅스 채점 환경에서는 대소문자가 다르면 컴파일되지 않을 수 있습니다.
      </p>
      <ul className="c-header-case-files">
        {files.map((file) => (
          <li key={file.name}>
            <strong>{file.name}</strong>
            {file.unavailable && (
              <p className="muted small">
                내용을 불러오지 못했습니다. 직접 확인하거나 그대로 실행할 수
                있습니다.
              </p>
            )}
            <ul>
              {file.findings.map((finding) => (
                <li key={`${finding.line}/${finding.header}`}>
                  <span>{finding.line}행</span>
                  <code>{`<${finding.header}>`}</code>
                  <span aria-hidden="true">→</span>
                  <code>{`<${finding.suggestion}>`}</code>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="muted small">코드는 자동으로 수정하지 않습니다.</p>
    </Modal>
  );
}
