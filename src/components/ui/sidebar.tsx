import * as React from "react";
import { cn } from "@/lib/utils";

interface SidebarProps extends React.ComponentProps<"div"> {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}

const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
  (
    {
      side = "left",
      variant = "sidebar",
      collapsible = "offcanvas",
      className,
      style,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      data-side={side}
      data-variant={variant}
      data-collapsible={collapsible === "offcanvas" ? collapsible : undefined}
      className={cn(
        "group peer fixed inset-y-0 z-50 flex h-full w-64 flex-col gap-4 border-r border-border bg-card p-6 transition-all duration-300 ease-in-out data-[side=left]:-translate-x-full data-[side=right]:translate-x-full md:data-[side=left]:translate-x-0 md:data-[side=right]:translate-x-0",
        className,
      )}
      style={style}
      {...props}
    />
  ),
);
Sidebar.displayName = "Sidebar";

const SidebarRail = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "pointer-events-none fixed inset-y-0 z-50 hidden w-64 transition-all duration-300 ease-in-out peer-data-[side=left]:-left-64 peer-data-[side=right]:-right-64 md:block md:peer-data-[collapsible=offcanvas]:left-0 md:peer-data-[side=right]:peer-data-[collapsible=offcanvas]:right-0",
        className,
      )}
      {...props}
    />
  ),
);
SidebarRail.displayName = "SidebarRail";

const SidebarInset = React.forwardRef<HTMLElement, React.ComponentProps<"main">>(
  ({ className, ...props }, ref) => (
    <main
      ref={ref}
      className={cn(
        "relative flex h-full w-full flex-1 flex-col gap-4 overflow-hidden transition-[margin] duration-300 ease-in-out md:ml-0 md:peer-data-[side=left]:ml-64 md:peer-data-[side=right]:mr-64",
        className,
      )}
      {...props}
    />
  ),
);
SidebarInset.displayName = "SidebarInset";

function sidebarPart(name: string, baseClass: string) {
  const Part = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
    ({ className, ...props }, ref) => (
      <div
        ref={ref}
        data-sidebar={name}
        className={cn(baseClass, className)}
        {...props}
      />
    ),
  );
  Part.displayName = `Sidebar${name[0].toUpperCase()}${name.slice(1)}`;
  return Part;
}

const SidebarHeader = sidebarPart("header", "flex flex-col gap-2");
const SidebarContent = sidebarPart(
  "content",
  "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
);
const SidebarGroup = sidebarPart(
  "group",
  "relative flex w-full flex-col gap-2",
);
const SidebarGroupContent = sidebarPart("group-content", "w-full");

const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu"
    className={cn("flex w-full min-w-0 flex-col gap-1", className)}
    {...props}
  />
));
SidebarMenu.displayName = "SidebarMenu";

const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar="menu-item"
    className={cn("group/menu-item relative", className)}
    {...props}
  />
));
SidebarMenuItem.displayName = "SidebarMenuItem";

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { isActive?: boolean }
>(({ isActive = false, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    data-sidebar="menu-button"
    data-active={isActive}
    className={cn(
      "peer/menu-button flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-all duration-200 focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
      className,
    )}
    {...props}
  />
));
SidebarMenuButton.displayName = "SidebarMenuButton";

export {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
};
