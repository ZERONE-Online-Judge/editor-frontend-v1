import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
      ['verification-single', '단일 검증', 'check'],
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

const SIDEBAR_COLLAPSED_KEY = 'zoj.editor.sidebarCollapsed';

function storedSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) !== 'false';
  } catch {
    return true;
  }
}

export default function WorkspaceNavigation(props: NavigationProps) {
  const { key: locationKey } = useLocation();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [closingAt, setClosingAt] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(storedSidebarCollapsed);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const pointerFocused = useRef(false);
  const menuRef = useRef<HTMLElement>(null);
  const menuId = useId();
  const open = openedAt === locationKey;
  const closing = closingAt === locationKey;
  const expanded = !collapsed || hovered || focused;
  const drawerMounted = open || closing;
  const currentGroup = sections.find((group) =>
    group.items.some(([id]) => id === props.tab),
  );
  const currentItem = currentGroup?.items.find(([id]) => id === props.tab);

  function closeMenu() {
    if (!open) return;
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    setClosingAt(reduced ? null : locationKey);
    setOpenedAt(null);
  }

  useEffect(() => {
    if (!closingAt) return;
    const timer = window.setTimeout(() => setClosingAt(null), 180);
    return () => window.clearTimeout(timer);
  }, [closingAt]);

  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 768px)');
    if (!desktop) return;
    const closeOnDesktop = () => {
      if (desktop.matches) {
        setOpenedAt(null);
        setClosingAt(null);
      }
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!drawerMounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    menuRef.current
      ?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')
      ?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerMounted]);

  return (
    <div
      className="workspace-navigation"
      data-collapsed={collapsed}
      data-expanded={expanded}
    >
      <aside className="problem-sidebar" aria-label="문제 작업 메뉴">
        <div
          className="workspace-navigation-rail"
          onPointerEnter={(event) => {
            if (
              event.pointerType === 'mouse' &&
              window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
            )
              setHovered(true);
          }}
          onPointerLeave={() => setHovered(false)}
          onPointerDownCapture={(event) => {
            pointerFocused.current = true;
            setFocused(false);
            if (event.pointerType !== 'mouse') setHovered(false);
          }}
          onKeyDownCapture={() => {
            pointerFocused.current = false;
            setFocused(true);
          }}
          onFocus={() => {
            if (!pointerFocused.current) setFocused(true);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              pointerFocused.current = false;
              setFocused(false);
            }
          }}
        >
          <div className="workspace-rail-toolbar">
            <button
              type="button"
              className="workspace-sidebar-toggle"
              aria-label={collapsed ? '작업 메뉴 고정' : '작업 메뉴 접기'}
              title={collapsed ? '작업 메뉴 고정' : '작업 메뉴 접기'}
              aria-expanded={expanded}
              aria-pressed={!collapsed}
              aria-controls={`${menuId}-desktop`}
              onClick={() => {
                const next = !collapsed;
                setCollapsed(next);
                try {
                  window.localStorage.setItem(
                    SIDEBAR_COLLAPSED_KEY,
                    String(next),
                  );
                } catch {
                  /* Keep navigation usable without browser storage. */
                }
              }}
            >
              <Icon name="menu" size={20} />
            </button>
            <span className="workspace-rail-title">문제 작업</span>
          </div>
          <nav id={`${menuId}-desktop`} aria-label="작업 선택">
            <NavigationLinks {...props} />
          </nav>
        </div>
      </aside>
      <div className="workspace-menu-bar">
        <button
          type="button"
          className="workspace-menu-toggle"
          aria-label={`작업 메뉴 열기 · ${currentItem?.[1] ?? '개요'}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={drawerMounted ? menuId : undefined}
          title="작업 메뉴"
          onClick={() => {
            setClosingAt(null);
            setOpenedAt(locationKey);
          }}
        >
          <span className="workspace-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <span className="workspace-menu-location">
          <span>{currentGroup?.label ?? '문제 작성'}</span>
          <Icon name="arrow" size={12} />
          <strong>{currentItem?.[1] ?? '개요'}</strong>
        </span>
      </div>
      {drawerMounted && (
        <Modal
          title="문제 작업 메뉴"
          className={['workspace-menu-modal', closing ? 'is-closing' : ''].join(
            ' ',
          )}
          onClose={closeMenu}
        >
          <nav ref={menuRef} id={menuId} aria-label="이동할 작업 선택">
            <NavigationLinks
              {...props}
              onNavigate={closeMenu}
              onDiscard={() => {
                setOpenedAt(null);
                setClosingAt(null);
                props.onDiscard();
              }}
            />
          </nav>
        </Modal>
      )}
    </div>
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
              aria-label={label}
              title={label}
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
              <span className="workspace-nav-label">{label}</span>
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
