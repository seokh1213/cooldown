import React, { useCallback, useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Menu, HelpCircle, AlertTriangle, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const isEncyclopediaPage = location.pathname === "/encyclopedia";
  const isSimulationPage = location.pathname === "/simulation";
  const isChampionCooldownPage = location.pathname === "/" || location.pathname === "";
  const [isMobile, setIsMobile] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [versionPopoverOpen, setVersionPopoverOpen] = useState(false);
  const [languagePopoverOpen, setLanguagePopoverOpen] = useState(false);

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

  const handleLanguageChange = useCallback(
    (newLang: string) => {
      selectHandler(newLang);
      setLanguagePopoverOpen(false);
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
          
          {/* Page title */}
          {(isEncyclopediaPage || isSimulationPage || isChampionCooldownPage) && (
            <h1 className="text-base md:text-lg font-medium flex-1 text-foreground/70 leading-none">
              {isEncyclopediaPage && t.nav.encyclopedia}
              {isSimulationPage && t.sidebar.simulation}
              {isChampionCooldownPage && t.sidebar.championCooldown}
            </h1>
          )}
          {!(isEncyclopediaPage || isSimulationPage || isChampionCooldownPage) && <div className="flex-1" />}
          {/* Version with mismatch icon */}
          {isVersionMismatch && (
            <Popover open={versionPopoverOpen} onOpenChange={setVersionPopoverOpen}>
              <PopoverTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-pointer">
                  {/* Mobile: icon only */}
                  <button
                    className={cn(
                      "sm:hidden h-auto w-auto p-1 rounded-md transition-all duration-200 text-red-500 hover:text-red-600 hover:bg-muted flex items-center justify-center -ml-1"
                    )}
                    aria-label={t.versionNotice.title}
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </button>
                  {/* Desktop: icon + version */}
                  {version && (
                    <>
                      <button
                        className={cn(
                          "hidden sm:flex h-auto w-auto p-1 rounded-md transition-all duration-200 text-red-500 hover:text-red-600 hover:bg-muted items-center justify-center -ml-1"
                        )}
                        aria-label={t.versionNotice.title}
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </button>
                      <button
                        className="hidden sm:block text-xs font-medium leading-none text-red-500 hover:text-red-600 transition-colors"
                        aria-label={t.versionNotice.title}
                      >
                        v{version}
                      </button>
                    </>
                  )}
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end" sideOffset={8}>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <h4 className="font-semibold text-sm leading-none">{t.versionNotice.title}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.versionNotice.description}</p>
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <div className="text-xs">
                      <span className="font-semibold">{t.versionNotice.ddragonLabel}:</span>{" "}
                      {version}
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold">{t.versionNotice.cdragonLabel}:</span>{" "}
                      {cdragonVersion ?? "-"}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
          {/* Version without mismatch - desktop only */}
          {version && !isVersionMismatch && (
            <div className="hidden sm:block text-xs font-medium leading-none text-muted-foreground/60">
              v{version}
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
                  "h-auto w-auto p-1 transition-all duration-200 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground flex items-center justify-center"
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
          {/* Language selector */}
          <Popover open={languagePopoverOpen} onOpenChange={setLanguagePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-auto w-auto p-1 transition-all duration-200 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground flex items-center justify-center"
                )}
                aria-label="Select language"
                title="Select language"
              >
                <Globe className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end" sideOffset={8}>
              <div className="space-y-2">
                <h4 className="font-medium text-sm leading-none mb-3">{t.nav.language.selectTitle}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleLanguageChange("ko_KR")}
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all",
                      lang === "ko_KR"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    )}
                  >
                    <span className="text-2xl">🇰🇷</span>
                    <span className="text-xs font-medium">{t.nav.language.korean}</span>
                  </button>
                  <button
                    onClick={() => handleLanguageChange("en_US")}
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all",
                      lang === "en_US"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    )}
                  >
                    <span className="text-2xl">🇺🇸</span>
                    <span className="text-xs font-medium">{t.nav.language.english}</span>
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </nav>
    </>
  );
}

export default React.memo(Nav);
