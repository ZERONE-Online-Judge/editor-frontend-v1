import { useCallback, useEffect, useState } from 'react';
import { api, post, put, time } from '../lib/api';
import { useAuth } from '../lib/authContext';
import { folderRoles, folderRoleHelp } from '../lib/sharedFolders';
import type { Folder, FolderRole } from '../lib/types';
import { Modal, Notice, Badge } from './ui';

type Invite = {
  id: string;
  workspace_id: string;
  folder_name: string;
  role: FolderRole;
  inviter: string;
  expires_at: number;
};
type Member = {
  user_id: string;
  role: FolderRole;
  display_name: string;
  handle: string;
};
type Members = {
  role: FolderRole;
  members: Member[];
  invitations: {
    id: string;
    email: string;
    role: FolderRole;
    expires_at: number;
  }[];
};
const choices = Object.keys(folderRoleHelp) as Exclude<FolderRole, 'OWNER'>[];
function RoleOptions() {
  return choices.map((role) => (
    <option value={role} key={role}>
      {folderRoles[role]}
    </option>
  ));
}

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
        사용합니다. 만든 뒤 이메일로 사람을 초대하세요.
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
}: {
  folder: Folder;
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<Members | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<FolderRole, 'OWNER'>>('VIEWER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<Member | null>(null);
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
  const admin = data?.role === 'OWNER' || data?.role === 'ADMIN';
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="공유 폴더 · 구성원" onClose={onClose} wide>
      <div className="shared-scope">
        <strong>{folder.name}</strong>
        <p>
          권한은 이 공유 폴더 전체와 모든 하위 폴더·문제에 적용됩니다. 하위
          폴더별 권한은 따로 설정하지 않습니다.
        </p>
        <p>
          탈퇴·내보내기는 폴더를 통한 접근을 해제합니다. 문제 소유권과 문제별
          직접 공유는 유지됩니다.
        </p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {!data ? (
        <p role="status">구성원을 불러오고 있습니다.</p>
      ) : (
        <>
          {admin && (
            <section className="shared-invite-form">
              <h3>이메일로 초대</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(
                    () =>
                      post(`${base}/invitations`, { email, role }).then(() =>
                        setEmail(''),
                      ),
                    '초대를 등록했습니다. 상대방이 로그인 후 받은 초대에서 수락할 수 있습니다.',
                  );
                }}
              >
                <fieldset disabled={busy}>
                  <label>
                    ZOJ 로그인 이메일
                    <input
                      required
                      type="email"
                      value={email}
                      maxLength={254}
                      placeholder="name@example.com"
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <label>
                    초대 권한
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as typeof role)}
                    >
                      <RoleOptions />
                    </select>
                  </label>
                  <button className="button primary" disabled={!email.trim()}>
                    초대하기
                  </button>
                </fieldset>
                <p className="muted">
                  {folderRoleHelp[role]} · 초대는 7일간 유효하며 이메일은
                  발송하지 않습니다.
                </p>
              </form>
            </section>
          )}
          <section>
            <h3>구성원 {data.members.length}명</h3>
            {data.members.map((member) => (
              <div className="shared-member-row" key={member.user_id}>
                <div>
                  <strong>{member.display_name}</strong>
                  <small>
                    @{member.handle}
                    {user?.id === member.user_id ? ' · 나' : ''}
                  </small>
                </div>
                <div className="actions">
                  {admin &&
                  member.role !== 'OWNER' &&
                  (data.role === 'OWNER' ||
                    member.role !== 'ADMIN' ||
                    user?.id === member.user_id) ? (
                    <>
                      <select
                        aria-label={`${member.display_name} 권한`}
                        value={member.role}
                        disabled={busy}
                        onChange={(e) =>
                          void act(
                            () =>
                              put(`${base}/members/${member.user_id}`, {
                                role: e.target.value,
                              }),
                            '권한을 변경했습니다. 다음 요청부터 적용됩니다.',
                          )
                        }
                      >
                        <RoleOptions />
                      </select>
                      <button
                        className="text-button danger-text"
                        disabled={busy}
                        onClick={() => setConfirm(member)}
                      >
                        내보내기
                      </button>
                    </>
                  ) : (
                    <Badge>{folderRoles[member.role]}</Badge>
                  )}
                </div>
              </div>
            ))}
          </section>
          {admin && data.invitations.length > 0 && (
            <section>
              <h3>수락 대기</h3>
              {data.invitations.map((invite) => (
                <div className="shared-member-row" key={invite.id}>
                  <div>
                    <strong>{invite.email}</strong>
                    <small>
                      {folderRoles[invite.role]} · {time(invite.expires_at)}까지
                    </small>
                  </div>
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
              ))}
            </section>
          )}
          <details className="shared-role-guide">
            <summary>권한별 가능한 작업</summary>
            {choices.map((r) => (
              <p key={r}>
                <strong>{folderRoles[r]}</strong> · {folderRoleHelp[r]}
              </p>
            ))}
            <p>
              ZOJ 전송은 쓰기 권한이 있는 협업자가 자신의 대회 등록 권한으로 할
              수 있습니다. 문제 삭제는 원래 문제 소유자만 할 수 있습니다. 다른
              공유 폴더로 문제를 옮기는 작업도 문제 소유자가 확인해야 합니다.
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
      {confirm && (
        <div className="shared-remove-confirm" role="alert">
          <strong>
            {confirm.user_id === user?.id
              ? '이 공유 폴더에서 나갈까요?'
              : `${confirm.display_name}님을 내보낼까요?`}
          </strong>
          <p>
            폴더를 통해 받은 접근과 실행 권한이 해제됩니다. 별도로 공유받은 문제
            권한은 유지됩니다.
          </p>
          <div className="actions">
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
          </div>
        </div>
      )}
    </Modal>
  );
}
