import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { AuthProvider } from "@/lib/context/auth-context";
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
  title: "VolunteerCal — Flexible Volunteer Scheduling for Churches, Nonprofits & Teams",
  description:
    "Auto-generate fair, conflict-free volunteer schedules across all your teams. Leaders review. Volunteers confirm. Works standalone or with Planning Center, Breeze, and Rock RMS.",
  keywords: [
    "volunteer scheduling",
    "church volunteer scheduling",
    "nonprofit volunteer management",
    "volunteer calendar",
    "scheduling software",
    "Planning Center alternative",
  ],
  openGraph: {
    title: "VolunteerCal — Flexible Volunteer Scheduling for Churches, Nonprofits & Teams",
    description:
      "Auto-generate fair, conflict-free volunteer schedules. Leaders review. Volunteers confirm and sync to their calendar.",
    url: "https://volunteercal.com",
    siteName: "VolunteerCal",
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
