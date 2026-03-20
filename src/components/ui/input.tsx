import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-vc-text"
          >
            {label}
            {props.required && <span className="ml-0.5 text-vc-coral">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`rounded-lg border border-vc-border bg-white px-3 py-2 text-base text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20 disabled:cursor-not-allowed disabled:opacity-50 ${error ? "border-vc-danger focus:border-vc-danger focus:ring-vc-danger/20" : ""} ${className}`}
          {...props}
        />
        {error && (
          <p className="text-sm text-vc-danger">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export { Input, type InputProps };
