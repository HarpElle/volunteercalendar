"use client";

interface NumericKeypadProps {
  value: string;
  maxLength?: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

/**
 * Large-format numeric keypad for kiosk phone lookup.
 * Touch-friendly 44px+ targets for iPad use.
 */
export function NumericKeypad({
  value,
  maxLength = 4,
  onChange,
  onSubmit,
}: NumericKeypadProps) {
  const handlePress = (digit: string) => {
    if (value.length < maxLength) {
      onChange(value + digit);
    }
  };

  const handleBackspace = () => {
    onChange(value.slice(0, -1));
  };

  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "back"],
  ];

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Display */}
      <div className="flex items-center justify-center gap-3 mb-2">
        {Array.from({ length: maxLength }, (_, i) => (
          <div
            key={i}
            className={`
              w-14 h-16 rounded-xl border-2 flex items-center justify-center
              text-3xl font-bold font-display transition-colors
              ${i < value.length
                ? "border-vc-coral bg-vc-coral/5 text-vc-indigo"
                : "border-gray-200 bg-white text-gray-300"
              }
            `}
          >
            {value[i] || ""}
          </div>
        ))}
      </div>

      {/* Keypad grid */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {keys.flat().map((key, i) => {
          if (key === "") {
            return <div key={i} />;
          }
          if (key === "back") {
            return (
              <button
                key={i}
                type="button"
                onClick={handleBackspace}
                disabled={value.length === 0}
                className="h-16 rounded-xl bg-gray-100 flex items-center justify-center
                  text-gray-600 active:bg-gray-200 transition-colors disabled:opacity-30"
              >
                <svg
                  className="w-7 h-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l7-7 12 0 0 14-12 0z"
                  />
                </svg>
              </button>
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => handlePress(key)}
              className="h-16 rounded-xl bg-white border border-gray-200
                text-2xl font-semibold text-vc-indigo
                active:bg-vc-coral/10 active:border-vc-coral transition-colors"
            >
              {key}
            </button>
          );
        })}
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={value.length < maxLength}
        className="w-full max-w-xs h-14 rounded-full bg-vc-coral text-white
          font-semibold text-lg mt-2 transition-all
          disabled:opacity-40 disabled:cursor-not-allowed
          active:scale-[0.98] active:bg-vc-coral/90"
      >
        Look Up
      </button>
    </div>
  );
}
