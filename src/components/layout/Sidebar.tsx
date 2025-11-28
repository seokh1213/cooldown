import React, { useCallback, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { X, ChevronLeft, ChevronRight, BookOpen, Lightbulb, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
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

function Sidebar({ isOpen, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
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
          "md:!translate-x-0 transition-all duration-300",
          isCollapsed && "md:w-16 md:p-2"
        )}
      >
        <SidebarHeader className={cn(
          "flex-row items-center border-b border-border py-3 min-h-[60px] relative transition-all duration-300",
          isCollapsed ? "px-0" : "px-4"
        )}>
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-3 flex-1">
                <img 
                  src={`${import.meta.env.BASE_URL}poro_logo.png`}
                  alt="Poro Logo" 
                  className="h-12 w-12 object-contain"
                  style={{ imageRendering: 'high-quality' }}
                />
                <h2 className="text-lg font-semibold text-sidebar-foreground">Cooldown</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className={cn(
                  "md:hidden h-8 w-8 transition-all duration-200",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  "active:scale-95"
                )}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <div className="w-full flex items-center justify-center px-1">
              <img 
                src={`${import.meta.env.BASE_URL}poro_logo.png`}
                alt="Poro Logo" 
                className="h-8 w-8 object-contain"
                style={{ imageRendering: 'high-quality' }}
              />
            </div>
          )}
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            {!isCollapsed && <SidebarGroupLabel>메뉴</SidebarGroupLabel>}
            <SidebarGroupContent className={cn(!isCollapsed && "px-1")}>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        onClick={() => handleNavigate(item.path)}
                        isActive={isActive}
                        className={cn(
                          "w-full transition-all duration-200 relative group/menu-item",
                          isCollapsed && "justify-center px-2",
                          !isCollapsed && "rounded-lg",
                          // 기본 hover 스타일 - 선택된 상태와 동일한 배경색
                          !isActive && [
                            "hover:bg-sidebar-accent dark:hover:bg-sidebar-accent",
                            "hover:text-sidebar-foreground",
                          ],
                          // 펼쳐진 상태 - 선택됨 (왼쪽 인디케이터만, 배경색 없음)
                          !isCollapsed && isActive && [
                            "text-sidebar-foreground dark:text-sidebar-foreground",
                            "font-semibold",
                            "hover:bg-sidebar-accent dark:hover:bg-sidebar-accent",
                            "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2",
                            "before:w-1 before:h-8 before:rounded-r-full",
                            "before:bg-sidebar-primary/60 dark:before:bg-sidebar-primary"
                          ],
                          // 펼쳐진 상태 - 선택 안됨
                          !isCollapsed && !isActive && [
                            "text-sidebar-foreground/70 dark:text-sidebar-foreground/80",
                            "hover:text-sidebar-foreground dark:hover:text-sidebar-foreground",
                            "border border-transparent hover:border-sidebar-border/50"
                          ],
                          // 접힌 상태 - 선택됨 (배경색 없음)
                          isCollapsed && isActive && [
                            "hover:bg-sidebar-accent dark:hover:bg-sidebar-accent"
                          ],
                          // 접힌 상태 - 선택 안됨
                          isCollapsed && !isActive && [
                            "hover:bg-sidebar-accent dark:hover:bg-sidebar-accent",
                            "hover:text-sidebar-foreground"
                          ]
                        )}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <Icon className={cn(
                          "shrink-0 transition-all duration-200",
                          isCollapsed ? "h-5 w-5" : "h-4 w-4",
                          isActive 
                            ? "text-sidebar-foreground dark:text-sidebar-foreground"
                            : "text-sidebar-foreground/60 dark:text-sidebar-foreground/70 group-hover/menu-item:text-sidebar-foreground dark:group-hover/menu-item:text-sidebar-foreground"
                        )} />
                        {!isCollapsed && (
                          <span className={cn(
                            "ml-3 truncate transition-colors duration-200",
                            isActive 
                              ? "text-sidebar-foreground dark:text-sidebar-foreground font-semibold" 
                              : "text-sidebar-foreground/70 dark:text-sidebar-foreground/80 group-hover/menu-item:text-sidebar-foreground dark:group-hover/menu-item:text-sidebar-foreground font-normal"
                          )}>
                            {item.label}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Footer with collapse button - 최신 UX 트렌드에 따라 하단 배치 */}
        {onToggleCollapse && (
          <SidebarFooter className="border-t border-border p-2">
            <div className="flex items-center justify-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                className={cn(
                  "h-9 w-9 transition-all duration-200",
                  "hover:bg-sidebar-accent dark:hover:bg-sidebar-accent",
                  "hover:text-sidebar-accent-foreground dark:hover:text-sidebar-accent-foreground",
                  "text-sidebar-foreground/70 dark:text-sidebar-foreground/80",
                  "active:scale-[0.98]",
                  "rounded-lg"
                )}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-5 w-5" />
                ) : (
                  <ChevronLeft className="h-5 w-5" />
                )}
              </Button>
            </div>
          </SidebarFooter>
        )}
      </ShadcnSidebar>
    </>
  );
}

export default React.memo(Sidebar);

