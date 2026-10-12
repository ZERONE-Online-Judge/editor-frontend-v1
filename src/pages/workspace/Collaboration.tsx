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
  const { data, editable, notify } = useWorkspace();
  const [rows, setRows] = useState<Access[]>([]);
  const [login, setLogin] = useState('');
  const [role, setRole] = useState('WRITE');
  const [reviewer, setReviewer] = useState(false);
  const [translator, setTranslator] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<Access[]>(`/problems/${data.problem.id}/accesses`)
        .then(setRows)
        .catch((e) => notify(e.message, true)),
    [data.problem.id, notify],
  );
  useEffect(() => {
    if (editable) void load();
  }, [load, editable]);
  async function change(
    target: string,
    type: string,
    flags = { reviewer: false, translator: false },
  ) {
    setBusy(true);
    try {
      await put(`/problems/${data.problem.id}/accesses`, {
        login: target,
        role: type,
        ...flags,
      });
      await load();
      notify('협업 권한을 변경했습니다. 즉시 적용됩니다.');
      setLogin('');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="section-stack">
      <SectionHeading
        title="협업 권한"
        description="Editor에 로그인한 사용자를 추가합니다. 권한 변경은 커밋 없이 즉시 적용됩니다."
      />
      {!editable ? (
        <Notice>
          쓰기 권한이 있는 사용자가 협업 권한을 관리할 수 있습니다.
        </Notice>
      ) : (
        <>
          <section className="card">
            <SectionHeading title="협업자 추가" />
            <fieldset className="form-grid" disabled={busy}>
              <label>
                이메일 또는 Editor 아이디
                <input
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="name@example.com 또는 handle"
                />
              </label>
              <label>
                접근 권한
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="WRITE">쓰기 · 자료 수정과 커밋</option>
                  <option value="READ">읽기 · 자료와 결과 열람</option>
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={reviewer}
                  onChange={(e) => setReviewer(e.target.checked)}
                />
                검수자 · 이슈 작성과 처리
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={translator}
                  onChange={(e) => setTranslator(e.target.checked)}
                />
                번역자 · 지문 수정과 커밋
              </label>
              <button
                className="button primary"
                disabled={!login}
                onClick={() =>
                  void change(login, role, { reviewer, translator })
                }
              >
                <Icon name="plus" />
                권한 추가
              </button>
            </fieldset>
          </section>
          <section className="card no-padding">
            <table className="data-table">
              <thead>
                <tr>
                  <th>사용자</th>
                  <th>접근 권한</th>
                  <th>역할</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((member) => (
                  <tr key={member.user_id}>
                    <td>
                      <strong>{member.display_name}</strong>
                      <div className="subtext">@{member.handle}</div>
                    </td>
                    <td>
                      <Badge
                        tone={member.role === 'OWNER' ? 'accent' : 'neutral'}
                      >
                        {member.role}
                      </Badge>
                    </td>
                    <td>
                      <div className="inline-tags">
                        {member.reviewer && <Badge>검수자</Badge>}
                        {member.translator && <Badge>번역자</Badge>}
                      </div>
                    </td>
                    <td>
                      {member.role !== 'OWNER' && (
                        <button
                          className="text-button danger-text"
                          disabled={busy}
                          onClick={() => void change(member.handle, 'NONE')}
                        >
                          접근 해제
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="workspace-guide">
            <Icon name="users" />
            <p>
              각 협업자는 개인 작업 사본을 가집니다. 커밋된 변경은 업데이트로
              가져오며, 같은 항목을 수정하면 충돌을 확인합니다.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
function IssuesPanel() {
  const { data, editable, notify } = useWorkspace();
  const [rows, setRows] = useState<Issue[]>([]);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [kind, setKind] = useState('BUG');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = editable || data.problem.reviewer || data.problem.translator;
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
          rows.map((row) => (
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
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="BUG">오류 보고</option>
              <option value="ENHANCEMENT">개선 요청</option>
              <option value="DISCUSSION">논의</option>
            </select>
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
            {selected.comments.map((c, i) => (
              <div className="issue-comment" key={i}>
                <strong>{c.author}</strong>
                <span>{time(c.created_at)}</span>
                <Markdown>{c.content}</Markdown>
                {c.changes.map((change) => (
                  <p className="subtext" key={change}>
                    {change}
                  </p>
                ))}
              </div>
            ))}
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
