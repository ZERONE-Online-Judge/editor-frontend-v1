import Pagination, { PaginatedList } from '../../components/Pagination';
import { usePagination } from '../../lib/pagination';
import Select from '../../components/Select';
import { can, permissionsOf } from '../../lib/permissions';
import type { Permission } from '../../lib/permissions';
import PermissionChecklist, {
  PermissionSummary,
} from '../../components/PermissionChecklist';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { api, post, put, patch, time } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import type { Access, Issue } from '../../lib/types';
import {
  Badge,
  Empty,
  Icon,
  Modal,
  Notice,
  SectionHeading,
} from '../../components/ui';
import Markdown from '../../components/Markdown';
export default function Collaboration({
  access = false,
}: {
  access?: boolean;
}) {
  return access ? <AccessPanel /> : <IssuesPanel />;
}
function AccessPanel() {
  const { data, notify, reload } = useWorkspace();
  const canManage =
    can(data.problem, 'manage_access') &&
    data.problem.can_manage_access !== false;
  const [rows, setRows] = useState<Access[]>([]);
  const paging = usePagination(rows, data.problem.id);
  const [login, setLogin] = useState('');
  const [selected, setSelected] = useState<Permission[]>([]);
  const [memberPermissions, setMemberPermissions] = useState<Permission[]>([]);
  const [editingMember, setEditingMember] = useState<Access | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<Access[]>(`/problems/${data.problem.id}/accesses`)
        .then(setRows)
        .catch((e) => notify(e.message, true)),
    [data.problem.id, notify],
  );
  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);
  async function change(
    target: string,
    permissions: Permission[],
    remove = false,
  ) {
    setBusy(true);
    try {
      await put(`/problems/${data.problem.id}/accesses`, {
        login: target,
        permissions,
        ...(remove ? { role: 'NONE' } : {}),
      });
      await load();
      await reload(true);
      notify('협업 권한을 변경했습니다. 즉시 적용됩니다.');
      setLogin('');
      setEditingMember(null);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const actorPermissions = permissionsOf(data.problem);
  return (
    <div className="section-stack">
      <SectionHeading
        title="협업 권한"
        description="허용할 기능을 선택하세요. 권한 변경은 커밋 없이 즉시 적용됩니다."
      />
      {data.problem.workspace_id && (
        <Notice>
          공유 작업 폴더 <strong>{data.problem.workspace_name}</strong>에서 받은
          권한은{' '}
          <Link to={`/problems?folder=${data.problem.workspace_id}`}>
            공유 폴더의 구성원
          </Link>
          에서 관리합니다. 문제에 직접 받은 권한과 합쳐 적용되며, 직접 공유를
          해제해도 폴더 권한은 유지됩니다.
          <div className="permission-inherited">
            <strong>폴더에서 받은 권한</strong>
            <PermissionSummary
              value={data.problem.inherited_permissions || []}
            />
          </div>
        </Notice>
      )}
      {!canManage ? (
        <Notice>
          구성원·권한 관리 권한이 필요합니다. 공유 폴더 문제의 직접 공유는 문제
          소유자만 관리합니다.
        </Notice>
      ) : (
        <>
          <section className="card form-section">
            <SectionHeading title="협업자 추가" />
            <label>
              이메일 또는 Editor 아이디
              <input
                value={login}
                disabled={busy}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="name@example.com 또는 @editor-1234567890"
              />
            </label>
            <PermissionChecklist
              value={selected}
              onChange={setSelected}
              disabled={busy}
              allowed={actorPermissions}
            />
            <button
              className="button primary"
              disabled={busy || !login.trim()}
              onClick={() => void change(login, selected)}
            >
              <Icon name="plus" />
              권한 추가
            </button>
          </section>
          <section className="card">
            <SectionHeading title="문제에 직접 공유한 구성원" />
            {paging.items.map((member) => (
              <div className="permission-member" key={member.user_id}>
                <div>
                  <strong>{member.display_name}</strong>
                  <span className="subtext"> @{member.handle}</span>
                  {member.role !== 'OWNER' && (
                    <PermissionSummary value={permissionsOf(member)} />
                  )}
                </div>
                {member.role === 'OWNER' ? (
                  <Badge tone="accent">소유자 · 모든 권한</Badge>
                ) : (
                  <div className="actions">
                    <button
                      className="button small"
                      disabled={
                        busy ||
                        !permissionsOf(member).every((p) =>
                          actorPermissions.includes(p),
                        )
                      }
                      onClick={() => {
                        setEditingMember(member);
                        setMemberPermissions(permissionsOf(member));
                      }}
                    >
                      권한 수정
                    </button>
                    <button
                      className="text-button danger-text"
                      disabled={
                        busy ||
                        !permissionsOf(member).every((p) =>
                          actorPermissions.includes(p),
                        )
                      }
                      onClick={() => void change(member.handle, [], true)}
                    >
                      직접 공유 해제
                    </button>
                  </div>
                )}
              </div>
            ))}
            <Pagination {...paging} label="공유 구성원" />
          </section>
        </>
      )}
      {editingMember && (
        <Modal
          title={`${editingMember.display_name} · 기능별 권한`}
          wide
          onClose={() => {
            if (!busy) setEditingMember(null);
          }}
          footer={
            <>
              <button
                className="button"
                disabled={busy}
                onClick={() => setEditingMember(null)}
              >
                취소
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  void change(editingMember.handle, memberPermissions)
                }
              >
                권한 저장
              </button>
            </>
          }
        >
          <PermissionChecklist
            value={memberPermissions}
            onChange={setMemberPermissions}
            allowed={actorPermissions}
            disabled={busy}
          />
        </Modal>
      )}
    </div>
  );
}
function IssuesPanel() {
  const { data, notify } = useWorkspace();
  const [rows, setRows] = useState<Issue[]>([]);
  const paging = usePagination(rows, data.problem.id);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [kind, setKind] = useState('BUG');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = can(data.problem, 'issues');
  const load = useCallback(async () => {
    const values = await api<Issue[]>(`/problems/${data.problem.id}/issues`);
    setRows(values);
    setSelected((previous) =>
      previous ? values.find((v) => v.id === previous.id) || null : null,
    );
  }, [data.problem.id]);
  useEffect(() => {
    let active = true;
    api<Issue[]>(`/problems/${data.problem.id}/issues`)
      .then((values) => {
        if (active) setRows(values);
      })
      .catch((e) => {
        if (active) notify(e.message, true);
      });
    return () => {
      active = false;
    };
  }, [data.problem.id, notify]);
  async function add() {
    setBusy(true);
    try {
      await post(`/problems/${data.problem.id}/issues`, {
        title,
        content,
        kind,
      });
      setAdding(false);
      setTitle('');
      setContent('');
      await load();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function change(body: Record<string, unknown>) {
    if (!selected) return;
    setBusy(true);
    try {
      const issue = await patch<Issue>(
        `/problems/${data.problem.id}/issues/${selected.id}`,
        body,
      );
      setSelected(issue);
      setComment('');
      await load();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="section-stack">
      <SectionHeading
        title="문제 이슈"
        description="오류 보고와 개선 의견, 검수 논의를 문제와 함께 보관합니다."
        actions={
          <button
            className="button primary"
            disabled={!canEdit}
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" />새 이슈
          </button>
        }
      />
      <section className="card no-padding">
        {rows.length ? (
          paging.items.map((row) => (
            <button
              key={row.id}
              className="issue-row"
              onClick={() => setSelected(row)}
            >
              <Icon name={row.status === 'CLOSED' ? 'check' : 'issue'} />
              <div>
                <strong>{row.title}</strong>
                <p>
                  {row.author} · {time(row.updated_at)}
                </p>
              </div>
              <Badge>{row.kind}</Badge>
              <Badge tone={row.status === 'CLOSED' ? 'success' : 'warning'}>
                {row.status === 'CLOSED' ? '완료' : '열림'}
              </Badge>
              <span className="subtext">댓글 {row.comments.length}</span>
              <Icon name="arrow" size={15} />
            </button>
          ))
        ) : (
          <Empty
            icon="issue"
            title="등록된 이슈가 없습니다."
            description="검수 중 찾은 문제와 수정 논의를 남겨 주세요."
          />
        )}
      </section>
      <Pagination {...paging} label="문제 이슈" />
      {adding && (
        <Modal
          title="새 이슈"
          onClose={() => setAdding(false)}
          footer={
            <>
              <button className="button" onClick={() => setAdding(false)}>
                취소
              </button>
              <button
                className="button primary"
                disabled={busy || !title || !content}
                onClick={() => void add()}
              >
                이슈 등록
              </button>
            </>
          }
        >
          <label>
            제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            유형
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="BUG">오류 보고</option>
              <option value="ENHANCEMENT">개선 요청</option>
              <option value="DISCUSSION">논의</option>
            </Select>
          </label>
          <label>
            내용
            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
        </Modal>
      )}
      {selected && (
        <Modal
          wide
          title={selected.title}
          onClose={() => setSelected(null)}
          footer={
            <>
              <button className="button" onClick={() => setSelected(null)}>
                닫기
              </button>
              {canEdit && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void change({
                      status:
                        selected.status === 'CLOSED' ? 'REOPENED' : 'CLOSED',
                    })
                  }
                >
                  {selected.status === 'CLOSED'
                    ? '이슈 다시 열기'
                    : '이슈 완료'}
                </button>
              )}
            </>
          }
        >
          <div className="inline-tags">
            <Badge>{selected.kind}</Badge>
            <Badge tone={selected.status === 'CLOSED' ? 'success' : 'warning'}>
              {selected.status === 'CLOSED' ? '완료' : '열림'}
            </Badge>
            <span className="muted small">
              {selected.author} · {time(selected.created_at)}
            </span>
          </div>
          <Markdown>{selected.content}</Markdown>
          <div className="issue-comments">
            <PaginatedList
              items={selected.comments}
              resetKey={selected.id}
              label="이슈 댓글"
            >
              {(comments, offset) =>
                comments.map((c, i) => (
                  <div className="issue-comment" key={offset + i}>
                    <strong>{c.author}</strong>
                    <span>{time(c.created_at)}</span>
                    <Markdown>{c.content}</Markdown>
                    {c.changes.map((change) => (
                      <p className="subtext" key={change}>
                        {change}
                      </p>
                    ))}
                  </div>
                ))
              }
            </PaginatedList>
          </div>
          {canEdit && selected.status !== 'CLOSED' && (
            <>
              <label>
                댓글
                <textarea
                  value={comment}
                  rows={3}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <button
                className="button"
                disabled={busy || !comment.trim()}
                onClick={() => void change({ comment })}
              >
                댓글 등록
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
