import { useEffect, useRef } from 'react';
import StatementImage from '../../components/StatementImage';
import StatementImageTools from '../../components/StatementImageTools';
import { CodeEditor } from '../../components/ui';
import { upload } from '../../lib/api';
import { can } from '../../lib/permissions';
import { statementImageAssets } from '../../lib/statementAssets';
import {
  validateStatementImageUpload,
  type StatementImageAsset,
} from '../../lib/statementImages';
import { useWorkspace } from '../../lib/workspace';

type UploadRequest = {
  prefix: string;
  sha256: string;
  resolve: (asset: StatementImageAsset) => void;
  reject: (error: Error) => void;
};

let uploadSequence = 0;

export default function StatementFieldEditor({
  identity,
  label,
  value,
  rows,
  readOnly,
  onChange,
}: {
  identity: string;
  label: string;
  value: string;
  rows: number;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const { data, document: doc, mutate, busy } = useWorkspace();
  const problemId = data.problem.id;
  const disabled = readOnly || busy;
  const canUpload = !disabled && can(data.problem, 'edit_files');
  const requests = useRef(new Set<UploadRequest>());
  const scope = useRef({ identity, problemId, active: true });
  const permissions = useRef(canUpload);

  useEffect(() => {
    permissions.current = canUpload;
  }, [canUpload]);

  useEffect(() => {
    const active = { identity, problemId, active: true };
    scope.current = active;
    const pending = requests.current;
    return () => {
      active.active = false;
      for (const request of pending)
        request.reject(
          new Error('편집 중인 지문이 바뀌어 이미지 삽입을 취소했습니다.'),
        );
      pending.clear();
    };
  }, [identity, problemId]);

  useEffect(() => {
    for (const request of requests.current) {
      const file = Object.values(doc.files).find(
        (file) =>
          file.name.startsWith(request.prefix) &&
          file.sha256 === request.sha256 &&
          file.kind === 'statement',
      );
      if (file) {
        requests.current.delete(request);
        request.resolve({
          id: file.name,
          source: file.name,
          name: file.name,
          previewUrl: `/api/problems/${encodeURIComponent(problemId)}/blobs/${file.sha256}`,
        });
      }
    }
  }, [doc.files, problemId]);

  async function uploadImage(file: File): Promise<StatementImageAsset> {
    const active = scope.current;
    if (!active.active || !permissions.current)
      throw new Error('이미지 업로드에는 파일 편집 권한이 필요합니다.');
    const mime = await validateStatementImageUpload(file);
    if (!active.active || scope.current !== active || !permissions.current)
      throw new Error('편집 중인 지문이 바뀌어 이미지 삽입을 취소했습니다.');
    const blob = await upload(active.problemId, file);
    if (!active.active || scope.current !== active || !permissions.current)
      throw new Error('편집 중인 지문이 바뀌어 이미지 삽입을 취소했습니다.');
    const extension = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
    const stem =
      file.name
        .replace(/\.[^.]*$/, '')
        .replace(/[^A-Za-z0-9_.-]+/g, '-')
        .replace(/\.{2,}/g, '-')
        .replace(/^[^A-Za-z0-9_]+|[-.]+$/g, '')
        .slice(0, 50) || 'image';
    const token = `${Date.now().toString(36)}-${(++uploadSequence).toString(36)}`;
    const prefix = `${stem}-${token}`;

    // Resolve after the metadata appears in the committed React state. The
    // functional mutation allocates its name against the latest draft, so
    // concurrent uploads or edits cannot overwrite another resource.
    return new Promise((resolve, reject) => {
      const request = { prefix, sha256: blob.sha256, resolve, reject };
      requests.current.add(request);
      mutate((document) => {
        if (!active.active || scope.current !== active || !permissions.current)
          return;
        let name = `${prefix}.${extension}`;
        let suffix = 2;
        while (
          Object.hasOwn(document.files, name) ||
          Object.hasOwn(document.solutions, name)
        )
          name = `${prefix}-${suffix++}.${extension}`;
        document.files[name] = {
          name,
          kind: 'statement',
          language: 'text',
          sha256: blob.sha256,
          size: blob.size,
        };
      });
    });
  }

  return (
    <StatementImageTools
      identity={`${problemId}/${identity}`}
      label={label}
      value={value}
      onChange={onChange}
      assets={statementImageAssets(problemId, doc.files)}
      onUpload={canUpload ? uploadImage : undefined}
      readOnly={disabled}
      renderThumbnail={(asset) => (
        <StatementImage
          src={asset.previewUrl || ''}
          alt={asset.name}
          properties={{}}
          compact
        />
      )}
    >
      <CodeEditor
        label={label}
        value={value}
        rows={rows}
        readOnly={disabled}
        onChange={onChange}
      />
    </StatementImageTools>
  );
}
