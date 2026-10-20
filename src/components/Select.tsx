import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

type Choice = {
  value: string;
  label: string;
  disabled: boolean;
  group: string;
  selected: boolean;
};

function optionGroup(option: HTMLOptionElement) {
  return option.parentElement?.tagName === 'OPTGROUP'
    ? (option.parentElement as HTMLOptGroupElement)
    : null;
}

/** Keep native labels, form values and change events with a shared popup. */
const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select(
  {
    className,
    children,
    onKeyDown,
    onPointerDown,
    onMouseDown,
    onClick,
    onBlur,
    ...props
  },
  ref,
) {
  const control = useRef<HTMLSelectElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', at: 0 });
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [active, setActive] = useState(-1);
  useImperativeHandle(ref, () => control.current!);

  const custom = !props.multiple && !(props.size && props.size > 1);
  const visible = open && !props.disabled && custom;

  function openMenu() {
    const select = control.current;
    if (!select || select.disabled || !custom) return;
    const items = Array.from(select.options, (option) => ({
      value: option.value,
      label: option.label,
      disabled: option.disabled || Boolean(optionGroup(option)?.disabled),
      group: optionGroup(option)?.label ?? '',
      selected: option.selected,
    }));
    setChoices(items);
    setActive(
      items.findIndex((item) => item.selected && !item.disabled) >= 0
        ? items.findIndex((item) => item.selected && !item.disabled)
        : items.findIndex((item) => !item.disabled),
    );
    setOpen(true);
  }

  function choose(index: number) {
    const select = control.current;
    const choice = choices[index];
    if (!select || select.disabled || !choice || choice.disabled) return;
    const option = Array.from(select.options).find(
      (item) => item.value === choice.value,
    );
    if (!option || option.disabled || optionGroup(option)?.disabled) {
      setOpen(false);
      return;
    }
    select.value = choice.value;
    select.dispatchEvent(
      new select.ownerDocument.defaultView!.Event('change', { bubbles: true }),
    );
    setOpen(false);
    select.focus({ preventScroll: true });
  }

  function move(direction: number) {
    for (let step = 1; step <= choices.length; step++) {
      const index =
        (active + direction * step + choices.length) % choices.length;
      if (!choices[index].disabled) {
        setActive(index);
        break;
      }
    }
  }

  useLayoutEffect(() => {
    if (!visible) return;
    const select = control.current;
    const menu = popup.current;
    if (!select || !menu) return;
    function place() {
      if (!select || !menu) return;
      const rect = select.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upwards = below < 160 && above > below;
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 24);
      menu.style.width = `${width}px`;
      menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
      menu.style.maxHeight = `${Math.max(80, Math.min(304, upwards ? above : below))}px`;
      menu.style.top = upwards ? 'auto' : `${rect.bottom + 6}px`;
      menu.style.bottom = upwards
        ? `${window.innerHeight - rect.top + 6}px`
        : 'auto';
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !control.current?.contains(target) &&
        !popup.current?.contains(target)
      )
        setOpen(false);
    }
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [visible]);

  useEffect(() => {
    if (visible)
      popup.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView?.({ block: 'nearest' });
  }, [active, visible]);

  return (
    <>
      <select
        {...props}
        ref={control}
        className={['zoj-select', className].filter(Boolean).join(' ')}
        data-open={visible}
        aria-expanded={custom ? visible : undefined}
        aria-controls={visible ? listId : undefined}
        aria-activedescendant={
          visible && active >= 0 ? `${listId}-${active}` : undefined
        }
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            !custom ||
            props.disabled
          )
            return;
          event.preventDefault();
          control.current?.focus({ preventScroll: true });
          if (visible) setOpen(false);
          else openMenu();
        }}
        onMouseDown={(event) => {
          onMouseDown?.(event);
          if (custom) event.preventDefault();
        }}
        onClick={(event) => {
          onClick?.(event);
          if (!custom || event.defaultPrevented) return;
          event.preventDefault();
          if (event.detail === 0) {
            if (visible) setOpen(false);
            else openMenu();
          }
        }}
        onBlur={(event) => {
          onBlur?.(event);
          setOpen(false);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || !custom || props.disabled) return;
          if (event.key === 'Tab') {
            setOpen(false);
            return;
          }
          if (event.key === 'Escape' && visible) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            return;
          }
          if (
            ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(
              event.key,
            )
          ) {
            event.preventDefault();
            if (!visible) {
              openMenu();
              return;
            }
            if (event.key === 'Enter' || event.key === ' ') choose(active);
            else if (event.key === 'Home')
              setActive(choices.findIndex((choice) => !choice.disabled));
            else if (event.key === 'End')
              setActive(choices.findLastIndex((choice) => !choice.disabled));
            else move(event.key === 'ArrowDown' ? 1 : -1);
            return;
          }
          if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            event.preventDefault();
            const now = Date.now();
            search.current = {
              text:
                (now - search.current.at < 600 ? search.current.text : '') +
                event.key.toLocaleLowerCase(),
              at: now,
            };
            const items = visible
              ? choices
              : Array.from(control.current!.options, (option) => ({
                  label: option.label,
                  disabled: option.disabled,
                }));
            if (!visible) openMenu();
            const index = items.findIndex(
              (item) =>
                !item.disabled &&
                item.label.toLocaleLowerCase().startsWith(search.current.text),
            );
            if (index >= 0) setActive(index);
          }
        }}
      >
        {children}
      </select>
      {visible &&
        control.current &&
        createPortal(
          <div
            ref={popup}
            className="zoj-select-menu"
            role="listbox"
            id={listId}
            aria-label={props['aria-label'] || '선택 항목'}
            onPointerDown={(event) => {
              if (event.pointerType !== 'touch') event.preventDefault();
            }}
            onMouseDown={(event) => event.preventDefault()}
          >
            {choices.map((choice, index) => (
              <div key={`${index}-${choice.value}`}>
                {choice.group &&
                (index === 0 || choices[index - 1].group !== choice.group) ? (
                  <div className="zoj-select-group">{choice.group}</div>
                ) : null}
                <div
                  role="option"
                  id={`${listId}-${index}`}
                  data-index={index}
                  aria-selected={choice.selected}
                  aria-disabled={choice.disabled || undefined}
                  data-active={active === index}
                  className="zoj-select-option"
                  onPointerMove={(event) => {
                    if (event.pointerType === 'mouse' && !choice.disabled)
                      setActive(index);
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    choose(index);
                  }}
                >
                  <span>{choice.label}</span>
                </div>
              </div>
            ))}
          </div>,
          control.current.closest('dialog') || document.body,
        )}
    </>
  );
});

export default Select;
