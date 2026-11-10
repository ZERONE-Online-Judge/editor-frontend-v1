import { useEffect, useRef, useState } from 'react';
import { statementImageStyle } from '../lib/statementHtml';
import { statementImageMime } from '../lib/statementAssets';
import './StatementImage.css';

type ImageProps = {
  src: string;
  alt: string;
  properties: Record<string, unknown>;
  compact?: boolean;
};

export default function StatementImage(props: ImageProps) {
  // A new source owns a new download/decode lifecycle. Parent layout changes
  // keep the same child, so already loaded authenticated URLs remain valid.
  return <ImageSource key={props.src} {...props} />;
}

function ImageSource({ src, alt, properties, compact = false }: ImageProps) {
  const internal = /^\/api\/problems\/[a-z\d-]+\/blobs\/[a-f\d]{64}$/.test(src);
  const [download, setDownload] = useState({ url: '', failed: false });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const ref = useRef<HTMLImageElement>(null);
  const url = internal ? download.url : src;

  useEffect(() => {
    if (!internal) return;
    const controller = new AbortController();
    let active = true;
    let objectUrl = '';
    void (async () => {
      try {
        // API attachments use octet-stream. Recognized images alone receive
        // an image MIME; SVG remains constrained to an img context.
        const response = await fetch(src, {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('image unavailable');
        const bytes = new Uint8Array(await response.arrayBuffer());
        const mime = statementImageMime(bytes);
        if (!mime || bytes.byteLength > 16 * 1024 * 1024)
          throw new Error('not a supported image');
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        setDownload({ url: objectUrl, failed: false });
      } catch {
        if (active) setDownload({ url: '', failed: true });
      }
    })();
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, internal]);

  useEffect(() => {
    const image = ref.current;
    if (!image || !url) return;
    let active = true;
    let failedLoad = false;
    let decoding = false;
    const failed = () => {
      failedLoad = true;
      if (active) setState('error');
    };
    const loaded = async () => {
      if (decoding || failedLoad) return;
      decoding = true;
      if (!image.naturalWidth) {
        failed();
        return;
      }
      try {
        await image.decode?.();
        if (active && !failedLoad) setState('ready');
      } catch {
        failed();
      }
    };
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    if (image.complete) void loaded();
    return () => {
      active = false;
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
    };
  }, [url]);

  if (!src) return null;
  const error = download.failed || state === 'error';
  const loading = !error && state !== 'ready';
  const layout = statementImageStyle(properties);
  return (
    <>
      {(loading || error) && (
        <span
          className="statement-image-status"
          data-statement-image-state={error ? 'error' : 'loading'}
          data-compact={compact || undefined}
          role="status"
          aria-live="polite"
          style={{
            width: layout.width || '100%',
            marginLeft: layout.marginLeft,
            marginRight: layout.marginRight,
            ...(!compact && !error && layout.height
              ? { height: layout.height, minHeight: 0 }
              : {}),
          }}
        >
          <svg
            className="statement-image-status-icon"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <circle cx="8" cy="9" r="1.5" />
            <path d="m4 17 5-5 4 4 3-3 5 5" />
          </svg>
          <span className="statement-image-status-copy">
            <span>
              {error
                ? '이미지를 불러오지 못했습니다'
                : '이미지를 불러오고 있습니다'}
            </span>
            {error && alt && <small>{alt}</small>}
          </span>
        </span>
      )}
      {url && !error && (
        <img
          ref={ref}
          className={loading ? 'statement-image-pending' : undefined}
          data-statement-image-state={state === 'ready' ? 'ready' : undefined}
          src={url}
          alt={alt}
          style={layout}
        />
      )}
    </>
  );
}
