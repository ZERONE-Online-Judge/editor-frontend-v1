import Select from '../../components/Select';
import { useState } from 'react';
import { CodeEditor } from '../../components/ui';

import { loopScript } from '../../lib/generationScript';

export default function GeneratorLoop({
  groups,
  disabled,
  append,
}: {
  groups: string[];
  disabled: boolean;
  append: (script: string) => void;
}) {
  const [command, setCommand] = useState('gen 10 {seed}');
  const [start, setStart] = useState(1),
    [end, setEnd] = useState(100),
    [step, setStep] = useState(1),
    [group, setGroup] = useState('');
  let preview = '',
    error = '';
  try {
    preview = loopScript(command, start, end, step, group);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <details className="scoped-expectations generator-loop">
      <summary>시드 범위로 생성 규칙 추가</summary>
      <fieldset disabled={disabled} className="form-grid">
        <label className="span-2">
          반복할 생성 명령
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="gen 10 {seed}"
          />
        </label>
        <label>
          시작 시드
          <input
            type="number"
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
          />
        </label>
        <label>
          마지막 시드
          <input
            type="number"
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
          />
        </label>
        <label>
          시드 증가량
          <input
            type="number"
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
          />
        </label>
        <label>
          생성 테스트 그룹
          <Select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">그룹 없음</option>
            {groups.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </Select>
        </label>
      </fieldset>
      {preview && (
        <>
          <p className="muted small">
            생성 명령 {Math.floor(Math.abs(end - start) / Math.abs(step)) + 1}
            개를 추가합니다. 기존 수동 테스트 번호는 건너뜁니다. 실제 실행은
            입력·정답 생성에서 시작합니다.
          </p>
          <CodeEditor
            label="추가할 반복 스크립트"
            value={preview}
            rows={6}
            readOnly
          />
        </>
      )}
      {error && (
        <p role="alert" className="muted small">
          {error}
        </p>
      )}
      <button
        className="button"
        disabled={disabled || !!error}
        onClick={() => append(preview)}
      >
        생성 스크립트에 추가
      </button>
    </details>
  );
}
