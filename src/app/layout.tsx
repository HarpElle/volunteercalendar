import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "VolunteerCalendar — Flexible Scheduling for Multi-Ministry Churches",
  description:
    "Auto-generate fair, conflict-free volunteer schedules across worship, kids, tech, greeters. Team leaders review. Volunteers confirm. Works standalone or with Planning Center.",
  keywords: [
    "church volunteer scheduling",
    "multi-ministry coordination",
    "volunteer calendar",
    "church scheduling software",
    "Planning Center alternative",
  ],
  openGraph: {
    title: "VolunteerCalendar — Flexible Scheduling for Multi-Ministry Churches",
    description:
      "Auto-generate fair, conflict-free volunteer schedules. Team leaders review. Volunteers confirm and sync to their calendar.",
    url: "https://volunteercalendar.org",
    siteName: "VolunteerCalendar",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${dmSerifDisplay.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
