import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { allPermissions } from '../lib/permissions';
import { folderRoles } from '../lib/sharedFolders';
import { useAuth } from '../lib/authContext';
import type { Folder } from '../lib/types';
import type { Members, SharedFolderTab } from './SharedFolders';
import { Badge, Icon } from './ui';

export default function SharedFolderOverview({
  folder,
  nested = false,
  refreshTick = 0,
  onOpen,
}: {
  folder: Folder;
  nested?: boolean;
  refreshTick?: number;
  onOpen: (tab: SharedFolderTab) => void;
}) {
  const { user } = useAuth();
  const workspaceId = folder.workspace_id;
  const [snapshot, setSnapshot] = useState<{
    id: string;
    data: Members | null;
    error: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const data = await api<Members>(
          `/shared-folders/${workspaceId}/members`,
        );
        if (active) setSnapshot({ id: workspaceId!, data, error: '' });
      } catch (error) {
        if (active)
          setSnapshot({
            id: workspaceId!,
            data: null,
            error: (error as Error).message,
          });
      } finally {
        pending = false;
      }
    }
    void load();
    window.addEventListener('focus', load);
    return () => {
      active = false;
      window.removeEventListener('focus', load);
    };
  }, [workspaceId, refreshTick, retry]);
  const currentSnapshot =
    snapshot && snapshot.id === workspaceId ? snapshot : null;
  const data = currentSnapshot?.data;
  const error = currentSnapshot?.error;
  const owner = data?.members.find((member) => member.role === 'OWNER');
  const permissions =
    data?.permissions ??
    (data?.role === 'OWNER' || data?.role === 'ADMIN' ? allPermissions : []);
  const canManage = permissions.includes('manage_access');
  return (
    <section
      className="team-folder-overview"
      aria-label="팀 폴더 협업 현황"
      aria-busy={!data && !error}
    >
      <div className="team-folder-heading">
        <div className="team-folder-title">
          <span className="team-folder-icon">
            <Icon name="users" size={23} />
          </span>
          <div>
            <span className="eyebrow">팀 폴더</span>
            <h2>{folder.name}</h2>
          </div>
        </div>
        <div className="actions">
          <button className="button" onClick={() => onOpen('members')}>
            <Icon name="users" size={16} />
            {canManage ? '구성원 관리' : '구성원 보기'}
          </button>
          {canManage && (
            <button className="button primary" onClick={() => onOpen('invite')}>
              <Icon name="plus" size={16} />
              구성원 초대
            </button>
          )}
        </div>
      </div>
      {data ? (
        <>
          <div className="team-folder-facts">
            <strong>
              함께하는 구성원 <span>{data.members.length}명</span>
            </strong>
            {owner && (
              <span>
                소유자 <strong>{owner.display_name || owner.handle}</strong>
              </span>
            )}
            <span>
              내 권한 <Badge>{folderRoles[data.role]}</Badge>
            </span>
            {canManage && (
              <button
                className="text-button"
                onClick={() => onOpen('invitations')}
              >
                초대 대기 {data.invitations.length}건{' '}
                <Icon name="arrow" size={13} />
              </button>
            )}
          </div>
          <div className="team-folder-people" aria-label="함께하는 구성원">
            {data.members.slice(0, 6).map((member) => (
              <button
                className="team-member-chip"
                key={member.user_id}
                onClick={() => onOpen('members')}
                title={`${member.display_name || member.handle} · ${folderRoles[member.role]}`}
              >
                <span className="team-member-avatar" aria-hidden="true">
                  {Array.from(member.display_name || member.handle)[0]}
                </span>
                <span>
                  <strong>
                    {member.display_name || member.handle}
                    {member.user_id === user?.id && ' (나)'}
                  </strong>
                  <small>{folderRoles[member.role]}</small>
                </span>
              </button>
            ))}
            {data.members.length > 6 && (
              <button
                className="team-member-more"
                onClick={() => onOpen('members')}
              >
                +{data.members.length - 6}명 더 보기
              </button>
            )}
          </div>
        </>
      ) : error ? (
        <div className="team-folder-error" role="alert">
          <span>구성원 정보를 불러오지 못했습니다. {error}</span>
          <button
            className="text-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <p className="muted small" role="status">
          소유자와 구성원을 불러오고 있습니다.
        </p>
      )}
      <p className="team-folder-scope">
        {nested
          ? '이 하위 폴더는 위 팀 폴더의 구성원·권한을 함께 사용합니다.'
          : '구성원은 이 폴더와 하위 폴더의 문제를 함께 작업합니다.'}
      </p>
    </section>
  );
}
