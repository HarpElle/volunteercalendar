"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface AddPeopleMenuProps {
  onSelect: (mode: "individual" | "csv" | "chms") => void;
}

export function AddPeopleMenu({ onSelect }: AddPeopleMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-1.5">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add People
        </span>
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-vc-border-light bg-white p-2 shadow-xl shadow-black/[0.08]">
            <button
              onClick={() => { setOpen(false); onSelect("individual"); }}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-vc-bg-warm"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-vc-indigo">Add person</p>
                <p className="text-xs text-vc-text-muted">Add and send email invitation</p>
              </div>
            </button>
            <button
              onClick={() => { setOpen(false); onSelect("csv"); }}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-vc-bg-warm"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <div>
                <p className="text-sm font-medium text-vc-indigo">Import CSV</p>
                <p className="text-xs text-vc-text-muted">Upload a spreadsheet</p>
              </div>
            </button>
            <button
              onClick={() => { setOpen(false); onSelect("chms"); }}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-vc-bg-warm"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
              <div>
                <p className="text-sm font-medium text-vc-indigo">Import from ChMS</p>
                <p className="text-xs text-vc-text-muted">Planning Center, Breeze, Rock RMS</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
