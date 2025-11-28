import React, { useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { X, BookOpen, Lightbulb, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { path: "/", label: "백과사전", icon: BookOpen },
  { path: "/laning-tips", label: "라인전 팁", icon: Lightbulb },
  { path: "/kill-angle", label: "킬각 계산기", icon: Calculator },
];

function Sidebar({ isOpen, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
      onClose();
    },
    [navigate, onClose]
  );

  return (
    <TooltipProvider delayDuration={200}>
      <>
        {/* Mobile overlay */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <ShadcnSidebar
          side="left"
          variant="sidebar"
          collapsible="offcanvas"
          style={{
            transform: isOpen ? "translateX(0)" : "translateX(-100%)",
          }}
          className={cn(
            "md:!translate-x-0 transition-all duration-300 md:w-16 md:p-2"
          )}
        >
          <SidebarHeader className="flex-row items-center border-b border-border py-3 min-h-[60px] relative transition-all duration-300 px-0 md:px-2">
            {/* Mobile: Full header */}
            <div className="md:hidden flex items-center gap-3 flex-1 px-4">
              <img 
                src={`${import.meta.env.BASE_URL}poro_logo.png`}
                alt="Poro Logo" 
                className="h-12 w-12 object-contain"
                style={{ imageRendering: 'high-quality' }}
              />
              <h2 className="text-lg font-semibold text-sidebar-foreground">Cooldown</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className={cn(
                  "ml-auto h-8 w-8 transition-all duration-200",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  "active:scale-95"
                )}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Desktop/Tablet: Collapsed header */}
            <div className="hidden md:flex w-full items-center justify-center px-1">
              <img 
                src={`${import.meta.env.BASE_URL}poro_logo.png`}
                alt="Poro Logo" 
                className="h-8 w-8 object-contain"
                style={{ imageRendering: 'high-quality' }}
              />
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent className="px-1">
                <SidebarMenu>
                  {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    const Icon = item.icon;
                    
                    return (
                      <SidebarMenuItem key={item.path}>
                        {/* Desktop/Tablet: Collapsed with Tooltip */}
                        <div className="hidden md:block">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <SidebarMenuButton
                                onClick={() => handleNavigate(item.path)}
                                isActive={isActive}
                                className={cn(
                                  "w-full transition-all duration-200 relative group/menu-item",
                                  "justify-center px-2 rounded-lg",
                                  "hover:bg-sidebar-accent dark:hover:bg-sidebar-accent",
                                  "hover:text-sidebar-foreground"
                                )}
                              >
                                <Icon className={cn(
                                  "shrink-0 transition-all duration-200 h-5 w-5",
                                  isActive 
                                    ? "text-sidebar-foreground dark:text-sidebar-foreground"
                                    : "text-sidebar-foreground/60 dark:text-sidebar-foreground/70 group-hover/menu-item:text-sidebar-foreground dark:group-hover/menu-item:text-sidebar-foreground"
                                )} />
                              </SidebarMenuButton>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              {item.label}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        {/* Mobile: Expanded without Tooltip */}
                        <div className="md:hidden">
                          <SidebarMenuButton
                            onClick={() => handleNavigate(item.path)}
                            isActive={isActive}
                            className={cn(
                              "w-full transition-all duration-200 relative group/menu-item rounded-lg",
                              // 기본 hover 스타일
                              !isActive && [
                                "hover:bg-sidebar-accent dark:hover:bg-sidebar-accent",
                                "hover:text-sidebar-foreground",
                              ],
                              // 선택됨
                              isActive && [
                                "text-sidebar-foreground dark:text-sidebar-foreground",
                                "font-semibold",
                                "hover:bg-sidebar-accent dark:hover:bg-sidebar-accent",
                                "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2",
                                "before:w-1 before:h-8 before:rounded-r-full",
                                "before:bg-sidebar-primary/60 dark:before:bg-sidebar-primary"
                              ],
                              // 선택 안됨
                              !isActive && [
                                "text-sidebar-foreground/70 dark:text-sidebar-foreground/80",
                                "hover:text-sidebar-foreground dark:hover:text-sidebar-foreground",
                                "border border-transparent hover:border-sidebar-border/50"
                              ]
                            )}
                          >
                            <Icon className={cn(
                              "shrink-0 transition-all duration-200 h-4 w-4",
                              isActive 
                                ? "text-sidebar-foreground dark:text-sidebar-foreground"
                                : "text-sidebar-foreground/60 dark:text-sidebar-foreground/70 group-hover/menu-item:text-sidebar-foreground dark:group-hover/menu-item:text-sidebar-foreground"
                            )} />
                            <span className={cn(
                              "ml-3 truncate transition-colors duration-200",
                              isActive 
                                ? "text-sidebar-foreground dark:text-sidebar-foreground font-semibold" 
                                : "text-sidebar-foreground/70 dark:text-sidebar-foreground/80 group-hover/menu-item:text-sidebar-foreground dark:group-hover/menu-item:text-sidebar-foreground font-normal"
                            )}>
                              {item.label}
                            </span>
                          </SidebarMenuButton>
                        </div>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </ShadcnSidebar>
      </>
    </TooltipProvider>
  );
}

export default React.memo(Sidebar);

