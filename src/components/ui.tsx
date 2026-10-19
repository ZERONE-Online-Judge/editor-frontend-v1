import { useEffect, useRef, useId, type ReactNode } from 'react';
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    arrow: <path d="m9 5 7 7-7 7" />,
    down: <path d="m6 9 6 6 6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    file: (
      <>
        <path d="M14 3H5v18h14V8zM14 3v5h5" />
        <path d="M8 12h8M8 16h6" />
      </>
    ),
    code: <path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18" />,
    tests: (
      <>
        <path d="M6 3h12M9 3v6l-5 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3M7 15h10" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5z" />
        <path d="m8 11 3 3 5-6" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8z" />,
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-7M3 3v5h5M12 7v6l4 2" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5" />
      </>
    ),
    box: (
      <>
        <path d="m3 7 9-5 9 5v11l-9 4-9-4zM3 7l9 5 9-5M12 12v10M7 4l10 6" />
      </>
    ),
    issue: (
      <>
        <path d="M21 3H3v15h5l4 4 4-4h5zM12 7v4M12 14h.01" />
      </>
    ),
    settings: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="8" cy="6" r="2" />
        <circle cx="16" cy="12" r="2" />
        <circle cx="10" cy="18" r="2" />
      </>
    ),
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
    upload: <path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5" />,
    trash: (
      <>
        <path d="M3 6h18M6 6l1 15h10l1-15M9 6V3h6v3M10 10v7M14 10v7" />
      </>
    ),
    save: (
      <>
        <path d="M3 3h15l3 3v15H3zM7 3v6h10V3M7 21v-8h10v8" />
      </>
    ),
    branch: (
      <>
        <circle cx="6" cy="4" r="2" />
        <circle cx="6" cy="20" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M6 6v12M6 14c8 0 12-2 12-6" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9a3 3 0 1 1 4 3c-1 .3-1 1-1 2M12 17h.01" />
      </>
    ),
    folder: <path d="M3 6V3h7l3 3h8v15H3z" />,
    logout: <path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h13" />,
    spark: <path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3z" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.file}
    </svg>
  );
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning';
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'error' | 'success';
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`notice ${tone}`}
    >
      <Icon name={tone === 'error' ? 'issue' : 'check'} />
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  icon = 'folder',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={26} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  footer,
  wide = false,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    (
      dialog.querySelector<HTMLElement>(
        '.modal-body input,.modal-body textarea',
      ) || dialog.querySelector<HTMLElement>('button')
    )?.focus();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className={`editor-modal ${wide ? 'wide' : ''} ${className}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="닫기">
          <Icon name="close" />
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </dialog>
  );
}
export function SectionHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
export function CodeEditor({
  value,
  onChange,
  label = '코드',
  readOnly = false,
  rows = 18,
}: {
  value: string;
  onChange?: (value: string) => void;
  label?: string;
  readOnly?: boolean;
  rows?: number;
}) {
  return (
    <div className={`code-editor ${readOnly ? 'readonly' : ''}`}>
      <div className="code-editor-bar">
        <Icon name="code" size={15} />
        <span>{label}</span>
        <span className="code-line-count">{value.split('\n').length}행</span>
      </div>
      <textarea
        aria-label={label}
        spellCheck={false}
        value={value}
        rows={rows}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}
