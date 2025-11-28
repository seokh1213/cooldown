import React, { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import { SidebarRail, SidebarInset } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: React.ReactNode;
  nav?: React.ReactNode;
}

function Layout({ children, nav }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          marginLeft: "4rem", // PC/태블릿에서 항상 접힌 상태 (16 * 4 = 64px = 4rem)
        }}
      >
        {/* Mobile header */}
        <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-card/90 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center gap-4 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Open menu"
            className="h-9 w-9 hover:bg-muted hover:text-foreground"
          >
            <Menu className="w-5 h-5" />
          </Button>
        </header>

        {/* Navigation bar */}
        {nav && (
          <>
            {React.isValidElement(nav) 
              ? React.cloneElement(nav as React.ReactElement<any>, { 
                  sidebarLeft: "4rem" 
                })
              : nav}
          </>
        )}

        {/* Page content */}
        <main className="flex-1 w-full min-w-0 overflow-x-hidden pt-[120px] md:pt-[60px]">
          {children}
        </main>
      </SidebarInset>
    </div>
  );
}

export default Layout;
