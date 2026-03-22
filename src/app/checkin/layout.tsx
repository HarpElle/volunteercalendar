import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check-In | VolunteerCal",
  description: "Children's check-in kiosk",
};

/**
 * Blank layout for kiosk mode — no nav, no sidebar, no scrolling.
 * Used by /checkin (kiosk) and /checkin/room/[roomId] (teacher view).
 */
export default function CheckInLayout({
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
