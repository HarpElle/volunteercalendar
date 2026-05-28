import { type InputHTMLAttributes, forwardRef, useId } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Validation error message rendered below the input. */
  error?: string;
  /** Hint text rendered below the input (when no error is showing). */
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = "", id, ...props }, ref) => {
    // Wave 5 H.1: stable, collision-free IDs via React's useId. Falls back
    // to caller-supplied id (for explicit form/label wiring). The previous
    // label-toLowercase derivation collided when two inputs shared a label.
    const reactId = useId();
    const inputId = id || reactId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    // Build the describedby list: error wins over hint visually, but if
    // hint exists alongside an error we still associate both so screen
    // readers read the hint context too.
    const describedBy =
      [error ? errorId : null, hint ? hintId : null]
        .filter(Boolean)
        .join(" ") || undefined;

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
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`rounded-lg border border-vc-border bg-white px-3 py-2 text-base text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20 disabled:cursor-not-allowed disabled:opacity-50 ${error ? "border-vc-danger focus:border-vc-danger focus:ring-vc-danger/20" : ""} ${className}`}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-sm text-vc-danger">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-xs text-vc-text-muted">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export { Input, type InputProps };
