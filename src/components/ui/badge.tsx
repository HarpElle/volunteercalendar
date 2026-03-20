import { type HTMLAttributes } from "react";

type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "accent";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-vc-bg-cream text-vc-text-secondary",
  primary: "bg-vc-primary-100 text-vc-primary-700",
  success: "bg-vc-sage/15 text-vc-sage-dark",
  warning: "bg-vc-sand/20 text-vc-warning",
  danger: "bg-vc-danger/10 text-vc-danger",
  accent: "bg-vc-accent-100 text-vc-accent-700",
};

function Badge({ variant = "default", className = "", children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export { Badge, type BadgeProps };
