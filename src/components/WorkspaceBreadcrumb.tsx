import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { folderPath } from '../lib/organization';
import type { Folder } from '../lib/types';

type Props = { problemId: string; folderId: string | null; title: string };

export default function WorkspaceBreadcrumb({
  problemId,
  folderId,
  title,
}: Props) {
  return (
    <BreadcrumbPath
      key={JSON.stringify([problemId, folderId])}
      folderId={folderId}
      title={title}
    />
  );
}

function BreadcrumbPath({ folderId, title }: Omit<Props, 'problemId'>) {
  const [path, setPath] = useState<Folder[]>([]);
  useEffect(() => {
    if (!folderId) return;
    const controller = new AbortController();
    void api<Folder[]>('/folders', { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        const folders = Array.isArray(value)
          ? value.filter(
              (folder) =>
                folder &&
                typeof folder.id === 'string' &&
                typeof folder.name === 'string' &&
                (folder.parent_id === null ||
                  typeof folder.parent_id === 'string'),
            )
          : [];
        const trail = folderPath(folders, folderId);
        // folderPath is cycle-safe but may return a partial path. Only show a
        // complete, authorized chain so missing ancestors cannot mislabel it.
        setPath(
          trail.length <= 12 &&
            trail[0]?.parent_id === null &&
            trail.at(-1)?.id === folderId
            ? trail
            : [],
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [folderId]);
  return (
    <nav className="breadcrumb" aria-label="문제 위치">
      <ol>
        <li>
          <Link to="/problems">내 문제</Link>
        </li>
        {path.map((folder) => (
          <li key={folder.id}>
            <span aria-hidden="true">›</span>
            <Link
              to={`/problems?folder=${encodeURIComponent(folder.id)}`}
              title={folder.name}
            >
              {folder.name}
            </Link>
          </li>
        ))}
        <li>
          <span aria-hidden="true">›</span>
          <span aria-current="page" title={title}>
            {title}
          </span>
        </li>
      </ol>
    </nav>
  );
}
