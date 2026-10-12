import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  blobText,
  bytes,
  inferLanguage,
  languages,
  tags,
  upload,
} from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import type {
  Language,
  Solution,
  SolutionTag,
  SourceFile,
} from '../../lib/types';
import {
  Badge,
  CodeEditor,
  Empty,
  Icon,
  Modal,
  Notice,
  SectionHeading,
} from '../../components/ui';
export default function Files({ solutions = false }: { solutions?: boolean }) {
  const { data, document: doc, mutate, editable, notify, run } = useWorkspace();
  const [editing, setEditing] = useState<SourceFile | null | false>(false);
  const [removing, setRemoving] = useState<SourceFile | null>(null);
  const [busy, setBusy] = useState(false);
  const items = Object.values(solutions ? doc.solutions : doc.files);
  async function addFiles(files: File[]) {
    setBusy(true);
    try {
      for (const file of files) {
        const blob = await upload(data.problem.id, file);
        mutate((d) => {
          const entry = {
            name: file.name,
            kind: (/\.(png|jpg|jpeg|gif|webp)$/i.test(file.name)
              ? 'statement'
              : inferLanguage(file.name) === 'text'
                ? 'resource'
                : 'source') as SourceFile['kind'],
            language: inferLanguage(file.name),
            ...blob,
          };
          if (solutions)
            d.solutions[file.name] = { ...entry, tag: 'OK', extra_tags: {} };
          else d.files[file.name] = entry;
        });
      }
      notify('파일을 추가했습니다. 작업 사본을 저장하세요.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  function remove() {
    if (!removing) return;
    mutate((d) => {
      if (solutions) {
        delete d.solutions[removing.name];
        for (const material of Object.values(d.materials))
          material.solutions = material.solutions.filter(
            (n) => n !== removing.name,
          );
      } else {
        delete d.files[removing.name];
        if (d.checker === removing.name) d.checker = '';
        if (d.validator === removing.name) d.validator = '';
        if (d.interactor === removing.name) d.interactor = '';
        d.extra_validators = d.extra_validators.filter(
          (n) => n !== removing.name,
        );
        for (const material of Object.values(d.materials))
          material.files = material.files.filter((n) => n !== removing.name);
      }
    });
    setRemoving(null);
  }
  return (
    <div className="section-stack">
      <SectionHeading
        title={solutions ? '문제 풀이' : '파일 · 리소스'}
        description={
          solutions
            ? 'Main 풀이로 기대 출력을 생성하고, 정답과 의도한 오답 풀이로 테스트를 검증합니다.'
            : '생성기·checker·validator 소스와 지문 이미지, 보조 리소스를 관리합니다.'
        }
        actions={
          <>
            {solutions && (
              <button
                className="button"
                disabled={!editable}
                onClick={() =>
                  void run('verify').catch((e) => notify(e.message, true))
                }
              >
                <Icon name="play" />
                전체 풀이 검증
              </button>
            )}
            <label className={`button ${!editable || busy ? 'disabled' : ''}`}>
              <Icon name="upload" />
              파일 올리기
              <input
                type="file"
                className="sr-only"
                multiple
                disabled={!editable || busy}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  void addFiles(files);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              className="button primary"
              disabled={!editable}
              onClick={() => setEditing(null)}
            >
              <Icon name="plus" />새 파일
            </button>
          </>
        }
      />
      {!solutions && (
        <div className="library-note">
          <Icon name="shield" />
          <div>
            <strong>testlib.h</strong>
            <span>
              공용 라이브러리가 컴파일에 자동 포함됩니다. 직접 추가할 필요가
              없습니다.
            </span>
          </div>
          <Badge>공용 · 원본 고정</Badge>
        </div>
      )}
      <section className="card no-padding">
        {items.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>파일</th>
                  <th>{solutions ? '기대 판정' : '분류'}</th>
                  <th>언어</th>
                  <th>크기</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((file) => (
                  <tr key={file.name}>
                    <td>
                      <button
                        className="file-title text-button"
                        onClick={() => setEditing(file)}
                      >
                        <Icon name="code" size={16} />
                        {file.name}
                      </button>
                      {solutions && (file as Solution).tag === 'MA' && (
                        <div className="subtext">기대 출력 생성에 사용</div>
                      )}
                    </td>
                    <td>
                      {solutions ? (
                        <select
                          aria-label={`${file.name} 기대 판정`}
                          value={(file as Solution).tag}
                          disabled={!editable}
                          onChange={(e) =>
                            mutate((d) => {
                              if (e.target.value === 'MA')
                                for (const s of Object.values(d.solutions))
                                  if (s.tag === 'MA') s.tag = 'OK';
                              d.solutions[file.name].tag = e.target
                                .value as SolutionTag;
                            })
                          }
                        >
                          {Object.entries(tags).map(([tag, label]) => (
                            <option key={tag} value={tag}>
                              {tag} · {label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge>
                          {file.kind === 'source'
                            ? '실행 소스'
                            : file.kind === 'resource'
                              ? '컴파일 리소스'
                              : file.kind === 'statement'
                                ? '지문 리소스'
                                : '보조 파일'}
                        </Badge>
                      )}
                    </td>
                    <td className="subtext">{languages[file.language]}</td>
                    <td className="subtext">{bytes(file.size)}</td>
                    <td>
                      <div className="actions">
                        <a
                          className="icon-button"
                          href={`/api/problems/${data.problem.id}/blobs/${file.sha256}`}
                          download={file.name}
                          aria-label={`${file.name} 다운로드`}
                        >
                          <Icon name="download" size={16} />
                        </a>
                        <button
                          className="icon-button"
                          disabled={!editable}
                          onClick={() => setRemoving(file)}
                          aria-label={`${file.name} 제거`}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon="code"
            title={
              solutions
                ? '풀이 파일을 추가하세요.'
                : '아직 등록한 파일이 없습니다.'
            }
            description={
              solutions
                ? '기준 정답은 Main, 검증용 오답은 WA·TL·ML 등의 태그를 지정하세요.'
                : 'C/C++·Python·Java 소스 또는 이미지·보조 파일을 올릴 수 있습니다.'
            }
            action={
              <button
                className="button"
                disabled={!editable}
                onClick={() => setEditing(null)}
              >
                새 파일 만들기
              </button>
            }
          />
        )}
      </section>
      {solutions && (
        <div className="workspace-guide">
          <Icon name="help" />
          <p>
            WA·TL·ML 태그는 전체 테스트 중 해당 판정이 실제로 나오는지
            확인합니다. 정답을 통과한 오답 풀이는 테스트 보강이 필요합니다.
          </p>
          <Link to={`/problems/${data.problem.id}/invocations`}>
            실행 결과 보기
          </Link>
        </div>
      )}
      {editing !== false && (
        <FileEditor
          asset={editing}
          solutions={solutions}
          onClose={() => setEditing(false)}
        />
      )}{' '}
      {removing && (
        <Modal
          title="작업 사본에서 파일을 제거할까요?"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button className="button" onClick={() => setRemoving(null)}>
                취소
              </button>
              <button className="button danger" onClick={remove}>
                제거
              </button>
            </>
          }
        >
          <p>
            <strong>{removing.name}</strong>를 제거합니다. 이 파일을 선택한
            checker·validator·공개 자료 연결도 해제됩니다. 이미 커밋한
            리비전에는 파일이 보관됩니다.
          </p>
        </Modal>
      )}
    </div>
  );
}
function FileEditor({
  asset,
  solutions,
  onClose,
}: {
  asset: SourceFile | null;
  solutions: boolean;
  onClose: () => void;
}) {
  const { data, document: doc, mutate, editable } = useWorkspace();
  const [name, setName] = useState(asset?.name || '');
  const [language, setLanguage] = useState<Language>(
    asset?.language || 'cpp17',
  );
  const [kind, setKind] = useState<SourceFile['kind']>(asset?.kind || 'source');
  const [compileWithSolution, setCompileWithSolution] = useState(
    asset?.compile_with_solution || false,
  );
  const [entryClass, setEntryClass] = useState(asset?.entry_class || '');
  const [tag, setTag] = useState<SolutionTag>(
    asset ? doc.solutions[asset.name]?.tag || 'OK' : 'OK',
  );
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(
    Boolean(asset && !/\.(png|jpg|jpeg|gif|webp|pdf|zip)$/i.test(asset.name)),
  );
  const [error, setError] = useState('');
  const binary = Boolean(
    asset && /\.(png|jpg|jpeg|gif|webp|pdf|zip)$/i.test(asset.name),
  );
  useEffect(() => {
    let active = true;
    if (asset && !binary)
      blobText(data.problem.id, asset.sha256)
        .then((value) => {
          if (active) setCode(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    return () => {
      active = false;
    };
  }, [asset, binary, data.problem.id]);
  async function submit() {
    if (
      !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/.test(name) ||
      name.includes('..') ||
      name === 'testlib.h'
    ) {
      setError(
        '폴더 경로 없이 영문 파일명을 지정하세요. testlib.h는 공용 파일입니다.',
      );
      return;
    }
    if (!asset && (solutions ? doc.solutions[name] : doc.files[name])) {
      setError('같은 이름의 파일이 이미 있습니다.');
      return;
    }
    setBusy(true);
    try {
      const blob =
        binary && asset
          ? { sha256: asset.sha256, size: asset.size }
          : await upload(data.problem.id, code);
      mutate((d) => {
        const entry = {
          name,
          kind,
          language,
          ...blob,
          compile_with_solution: compileWithSolution,
          entry_class: entryClass,
        };
        if (solutions) {
          if (tag === 'MA')
            for (const s of Object.values(d.solutions))
              if (s.tag === 'MA') s.tag = 'OK';
          d.solutions[name] = {
            ...entry,
            tag,
            extra_tags: asset ? d.solutions[asset.name].extra_tags : {},
          };
        } else d.files[name] = entry;
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={asset ? asset.name : '새 파일 만들기'}
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            닫기
          </button>
          {editable && (
            <button
              className="button primary"
              disabled={busy || !name}
              onClick={() => void submit()}
            >
              작업 사본에 반영
            </button>
          )}
        </>
      }
    >
      <fieldset disabled={!editable || busy} className="form-grid">
        <label>
          파일 이름
          <input
            value={name}
            disabled={Boolean(asset)}
            placeholder="solution.cpp"
            onChange={(e) => {
              setName(e.target.value);
              setLanguage(inferLanguage(e.target.value));
            }}
          />
        </label>
        <label>
          언어
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {Object.entries(languages).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {solutions ? (
          <label>
            기대 판정
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value as SolutionTag)}
            >
              {Object.entries(tags).map(([id, label]) => (
                <option key={id} value={id}>
                  {id} · {label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            파일 분류
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as SourceFile['kind'])}
            >
              <option value="source">실행 소스</option>
              <option value="resource">컴파일 리소스</option>
              <option value="aux">보조 파일</option>
              <option value="statement">지문 리소스</option>
            </select>
          </label>
        )}
        {!solutions &&
          ['cpp17', 'cpp20', 'c17', 'java17'].includes(language) && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={compileWithSolution}
                onChange={(e) => setCompileWithSolution(e.target.checked)}
              />
              풀이와 함께 컴파일 (grader)
            </label>
          )}
        {language === 'java17' && (
          <label>
            Java 진입 클래스
            <input
              value={entryClass}
              onChange={(e) => setEntryClass(e.target.value)}
              placeholder="자동 감지 · 필요하면 package.Main"
            />
          </label>
        )}
      </fieldset>
      {binary ? (
        <div className="file-preview">
          <a
            href={`/api/problems/${data.problem.id}/blobs/${asset!.sha256}`}
            download={asset!.name}
            className="button"
          >
            <Icon name="download" />
            파일 다운로드
          </a>
          <p className="muted">바이너리 파일은 파일 올리기로 교체하세요.</p>
        </div>
      ) : (
        <CodeEditor
          value={code}
          onChange={setCode}
          readOnly={!editable || busy}
          label={name || '새 파일'}
          rows={22}
        />
      )}{' '}
      {error && <Notice tone="error">{error}</Notice>}
    </Modal>
  );
}
