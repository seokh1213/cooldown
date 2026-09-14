/**
 * 화면 맥락을 React 에 잇는다.
 *
 * 경로가 바뀌면 다시 읽고, 다른 탭에서 저장소가 바뀌면 다시 읽는다.
 * 같은 탭에서 쿨타임 표가 선택을 바꾸는 것은 storage 이벤트가 안 오므로,
 * 도우미 패널이 열릴 때(refreshKey) 한 번 더 읽는다. 그 시점이 사용자가 질문하는 시점이다.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { readPageContext, type PageContext } from "@/lib/advisor/pageContext";

export function usePageContext(refreshKey?: unknown): PageContext {
  const { pathname, search } = useLocation();
  const [context, setContext] = useState<PageContext>(() => readPageContext(pathname, search));

  useEffect(() => {
    setContext(readPageContext(pathname, search));
  }, [pathname, search, refreshKey]);

  useEffect(() => {
    const refresh = () => setContext(readPageContext(pathname, search));
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [pathname, search]);

  return context;
}
