import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all select-none focus-visible:ring-1 focus-visible:ring-rose-500 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "border border-rose-600 bg-rose-600 text-white shadow-xs hover:bg-rose-500 active:scale-98",
        destructive: "border border-rose-600 bg-rose-600 text-white shadow-xs hover:bg-rose-700 active:scale-98",
        outline: "border border-zinc-200 bg-white text-zinc-700 shadow-xs hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 active:scale-98",
        secondary: "border border-zinc-200 bg-zinc-100 text-zinc-700 shadow-xs hover:bg-zinc-200 hover:text-zinc-900 active:scale-98",
        ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
        link: "text-rose-600 underline-offset-4 hover:underline",
        warning: "border border-amber-500 bg-amber-500 font-semibold text-white shadow-xs hover:bg-amber-600 active:scale-98",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-2.5 text-xs",
        lg: "h-10 rounded-lg px-6 text-sm font-semibold",
        icon: "size-8 rounded-md p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

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
    );
  }
);
Button.displayName = "Button";

export { Button };
