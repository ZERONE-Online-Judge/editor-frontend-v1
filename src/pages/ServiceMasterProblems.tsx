import { Link, useSearchParams } from 'react-router-dom';
import { useCallback, useState } from 'react';
import Pagination, { PaginatedList } from '../components/Pagination';
import Select from '../components/Select';
import {
  Badge,
  Empty,
  Icon,
  Modal,
  Notice,
  SectionHeading,
} from '../components/ui';
import { useAuth } from '../lib/authContext';
import type { Page } from '../lib/pagination';
import {
  authoringMoment,
  useMasterMetadata,
  type AuthorIdentity,
  type AuthoringDetail,
  type AuthoringProblem,
} from '../lib/serviceMaster';
import './ServiceMasterProblems.css';

const activityLabels = {
  created: '문제 생성',
  commit: '공유본 커밋',
  working_copy: '작업 사본 저장',
};
const sortOptions = {
  recent: '최근 작업순',
  created: '최근 생성순',
  name: '문제명순',
  owner: '생성자 이름순',
};

function Author({ user }: { user: AuthorIdentity | null }) {
  if (!user) return <span className="muted">기록 없음</span>;
  return (
    <span className="master-author">
      <strong>{user.display_name || user.handle}</strong>
      <small>{user.email}</small>
    </span>
  );
}

