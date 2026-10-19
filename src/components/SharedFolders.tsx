import PermissionChecklist, { PermissionSummary } from './PermissionChecklist';
import { allPermissions } from '../lib/permissions';
import type { Permission } from '../lib/permissions';
import { useCallback, useEffect, useId, useState } from 'react';
import { api, post, put, time } from '../lib/api';
import { useAuth } from '../lib/authContext';
import { folderRoles } from '../lib/sharedFolders';
import type { Folder, FolderRole } from '../lib/types';
import { Modal, Notice, Badge, Icon } from './ui';

type Invite = {
  id: string;
  workspace_id: string;
  folder_name: string;
  role: FolderRole;
  permissions?: Permission[];
  inviter: string;
  expires_at: number;
};
type Member = {
  user_id: string;
  role: FolderRole;
  permissions?: Permission[];
  display_name: string;
  handle: string;
};
type PendingInvitation = {
  id: string;
  email: string;
  role: FolderRole;
  permissions?: Permission[];
  expires_at: number;
};
type PermissionTarget =
  | { kind: 'member'; member: Member }
  | { kind: 'invitation'; invitation: PendingInvitation };
export type SharedFolderTab = 'members' | 'invitations' | 'invite';
export type Members = {
  role: FolderRole;
  permissions?: Permission[];
  members: Member[];
  invitations: PendingInvitation[];
};
export function FolderInvitations({
  onAccepted,
  refreshTick = 0,
}: {
  onAccepted: (id: string) => void;
  refreshTick?: number;
}) {
  const [invitations, setInvitations] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<Invite[]>('/shared-folders/invitations')
      .then((rows) => {
        if (active) setInvitations(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refreshTick]);
  async function respond(invite: Invite, accept: boolean) {
    setBusy(true);
    setError('');
    try {
      await post(
        `/shared-folders/invitations/${invite.id}/${accept ? 'accept' : 'decline'}`,
      );
      setInvitations((items) => items.filter((i) => i.id !== invite.id));
      if (accept) onAccepted(invite.workspace_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!invitations.length && !error) return null;
  return (
    <section
      className="card shared-invitations"
      aria-label="받은 공유 폴더 초대"
    >
      <h2>
        받은 초대 <Badge>{invitations.length}</Badge>
      </h2>
      <p className="muted">
        수락하면 폴더 안의 모든 문제와 하위 폴더에 접근할 수 있습니다.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {invitations.map((invite) => (
        <div className="shared-member-row" key={invite.id}>
          <div>
            <strong>{invite.folder_name}</strong>
            <p>
              {invite.inviter}님의 초대 · {folderRoles[invite.role]} ·{' '}
              {time(invite.expires_at)}까지
            </p>
          </div>
          <PermissionSummary value={invite.permissions || []} />
          <div className="actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => void respond(invite, false)}
            >
              거절
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void respond(invite, true)}
            >
              초대 수락
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

export function NewSharedFolder({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function create() {
    setBusy(true);
    try {
      const f = await post<Folder>('/shared-folders', { name });
      onCreated(f.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="공유 작업 폴더 만들기"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button
            className="button primary"
            onClick={() => void create()}
            disabled={busy || !name.trim()}
          >
            공유 폴더 만들기
          </button>
        </>
      }
    >
      <label>
        폴더 이름
        <input
          value={name}
          maxLength={80}
          placeholder="예: 2026 대회 출제팀"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <p className="muted">
        개인 정리용 폴더와 달리, 구성원들이 같은 폴더 구조와 문제 목록을 함께
        사용합니다. 만든 뒤 이메일이나 @Editor 아이디로 사람을 초대하세요.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
    </Modal>
  );
}

export function SharedFolderMembers({
  folder,
  onClose,
  onChanged,
  onLeft,
  initialTab = 'members',
}: {
  folder: Folder;
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
  initialTab?: SharedFolderTab;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<Members | null>(null);
  const [login, setLogin] = useState('');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [memberPermissions, setMemberPermissions] = useState<Permission[]>([]);
  const [editing, setEditing] = useState<PermissionTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<Member | null>(null);
  const [tab, setTab] = useState<SharedFolderTab>(initialTab);
  const [query, setQuery] = useState('');
  const panelId = useId();
  const base = `/shared-folders/${folder.workspace_id}`;
  const load = useCallback(
    () => api<Members>(`${base}/members`).then(setData),
    [base],
  );
  useEffect(() => {
    let active = true;
    api<Members>(`${base}/members`)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [base]);
  const actorPermissions =
    data?.permissions ||
    (data?.role === 'OWNER' || data?.role === 'ADMIN' ? allPermissions : []);
  const admin = actorPermissions.includes('manage_access');
  const activeTab = admin ? tab : 'members';
  const tabs: [SharedFolderTab, string][] = [
    ['members', `구성원 ${data?.members.length || 0}명`],
    ...(admin
      ? ([
          ['invitations', `초대 대기 ${data?.invitations.length || 0}건`],
          ['invite', '새 구성원 초대'],
        ] as [SharedFolderTab, string][])
      : []),
  ];
  const owner = data?.members.find((member) => member.role === 'OWNER');
  const visibleMembers =
    data?.members.filter((member) =>
      `${member.display_name} ${member.handle}`
        .toLocaleLowerCase()
        .includes(query.trim().replace(/^@/, '').toLocaleLowerCase()),
    ) || [];
  const canChangeInvitation = (invite: PendingInvitation) =>
    admin &&
    (data?.role === 'OWNER' ||
      !invite.permissions?.includes('manage_access')) &&
    (invite.permissions || []).every((p) => actorPermissions.includes(p));
  function editPermissions(target: PermissionTarget, selected: Permission[]) {
    setError('');
    setMessage('');
    setMemberPermissions([...selected]);
    setEditing(target);
  }
  function closeEditor() {
    if (!busy) {
      setEditing(null);
      setError('');
    }
  }
  async function savePermissions() {
    if (!editing || busy) return;
    const invitation = editing.kind === 'invitation';
    const path =
      editing.kind === 'member'
        ? `members/${editing.member.user_id}`
        : `invitations/${editing.invitation.id}`;
    const saved = await act(
      () => put(`${base}/${path}`, { permissions: memberPermissions }),
      invitation
        ? '초대 권한을 변경했습니다. 상대방이 수락할 때 적용됩니다.'
        : '권한을 변경했습니다. 즉시 적용됩니다.',
    );
    if (saved) setEditing(null);
  }
  async function act(
    action: () => Promise<unknown>,
    success: string,
    left = false,
  ) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      if (left) {
        onLeft();
        return;
      }
      await load();
      setMessage(success);
      onChanged();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title={`${folder.name} · 구성원`}
        className="shared-members-modal"
        onClose={() => {
          if (!busy) onClose();
        }}
        wide
      >
        <div className="shared-members-summary">
          <div>
            <Icon name="users" size={20} />
            <strong>
              {data
                ? `함께하는 구성원 ${data.members.length}명`
                : error
                  ? '구성원 정보를 확인하지 못했습니다.'
                  : '구성원 확인 중'}
            </strong>
          </div>
          {owner && (
            <span>
              소유자 <strong>{owner.display_name || owner.handle}</strong>
            </span>
          )}
        </div>
        <p className="muted small shared-members-scope">
          이 팀 폴더와 모든 하위 폴더·문제에 같은 권한이 적용됩니다.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone="success">{message}</Notice>}
        {!data ? (
          error ? (
            <button
              className="button"
              onClick={() => {
                setError('');
                void load().catch((e) => setError(e.message));
              }}
            >
              다시 불러오기
            </button>
          ) : (
            <p role="status">구성원을 불러오고 있습니다.</p>
          )
        ) : (
          <>
            <div
              className="shared-members-tabs"
              role="tablist"
              aria-label="팀 폴더 구성원 관리"
            >
              {tabs.map(([value, label], index) => (
                <button
                  key={value}
                  id={`${panelId}-${value}`}
                  role="tab"
                  aria-selected={activeTab === value}
                  aria-controls={`${panelId}-panel`}
                  tabIndex={activeTab === value ? 0 : -1}
                  disabled={busy}
                  onClick={() => setTab(value)}
                  onKeyDown={(event) => {
                    const next =
                      event.key === 'ArrowRight'
                        ? (index + 1) % tabs.length
                        : event.key === 'ArrowLeft'
                          ? (index - 1 + tabs.length) % tabs.length
                          : event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? tabs.length - 1
                              : null;
                    if (next === null) return;
                    event.preventDefault();
                    setTab(tabs[next][0]);
                    const buttons =
                      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                        '[role="tab"]',
                      );
                    buttons?.item(next).focus();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              id={`${panelId}-panel`}
              role="tabpanel"
              aria-labelledby={`${panelId}-${activeTab}`}
            >
              {admin && activeTab === 'invite' && (
                <section className="shared-invite-form">
                  <h3>이메일 또는 아이디로 초대</h3>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act(
                        () =>
                          post(`${base}/invitations`, {
                            login: login.trim(),
                            permissions,
                          }).then(() => setLogin('')),
                        '초대를 등록하고 안내 메일 발송을 요청했습니다. 상대방이 로그인 후 받은 초대에서 수락할 수 있습니다.',
                      );
                    }}
                  >
                    <fieldset disabled={busy}>
                      <label>
                        이메일 또는 Editor 아이디
                        <input
                          required
                          type="text"
                          value={login}
                          maxLength={254}
                          placeholder="name@example.com 또는 @editor-1234567890"
                          autoCapitalize="none"
                          spellCheck={false}
                          onChange={(e) => setLogin(e.target.value)}
                        />
                      </label>
                      <PermissionChecklist
                        folder
                        value={permissions}
                        onChange={setPermissions}
                        disabled={busy}
                        allowed={actorPermissions}
                      />
                      <button
                        className="button primary"
                        disabled={!login.trim()}
                      >
                        초대하기
                      </button>
                    </fieldset>
                    <p className="muted">
                      아이디는 내 정보에서 확인할 수 있습니다. 아이디로 초대해도
                      해당 계정에 안내 이메일을 보냅니다. 초대는 7일간 유효하며,
                      상대방이 ZOJ 로그인 후 받은 초대에서 수락할 수 있습니다.
                    </p>
                  </form>
                </section>
              )}
              {activeTab === 'members' && (
                <section aria-label="폴더 구성원 목록">
                  <label className="search-field shared-member-search">
                    <Icon name="search" />
                    <input
                      aria-label="구성원 검색"
                      placeholder="이름 또는 아이디로 구성원 검색"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  {visibleMembers.map((member) => (
                    <div className="shared-member-row" key={member.user_id}>
                      <div>
                        <strong>{member.display_name || member.handle}</strong>
                        <small>
                          @{member.handle}
                          {user?.id === member.user_id ? ' · 나' : ''}
                        </small>
                      </div>
                      <div className="actions">
                        {member.role !== 'OWNER' && (
                          <Badge>{folderRoles[member.role]}</Badge>
                        )}
                        {member.role === 'OWNER' ? (
                          <Badge>소유자 · 모든 권한</Badge>
                        ) : admin &&
                          (data.role === 'OWNER' ||
                            !member.permissions?.includes('manage_access') ||
                            user?.id === member.user_id) &&
                          (member.permissions || []).every((p) =>
                            actorPermissions.includes(p),
                          ) ? (
                          <>
                            <button
                              className="button small"
                              disabled={busy}
                              onClick={() => {
                                editPermissions(
                                  { kind: 'member', member },
                                  member.permissions || [],
                                );
                              }}
                            >
                              권한 수정
                            </button>
                            <button
                              className="text-button danger-text"
                              disabled={busy}
                              onClick={() => setConfirm(member)}
                            >
                              내보내기
                            </button>
                          </>
                        ) : null}
                      </div>
                      {member.role !== 'OWNER' && (
                        <PermissionSummary value={member.permissions || []} />
                      )}
                    </div>
                  ))}
                  {!visibleMembers.length && (
                    <p className="muted">검색한 구성원이 없습니다.</p>
                  )}
                </section>
              )}
              {admin && activeTab === 'invitations' && (
                <section aria-label="초대 대기 목록">
                  <p className="muted small">
                    아직 수락하지 않은 초대입니다. 수락하기 전에도 권한을 수정할
                    수 있습니다.
                  </p>
                  {data.invitations.map((invite) => (
                    <div className="shared-member-row" key={invite.id}>
                      <div>
                        <strong>{invite.email}</strong>
                        <PermissionSummary value={invite.permissions || []} />
                        <small>
                          {folderRoles[invite.role]} · {time(invite.expires_at)}
                          까지
                        </small>
                      </div>
                      <div className="actions">
                        {canChangeInvitation(invite) && (
                          <button
                            className="button small"
                            disabled={busy}
                            onClick={() =>
                              editPermissions(
                                { kind: 'invitation', invitation: invite },
                                invite.permissions || [],
                              )
                            }
                          >
                            권한 수정
                          </button>
                        )}
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () =>
                                api(`${base}/invitations/${invite.id}`, {
                                  method: 'DELETE',
                                }),
                              '초대를 취소했습니다.',
                            )
                          }
                        >
                          초대 취소
                        </button>
                      </div>
                    </div>
                  ))}
                  {!data.invitations.length && (
                    <div className="shared-members-empty">
                      <Icon name="users" size={28} />
                      <strong>대기 중인 초대가 없습니다.</strong>
                      <p>함께 작업할 사람을 이메일이나 @아이디로 초대하세요.</p>
                      <button
                        className="button"
                        onClick={() => setTab('invite')}
                      >
                        새 구성원 초대
                      </button>
                    </div>
                  )}
                </section>
              )}
            </div>
            <details className="shared-members-help">
              <summary>권한과 폴더 나가기 안내</summary>
              <p className="muted small">
                문제와 같은 기능별 권한을 사용합니다. 폴더 정리와 새 문제 추가는
                별도로 선택합니다. 폴더 권한으로 문제별 직접 공유를 추가할 수는
                없습니다. 문제 삭제·공유 범위를 바꾸는 이동은 문제 소유자만 할
                수 있습니다.
              </p>
              <p className="muted small">
                탈퇴·내보내기는 이 폴더를 통해 받은 접근만 해제합니다. 문제
                소유권과 문제별 직접 공유는 유지됩니다.
              </p>
            </details>
            {data.role !== 'OWNER' && (
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  setConfirm(
                    data.members.find((m) => m.user_id === user?.id) || null,
                  )
                }
              >
                공유 폴더 나가기
              </button>
            )}
          </>
        )}
      </Modal>
      {confirm && (
        <Modal
          title={
            confirm.user_id === user?.id
              ? '이 공유 폴더에서 나갈까요?'
              : `${confirm.display_name}님을 내보낼까요?`
          }
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
          className="shared-remove-modal"
          footer={
            <>
              <button
                className="button"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                취소
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() =>
                  void act(
                    () =>
                      api(`${base}/members/${confirm.user_id}`, {
                        method: 'DELETE',
                      }).then(() => setConfirm(null)),
                    '구성원을 내보냈습니다.',
                    confirm.user_id === user?.id,
                  )
                }
              >
                확인
              </button>
            </>
          }
        >
          <p role="alert">
            {confirm.user_id === user?.id
              ? '이 공유 폴더에서 나갈까요?'
              : `${confirm.display_name}님을 내보낼까요?`}
          </p>
          <p>
            폴더를 통해 받은 접근과 실행 권한이 해제됩니다. 별도로 공유받은 문제
            권한은 유지됩니다.
          </p>
        </Modal>
      )}
      {editing && (
        <Modal
          title={`${editing.kind === 'member' ? editing.member.display_name : editing.invitation.email} · ${editing.kind === 'invitation' ? '초대 권한 수정' : '기능별 권한'}`}
          wide
          className="permission-member-editor"
          onClose={closeEditor}
          footer={
            <>
              <button className="button" disabled={busy} onClick={closeEditor}>
                취소
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void savePermissions()}
              >
                {busy ? '저장 중…' : '권한 저장'}
              </button>
            </>
          }
        >
          <p className="muted">
            {folder.name} ·{' '}
            {editing.kind === 'invitation'
              ? '초대를 수락하면 선택한 권한으로 참여합니다. 초대 만료일은 유지됩니다.'
              : '변경한 권한은 이 폴더와 하위 폴더·문제에 즉시 적용됩니다.'}
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          <PermissionChecklist
            folder
            value={memberPermissions}
            onChange={setMemberPermissions}
            allowed={actorPermissions}
            disabled={busy}
          />
        </Modal>
      )}
    </>
  );
}
