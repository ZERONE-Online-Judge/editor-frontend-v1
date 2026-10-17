import { useEffect, useState } from 'react';
import { statementImageStyle } from '../lib/statementHtml';
import { statementImageMime } from '../lib/statementAssets';

export default function StatementImage({
  src,
  alt,
  properties,
}: {
  src: string;
  alt: string;
  properties: Record<string, unknown>;
}) {
  const internal = /^\/api\/problems\/[a-z\d-]+\/blobs\/[a-f\d]{64}$/.test(src);
  const [image, setImage] = useState({ source: '', url: '', failed: false });
  useEffect(() => {
    if (!internal) return;
    const controller = new AbortController();
    let active = true;
    let url = '';
    void (async () => {
      try {
        // Blob downloads deliberately use attachment/octet-stream on the API.
        // Only recognized images are retyped, and SVG stays in an img context.
        const response = await fetch(src, {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('image unavailable');
        const bytes = new Uint8Array(await response.arrayBuffer());
        const mime = statementImageMime(bytes, alt);
        if (!mime || bytes.byteLength > 16 * 1024 * 1024)
          throw new Error('not a supported image');
        if (!active) return;
        url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        setImage({ source: src, url, failed: false });
      } catch {
        if (active) setImage({ source: src, url: '', failed: true });
      }
    })();
    return () => {
      active = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, alt, internal]);
  if (!src) return null;
  if (internal && image.source !== src)
    return <span role="status">이미지 불러오는 중…</span>;
  if (internal && image.failed)
    return <a href={src}>{alt || '이미지'} 다운로드</a>;
  return (
    <img
      src={internal ? image.url : src}
      alt={alt}
      style={statementImageStyle(properties)}
    />
  );
}
