import { useState } from 'react';
import { downloadArchive, type DownloadFile } from '../lib/downloads';
import { Icon, Notice } from './ui';

export function BlobDownload({
  problemId,
  sha,
  filename,
  label,
}: {
  problemId: string;
  sha: string | null | undefined;
  filename: string;
  label: string;
}) {
  return sha ? (
    <a
      className="button small"
      href={`/api/problems/${problemId}/blobs/${sha}`}
      download={filename}
    >
      <Icon name="download" size={15} />
      {label}
    </a>
  ) : (
    <button
      className="button small"
      disabled
      title="아직 생성된 파일이 없습니다."
    >
      {label}
    </button>
  );
}

export function DownloadActions({
  problemId,
  files,
  selectedFiles = [],
  filename,
  allLabel = '전체 다운로드',
  selectionLabel = '선택 다운로드',
  note,
  selectable = true,
}: {
  problemId: string;
  files: DownloadFile[];
  selectedFiles?: DownloadFile[];
  filename: string;
  allLabel?: string;
  selectionLabel?: string;
  note?: string;
  selectable?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download(selected: boolean) {
    setBusy(true);
    setError('');
    try {
      await downloadArchive(
        problemId,
        selected ? selectedFiles : files,
        filename,
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="download-toolbar">
      <div className="actions">
        {selectable && (
          <button
            className="button small"
            disabled={busy || !selectedFiles.length}
            onClick={() => void download(true)}
          >
            <Icon name="download" size={15} />
            {selectionLabel}
          </button>
        )}
        <button
          className="button small"
          disabled={busy || !files.length}
          onClick={() => void download(false)}
        >
          <Icon name="download" size={15} />
          {allLabel}
        </button>
        {busy && (
          <span className="muted small" role="status">
            ZIP 준비 중…
          </span>
        )}
      </div>
      {note && <p className="muted small">{note}</p>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
