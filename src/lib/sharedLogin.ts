export function editorReturnPath() {
  const { pathname, search, hash } = window.location;
  if (pathname === '/login') {
    const next = new URLSearchParams(search).get('next');
    return safeEditorPath(next);
  }
  return safeEditorPath(pathname + search + hash);
}
export function safeEditorPath(value: string | null) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    [...value].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return '/problems';
  try {
    const url = new URL(value, window.location.origin);
    const path = decodeURIComponent(url.pathname);
    if (
      url.origin !== window.location.origin ||
      path.includes('\\') ||
      !/^\/(?:problems(?:\/|$)|help(?:\/|$)|$)/.test(path)
    )
      return '/problems';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/problems';
  }
}
export function sharedLoginUrl() {
  return (
    '/api/auth/redirect?' + new URLSearchParams({ next: editorReturnPath() })
  );
}
export function securityUrl(section: 'passkeys' | 'password') {
  return (
    '/api/auth/security?' +
    new URLSearchParams({ section, next: editorReturnPath() })
  );
}

export function redirectToSharedLogin() {
  window.location.replace(sharedLoginUrl());
}
