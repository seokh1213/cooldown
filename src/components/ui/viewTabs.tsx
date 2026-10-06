/**
 * 화면을 바꾸는 탭 줄
 *
 * 생김새는 탭이지만 **탭 위젯이 아니다.** 탭 위젯은 버튼 바로 아래에 패널이 있고
 * 버튼이 `aria-controls` 로 그 패널을 가리켜야 한다. 이 앱의 탭 줄은 버튼만 있고
 * 내용은 저 아래 다른 컴포넌트가 그린다. 그런데도 Radix Tabs 를 쓰고 있어서,
 * 존재하지 않는 패널 id 를 가리키는 `aria-controls` 가 나갔다.
 *
 *   aria-controls="radix-_r_a_-content-skills"  ← 이 id 를 가진 요소가 DOM 에 없다
 *
 * Lighthouse 가 이것을 두 항목으로 잡는다. ARIA 값 유효성과 접근성 트리 형태다.
 * 코드베이스 전체에서 `TabsContent` 를 한 번도 쓰지 않으므로, 패널을 만들기보다
 * 버튼 묶음으로 정직하게 적는 편이 맞다. 켜진 것을 `aria-pressed` 로 알린다.
 *
 * 생김새는 그대로다. Radix 가 붙이던 `data-state="active"` 를 우리가 붙인다.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface ViewTabItem<T extends string> {
  value: T;
  label: string;
  /** 좁은 화면(sm 미만)에서 대신 보이는 이름 */
  shortLabel?: string;
}

interface ViewTabsProps<T extends string> {
  items: ViewTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 이 줄이 무엇을 고르는 것인지. 화면 낭독기가 묶음을 읽을 때 쓴다. */
  label: string;
  className?: string;
}

/**
 * 탭 하나의 모양. 두 화면이 같은 줄을 쓰므로 한 곳에 둔다.
 * 탭은 줄어들지도 꺾이지도 않는다. 자리가 모자라면 줄을 감싼 쪽이 가로로 스크롤한다.
 * 줄어들게 두면 한글 이름이 한 글자씩 세로로 쌓인다.
 */
const TAB_CLASS =
  "shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 text-sm font-medium transition-colors border-b-2 rounded-none shadow-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TAB_ACTIVE = "border-primary text-primary";
const TAB_IDLE = "border-transparent text-muted-foreground hover:text-foreground";

export function ViewTabs<T extends string>({ items, value, onChange, label, className }: ViewTabsProps<T>) {
  const activeRef = useRef<HTMLButtonElement>(null);
  // 가로로 스크롤하는 줄에서 켜진 탭이 화면 밖에 있으면 보이는 자리로 당긴다.
  // scrollIntoView 는 창까지 세로로 움직이므로 줄의 scrollLeft 만 고친다.
  useEffect(() => {
    const tab = activeRef.current;
    let strip = tab?.parentElement ?? null;
    while (strip && !/(auto|scroll)/.test(getComputedStyle(strip).overflowX)) strip = strip.parentElement;
    if (!tab || !strip) return;
    const edge = 16;
    const box = strip.getBoundingClientRect();
    const rect = tab.getBoundingClientRect();
    if (rect.left < box.left + edge) strip.scrollLeft -= box.left + edge - rect.left;
    else if (rect.right > box.right - edge) strip.scrollLeft += rect.right - (box.right - edge);
  }, [value]);
  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center gap-2", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={active ? activeRef : undefined}
            type="button"
            aria-pressed={active}
            // 짧은 이름이 보일 때도 화면 낭독기는 온이름을 읽는다. 온이름은 짧은 이름을 품는다(Label in Name).
            aria-label={item.shortLabel ? item.label : undefined}
            onClick={() => onChange(item.value)}
            className={cn(TAB_CLASS, active ? TAB_ACTIVE : TAB_IDLE)}
          >
            {item.shortLabel ? (
              <>
                <span className="sm:hidden">{item.shortLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </>
            ) : (
              item.label
            )}
          </button>
        );
      })}
    </div>
  );
}
