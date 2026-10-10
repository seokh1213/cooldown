import { useEffect, useState } from "react";

/**
 * 입력이 자주 바뀌는 값(검색어 등)에 디바운스를 적용하는 훅.
 *
 * - UI 입력은 즉시 업데이트하면서, 무거운 계산/필터링은 일정 간격으로만 실행하고 싶을 때 사용한다.
 * - 사용 예: const debouncedSearch = useDebouncedValue(search, 200);
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}



