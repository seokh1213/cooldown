import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export function usePatchFragment(ready: boolean) {
  const { hash, key } = useLocation();
  const navigation = useNavigationType();
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  useEffect(() => {
    if (!ready || !hash.startsWith("#patch-")) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({
        behavior: navigation === "PUSH" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, hash, key, navigation]);
}
