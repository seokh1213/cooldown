import React, { useCallback } from "react";
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
}

function Nav({ 
  version = "10.8.1", 
  lang, 
  selectHandler,
  theme = "light",
  onThemeToggle
}: NavProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      selectHandler(e.target.value);
    },
    [selectHandler]
  );

  return (
    <>
      <nav className="w-full px-4 md:px-6 py-3 flex items-center gap-3 bg-card/80 backdrop-blur-md border-b border-border/50 sticky top-0 z-20 min-h-[60px]">
        <div className="flex-1" />
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
