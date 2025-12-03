import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, collisionPadding, ...props }, ref) => {
  const [isMobile, setIsMobile] = React.useState(false);
  
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={
          collisionPadding ??
          (isMobile ? 16 : { top: 8, bottom: 8, left: 0, right: 0 })
        }
        avoidCollisions={!isMobile}
        side={isMobile ? "bottom" : props.side}
        align={isMobile ? "center" : props.align}
        className={cn(
          // 최대 높이를 제한하고 내부 스크롤을 허용하여 긴 툴팁이 화면 밖으로 나가지 않도록 처리
          // 모바일은 화면을 더 많이 쓰고, 데스크톱은 약간 더 여유를 둔다.
          // 잔상처럼 보이는 효과를 줄이기 위해 애니메이션/트랜지션은 제거한다.
          "z-[100] overflow-y-auto overflow-x-hidden rounded-lg border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md",
          isMobile ? "max-h-[80vh]" : "max-h-[60vh]",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
})
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

