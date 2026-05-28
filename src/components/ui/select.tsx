import { type SelectHTMLAttributes, forwardRef, useId } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  /** Validation error message rendered below the select. */
  error?: string;
  /** Hint text rendered below the select (when no error is showing). */
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className = "", id, ...props }, ref) => {
    // Wave 5 H.1: stable IDs via useId; aria-invalid/aria-describedby for
    // the same reasons as Input. See input.tsx for rationale.
    const reactId = useId();
    const selectId = id || reactId;
    const errorId = `${selectId}-error`;
    const hintId = `${selectId}-hint`;
    const describedBy =
      [error ? errorId : null, hint ? hintId : null]
        .filter(Boolean)
        .join(" ") || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-vc-text"
          >
            {label}
            {props.required && <span className="ml-0.5 text-vc-coral">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`rounded-lg border border-vc-border bg-white px-3 py-2 text-base text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20 disabled:cursor-not-allowed disabled:opacity-50 ${error ? "border-vc-danger" : ""} ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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

Select.displayName = "Select";

export { Select, type SelectProps };
