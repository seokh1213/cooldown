import React, { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
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
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={closeSidebar}
      />
      <SidebarRail />
      
      <SidebarInset 
        className="flex flex-col transition-[margin] duration-300 ease-in-out"
        style={{
          marginLeft: deviceType === "mobile" ? "0" : "4rem", // 모바일에서는 0, PC/태블릿에서는 64px
        }}
      >
        {/* Navigation bar */}
        {nav && (
          <>
            {React.isValidElement(nav) 
              ? React.cloneElement(nav as React.ReactElement<any>, { 
                  sidebarLeft: "4rem",
                  onMenuToggle: toggleSidebar
                })
              : nav}
          </>
        )}

        {/* Page content */}
        <main className="flex-1 w-full min-w-0 overflow-x-hidden pt-[60px]">
          {children}
        </main>
      </SidebarInset>
    </div>
  );
}

export default Layout;
