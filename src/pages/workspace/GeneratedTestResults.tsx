import { useEffect, useState } from 'react';
import Select from '../../components/Select';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../lib/pagination';
import { blobPreview } from '../../lib/api';
import type { Job } from '../../lib/types';
import { Badge, CodeEditor, Notice } from '../../components/ui';
import { BlobDownload } from '../../components/Downloads';
import { DownloadActions } from '../../components/Downloads';
import { testDownloads } from '../../lib/downloads';

type Preview = {
  text: string;
  truncated: boolean;
  binary: boolean;
  error?: string;
};

function GeneratedFile({
  problemId,
  sha,
  label,
  filename,
}: {
  problemId: string;
  sha?: string | null;
  label: string;
  filename: string;
}) {
  const [state, setState] = useState<{ key: string; value: Preview } | null>(
    null,
  );
  const key = `${problemId}/${sha || ''}`;
  const preview = state?.key === key ? state.value : null;
  useEffect(() => {
    if (!sha) return;
    const controller = new AbortController();
    void blobPreview(problemId, sha, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setState({ key, value });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            key,
            value: {
              text: '',
              truncated: false,
              binary: false,
              error: error.message,
            },
          });
      });
    return () => controller.abort();
  }, [problemId, sha, key]);
  return (
    <section
      className="generated-file-preview"
      aria-label={`${label} 미리보기`}
    >
      <div className="section-heading">
        <h4>{label}</h4>
        <BlobDownload
          problemId={problemId}
          sha={sha}
          filename={filename}
          label={`${label} 다운로드`}
        />
      </div>
      {!sha ? (
        <p className="muted small">아직 생성된 {label}이 없습니다.</p>
      ) : preview?.error ? (
        <Notice tone="error">{preview.error}</Notice>
      ) : (
        <>
          {preview?.binary ? (
            <Notice>
              텍스트로 표시할 수 없는 파일입니다. 원본 파일을 다운로드해
              확인하세요.
            </Notice>
          ) : (
            <CodeEditor
              readOnly
              rows={12}
              label={`${label} 내용`}
              value={preview?.text ?? '불러오는 중…'}
            />
          )}
          {preview?.truncated && (
            <p className="muted small">
              큰 파일의 앞부분만 표시합니다. 원본 파일에는 전체 내용이 보관되어
              있습니다.
            </p>
          )}
          {preview &&
            !preview.binary &&
            !preview.truncated &&
            !preview.text && <p className="muted small">빈 파일입니다.</p>}
        </>
      )}
    </section>
  );
}

export default function GeneratedTestResults({
  job,
  problemId,
}: {
  job: Job;
  problemId: string;
}) {
  const sets = Object.keys(job.result.testsets || {});
  const [chosenSet, setSet] = useState('');
  const setName = sets.includes(chosenSet) ? chosenSet : sets[0] || '';
  const tests = job.result.testsets?.[setName] || [];
  const [selection, setSelection] = useState({ set: '', index: 0 });
  const selected =
    tests.find(
      (test) => selection.set === setName && test.index === selection.index,
    ) || tests[0];
  const paging = usePagination(tests, `${job.id}/${setName}`, 50);
  if (!sets.length) return null;
  return (
    <section
      className="generated-results"
      aria-label="생성된 입력·정답 미리보기"
    >
      <div className="section-heading">
        <div>
          <h3>생성된 입력·정답</h3>
          <p>
            작업 사본에 반영하기 전에도 실제 생성된 값을 확인할 수 있습니다.
          </p>
        </div>
        <Badge>{tests.length}개 테스트</Badge>
      </div>
      {sets.length > 1 && (
        <label>
          테스트 세트
          <Select
            value={setName}
            onChange={(event) => setSet(event.target.value)}
          >
            {sets.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </label>
      )}
      <div
        className="generated-test-picker"
        role="group"
        aria-label="미리볼 생성 테스트"
      >
        {paging.items.map((test) => (
          <button
            type="button"
            key={test.index}
            className={`button small ${test.index === selected?.index ? 'primary' : ''}`}
            aria-pressed={test.index === selected?.index}
            aria-label={`${setName} #${test.index} 입력·정답 미리보기`}
            onClick={() => setSelection({ set: setName, index: test.index })}
          >
            #{test.index}
          </button>
        ))}
      </div>
      <Pagination {...paging} label="생성 테스트" />
      {selected && (
        <>
          <p className="generated-test-meta">
            <strong>
              {setName} · 테스트 #{selected.index}
            </strong>
            {selected.command && <span>{selected.command}</span>}
            {selected.main_cpu_ms != null && (
              <span>Main CPU {selected.main_cpu_ms}ms</span>
            )}
          </p>
          <div className="generated-preview-grid">
            <GeneratedFile
              problemId={problemId}
              sha={selected.input_sha}
              label="입력"
              filename={`${selected.index}.in`}
            />
            <GeneratedFile
              problemId={problemId}
              sha={selected.answer_sha}
              label="정답"
              filename={`${selected.index}.out`}
            />
          </div>
        </>
      )}
      <DownloadActions
        problemId={problemId}
        files={testDownloads(setName, tests)}
        filename={`${setName.slice(0, 85)}-tests.zip`}
        allLabel={`${setName} 생성 파일 다운로드`}
        selectable={false}
      />
    </section>
  );
}
