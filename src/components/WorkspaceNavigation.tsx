import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon, Modal } from './ui';

const sections = [
  {
    label: '문제 작성',
    items: [
      ['overview', '개요', 'settings'],
      ['statements', '지문', 'file'],
      ['files', '파일 · 리소스', 'folder'],
      ['checker', 'Checker', 'shield'],
      ['validator', 'Validator', 'shield'],
      ['interactor', 'Interactor', 'code'],
    ],
  },
  {
    label: '테스트 · 검증',
    items: [
      ['tests', '테스트 · 생성 스크립트', 'tests'],
      ['solutions', '풀이', 'code'],
      ['verification', '전체 검증', 'check'],
      ['invocations', '실행 결과', 'play'],
      ['stress', '스트레스 테스트', 'spark'],
    ],
  },
  {
    label: '검수 · 배포',
    items: [
      ['review', '문제 미리보기', 'file'],
      ['issues', '이슈', 'issue'],
      ['access', '협업 권한', 'users'],
      ['revisions', '리비전', 'history'],
      ['materials', '공개 자료', 'folder'],
      ['packages', '패키지', 'box'],
    ],
  },
];

type NavigationProps = {
  problemId: string;
  tab: string;
  required: number;
  recommended: number;
  pendingPreparations: number;
  busy: boolean;
  onDiscard: () => void;
};

export default function WorkspaceNavigation(props: NavigationProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const currentGroup = sections.find((group) =>
    group.items.some(([id]) => id === props.tab),
  );
  const currentItem = currentGroup?.items.find(([id]) => id === props.tab);

  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 901px)');
    if (!desktop) return;
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    menuRef.current
      ?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')
      ?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <aside className="problem-sidebar" aria-label="문제 작업 메뉴">
        <NavigationLinks {...props} />
      </aside>
      <button
        type="button"
        className="workspace-menu-toggle"
        aria-label={`작업 메뉴 열기 · ${currentItem?.[1] ?? '개요'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="workspace-menu-icon">
          <Icon name="menu" size={21} />
        </span>
        <span className="workspace-menu-current">
          <small>{currentGroup?.label ?? '문제 작성'}</small>
          <strong>{currentItem?.[1] ?? '개요'}</strong>
        </span>
        <span className="workspace-menu-caption">메뉴</span>
      </button>
      {open && (
        <Modal
          title="문제 작업 메뉴"
          className="workspace-menu-modal"
          onClose={() => setOpen(false)}
        >
          <nav ref={menuRef} aria-label="이동할 작업 선택">
            <NavigationLinks
              {...props}
              onNavigate={() => setOpen(false)}
              onDiscard={() => {
                setOpen(false);
                props.onDiscard();
              }}
            />
          </nav>
        </Modal>
      )}
    </>
  );
}

function NavigationLinks({
  problemId,
  required,
  recommended,
  pendingPreparations,
  busy,
  onDiscard,
  onNavigate,
}: NavigationProps & { onNavigate?: () => void }) {
  return (
    <div className="workspace-navigation-links">
      {sections.map((group) => (
        <div className="sidebar-group" key={group.label}>
          <div>{group.label}</div>
          {group.items.map(([id, label, icon]) => (
            <NavLink
              key={id}
              to={`/problems/${problemId}/${id}`}
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={(event) => {
                if (
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey &&
                  event.button === 0
                )
                  onNavigate?.();
              }}
            >
              <Icon name={icon} size={17} />
              <span>{label}</span>
              {id === 'overview' && (
                <span className={`nav-readiness ${required ? 'blocking' : ''}`}>
                  {required ? `필수 ${required}` : '필수 완료'}
                  {recommended ? ` · 권장 ${recommended}` : ''}
                </span>
              )}
              {id === 'invocations' && pendingPreparations > 0 && (
                <span className="nav-count">미반영 {pendingPreparations}</span>
              )}
            </NavLink>
          ))}
        </div>
      ))}
      <div className="sidebar-bottom">
        <span>작업 사본은 나에게만 보입니다.</span>
        <button className="text-button" disabled={busy} onClick={onDiscard}>
          작업 사본 되돌리기
        </button>
      </div>
    </div>
  );
}
