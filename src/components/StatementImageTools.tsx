import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  imageEditContextMatches,
  insertStatementImage,
  moveStatementImage,
  parseStatementImages,
  replaceStatementImage,
  statementImageMarkup,
  statementImageTextEditable,
  validateStatementImageUpload,
  type ImageAlignment,
  type StatementImageAsset,
  type StatementImageOccurrence,
} from '../lib/statementImages';
import './StatementImageTools.css';

export type { StatementImageAsset } from '../lib/statementImages';
export type StatementImageToolsProps = {
  identity: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  assets: StatementImageAsset[];
  onUpload?: (file: File) => Promise<StatementImageAsset>;
  readOnly?: boolean;
  children: ReactNode;
  renderThumbnail?: (asset: StatementImageAsset) => ReactNode;
};
type Context = {
  identity: string;
  value: string;
  position: number;
  version: number;
};

function ImageDialog({
  context,
  label,
  assets,
  busy,
  valid,
  onClose,
  onApply,
  onUpload,
  renderThumbnail,
}: {
  context: Context;
  label: string;
  assets: StatementImageAsset[];
  busy: boolean;
  valid: boolean;
  onClose: () => void;
  onApply: (value: string | null) => void;
  onUpload?: (file: File) => void;
  renderThumbnail?: (asset: StatementImageAsset) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();
  const images = useMemo(
    () => parseStatementImages(context.value),
    [context.value],
  );
  const [selected, setSelected] = useState<StatementImageOccurrence | null>(
    null,
  );
  const [assetId, setAssetId] = useState(assets[0]?.id ?? '');
  const [alt, setAlt] = useState(assets[0]?.name ?? '');
  const [align, setAlign] = useState<ImageAlignment>('center');
  const [width, setWidth] = useState('');
  const asset = assets.find((item) => item.id === assetId);
  const source = selected?.source ?? asset?.source ?? '';
  const locked = busy || !valid;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    dialog.focus();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  function selectImage(image: StatementImageOccurrence) {
    setSelected(image);
    setAlt(image.alt);
    setAlign(image.align ?? 'center');
    setWidth(image.width ?? '');
  }
  const tex = selected?.kind === 'tex';
  return createPortal(
    <dialog
      ref={ref}
      className="statement-image-dialog"
      tabIndex={-1}
      aria-labelledby={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="statement-image-dialog__panel">
        <header>
          <div>
            <h2 id={title}>이미지 추가·관리</h2>
            <p>{label} · 그림을 고르면 위치와 크기를 바꿀 수 있습니다.</p>
          </div>
          <button type="button" aria-label="이미지 관리 닫기" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="statement-image-dialog__body">
          {!valid && (
            <p className="statement-image-warning" role="status">
              편집 내용이 바뀌었습니다. 창을 닫고 이미지 관리를 다시 열어
              주세요.
            </p>
          )}
          {onUpload && (
            <label
              className={`statement-image-upload ${locked ? 'is-disabled' : ''}`}
            >
              새 이미지 업로드
              <input
                aria-label="새 이미지 업로드"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={locked}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = '';
                  if (file) onUpload(file);
                }}
              />
            </label>
          )}
          <p className="statement-image-help">
            PNG · JPEG · WEBP, 최대 16MiB. 붙여넣거나 편집 영역에 끌어 놓아도
            추가됩니다.
          </p>
          <section
            aria-label="사용할 이미지"
            className="statement-image-section"
          >
            <h3>첨부 이미지</h3>
            {assets.length ? (
              <div className="statement-image-gallery">
                {assets.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={!selected && item.id === assetId}
                    disabled={locked}
                    onClick={() => {
                      setSelected(null);
                      setAssetId(item.id);
                      setAlt(item.name);
                      setAlign('center');
                      setWidth('');
                    }}
                  >
                    <span className="statement-image-thumbnail">
                      {renderThumbnail ? (
                        renderThumbnail(item)
                      ) : item.previewUrl ? (
                        <img src={item.previewUrl} alt="" />
                      ) : (
                        <span aria-hidden="true">▧</span>
                      )}
                    </span>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="statement-image-empty">첨부된 이미지가 없습니다.</p>
            )}
          </section>
          {images.length > 0 && (
            <section
              className="statement-image-section"
              aria-label="본문에 사용한 이미지"
            >
              <h3>
                본문에 사용한 이미지 <span>{images.length}개</span>
              </h3>
              <div className="statement-image-occurrences">
                {images.map((image, index) => (
                  <button
                    key={image.start}
                    type="button"
                    aria-pressed={selected?.start === image.start}
                    disabled={locked}
                    onClick={() => selectImage(image)}
                  >
                    <span>{index + 1}</span>
                    <span>{image.alt || image.source}</span>
                    <small>
                      {image.kind === 'tex'
                        ? 'TeX'
                        : image.width || '원본 크기'}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="statement-image-section">
            <h3>{selected ? '선택한 이미지 수정' : '이미지 삽입'}</h3>
            {tex ? (
              <p className="statement-image-help">
                TeX 원문을 보존합니다. 문단 사이로 이동하거나 본문에서 제거할 수
                있습니다.
              </p>
            ) : (
              <>
                <label>
                  이미지 설명
                  <input
                    value={alt}
                    disabled={locked || !source}
                    onChange={(e) => setAlt(e.target.value)}
                    placeholder="그림을 설명해 주세요"
                  />
                </label>
                <div className="statement-image-options">
                  <label>
                    정렬
                    <select
                      value={align}
                      disabled={locked || !source}
                      onChange={(e) =>
                        setAlign(e.target.value as ImageAlignment)
                      }
                    >
                      <option value="left">왼쪽</option>
                      <option value="center">가운데</option>
                      <option value="right">오른쪽</option>
                    </select>
                  </label>
                  <label>
                    너비
                    <select
                      value={width}
                      disabled={locked || !source}
                      onChange={(e) => setWidth(e.target.value)}
                    >
                      <option value="">원본 크기</option>
                      {['25%', '50%', '75%', '100%'].map((size) => (
                        <option key={size}>{size}</option>
                      ))}
                      {width &&
                        !['25%', '50%', '75%', '100%'].includes(width) && (
                          <option value={width}>{width}</option>
                        )}
                    </select>
                  </label>
                </div>
              </>
            )}
            {selected && (
              <div className="statement-image-moves">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    onApply(
                      moveStatementImage(context.value, selected, 'above'),
                    )
                  }
                >
                  위 문단으로
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    onApply(
                      moveStatementImage(context.value, selected, 'below'),
                    )
                  }
                >
                  아래 문단으로
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    onApply(
                      moveStatementImage(
                        context.value,
                        selected,
                        context.position,
                      ),
                    )
                  }
                >
                  커서 위치로
                </button>
                <button
                  className="statement-image-remove"
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    onApply(replaceStatementImage(context.value, selected, ''))
                  }
                >
                  본문에서 제거
                </button>
              </div>
            )}
          </section>
        </div>
        <footer>
          <p>
            {busy
              ? '이미지 업로드 중…'
              : '원본 파일은 보존됩니다. 변경 후 지문을 저장해 주세요.'}
          </p>
          <button type="button" onClick={onClose}>
            닫기
          </button>
          {!tex && (
            <button
              type="button"
              className="statement-image-primary"
              disabled={locked || !source}
              onClick={() => {
                const markup = statementImageMarkup(
                  { source, alt, align, width },
                  selected?.legacy,
                );
                onApply(
                  selected
                    ? replaceStatementImage(context.value, selected, markup)
                    : insertStatementImage(
                        context.value,
                        context.position,
                        markup,
                      ),
                );
              }}
            >
              {selected ? '변경 적용' : '커서 위치에 삽입'}
            </button>
          )}
        </footer>
      </section>
    </dialog>,
    document.body,
  );
}

export default function StatementImageTools(props: StatementImageToolsProps) {
  const [context, setContext] = useState<Context | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(props);
  const version = useRef(0);
  const mounted = useRef(false);
  const uploading = useRef(false);
  const selection = useRef({
    identity: props.identity,
    value: props.value,
    position: props.value.length,
  });
  const readOnly = props.readOnly || !statementImageTextEditable(props.value);
  useLayoutEffect(() => {
    if (
      latest.current.identity !== props.identity ||
      latest.current.value !== props.value ||
      Boolean(latest.current.readOnly) !== Boolean(readOnly)
    )
      version.current++;
    latest.current = { ...props, readOnly };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function capture(target: EventTarget | null) {
    if (
      !(target instanceof HTMLTextAreaElement) ||
      target.value !== props.value
    )
      return;
    selection.current = {
      identity: props.identity,
      value: props.value,
      position: target.selectionStart,
    };
  }
  function currentContext(): Context {
    return {
      ...(imageEditContextMatches(props, selection.current)
        ? selection.current
        : {
            identity: props.identity,
            value: props.value,
            position: props.value.length,
          }),
      version: version.current,
    };
  }
  const matches = (captured: Context) =>
    captured.version === version.current &&
    imageEditContextMatches(latest.current, captured);
  function apply(captured: Context, value: string | null) {
    if (!mounted.current || !matches(captured)) {
      if (mounted.current)
        setNotice(
          '편집 내용이 바뀌었습니다. 이미지를 추가할 위치를 다시 선택해 주세요.',
        );
      return;
    }
    if (value === null) {
      setNotice(
        '코드나 이미지 중간에는 삽입할 수 없습니다. 문단 사이에 커서를 놓아 주세요.',
      );
      return;
    }
    latest.current.onChange(value);
    setContext(null);
    setNotice('이미지를 반영했습니다. 지문을 저장해 주세요.');
  }
  async function upload(file: File, captured: Context) {
    if (!props.onUpload || readOnly || uploading.current) return;
    uploading.current = true;
    setBusy(true);
    setNotice('');
    try {
      await validateStatementImageUpload(file);
      if (!mounted.current || !matches(captured)) return;
      const asset = await props.onUpload(file);
      if (!mounted.current) return;
      if (!matches(captured)) {
        setNotice(
          '이미지는 업로드했지만 편집 내용이 바뀌어 삽입하지 않았습니다. 첨부 이미지에서 다시 선택해 주세요.',
        );
        return;
      }
      apply(
        captured,
        insertStatementImage(
          captured.value,
          captured.position,
          statementImageMarkup({
            source: asset.source,
            alt: asset.name,
            align: 'center',
          }),
        ),
      );
    } catch (error) {
      if (mounted.current && latest.current.identity === captured.identity)
        setNotice(
          error instanceof Error
            ? error.message
            : '이미지를 업로드하지 못했습니다. 다시 시도해 주세요.',
        );
    } finally {
      uploading.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div
      className="statement-image-tools"
      onSelectCapture={(e) => capture(e.target)}
      onFocusCapture={(e) => capture(e.target)}
      onPasteCapture={(e) => {
        if (readOnly || !props.onUpload) return;
        const file = [...e.clipboardData.files].find((item) =>
          item.type.startsWith('image/'),
        );
        if (!file) return;
        e.preventDefault();
        capture(e.target);
        void upload(file, currentContext());
      }}
      onDragOverCapture={(e) => {
        if (
          !readOnly &&
          props.onUpload &&
          e.dataTransfer.types.includes('Files')
        )
          e.preventDefault();
      }}
      onDropCapture={(e) => {
        if (readOnly || !props.onUpload || !e.dataTransfer.files.length) return;
        e.preventDefault();
        capture(e.target);
        void upload(e.dataTransfer.files[0], currentContext());
      }}
    >
      {props.children}
      {!readOnly && (
        <div className="statement-image-toolbar">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              setNotice('');
              setContext(currentContext());
            }}
          >
            <span aria-hidden="true">▧</span> 이미지 추가·관리
          </button>
          <span>커서 위치에 삽입 · 정렬과 크기 조절</span>
        </div>
      )}
      {notice && (
        <p className="statement-image-feedback" role="status">
          {notice}
        </p>
      )}
      {context && !readOnly && (
        <ImageDialog
          context={context}
          label={props.label}
          assets={props.assets}
          busy={busy}
          valid={imageEditContextMatches(props, context)}
          onClose={() => {
            version.current++;
            setContext(null);
          }}
          onApply={(value) => apply(context, value)}
          onUpload={
            props.onUpload ? (file) => void upload(file, context) : undefined
          }
          renderThumbnail={props.renderThumbnail}
        />
      )}
    </div>
  );
}
