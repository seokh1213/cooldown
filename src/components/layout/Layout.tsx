import React, { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import { LegalFooter } from "./LegalFooter";
import { SidebarRail, SidebarInset } from "@/components/ui/sidebar";
import { useDeviceType } from "@/hooks/useDeviceType";

interface LayoutProps {
  children: React.ReactNode;
  nav?: React.ReactNode;
}

function Layout({ children, nav }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
          /*
           * 본문이 화면을 채우게 해 둔다. 안 그러면 자료가 오기 전의 짧은 화면에서
           * 푸터가 중간에 떠 있다가, 챔피언 표가 들어오면서 아래로 밀린다. 그 움직임이
           * 모바일 CLS 0.14 로 잡혔다(권장선 0.1). 부모가 min-h-screen 이라
           * SidebarInset 의 h-full 이 잡히지 않아 flex-1 만으로는 늘어나지 않는다.
           * 100svh 는 모바일 주소창이 접힐 때 높이가 튀지 않게 한다. 60px 은 위 고정 내비다.
           */
          className="flex-1 w-full min-w-0 overflow-x-clip pt-[60px] min-h-[calc(100svh-60px)]"
        >
          {children}
        </main>

        {/* 라이엇 고지는 모든 화면에 보여야 한다. main 밖에 두어 본문 스크롤 끝에 붙인다. */}
        <LegalFooter />
      </SidebarInset>
    </div>
  );
}

export default Layout;
