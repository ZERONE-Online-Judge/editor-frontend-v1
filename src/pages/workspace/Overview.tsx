import LanguageLimits from '../../components/LanguageResourceLimits';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { patch, put } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import { Badge, Icon, Modal, SectionHeading } from '../../components/ui';
import { preparationCautions } from '../../lib/readiness';
import ReviewReport from './ReviewReport';
export default function Overview() {
  const {
    data,
    document: doc,
    mutate,
    editable,
    busy,
    dirty,
    notify,
  } = useWorkspace();
  const [note, setNote] = useState(data.problem.note);
  const [deleting, setDeleting] = useState(false);
  const cautions = preparationCautions(doc);
  const required = cautions.filter((c) => c.blocking);
  const recommended = cautions.filter((c) => !c.blocking);
  const pending =
    data.pending_preparations?.filter((r) => !r.stale).length || 0;
  const fileCount =
    Object.keys(doc.files).length + Object.keys(doc.solutions).length;
  const tests = Object.values(doc.testsets).reduce(
    (n, s) => n + Object.keys(s.tests).length,
    0,
  );
  return (
    <div className="section-stack">
      <SectionHeading
        title="문제 개요"
        description="채점 기준과 문제 정보를 설정하고 준비 상태를 확인하세요."
      />
      <div className="stat-strip">
        {[
          ['file', '지문', `${Object.keys(doc.statements).length}개 언어`],
          ['tests', '테스트', `${tests}개`],
          ['code', '풀이', `${Object.keys(doc.solutions).length}개`],
          ['folder', '파일', `${fileCount}개`],
        ].map(([icon, label, value]) => (
          <div key={label}>
            <Icon name={icon} />
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className="card">
        <SectionHeading title="기본 정보" />
        <fieldset disabled={!editable || busy} className="form-grid">
          <label className="span-2">
            문제 이름
            <input
              value={doc.info.name}
              maxLength={200}
              onChange={(e) =>
                mutate((d) => {
                  d.info.name = e.target.value;
                })
              }
            />
          </label>
          <label>
            시간 제한
            <span className="input-unit">
              <input
                type="number"
                min={250}
                max={10000}
                step={50}
                value={doc.info.time_limit_ms}
                onChange={(e) =>
                  mutate((d) => {
                    d.info.time_limit_ms = Number(e.target.value);
                  })
                }
              />
              <span>ms</span>
            </span>
            <small>250~10,000ms · 50ms 단위</small>
          </label>
          <label>
            메모리 제한
            <span className="input-unit">
              <input
                type="number"
                min={16}
                max={1024}
                value={doc.info.memory_limit_mb}
                onChange={(e) =>
                  mutate((d) => {
                    d.info.memory_limit_mb = Number(e.target.value);
                  })
                }
              />
              <span>MiB</span>
            </span>
          </label>
          <details className="span-2 language-limits-disclosure">
            <summary>
              <span>
                <strong>언어별 개별 설정</strong>
                <small>시간·메모리 제한 · 모든 생성·검증에 공통 적용</small>
              </span>
              <span className="language-limits-state">
                {Object.keys(doc.language_resource_limits || {}).length
                  ? `${Object.keys(doc.language_resource_limits || {}).length}개 언어 설정됨`
                  : '기본 보정 사용'}
                <Icon name="down" />
              </span>
            </summary>
            <LanguageLimits
              document={doc}
              disabled={busy || !editable}
              onChange={
                editable
                  ? (value) =>
                      mutate((d) => {
                        d.language_resource_limits = value;
                      })
                  : undefined
              }
            />
          </details>
          <label>
            입력 파일
            <input
              value={doc.info.input_file}
              onChange={(e) =>
                mutate((d) => {
                  d.info.input_file = e.target.value;
                })
              }
            />
            <small>표준 입력은 stdin</small>
          </label>
          <label>
            출력 파일
            <input
              value={doc.info.output_file}
              onChange={(e) =>
                mutate((d) => {
                  d.info.output_file = e.target.value;
                })
              }
            />
            <small>표준 출력은 stdout</small>
          </label>
          <label className="span-2">
            태그
            <input
              value={doc.info.tags.join(', ')}
              onChange={(e) =>
                mutate((d) => {
                  d.info.tags = e.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean);
                })
              }
              placeholder="구현, 자료 구조, 문자열"
            />
          </label>
          <label className="span-2">
            내부 설명
            <textarea
              rows={3}
              value={doc.info.description}
              onChange={(e) =>
                mutate((d) => {
                  d.info.description = e.target.value;
                })
              }
              placeholder="문제 아이디어나 검수자가 알아야 할 내용을 남기세요."
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={doc.info.interactive}
              onChange={(e) =>
                mutate((d) => {
                  d.info.interactive = e.target.checked;
                })
              }
            />
            인터랙티브 문제
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={doc.info.well_formed}
              onChange={(e) =>
                mutate((d) => {
                  d.info.well_formed = e.target.checked;
                })
              }
            />
            입력 형식 검사 (LF·마지막 개행)
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={doc.info.skip_duplicate_validation}
              onChange={(e) =>
                mutate((d) => {
                  d.info.skip_duplicate_validation = e.target.checked;
                })
              }
            />
            중복 테스트 허용
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={doc.info.points_enabled}
              onChange={(e) =>
                mutate((d) => {
                  d.info.points_enabled = e.target.checked;
                  if (!e.target.checked) d.info.checker_percent = false;
                })
              }
            />
            부분 점수 사용
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={doc.info.checker_percent}
              disabled={!doc.info.points_enabled}
              onChange={(e) =>
                mutate((d) => {
                  d.info.checker_percent = e.target.checked;
                })
              }
            />
            Checker 점수를 백분율로 처리
          </label>
        </fieldset>
      </section>
      <ReviewReport />
      <section className="card">
        <SectionHeading
          title="패키지 준비 상태"
          description="현재 편집 내용에서 필수 자료와 권장 검증을 구분합니다. 필수 완료 후에도 커밋과 실제 검증이 필요합니다."
        />
        <div className="readiness-summary">
          <strong>
            <Icon name={required.length ? 'issue' : 'check'} />
            {required.length
              ? `필수 ${required.length}개 남음`
              : '필수 준비 완료'}
          </strong>
          <Badge tone={recommended.length ? 'warning' : 'success'}>
            {recommended.length
              ? `권장 검증 ${recommended.length}개 남음`
              : '권장 항목 완료'}
          </Badge>
          <p>
            {required.length
              ? '아래 필수 항목을 먼저 준비하세요.'
              : busy
                ? '자료를 저장하고 있습니다.'
                : pending
                  ? '생성 결과를 작업 사본에 반영한 뒤 커밋하세요.'
                  : dirty
                    ? '편집 내용을 작업 사본에 저장하고 커밋한 뒤 패키지를 생성하세요.'
                    : data.problem.modified
                      ? '변경사항을 커밋한 뒤 패키지를 생성하세요. 검증 실행 여부를 선택할 수 있습니다.'
                      : '패키지 화면에서 내보내세요. 검증 실행 여부를 선택하고 형식별 호환 조건을 확인합니다.'}
          </p>
        </div>
        <div className="readiness-list">
          {cautions.length ? (
            [...required, ...recommended].map((c) => (
              <Link
                key={c.code}
                to={`/problems/${data.problem.id}/${c.section}`}
              >
                <span
                  className={
                    c.blocking ? 'caution-icon blocking' : 'caution-icon'
                  }
                >
                  <Icon name={c.blocking ? 'issue' : 'help'} size={16} />
                </span>
                <span>{c.message}</span>
                <Badge tone={c.blocking ? 'danger' : 'warning'}>
                  {c.blocking ? '필수' : '권장'}
                </Badge>
                <Icon name="arrow" size={15} />
              </Link>
            ))
          ) : (
            <div className="readiness-complete">
              <Icon name="check" />
              필수 자료가 준비되었습니다. 패키지 화면에서 검증 여부를 선택해
              내보내세요.
            </div>
          )}
        </div>
      </section>
      <section className="card">
        <SectionHeading
          title="문제 메모"
          description="목록에 표시되는 짧은 메모입니다. 작업 사본과 별도로 즉시 저장합니다."
        />
        <div className="inline-form">
          <input
            aria-label="문제 메모"
            maxLength={50}
            disabled={!editable}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 1차 검수 대기"
          />
          <button
            className="button"
            disabled={!editable}
            onClick={() =>
              void put(`/problems/${data.problem.id}/note`, { note })
                .then(() => notify('문제 메모를 저장했습니다.'))
                .catch((e) => notify(e.message, true))
            }
          >
            메모 저장
          </button>
        </div>
      </section>
      {data.problem.role === 'OWNER' && (
        <section className="danger-section">
          <div>
            <strong>문제를 휴지통으로 이동</strong>
            <p>휴지통에서 다시 복원할 수 있습니다.</p>
          </div>
          <button className="button danger" onClick={() => setDeleting(true)}>
            휴지통으로 이동
          </button>
        </section>
      )}
      {deleting && (
        <Modal
          title="문제를 휴지통으로 이동할까요?"
          onClose={() => setDeleting(false)}
          footer={
            <>
              <button className="button" onClick={() => setDeleting(false)}>
                취소
              </button>
              <button
                className="button danger"
                onClick={() =>
                  void patch(`/problems/${data.problem.id}/deleted`, {
                    deleted: true,
                  })
                    .then(() => {
                      window.location.href = '/problems';
                    })
                    .catch((e) => notify(e.message, true))
                }
              >
                휴지통으로 이동
              </button>
            </>
          }
        >
          <p>
            문제와 리비전은 보관되며 소유자가 휴지통에서 복원할 수 있습니다.
          </p>
        </Modal>
      )}
    </div>
  );
}
