import React, { useCallback, useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Menu, HelpCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { TutorialContent } from "./TutorialContent";
import { useTranslation } from "@/i18n";

function getMajorMinor(version: string | null | undefined): string | null {
  if (!version) return null;
  const parts = version.split(".");
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  return version;
}

interface NavProps {
  version?: string;
  cdragonVersion?: string | null;
  lang: string;
  selectHandler: (lang: string) => void;
  theme?: "light" | "dark";
  onThemeToggle?: () => void;
  sidebarLeft?: string;
  onMenuToggle?: () => void;
}

function Nav({ 
  version, 
  cdragonVersion,
  lang, 
  selectHandler,
  theme = "light",
  onThemeToggle,
  sidebarLeft = "0px",
  onMenuToggle
}: NavProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const isEncyclopediaPage = location.pathname === "/";
  const [isMobile, setIsMobile] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [showVersionDialog, setShowVersionDialog] = useState(false);

  const isVersionMismatch = useMemo(() => {
    if (!version || !cdragonVersion) return false;
    const ddragonMajorMinor = getMajorMinor(version);
    const cdragonMajorMinor = getMajorMinor(cdragonVersion);
    if (!ddragonMajorMinor || !cdragonMajorMinor) return false;
    return ddragonMajorMinor !== cdragonMajorMinor;
  }, [version, cdragonVersion]);

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
        className="bg-background border-b border-border/50 fixed z-30 h-[60px] box-border pointer-events-none"
        style={{ 
          left: navLeft,
          width: navWidth,
          top: "0px"
        }}
      >
        <div className="px-4 md:px-6 flex items-center gap-3 w-full h-full pointer-events-auto">
          {/* Mobile: Menu button */}
          {isMobile && onMenuToggle && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuToggle}
              aria-label="Open menu"
              className="h-9 w-9 hover:bg-muted hover:text-foreground flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </Button>
          )}
          
          {isEncyclopediaPage && (
            <h1 className="text-base md:text-lg font-medium flex-1 text-foreground/70 leading-none">
              {t.nav.encyclopedia}
            </h1>
          )}
          {!isEncyclopediaPage && <div className="flex-1" />}
          {/* Version with mismatch icon */}
          {version && (
            <div className="hidden sm:flex items-center gap-1.5">
              {/* Version mismatch icon - placed before version text */}
              {isVersionMismatch && (
                <button
                  onClick={() => setShowVersionDialog(true)}
                  className="text-red-500 hover:text-red-600 transition-colors"
                  aria-label={t.versionNotice.title}
                >
                  <AlertTriangle className="h-4 w-4" />
                </button>
              )}
              {isVersionMismatch ? (
                <button
                  onClick={() => setShowVersionDialog(true)}
                  className="text-xs font-medium leading-none text-red-500 hover:text-red-600 transition-colors cursor-pointer"
                  aria-label={t.versionNotice.title}
                >
                  v{version}
                </button>
              ) : (
                <div className="text-xs font-medium leading-none text-muted-foreground/60">
                  v{version}
                </div>
              )}
            </div>
          )}
          {onThemeToggle && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onThemeToggle}
              className={cn(
                "h-auto w-auto p-1 transition-all duration-200 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground flex items-center justify-center"
              )}
              aria-label={theme === "dark" ? t.nav.theme.switchToLight : t.nav.theme.switchToDark}
              title={theme === "dark" ? t.nav.theme.switchToLight : t.nav.theme.switchToDark}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          )}
          {/* 튜토리얼 도움말 버튼 (모바일에서만 표시) */}
          {isMobile && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTutorialOpen(true)}
                className={cn(
                  "h-9 w-9 transition-all duration-200 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground flex items-center justify-center"
                )}
                aria-label={t.nav.tutorial.title}
                title={t.nav.tutorial.title}
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
              <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
                <DialogContent
                  className="w-[calc(100vw-32px)] max-w-lg h-[70vh] max-h-[70vh] p-0 rounded-xl overflow-hidden flex flex-col"
                >
                  <VisuallyHidden>
                    <DialogTitle>{t.nav.tutorial.title}</DialogTitle>
                  </VisuallyHidden>
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="p-4 flex flex-col gap-3">
                      <div className="text-center space-y-2 mb-4">
                        <h2 className="text-xl font-bold text-foreground">
                          {t.nav.tutorial.title}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {t.nav.tutorial.description}
                        </p>
                      </div>
                      <TutorialContent />
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </>
          )}
          <Select
            defaultValue={lang}
            onChange={handleChange}
            className="h-9 w-auto min-w-[80px] border border-border/50 bg-background/50 backdrop-blur-sm px-2 rounded-md focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 text-xs text-muted-foreground/70 cursor-pointer hover:border-primary/50 transition-colors flex items-center"
            aria-label="Select language"
          >
            <option value="ko_KR">{t.nav.language.korean}</option>
            <option value="en_US">{t.nav.language.english}</option>
          </Select>
        </div>
      </nav>
      {/* Version mismatch dialog */}
      {isVersionMismatch && (
        <Dialog open={showVersionDialog} onOpenChange={setShowVersionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                {t.versionNotice.title}
              </DialogTitle>
              <DialogDescription className="pt-2">
                <div className="space-y-3">
                  <p>{t.versionNotice.description}</p>
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <div>
                      <span className="font-semibold">{t.versionNotice.ddragonLabel}:</span>{" "}
                      {version}
                    </div>
                    <div>
                      <span className="font-semibold">{t.versionNotice.cdragonLabel}:</span>{" "}
                      {cdragonVersion ?? "-"}
                    </div>
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export default React.memo(Nav);
