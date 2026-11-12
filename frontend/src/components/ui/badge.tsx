import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-500",
  {
    variants: {
      variant: {
        default: "border-rose-200 bg-rose-50 text-rose-700 shadow-2xs",
        secondary: "border-zinc-200 bg-zinc-100 text-zinc-700",
        destructive: "border-rose-200 bg-rose-50 text-rose-700 shadow-2xs",
        outline: "border-zinc-200 bg-white text-zinc-700",
        success: "border-emerald-200 bg-emerald-50 text-emerald-700",
        warning: "border-amber-200 bg-amber-50 text-amber-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
