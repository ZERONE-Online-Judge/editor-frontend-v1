import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { time } from '../lib/api';
import { useRemotePage } from '../lib/useRemotePage';
import { Badge, Empty, Icon, Notice } from './ui';
import Pagination from './Pagination';
import RevisionPreview, { type ChangeSummary } from './RevisionPreview';
import './SharedFolderHistory.css';

type FolderRevision = {
  problem_id: string;
  problem_name: string;
  slug: string;
  folder_path: string[];
  number: number;
  message: string;
  minor: boolean;
  author: string;
  created_at: number;
  changes: ChangeSummary;
};

export default function SharedFolderHistory({
  folderId,
}: {
  folderId: string;
}) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState('');
  const { data, error, refresh } = useRemotePage<FolderRevision>(
    `/folders/${folderId}/revisions?page=${page}&page_size=10`,
    page,
    15000,
    undefined,
    true,
    10,
  );
  useEffect(() => {
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [refresh]);
  return (
    <section
      className="folder-history section-stack"
      aria-label="팀 폴더 리비전"
    >
      <div className="folder-history-heading">
        <div>
          <h2>리비전</h2>
          <p>
            현재 폴더와 하위 폴더 문제의 공유 커밋입니다. 개인 작업 사본은 커밋
            후 표시됩니다.
          </p>
        </div>
        <button className="button small" onClick={() => void refresh()}>
          <Icon name="history" size={15} />
          새로고침
        </button>
      </div>
      {error && (
        <Notice tone="error">리비전을 불러오지 못했습니다. {error}</Notice>
      )}
      {!data && !error && (
        <p role="status">최근 공유 커밋을 불러오고 있습니다.</p>
      )}
      {data && !data.total && (
        <Empty
          title="공유한 리비전이 없습니다."
          description="이 폴더에 문제를 만들거나 변경사항을 커밋하면 여기에 표시됩니다."
        />
      )}
      <ol className="folder-history-list">
        {data?.items.map((row) => {
          const key = `${row.problem_id}/${row.number}`;
          const open = expanded === key;
          return (
            <li key={key}>
              <div className="folder-history-meta">
                <Link to={`/problems/${row.problem_id}/revisions`}>
                  {row.problem_name}
                </Link>
                <Badge>r{row.number}</Badge>
                <span>
                  {row.author} · {time(row.created_at)}
                </span>
                {row.minor && <span>작은 변경</span>}
              </div>
              <strong className="folder-history-message">{row.message}</strong>
              <span className="folder-history-path">
                {row.folder_path.join(' / ')} · {row.slug}
              </span>
              <div
                className="folder-history-files"
                aria-label="변경된 파일과 항목"
              >
                {row.changes.items.map((change) => (
                  <span key={change.path} title={change.path}>
                    <i className={`folder-change-${change.kind}`}>
                      {change.kind === 'added'
                        ? '+'
                        : change.kind === 'removed'
                          ? '−'
                          : '~'}
                    </i>
                    {change.label}
                    <span className="sr-only">
                      {' '}
                      {change.kind === 'added'
                        ? '추가'
                        : change.kind === 'removed'
                          ? '삭제'
                          : '수정'}
                    </span>
                  </span>
                ))}
                {row.changes.total > row.changes.items.length && (
                  <span>
                    외 {row.changes.total - row.changes.items.length}개
                  </span>
                )}
              </div>
              <button
                className="text-button"
                aria-expanded={open}
                onClick={() => setExpanded(open ? '' : key)}
              >
                {open ? '변경 접기' : '변경 내용 보기'}
                <Icon name="down" size={14} />
              </button>
              {open && (
                <RevisionPreview
                  problemId={row.problem_id}
                  from={row.number - 1}
                  to={row.number}
                />
              )}
            </li>
          );
        })}
      </ol>
      {data && (
        <Pagination
          {...data}
          label="팀 폴더 리비전"
          onPageChange={(next) => {
            setPage(next);
            setExpanded('');
          }}
        />
      )}
    </section>
  );
}
