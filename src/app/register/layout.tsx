import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get Started — VolunteerCal",
  description:
    "Create your VolunteerCal account and start building fair, conflict-free volunteer schedules in minutes.",
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
