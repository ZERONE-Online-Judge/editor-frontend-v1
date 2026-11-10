import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/authContext';
import { executionResultPath } from '../lib/executionNavigation';
import {
  executionHistoryPresentation,
  executionTitle,
} from '../lib/executionTitles';
import {
  jobCategory,
  type ExecutionCategory,
} from '../lib/executionCategories';
import { jobRelation, requesterName, historyTime } from '../lib/jobHistory';
import { time } from '../lib/api';
import type { Job } from '../lib/types';
import { useRemotePage } from '../lib/useRemotePage';
import { useWorkspace } from '../lib/workspace';
import JobOutcome from './JobOutcome';
import Pagination from './Pagination';
import { Icon, Notice } from './ui';
import './RecentExecutions.css';

export default function RecentExecutions({
  category,
}: {
  category: ExecutionCategory;
}) {
  const { data, dirty } = useWorkspace();
  const { user } = useAuth();
  return (
    <RecentExecutionList
      key={`${user?.id || ''}/${data.problem.id}/${category}/${data.document_hash}`}
      problemId={data.problem.id}
      currentHash={data.document_hash}
      userId={user?.id}
      category={category}
      dirty={dirty}
    />
  );
}

function RecentExecutionList({
  problemId,
  currentHash,
  userId,
  category,
  dirty,
}: {
  problemId: string;
  currentHash: string;
  userId?: string;
  category: ExecutionCategory;
  dirty: boolean;
}) {
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({
    page: String(page),
    page_size: '10',
    kind: 'all',
    category,
    relation: 'all',
    current_hash: currentHash,
  });
  const {
    data: history,
    error,
    refresh,
  } = useRemotePage<Job>(
    `/problems/${encodeURIComponent(problemId)}/jobs?${query}`,
    page,
    3000,
    (rows) =>
      rows
        .filter(
          (job) =>
            category === 'all' ||
            jobCategory(job).id === category ||
            (category === 'prepare' && job.kind === 'prepare'),
        )
        .sort((a, b) => b.created_at - a.created_at),
    true,
    10,
  );
  const allHistory = `/problems/${encodeURIComponent(problemId)}/invocations?${new URLSearchParams({ history_category: category })}`;
  return (
    <section
      className="card no-padding recent-executions"
      aria-label="최근 실행 기록"
    >
      <div className="card-heading recent-executions-heading">
        <div>
          <h3>최근 실행 기록</h3>
          <p className="muted small">
            기록을 누르면 해당 작업의 실행 결과로 이동합니다.
          </p>
        </div>
        <Link className="text-button small" to={allHistory}>
          전체 기록 보기 <Icon name="arrow" size={14} />
        </Link>
      </div>
      {dirty && (
        <p className="recent-executions-note muted small">
          자료 기준은 마지막으로 저장한 작업 사본과 비교합니다.
        </p>
      )}
      {error && (
        <div className="recent-executions-message">
          <Notice tone="error">
            기록을 불러오지 못했습니다. {error}
            <button className="button small" onClick={() => void refresh()}>
              다시 불러오기
            </button>
          </Notice>
        </div>
      )}
      {!history && !error && (
        <p className="recent-executions-message muted" role="status">
          실행 기록을 불러오는 중입니다.
        </p>
      )}
      {history && !history.items.length && (
        <p className="recent-executions-message muted">
          아직 실행 기록이 없습니다.
        </p>
      )}
      {!!history?.items.length && (
        <ul className="recent-execution-list">
          {history.items.map((job) => {
            const presentation = executionHistoryPresentation(job);
            const relation = jobRelation(job, currentHash);
            const source =
              relation === 'other'
                ? '다른 자료'
                : relation === 'applied'
                  ? '결과 반영본'
                  : '현재 저장본';
            const requester = requesterName(job, userId);
            const target = `${executionResultPath(problemId, job.id)}&${new URLSearchParams(
              {
                history_category: category,
                ...(page > 1 ? { history_page: String(page) } : {}),
              },
            )}`;
            return (
              <li key={job.id}>
                <Link
                  className="recent-execution-link"
                  to={target}
                  aria-label={`${executionTitle(job)} · ${requester} 요청 · ${time(job.created_at)} · ${source}`}
                >
                  <div className="recent-execution-info">
                    <strong title={executionTitle(job)}>
                      {presentation.title}
                    </strong>
                    {presentation.scope && (
                      <span className="recent-execution-scope">
                        {presentation.scope}
                      </span>
                    )}
                    <span className="recent-execution-meta">
                      <span>{requester}</span>
                      <time
                        dateTime={new Date(job.created_at * 1000).toISOString()}
                        title={time(job.created_at)}
                      >
                        {historyTime(job.created_at)}
                      </time>
                      <span>{source}</span>
                    </span>
                  </div>
                  <JobOutcome job={job} compact />
                  <Icon name="arrow" size={16} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {history && (
        <Pagination
          {...history}
          label="최근 실행 기록"
          onPageChange={setPage}
        />
      )}
    </section>
  );
}
