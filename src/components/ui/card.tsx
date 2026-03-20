import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "bordered" | "elevated" | "tappable";
}

function Card({ variant = "default", className = "", children, ...props }: CardProps) {
  const variantStyles = {
    default: "bg-white",
    bordered: "bg-white border border-vc-border",
    elevated: "bg-white shadow-md",
    tappable: "bg-white border border-vc-border-light cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]",
  };

  return (
    <div
      className={`rounded-xl p-6 ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

function CardHeader({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`mb-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

function CardTitle({ className = "", children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`text-lg font-semibold text-vc-text ${className}`} {...props}>
      {children}
    </h3>
  );
}

function CardDescription({ className = "", children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-sm text-vc-text-secondary ${className}`} {...props}>
      {children}
    </p>
  );
}

function CardContent({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
