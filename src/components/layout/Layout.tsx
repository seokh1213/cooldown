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
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  return (
    <div className="min-h-screen bg-background flex w-full">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={closeSidebar}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      <SidebarRail />
      
      <SidebarInset 
        className="flex flex-col transition-[margin] duration-300 ease-in-out"
        style={{
          marginLeft: isCollapsed ? "4rem" : "16rem",
        }}
      >
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center gap-4 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Open menu"
            className="h-9 w-9"
          >
            <Menu className="w-5 h-5" />
          </Button>
        </header>

        {/* Navigation bar */}
        {nav && (
          <div className="w-full shrink-0">
            {nav}
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 w-full min-w-0 overflow-x-hidden">
          {children}
        </main>
      </SidebarInset>
    </div>
  );
}

export default Layout;
