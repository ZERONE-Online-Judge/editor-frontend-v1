import { BoundedText } from './ui';
import { textPreview } from '../lib/largeText';
import { useEffect, useMemo, useState } from 'react';
import { blobPreview, languages, tags } from '../lib/api';
import { diffLines, type DocumentChange } from '../lib/documentChanges';
import {
  categories,
  categoryOf,
  changedContents,
  changedFields,
  changeLabels,
  describeChange,
  displayChangeLabel,
  displayValue,
  revisionChanges,
  valueText,
  type RevisionAsset,
  type RevisionContent,
} from '../lib/revisionChanges';
import type { Language, ProblemDocument, SolutionTag } from '../lib/types';
import { Badge, Icon } from './ui';
import './RevisionChanges.css';

const tone = (kind: DocumentChange['kind']) =>
  kind === 'added' ? 'success' : kind === 'removed' ? 'danger' : 'accent';
function fieldText(value: unknown, field?: string) {
  if (typeof value !== 'string') return displayValue(value);
  if (field === 'language')
    return languages[value as Language]?.replace(' · ZOJ 채점기', '') || value;
  if ((field === 'tag' || field === 'expected') && tags[value as SolutionTag])
    return `${value} · ${tags[value as SolutionTag]}`;
  if (field === 'kind')
    return (
      (
        {
          source: '소스 코드',
          resource: '리소스',
          aux: '보조 파일',
          statement: '지문 자료',
        } as Record<string, string>
      )[value] || value
    );
  if (field === 'strategy')
    return (
      (
        {
          NONE: '공개하지 않음',
          WITH_STATEMENT: '지문과 함께 공개',
          WITH_TUTORIAL: '해설과 함께 공개',
        } as Record<string, string>
      )[value] || value
    );
  return displayValue(value);
}
function FieldValue({ value, field }: { value: unknown; field?: string }) {
  return (
    <BoundedText className="revision-value">
      {fieldText(value, field)}
    </BoundedText>
  );
}
function ValuePair({
  before,
  after,
  field,
}: {
  before: unknown;
  after: unknown;
  field?: string;
}) {
  return (
    <div className="revision-value-pair">
      <div>
        <span>변경 전</span>
        <FieldValue value={before} field={field} />
      </div>
      <div>
        <span>변경 후</span>
        <FieldValue value={after} field={field} />
      </div>
    </div>
  );
}
function TextDiff({ before, after }: { before: string; after: string }) {
  const [all, setAll] = useState(false);
  const [limit, setLimit] = useState(500);
  const truncated = before.length > 262144 || after.length > 262144;
  const lines = useMemo(
    () => diffLines(textPreview(before).text, textPreview(after).text),
    [before, after],
  );
  const added = lines.filter((line) => line.kind === 'add').length;
  const removed = lines.filter((line) => line.kind === 'remove').length;
  const visible = useMemo(() => {
    if (all || (!added && !removed)) return lines;
    const selected = new Set<number>();
    lines.forEach((line, i) => {
      if (line.kind !== 'same')
        for (
          let j = Math.max(0, i - 2);
          j <= Math.min(lines.length - 1, i + 2);
          j++
        )
          selected.add(j);
    });
    return lines.filter((_, i) => selected.has(i));
  }, [all, lines, added, removed]);
  return (
    <div className="revision-text-diff">
      <div className="revision-diff-toolbar">
        <span>
          <b className="revision-added">+{added}줄</b>{' '}
          <b className="revision-removed">−{removed}줄</b>
        </span>
        <label>
          <input
            type="checkbox"
            checked={all}
            onChange={(event) => setAll(event.target.checked)}
          />
          변경 없는 줄도 표시
        </label>
      </div>
      {truncated && (
        <p className="revision-preview-note">
          긴 내용은 앞부분을 비교합니다. 전체 자료를 내려받아 확인하세요.
        </p>
      )}
      {(textPreview(before).truncated || textPreview(after).truncated) && (
        <p className="revision-preview-note">
          표시 한도를 넘어 앞부분만 비교합니다. 원본은 다운로드해 확인하세요.
        </p>
      )}
      <div className="revision-line-head" aria-hidden="true">
        <span>이전</span>
        <span>현재</span>
        <span>내용</span>
      </div>
      <div className="line-diff" aria-label="줄별 변경 내용">
        {visible.slice(0, limit).map((row, i) => (
          <div key={i} className={`diff-line ${row.kind}`}>
            <span className="line-number">{row.old ?? ''}</span>
            <span className="line-number">{row.next ?? ''}</span>
            <span
              aria-label={
                row.kind === 'add'
                  ? '추가'
                  : row.kind === 'remove'
                    ? '삭제'
                    : '동일'
              }
            >
              {row.kind === 'add' ? '+' : row.kind === 'remove' ? '−' : ' '}
            </span>
            <code>{row.text || ' '}</code>
          </div>
        ))}
      </div>
      {!added && !removed && (
        <p className="revision-preview-note">텍스트 내용은 같습니다.</p>
      )}
      {visible.length > limit && (
        <button
          className="button small"
          onClick={() => setLimit((value) => value + 500)}
        >
          다음 500줄 표시 · {limit.toLocaleString()} /{' '}
          {visible.length.toLocaleString()}줄
        </button>
      )}
    </div>
  );
}
function ContentDiff({
  problemId,
  content,
}: {
  problemId: string;
  content: RevisionContent;
}) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([
    problemId,
    content.before,
    content.after,
    attempt,
  ]);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    values?: Awaited<ReturnType<typeof blobPreview>>[];
    error?: string;
  } | null>(null);
  const hasBlob = Boolean(content.before?.sha || content.after?.sha);
  useEffect(() => {
    if (!hasBlob) return;
    const abort = new AbortController();
    const read = (asset: RevisionAsset | undefined) =>
      asset?.sha
        ? blobPreview(problemId, asset.sha, abort.signal)
        : Promise.resolve({
            text: asset?.text || '',
            truncated: false,
            binary: false,
          });
    void Promise.all([read(content.before), read(content.after)])
      .then((values) => {
        if (!abort.signal.aborted) setSnapshot({ key, values });
      })
      .catch((error) => {
        if (!abort.signal.aborted) setSnapshot({ key, error: error.message });
      });
    return () => abort.abort();
  }, [problemId, content, key, hasBlob]);
  const data = snapshot?.key === key ? snapshot : null;
  return (
    <section className="revision-content-diff">
      <div className="revision-content-heading">
        <h4>{content.label}</h4>
        <div className="actions">
          {(['before', 'after'] as const).map(
            (side) =>
              content[side]?.sha && (
                <a
                  key={side}
                  className="text-button"
                  href={`/api/problems/${problemId}/blobs/${content[side].sha}`}
                  download={content[side].name}
                >
                  {side === 'before' ? '이전 파일' : '현재 파일'} 다운로드
                </a>
              ),
          )}
        </div>
      </div>
      {hasBlob && !data ? (
        <p role="status">변경 전후 내용을 불러오고 있습니다.</p>
      ) : data?.error ? (
        <div role="alert">
          <p>{data.error}</p>
          <button
            className="button small"
            onClick={() => setAttempt((value) => value + 1)}
          >
            다시 시도
          </button>
        </div>
      ) : data?.values?.some((value) => value.binary) ? (
        <p className="revision-preview-note">
          이미지·바이너리 파일은 줄 단위로 비교할 수 없습니다. 이전·현재 파일을
          내려받아 확인하세요.
        </p>
      ) : (
        <>
          {data?.values?.some((value) => value.truncated) && (
            <p className="revision-preview-note">
              큰 파일은 각 파일의 앞 256KiB만 비교합니다. 전체 내용은
              다운로드하세요.
            </p>
          )}
          <TextDiff
            key={key}
            before={data?.values?.[0].text ?? content.before?.text ?? ''}
            after={data?.values?.[1].text ?? content.after?.text ?? ''}
          />
        </>
      )}
    </section>
  );
}
function ChangeDetail({
  problemId,
  change,
}: {
  problemId: string;
  change: DocumentChange;
}) {
  const contents = useMemo(() => changedContents(change), [change]);
  const fields = useMemo(() => changedFields(change), [change]);
  const compactFields = fields.filter((field) =>
    [field.before, field.after].every(
      (value) =>
        (value === null || typeof value !== 'object') &&
        fieldText(value, field.key).length < 80 &&
        !fieldText(value, field.key).includes('\n'),
    ),
  );
  const detailedFields = fields.filter(
    (field) => !compactFields.includes(field),
  );
  const [selected, setSelected] = useState('');
  const content = contents.find((item) => item.key === selected) || contents[0];
  const scalarText =
    !fields.length &&
    !contents.length &&
    categoryOf(change) === '지문' &&
    (typeof change.before === 'string' || typeof change.after === 'string');
  return (
    <article
      className="revision-change-detail"
      aria-label={`${displayChangeLabel(change)} 비교`}
    >
      <header>
        <div>
          <span className="eyebrow">{change.group}</span>
          <h3>{displayChangeLabel(change)}</h3>
        </div>
        <Badge tone={tone(change.kind)}>{changeLabels[change.kind]}</Badge>
      </header>
      {fields.length > 0 && (
        <div className="revision-metadata">
          {compactFields.length > 0 && (
            <div
              className="revision-metadata-strip"
              aria-label="속성 변경 전후"
            >
              {compactFields.map((field) => (
                <div key={field.key}>
                  <strong>{field.label}</strong>
                  <span>
                    <del aria-label="변경 전">
                      {fieldText(field.before, field.key)}
                    </del>
                    <span aria-hidden="true">→</span>
                    <ins aria-label="변경 후">
                      {fieldText(field.after, field.key)}
                    </ins>
                  </span>
                </div>
              ))}
            </div>
          )}
          {detailedFields.length > 0 && (
            <div className="revision-field-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>변경 항목</th>
                    <th>변경 전</th>
                    <th>변경 후</th>
                  </tr>
                </thead>
                <tbody>
                  {detailedFields.map((field) => (
                    <tr key={field.key}>
                      <th>{field.label}</th>
                      <td>
                        <FieldValue value={field.before} field={field.key} />
                      </td>
                      <td>
                        <FieldValue value={field.after} field={field.key} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {contents.length > 1 && (
        <div className="revision-content-tabs" aria-label="비교할 파일 내용">
          {contents.map((item) => (
            <button
              key={item.key}
              className="button small"
              aria-pressed={content?.key === item.key}
              onClick={() => setSelected(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {content && (
        <ContentDiff
          key={content.key}
          problemId={problemId}
          content={content}
        />
      )}
      {scalarText ? (
        <TextDiff
          before={valueText(change.before)}
          after={valueText(change.after)}
        />
      ) : (
        !fields.length &&
        !contents.length && (
          <ValuePair before={change.before} after={change.after} />
        )
      )}
    </article>
  );
}

export default function RevisionChanges({
  problemId,
  before,
  after,
}: {
  problemId: string;
  before: ProblemDocument | null;
  after: ProblemDocument;
}) {
  const changes = useMemo(
    () => revisionChanges(before, after),
    [before, after],
  );
  const [category, setCategory] = useState('전체');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const visible = changes.filter(
    (change) =>
      (category === '전체' || categoryOf(change) === category) &&
      `${displayChangeLabel(change)} ${describeChange(change)}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const current =
    visible.find((change) => change.key === selected) || visible[0];
  return (
    <div className="revision-changes">
      <div className="revision-change-summary">
        <strong>
          {before ? '이 리비전에서 달라진 자료' : '처음 등록한 자료'}{' '}
          <span>{changes.length.toLocaleString()}개 항목</span>
        </strong>
        <div className="actions">
          {(['added', 'changed', 'removed'] as const).map((kind) => (
            <Badge key={kind} tone={tone(kind)}>
              {changeLabels[kind]}{' '}
              {changes.filter((change) => change.kind === kind).length}
            </Badge>
          ))}
        </div>
      </div>
      <div className="revision-categories" aria-label="변경 종류 필터">
        {['전체', ...categories].map((name) => {
          const count =
            name === '전체'
              ? changes.length
              : changes.filter((change) => categoryOf(change) === name).length;
          return (
            <button
              key={name}
              aria-pressed={category === name}
              disabled={name !== '전체' && !count}
              onClick={() => setCategory(name)}
            >
              <span>{name}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>
      {!changes.length ? (
        <p className="revision-no-changes">이전 리비전과 자료가 같습니다.</p>
      ) : (
        <div className="revision-change-browser">
          <nav className="revision-change-list" aria-label="변경된 자료 목록">
            <label className="search-field">
              <Icon name="search" size={15} />
              <input
                aria-label="변경 항목 검색"
                placeholder="파일·항목 검색"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="revision-change-items">
              {visible.map((change) => (
                <button
                  key={change.key}
                  aria-pressed={current?.key === change.key}
                  onClick={() => setSelected(change.key)}
                >
                  <span>
                    <Badge tone={tone(change.kind)}>
                      {changeLabels[change.kind]}
                    </Badge>
                    <small>{categoryOf(change)}</small>
                  </span>
                  <strong>{displayChangeLabel(change)}</strong>
                  <small>{describeChange(change)}</small>
                </button>
              ))}
            </div>
            {!visible.length && <p>해당하는 변경 항목이 없습니다.</p>}
          </nav>
          {current ? (
            <ChangeDetail
              key={current.key}
              problemId={problemId}
              change={current}
            />
          ) : (
            <div className="revision-no-changes">
              검색어나 변경 종류를 바꿔 확인하세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
