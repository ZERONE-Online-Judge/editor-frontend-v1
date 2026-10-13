import { useEffect, useState } from 'react';
import { api, post, time } from '../../lib/api';
import { Notice } from '../../components/ui';

type Comment = {
  id: string;
  author: string;
  content: string;
  created_at: number;
};

export default function InvocationComments({
  problemId,
  jobId,
  allowed,
}: {
  problemId: string;
  jobId: string;
  allowed: boolean;
}) {
  const [loaded, setLoaded] = useState<{ id: string; rows: Comment[] }>({
    id: '',
    rows: [],
  });
  const [draft, setDraft] = useState({ id: '', text: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const text = draft.id === jobId ? draft.text : '';
  const rows = loaded.id === jobId ? loaded.rows : [];
  const path = `/problems/${problemId}/jobs/${jobId}/comments`;
  useEffect(() => {
    let active = true;
    void api<Comment[]>(path)
      .then((value) => {
        if (active) setLoaded({ id: jobId, rows: value });
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [path, jobId]);
  async function submit() {
    setBusy(true);
    try {
      const note = await post<Comment>(path, { content: text });
      setLoaded((previous) => ({
        id: jobId,
        rows: [...(previous.id === jobId ? previous.rows : []), note],
      }));
      setDraft({ id: jobId, text: '' });
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="invocation-comments">
      <h4>검수 의견</h4>
      <p className="muted small">
        이 실행의 결과와 의견을 함께 보관하며 문제 협업자가 열람할 수 있습니다.
      </p>
      {rows.map((note) => (
        <article className="notice neutral" key={note.id}>
          <strong>{note.author}</strong>
          <span className="muted small"> · {time(note.created_at)}</span>
          <p style={{ whiteSpace: 'pre-wrap' }}>{note.content}</p>
        </article>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
      {allowed && (
        <>
          <label>
            이 실행에 대한 의견
            <textarea
              value={text}
              maxLength={8000}
              rows={3}
              onChange={(e) => setDraft({ id: jobId, text: e.target.value })}
            />
          </label>
          <button
            className="button"
            disabled={busy || !text.trim()}
            onClick={() => void submit()}
          >
            의견 저장
          </button>
        </>
      )}
    </section>
  );
}