function AuthoringDetails({
  id,
  accountId,
  onClose,
  onAccessDenied,
}: {
  id: string;
  accountId: string;
  onClose: () => void;
  onAccessDenied: () => void;
}) {
  const { data, error, loading, refresh } = useMasterMetadata<AuthoringDetail>(
    `/service-master/problems/${encodeURIComponent(id)}`,
    accountId,
    onAccessDenied,
  );
  return (
    <Modal
      title="문제 제작자 상세"
      onClose={onClose}
      wide
      className="master-authoring-modal"
      footer={
        <button className="button" onClick={onClose}>
          닫기
        </button>
      }
    >
      {loading && (
        <div className="loading" role="status">
          제작자 정보를 불러오고 있습니다.
        </div>
      )}
      {error && (
        <>
          <Notice tone="error">{error}</Notice>
          <button className="button" onClick={refresh}>
            다시 불러오기
          </button>
        </>
      )}
      {data && (
        <>
          <header className="master-detail-heading">
            <h2>{data.problem.name}</h2>
            <span>{data.problem.slug}</span>
            {data.problem.deleted && <Badge tone="danger">삭제된 문제</Badge>}
          </header>
          <dl className="master-detail-summary">
            <div>
              <dt>생성자</dt>
              <dd>
                <Author user={data.problem.owner} />
              </dd>
            </div>
            <div>
              <dt>생성 시각</dt>
              <dd>{authoringMoment(data.problem.created_at)}</dd>
            </div>
            <div>
              <dt>공유 리비전</dt>
              <dd>r{data.problem.revision}</dd>
            </div>
            <div>
              <dt>최근 커밋</dt>
              <dd>
                {data.last_commit ? (
                  <>
                    <Author user={data.last_commit.author} />
                    <small>
                      {authoringMoment(data.last_commit.created_at)}
                    </small>
                  </>
                ) : (
                  '커밋 기록 없음'
                )}
              </dd>
            </div>
          </dl>
          <section className="master-editor-section">
            <SectionHeading
              title={`제작자 ${data.editors.length}명`}
              description="현재 편집 권한이 있는 사용자와 마지막 작업 사본 저장 기록입니다."
            />
            <PaginatedList
              items={data.editors}
              label="제작자"
              size={10}
              resetKey={id}
            >
              {(editors) => (
                <ul className="master-editor-list">
                  {editors.map((editor) => (
                    <li key={editor.user.id}>
                      <div>
                        <Author user={editor.user} />
                        <span className="master-user-handle">
                          @{editor.user.handle}
                        </span>
                      </div>
                      <Badge
                        tone={editor.role === 'OWNER' ? 'accent' : 'neutral'}
                      >
                        {editor.role === 'OWNER' ? '소유자' : '제작자'}
                      </Badge>
                      <div className="master-saved">
                        <span>마지막 저장</span>
                        <strong>{authoringMoment(editor.last_saved_at)}</strong>
                        {editor.working_revision !== null && (
                          <small>작업 기준 r{editor.working_revision}</small>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </PaginatedList>
          </section>
        </>
      )}
    </Modal>
  );
}

export default function ServiceMasterProblems() {
  const { user, retryAuthentication } = useAuth();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<{
    id: string;
    accountId: string;
  } | null>(null);
  const [deniedAccount, setDeniedAccount] = useState<string | null>(null);
  const isMaster = user?.is_service_master === true;
  const masterAccountId = isMaster ? user.id : null;
  const accessDenied =
    masterAccountId !== null && deniedAccount === masterAccountId;
  const accountId = accessDenied ? null : masterAccountId;
  const onAccessDenied = useCallback(() => {
    setDeniedAccount(masterAccountId);
  }, [masterAccountId]);
  const query = params.get('q') || '';
  const sort = Object.hasOwn(sortOptions, params.get('sort') || '')
    ? params.get('sort')!
    : 'recent';
  const deleted = params.get('deleted') === 'true';
  const requestedPage = Number(params.get('page') || 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const path = `/service-master/problems?${new URLSearchParams({ q: query, sort, deleted: String(deleted), page: String(page), page_size: '10' })}`;
  const { data, error, loading, refresh } = useMasterMetadata<
    Page<AuthoringProblem>
  >(path, accountId, onAccessDenied);

  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    setSelected(null);
    setParams(next);
  }

  if (!isMaster || accessDenied)
    return (
      <div className="page-container">
        <Empty
          icon="shield"
          title="서비스 마스터 전용 화면입니다."
          description={
            accessDenied
              ? '접근 권한이 변경되었거나 로그인이 만료되었습니다. 계정을 다시 확인해 주세요.'
              : undefined
          }
          action={
            <>
              {accessDenied && (
                <button
                  className="button primary"
                  onClick={retryAuthentication}
                >
                  계정 다시 확인
                </button>
              )}
              <Link className="button" to="/problems">
                내 문제로 이동
              </Link>
            </>
          }
        />
      </div>
    );

  return (
    <div className="page-container master-authoring-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">서비스 관리</span>
          <h1>문제 제작 현황</h1>
          <p>누가 어떤 문제를 만들고 있는지 확인하세요.</p>
        </div>
        <button className="button" disabled={loading} onClick={refresh}>
          <Icon name="refresh" />
          새로고침
        </button>
      </header>
      <form
        className="master-authoring-filters"
        onSubmit={(event) => {
          event.preventDefault();
          filter(
            'q',
            String(new FormData(event.currentTarget).get('q') || '').trim(),
          );
        }}
      >
        <label className="master-search">
          문제·생성자 검색
          <div>
            <input
              key={query}
              defaultValue={query}
              name="q"
              placeholder="문제명, ID, 생성자 이름·이메일"
              maxLength={200}
            />
            <button type="submit" className="button primary">
              <Icon name="search" />
              검색
            </button>
          </div>
        </label>
        <label>
          문제 범위
          <Select
            value={String(deleted)}
            onChange={(event) => filter('deleted', event.target.value)}
          >
            <option value="false">현재 문제</option>
            <option value="true">삭제된 문제</option>
          </Select>
        </label>
        <label>
          정렬 기준
          <Select
            value={sort}
            onChange={(event) => filter('sort', event.target.value)}
          >
            {Object.entries(sortOptions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
      </form>
      <div className="master-authoring-caption">
        <strong>
          {data
            ? `전체 ${data.total.toLocaleString()}개`
            : loading
              ? '불러오는 중'
              : '문제 목록'}
        </strong>
        <span>마지막 저장·커밋 기준 · 페이지당 10개</span>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {loading && (
        <div className="loading" role="status">
          문제 제작 현황을 불러오고 있습니다.
        </div>
      )}
      {data && data.items.length === 0 && (
        <Empty
          icon="search"
          title={
            query
              ? '검색 결과가 없습니다.'
              : deleted
                ? '삭제된 문제가 없습니다.'
                : '등록된 문제가 없습니다.'
          }
          description={
            query ? '문제명이나 생성자 정보를 확인해 주세요.' : undefined
          }
        />
      )}
      {data && data.items.length > 0 && (
        <>
          <div className="master-problem-columns" aria-hidden="true">
            <span>문제</span>
            <span>생성자</span>
            <span>최근 작업</span>
            <span />
          </div>
          <ul className="master-problem-list">
            {data.items.map((problem) => (
              <li key={problem.id}>
                <div className="master-problem-title">
                  <h2>{problem.name}</h2>
                  <span>{problem.slug}</span>
                  <div>
                    <span>r{problem.revision}</span>
                    <span>제작자 {problem.editor_count}명</span>
                    {problem.deleted && <Badge tone="danger">삭제됨</Badge>}
                  </div>
                </div>
                <div className="master-problem-owner">
                  <span className="master-mobile-label">생성자</span>
                  <Author user={problem.owner} />
                </div>
                <div className="master-problem-activity">
                  <span className="master-mobile-label">최근 작업</span>
                  <strong>
                    {problem.last_actor?.display_name ||
                      problem.last_actor?.handle ||
                      '기록 없음'}
                  </strong>
                  <small>{activityLabels[problem.last_activity_type]}</small>
                  <time
                    dateTime={new Date(
                      problem.last_activity_at * 1000,
                    ).toISOString()}
                  >
                    {authoringMoment(problem.last_activity_at)}
                  </time>
                </div>
                <button
                  className="button small"
                  onClick={() =>
                    setSelected({ id: problem.id, accountId: accountId! })
                  }
                  aria-label={`${problem.name} 제작자 상세`}
                >
                  상세
                  <Icon name="arrow" size={14} />
                </button>
              </li>
            ))}
          </ul>
          <Pagination
            {...data}
            onPageChange={(next) => filter('page', String(next))}
            label="문제 제작 현황"
          />
        </>
      )}
      {selected && selected.accountId === accountId && data && !error && (
        <AuthoringDetails
          key={`${accountId}:${selected.id}`}
          id={selected.id}
          accountId={accountId!}
          onClose={() => setSelected(null)}
          onAccessDenied={onAccessDenied}
        />
      )}
    </div>
  );
}
