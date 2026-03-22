import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Room Display | VolunteerCal",
  description: "Room availability display for wall-mounted screens",
};

/**
 * Blank layout for room display mode — no nav, no sidebar.
 * Used by /display/room/[roomId] (wall-mounted tablet signage).
 */
export default function DisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-vc-bg font-sans">
      {children}
    </div>
  );
}
