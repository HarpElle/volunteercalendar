import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Family Portal — VolunteerCal",
  description: "View and manage your family check-in information",
};

export default function GuardianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-vc-bg">
      {/* Minimal header */}
      <header className="border-b border-vc-border-light bg-white/80 backdrop-blur-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center">
          <span className="text-sm font-semibold text-vc-indigo tracking-wide">
            VolunteerCal
          </span>
          <span className="mx-2 text-vc-border-light">|</span>
          <span className="text-sm text-vc-text-secondary">
            Family Portal
          </span>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
