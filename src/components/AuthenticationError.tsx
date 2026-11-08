export default function AuthenticationError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="login-page" aria-label="계정 연결 확인">
      <div className="login-panel auth-connection-error">
        <h1>계정을 확인하지 못했습니다</h1>
        <p role="alert">{message}</p>
        <button
          type="button"
          className="button primary large"
          onClick={onRetry}
        >
          다시 시도
        </button>
      </div>
    </section>
  );
}
