export type ImportReport = {
  format: string;
  files: number;
  solutions: number;
  tests: number;
  statement_languages: string[];
  warnings: string[];
  preserved_files: { path: string; name: string }[];
};

export default function PackageImportSummary({
  report,
}: {
  report: ImportReport;
}) {
  return (
    <div className="package-import-summary">
      <p>
        지문·코드·테스트를 가져왔습니다. 변환된 설정과 원본 보관 내역을
        확인하세요.
      </p>
      <dl className="package-import-counts">
        <div>
          <dt>지문</dt>
          <dd>{report.statement_languages.length}개 언어</dd>
        </div>
        <div>
          <dt>풀이</dt>
          <dd>{report.solutions}개</dd>
        </div>
        <div>
          <dt>테스트</dt>
          <dd>{report.tests}개</dd>
        </div>
        <div>
          <dt>파일·리소스</dt>
          <dd>{report.files}개</dd>
        </div>
      </dl>
      {report.warnings.length > 0 && (
        <section
          className="package-import-warnings"
          aria-label="가져오기 확인 사항"
        >
          <strong>확인이 필요한 설정 {report.warnings.length}개</strong>
          <ul>
            {report.warnings.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </section>
      )}
      {report.preserved_files.length > 0 && (
        <details className="package-import-originals">
          <summary>
            원본 보조 파일 {report.preserved_files.length}개 보관
          </summary>
          <p>
            추가 설정과 원본 자료는 ‘파일 · 리소스’의 보조 파일에 보관했습니다.
            컴파일·실행에는 자동으로 첨부하지 않습니다.
          </p>
          <ul>
            {report.preserved_files.map((file) => (
              <li key={file.name}>
                <span>{file.path}</span>
                <code>{file.name}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
