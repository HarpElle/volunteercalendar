import { ModuleTabs, type ModuleTab } from "@/components/dashboard/module-tabs";

const CHECKIN_ICON =
  "M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z";

const CHECKIN_TABS: ModuleTab[] = [
  { id: "today", label: "Today", href: "/dashboard/checkin" },
  { id: "households", label: "Households", href: "/dashboard/checkin/households" },
  { id: "reports", label: "Reports", href: "/dashboard/checkin/reports" },
  { id: "room-setup", label: "Room Setup", href: "/dashboard/checkin/rooms" },
  { id: "import", label: "Import", href: "/dashboard/checkin/import" },
];

export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  // sr-only h1 with active tab is rendered INSIDE <ModuleTabs>.
  return (
    <>
      <ModuleTabs
        moduleLabel="Check-In"
        moduleIconPath={CHECKIN_ICON}
        tabs={CHECKIN_TABS}
      />
      {children}
    </>
  );
}
