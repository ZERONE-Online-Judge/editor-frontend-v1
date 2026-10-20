import Select from '../../components/Select';
import { useState } from 'react';
import { useWorkspace } from '../../lib/workspace';
import { Badge, Empty, Icon, Modal, SectionHeading } from '../../components/ui';
export default function Materials() {
  const { document: doc, editable, mutate } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  return (
    <div className="section-stack">
      <SectionHeading
        title="공개 자료"
        description="지문·해설과 함께 제공할 파일, 풀이, 테스트 자료를 묶습니다. 패키지에 별도 ZIP으로 포함됩니다."
        actions={
          <button
            className="button primary"
            disabled={!editable}
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" />
            자료 묶음 추가
          </button>
        }
      />
      {Object.entries(doc.materials).length ? (
        Object.entries(doc.materials).map(([key, material]) => (
          <section className="card" key={key}>
            <SectionHeading
              title={key}
              actions={
                <>
                  <Badge tone="accent">
                    {material.strategy === 'NONE'
                      ? '비공개'
                      : material.strategy === 'WITH_STATEMENT'
                        ? '지문과 함께'
                        : '해설과 함께'}
                  </Badge>
                  <button
                    className="icon-button"
                    aria-label={`${key} 제거`}
                    disabled={!editable}
                    onClick={() =>
                      mutate((d) => {
                        delete d.materials[key];
                      })
                    }
                  >
                    <Icon name="trash" />
                  </button>
                </>
              }
            />
            <label>
              공개 시점
              <Select
                disabled={!editable}
                value={material.strategy}
                onChange={(e) =>
                  mutate((d) => {
                    d.materials[key].strategy = e.target.value as
                      'NONE' | 'WITH_STATEMENT' | 'WITH_TUTORIAL';
                  })
                }
              >
                <option value="NONE">비공개 · 보관만</option>
                <option value="WITH_STATEMENT">지문과 함께 공개</option>
                <option value="WITH_TUTORIAL">해설과 함께 공개</option>
              </Select>
            </label>
            {(['files', 'solutions', 'testsets'] as const).map((type) => (
              <div className="material-section" key={type}>
                <h3>
                  {type === 'files'
                    ? '파일'
                    : type === 'solutions'
                      ? '풀이'
                      : '테스트 세트 · 입력과 정답 포함'}
                </h3>
                <div className="checkbox-list">
                  {Object.keys(doc[type]).map((item) => (
                    <label className="checkbox" key={item}>
                      <input
                        type="checkbox"
                        disabled={!editable}
                        checked={material[type].includes(item)}
                        onChange={(e) =>
                          mutate((d) => {
                            d.materials[key][type] = e.target.checked
                              ? [...d.materials[key][type], item]
                              : d.materials[key][type].filter(
                                  (n) => n !== item,
                                );
                          })
                        }
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))
      ) : (
        <section className="card">
          <Empty
            icon="folder"
            title="공개 자료가 없습니다."
            description="첨부 자료를 선택하고 지문 또는 해설 공개 시점을 지정하세요."
          />
        </section>
      )}
      {adding && (
        <Modal
          title="자료 묶음 추가"
          onClose={() => setAdding(false)}
          footer={
            <>
              <button className="button" onClick={() => setAdding(false)}>
                취소
              </button>
              <button
                className="button primary"
                disabled={
                  !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(name) ||
                  Boolean(doc.materials[name])
                }
                onClick={() => {
                  mutate((d) => {
                    d.materials[name] = {
                      strategy: 'NONE',
                      files: [],
                      solutions: [],
                      testsets: [],
                    };
                  });
                  setAdding(false);
                  setName('');
                }}
              >
                추가
              </button>
            </>
          }
        >
          <label>
            파일명
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="attachments"
            />
            <small>
              영문 이름으로 지정하세요. 패키지에 {name || 'attachments'}.zip으로
              포함됩니다.
            </small>
          </label>
        </Modal>
      )}
    </div>
  );
}
