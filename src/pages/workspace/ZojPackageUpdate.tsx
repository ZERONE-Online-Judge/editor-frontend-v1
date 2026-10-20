import { BoundedText } from '../../components/ui';
import { useEffect, useState } from 'react';
import { post } from '../../lib/api';
import type { Publication, ZojPackageUpdatePreview } from '../../lib/types';
import { Modal, Notice } from '../../components/ui';
import './ZojPackageUpdate.css';

export default function ZojPackageUpdate({
  problemId,
  jobId,
  target,
  onClose,
  onUpdated,
}: {
  problemId: string;
  jobId: string;
  target: Publication;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [preview, setPreview] = useState<ZojPackageUpdatePreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    post<ZojPackageUpdatePreview>(
      `/problems/${problemId}/zoj-updates:preview`,
      {
        job_id: jobId,
        contest_id: target.contest_id,
        target_problem_id: target.result.problem_id,
      },
    )
      .then((value) => {
        if (active) setPreview(value);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [problemId, jobId, target.contest_id, target.result.problem_id, attempt]);
  async function apply() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      await post(`/problems/${problemId}/zoj-updates`, {
        job_id: jobId,
        contest_id: target.contest_id,
        target_problem_id: target.result.problem_id,
        target_hash: preview.target_hash,
        archive_sha256: preview.archive_sha256,
        reason: reason.trim(),
        confirm_running: confirmed,
      });
      setDone(true);
      onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${target.problem_code}. ${target.result.title} 패키지 업데이트`}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        done ? (
          <>
            <button className="button" onClick={onClose}>
              닫기
            </button>
            <a
              className="button primary"
              href={target.result.url}
              target="_blank"
              rel="noreferrer"
            >
              ZOJ에서 확인
            </a>
          </>
        ) : (
          <>
            <button className="button" disabled={busy} onClick={onClose}>
              취소
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                !preview ||
                !reason.trim() ||
                (preview.contest_running && !confirmed)
              }
              onClick={() => void apply()}
            >
              {busy ? '업데이트 중…' : '확인한 패키지 적용'}
            </button>
          </>
        )
      }
    >
      {done ? (
        <Notice tone="success">
          패키지를 업데이트하고 이전 패키지를 백업했습니다. 기존 제출의 시간과
          판정은 유지됩니다. 필요한 제출은 ZOJ에서 재채점하세요. 이전 패키지는
          ZOJ 문제 관리의 업데이트 기록에서 다운로드할 수 있습니다.
        </Notice>
      ) : preview ? (
        <div className="section-stack">
          <p>
            <strong>{preview.contest_title}</strong> · {preview.division_name} ·{' '}
            {preview.problem_code}번 문제
          </p>
          <Notice>{preview.preserved}</Notice>
          <p>
            활성 테스트 {preview.current_testcase_count}개 →{' '}
            {preview.incoming_testcase_count}개 · 새 버전 v
            {preview.next_testcase_version}부터 · 기존 제출{' '}
            {preview.submission_count}개 보존
          </p>
          <p className="muted">
            테스트 추가 {preview.testcase_changes.added}개 · 변경{' '}
            {preview.testcase_changes.changed}개 · 제거{' '}
            {preview.testcase_changes.removed}개
          </p>
          <section>
            <h3>문제 설정 변경</h3>
            <ul>
              {preview.changes
                .filter((c) => c.changed)
                .map((c) => (
                  <li key={c.field}>
                    {[
                      'statement',
                      'editorial',
                      'statement_translations',
                      'editorial_translations',
                    ].includes(c.field) ? (
                      <details>
                        <summary>{c.label} 변경</summary>
                        <div className="zoj-update-diff">
                          {[
                            ['이전', c.before],
                            ['변경 후', c.after],
                          ].map(([label, text]) => (
                            <div key={label}>
                              <small>{label}</small>
                              <BoundedText>{text}</BoundedText>
                            </div>
                          ))}
                        </div>
                        {c.truncated && (
                          <small>
                            긴 내용은 각각 처음 2,000자까지 표시합니다.
                          </small>
                        )}
                      </details>
                    ) : (
                      `${c.label}: ${c.before} → ${c.after}`
                    )}
                  </li>
                ))}
              {!preview.changes.some((c) => c.changed) && (
                <li>지문과 기본 제한 변경 없음</li>
              )}
            </ul>
          </section>
          <details>
            <summary>
              첨부·채점 파일 변경 {preview.changed_file_count}개
            </summary>
            <ul style={{ maxHeight: 180, overflowY: 'auto' }}>
              {preview.files.map((f, i) => (
                <li key={i}>
                  {
                    { added: '추가', removed: '제거', changed: '변경' }[
                      f.change
                    ]
                  }{' '}
                  · {f.filename} · {f.category}
                </li>
              ))}
            </ul>
            {preview.changed_file_count > preview.files.length && (
              <small>처음 {preview.files.length}개만 표시합니다.</small>
            )}
          </details>
          <label>
            업데이트 이유
            <textarea
              rows={3}
              maxLength={1000}
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="변경 내용과 이유를 운영 로그에 남깁니다."
            />
          </label>
          {preview.contest_running && (
            <Notice>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                진행 중인 대회를 변경하며, 기존 판정을 바꾸려면 별도로
                재채점해야 함을 확인했습니다.
              </label>
            </Notice>
          )}
        </div>
      ) : (
        !error && (
          <p className="muted">
            패키지와 대회 문제의 변경 내용을 확인하고 있습니다.
          </p>
        )
      )}
      {error && (
        <Notice tone="error">
          {error}
          <button
            className="button small"
            disabled={busy}
            onClick={() => {
              setError('');
              setPreview(null);
              setConfirmed(false);
              setAttempt((n) => n + 1);
            }}
          >
            변경 내용 다시 확인
          </button>
        </Notice>
      )}
    </Modal>
  );
}
