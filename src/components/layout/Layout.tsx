import React, { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import { AdvisorWidget } from "@/components/features/advisor/AdvisorWidget";
import { SidebarRail, SidebarInset } from "@/components/ui/sidebar";
import { useDeviceType } from "@/hooks/useDeviceType";

interface LayoutProps {
  children: React.ReactNode;
  nav?: React.ReactNode;
  /** 상성 코치가 어느 패치의 자료를 받을지 */
  patch?: string;
  /** 카드 아이콘용 DDragon 버전 */
  ddragonVersion?: string;
}

/** 도우미 드로어 폭. 카드가 표 문법으로 들어가려면 이만큼은 필요하다. */
export const ADVISOR_DRAWER_WIDTH = 560;

function Layout({ children, nav, patch, ddragonVersion }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 도우미가 열려 있으면 페이지를 옆으로 밀어 둘이 나란히 보이게 한다.
  // 위에 띄우면 쿨타임 표를 보면서 물을 수 없다 — 답이 표를 가린다.
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const deviceType = useDeviceType();

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-background flex w-full">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <Sidebar 
        isOpen={sidebarOpen} 
        isMobile={deviceType === "mobile"}
        onClose={closeSidebar}
      />
      <SidebarRail className="transition-[left,right]" />
      
      <SidebarInset 
        className="flex flex-col overflow-clip transition-[margin] duration-300 ease-in-out"
        style={{
          marginLeft: deviceType === "mobile" ? "0" : "4rem", // 모바일에서는 0, PC/태블릿에서는 64px
          // 모바일은 드로어가 전체 화면이라 밀 것이 없다.
          marginRight: deviceType !== "mobile" && advisorOpen ? `${ADVISOR_DRAWER_WIDTH}px` : "0",
        }}
      >
        {/* Navigation bar */}
        {nav && (
          <>
            {React.isValidElement(nav) 
              ? React.cloneElement(nav as React.ReactElement<Record<string, unknown>>, { 
                  sidebarLeft: "4rem",
                  onMenuToggle: toggleSidebar
                })
              : nav}
          </>
        )}

        {/* Page content */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 w-full min-w-0 overflow-x-clip pt-[60px]"
        >
          {children}
        </main>
      </SidebarInset>

      {/* 오른쪽 드로어로 열리는 지식 도우미. 동의 전에는 모델을 받지 않는다. */}
      {patch && ddragonVersion && (
        <AdvisorWidget patch={patch} ddragonVersion={ddragonVersion} onOpenChange={setAdvisorOpen} />
      )}
    </div>
  );
}

export default Layout;
