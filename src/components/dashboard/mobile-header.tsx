"use client";

interface MobileHeaderProps {
  onMenuOpen: () => void;
}

export function MobileHeader({ onMenuOpen }: MobileHeaderProps) {
  return (
    <header className="flex h-16 items-center gap-4 border-b border-vc-border-light bg-white px-4 lg:hidden">
      <button
        onClick={onMenuOpen}
        className="rounded-lg p-2 text-vc-text-secondary hover:bg-vc-bg-warm"
        aria-label="Open navigation"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>
      <span className="text-lg font-semibold text-vc-indigo">
        Volunteer<span className="text-vc-coral">Cal</span>
      </span>
    </header>
  );
}
