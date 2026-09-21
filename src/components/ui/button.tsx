import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/*
 * 호버는 **무채색**이다.
 *
 * ghost·outline·secondary 가 `accent` 를 쓰고 있었다. 그 토큰은 채도 45%(밝게)·
 * 22%(어둡게)이고 `accent-foreground` 는 아예 보라색 글자(240 60% 42%)라, 같은
 * 아이콘 단추라도 도우미 머리의 것만 보라로 뜨고 Nav·사이드바·챔피언 선택기의
 * 것은 회색으로 떴다. 앱에서 손으로 적어 둔 호버 16곳이 전부 `muted` 였다.
 *
 * 강조는 채도가 아니라 굵기와 명도로 한다는 이 제품의 규칙과도 `muted` 가 맞는다.
 * 여기서 고치면 낱낱이 덧칠하지 않아도 한 번에 맞는다.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:opacity-100 disabled:transform-none active:scale-[0.98] motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-sm hover:shadow-primary/20 active:bg-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-md hover:shadow-destructive/20 active:bg-destructive/95",
        outline:
          "border border-input bg-background hover:border-primary/50 hover:bg-muted hover:text-foreground hover:shadow-xs active:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-muted hover:text-foreground hover:shadow-xs active:bg-muted",
        ghost: "hover:bg-muted hover:text-foreground active:bg-muted",
        link: "text-primary underline-offset-4 hover:underline active:text-primary/80",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
