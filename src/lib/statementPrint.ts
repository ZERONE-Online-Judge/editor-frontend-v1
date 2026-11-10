const imageFailure =
  '인쇄할 이미지를 불러오지 못했습니다. 미리보기에서 이미지를 확인한 뒤 다시 시도해 주세요.';

export function prepareStatementPrint(
  root: HTMLElement,
  signal: AbortSignal,
  timeoutMs = 15000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const Observer = root.ownerDocument.defaultView?.MutationObserver;
    if (!Observer) {
      reject(new Error(imageFailure));
      return;
    }
    let settled = false;
    let checking = false;
    let changed = false;
    const included = (element: Element) =>
      !element.closest('[data-print-included="false"], .review-screen-only');
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      observer.disconnect();
      root.removeEventListener('load', inspect, true);
      root.removeEventListener('error', inspect, true);
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () =>
      finish(new DOMException('Print preparation cancelled', 'AbortError'));
    const observer = new Observer(() => {
      changed = true;
      void inspect();
    });
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            '이미지 준비 시간이 오래 걸립니다. 잠시 후 다시 인쇄해 주세요.',
          ),
        ),
      timeoutMs,
    );
    async function inspect() {
      if (settled) return;
      if (checking) {
        changed = true;
        return;
      }
      checking = true;
      try {
        do {
          changed = false;
          const states = Array.from(
            root.querySelectorAll('[data-statement-image-state]'),
          ).filter(included);
          if (
            states.some(
              (element) =>
                element.getAttribute('data-statement-image-state') === 'error',
            )
          ) {
            finish(new Error(imageFailure));
            return;
          }
          if (
            states.some(
              (element) =>
                element.getAttribute('data-statement-image-state') ===
                'loading',
            )
          )
            return;
          const images = Array.from(root.querySelectorAll('img')).filter(
            included,
          );
          if (images.some((image) => !image.complete)) return;
          if (images.some((image) => image.naturalWidth === 0)) {
            finish(new Error(imageFailure));
            return;
          }
          const sources = images.map((image) => image.currentSrc || image.src);
          try {
            await Promise.all(images.map((image) => image.decode?.()));
          } catch {
            if (!changed) {
              finish(new Error(imageFailure));
              return;
            }
          }
          if (settled) return;
          if (
            images.some(
              (image, index) =>
                !root.contains(image) ||
                sources[index] !== (image.currentSrc || image.src),
            )
          )
            changed = true;
        } while (changed);
        finish();
      } finally {
        checking = false;
      }
    }
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'src',
        'data-statement-image-state',
        'data-print-included',
      ],
    });
    root.addEventListener('load', inspect, true);
    root.addEventListener('error', inspect, true);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else void inspect();
  });
}
