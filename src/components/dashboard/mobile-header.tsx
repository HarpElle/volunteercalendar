"use client";

import Link from "next/link";

export function MobileHeader() {
  return (
    <header className="flex h-14 items-center border-b border-vc-border-light bg-white px-4 lg:hidden">
      <Link
        href="/dashboard"
        className="flex items-center gap-2"
        aria-label="VolunteerCal home"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-vc-indigo">
          <svg
            className="h-3.5 w-3.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
            />
          </svg>
        </div>
        <span className="text-base font-semibold text-vc-indigo">
          Volunteer<span className="text-vc-coral">Cal</span>
        </span>
      </Link>
    </header>
  );
}
