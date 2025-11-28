import React, { useCallback, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavProps {
  version?: string;
  lang: string;
  selectHandler: (lang: string) => void;
  theme?: "light" | "dark";
  onThemeToggle?: () => void;
  sidebarLeft?: string;
}

function Nav({ 
  version = "10.8.1", 
  lang, 
  selectHandler,
  theme = "light",
  onThemeToggle,
  sidebarLeft = "0px"
}: NavProps) {
  const location = useLocation();
  const isEncyclopediaPage = location.pathname === "/";
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      selectHandler(e.target.value);
    },
    [selectHandler]
  );

  const navLeft = isMobile ? "0px" : sidebarLeft;
  const navWidth = isMobile ? "100%" : `calc(100% - ${sidebarLeft})`;

  return (
    <>
      <nav 
        className="px-4 md:px-6 py-3 flex items-center gap-3 bg-card/80 backdrop-blur-md border-b border-border/50 fixed z-30 min-h-[60px]"
        style={{ 
          left: navLeft,
          width: navWidth,
          top: isMobile ? "60px" : "0px"
        }}
      >
        {isEncyclopediaPage && (
          <h1 className="text-xl md:text-2xl font-bold flex-1">백과사전</h1>
        )}
        {!isEncyclopediaPage && <div className="flex-1" />}
        <div className="text-xs text-muted-foreground/80 hidden sm:block font-medium">v{version}</div>
        {onThemeToggle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onThemeToggle}
            className={cn(
              "h-9 w-9 transition-all duration-200",
              theme === "dark" 
                ? "text-amber-400 hover:bg-amber-400/10 hover:text-amber-400" 
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
            )}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        )}
        <Select
          defaultValue={lang}
          onChange={handleChange}
          className="h-8 w-auto min-w-[90px] border border-border/50 bg-background/50 backdrop-blur-sm px-2 py-1 rounded-md focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
          aria-label="Select language"
        >
          <option value="ko_KR">한국어</option>
          <option value="en_US">Eng</option>
        </Select>
      </nav>
    </>
  );
}

export default React.memo(Nav);
