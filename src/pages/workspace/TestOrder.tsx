import { useState } from 'react';
import Select from '../../components/Select';
import Pagination from '../../components/Pagination';
import { Icon, Modal, Notice } from '../../components/ui';
import { usePagination } from '../../lib/pagination';
import { moveTest, orderedTests } from '../../lib/testOrder';
import type { TestSet } from '../../lib/types';

export default function TestOrder({
  testset,
  onApply,
  onClose,
}: {
  testset: TestSet;
  onApply: (order: number[]) => void;
  onClose: () => void;
}) {
  const tests = orderedTests(testset);
  const [order, setOrder] = useState(() => tests.map((test) => test.index));
  const [selected, setSelected] = useState(order[0]);
  const [position, setPosition] = useState('1');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const paging = usePagination(order, 'test-order', 50);
  const changed = order.some(
    (index, position) => index !== tests[position]?.index,
  );
  const lookup = new Map(tests.map((test) => [test.index, test]));
  function move(index: number, destination: number) {
    try {
      setOrder(moveTest(order, index, destination));
      setSelected(index);
      setPosition(String(destination));
      paging.onPageChange(Math.ceil(destination / paging.page_size));
      setMessage(`#${index} 테스트를 ${destination}번째로 이동했습니다.`);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title="테스트 순서 변경"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            취소
          </button>
          <button
            className="button primary"
            disabled={!changed}
            onClick={() => onApply(order)}
          >
            작업 사본에 반영
          </button>
        </>
      }
    >
      <p className="muted small">
        위·아래 버튼으로 옮기거나 이동할 위치를 지정하세요. 테스트 번호와 입출력
        파일은 유지되며 검증·내보내기에 같은 순서를 사용합니다.
      </p>
      <form
        className="test-order-jump"
        onSubmit={(e) => {
          e.preventDefault();
          move(selected, Number(position));
        }}
      >
        <label>
          이동할 테스트
          <Select
            value={selected}
            onChange={(e) => {
              setSelected(Number(e.target.value));
              setPosition(String(order.indexOf(Number(e.target.value)) + 1));
            }}
          >
            {order.map((index) => (
              <option key={index} value={index}>
                #{index}
                {lookup.get(index)?.description
                  ? ` · ${lookup.get(index)?.description}`
                  : ''}
              </option>
            ))}
          </Select>
        </label>
        <label>
          이동할 위치
          <input
            aria-label="이동할 위치"
            type="number"
            min={1}
            max={order.length}
            step={1}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
        </label>
        <button className="button" type="submit">
          위치로 이동
        </button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="test-order-status" role="status">
        {message || `총 ${order.length}개 테스트`}
      </div>
      <ol
        className="test-order-list"
        start={paging.offset + 1}
        aria-label="테스트 실행 순서"
      >
        {paging.items.map((index, offset) => {
          const ordinal = paging.offset + offset + 1;
          return (
            <li key={index}>
              <span className="test-order-number">{ordinal}</span>
              <span className="test-order-label">
                <strong>#{index}</strong>
                <span>{lookup.get(index)?.description || '등록 테스트'}</span>
              </span>
              <div className="test-order-buttons">
                <button
                  className="icon-button test-order-up"
                  aria-label={`테스트 ${index} 위로 이동`}
                  title="위로 이동"
                  disabled={ordinal === 1}
                  onClick={() => move(index, ordinal - 1)}
                >
                  <Icon name="down" size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`테스트 ${index} 아래로 이동`}
                  title="아래로 이동"
                  disabled={ordinal === order.length}
                  onClick={() => move(index, ordinal + 1)}
                >
                  <Icon name="down" size={17} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <Pagination {...paging} label="테스트 순서" />
      <button
        className="text-link"
        onClick={() => {
          setOrder([...order].sort((a, b) => a - b));
          paging.onPageChange(1);
          setMessage('테스트 번호순으로 정렬했습니다.');
          setError('');
        }}
      >
        번호순으로 초기화
      </button>
    </Modal>
  );
}
