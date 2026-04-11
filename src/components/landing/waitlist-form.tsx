"use client";

import { useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AnimateIn } from "./animate-in";

const WORKFLOW_OPTIONS = [
  { value: "", label: "How would you like scheduling to work?" },
  { value: "centralized", label: "Centralized (one admin manages all)" },
  { value: "ministry-first", label: "Team-First (each team manages their own)" },
  { value: "hybrid", label: "Hybrid (auto-draft + team tweaks)" },
  { value: "self-service", label: "Self-Service (volunteers sign up for open slots)" },
  { value: "not-sure", label: "Not sure yet" },
];

const CURRENT_TOOL_OPTIONS = [
  { value: "", label: "What do you use now?" },
  { value: "planning-center", label: "Planning Center" },
  { value: "breeze", label: "Breeze" },
  { value: "rock", label: "Rock RMS" },
  { value: "spreadsheets", label: "Spreadsheets / Google Sheets" },
  { value: "signupgenius", label: "SignUpGenius" },
  { value: "email", label: "Email / text messages" },
  { value: "other", label: "Other" },
  { value: "none", label: "Nothing yet" },
];

export function WaitlistForm() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          church_name: data.get("church_name"),
          team_size: Number(data.get("team_size")) || 0,
          current_tool: data.get("current_tool"),
          workflow_preference: data.get("workflow_preference"),
          phone: data.get("phone") || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Something went wrong");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inputClasses =
    "w-full rounded-xl border border-vc-border bg-white px-4 py-3 text-base text-vc-indigo placeholder:text-vc-text-muted/60 focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20 transition-colors";

  const selectClasses =
    "w-full rounded-xl border border-vc-border bg-white px-4 py-3 text-base text-vc-indigo focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20 transition-colors appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239A9BB5%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:20px] bg-[right_12px_center] bg-no-repeat pr-10";

  return (
    <section id="waitlist" className="relative bg-vc-bg-warm px-6 py-24 bg-noise">
      {/* Decorative gradient */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-vc-coral-glow blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-xl">
        <AnimatePresence mode="wait">
          {submitted ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-vc-sage/10">
                <motion.svg
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="h-10 w-10 text-vc-sage"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                >
                  <motion.path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  />
                </motion.svg>
              </div>
              <h2 className="font-editorial text-3xl text-vc-indigo">
                Thanks for reaching out!
              </h2>
              <p className="mt-3 text-lg text-vc-text-secondary">
                We&apos;ll be in touch within one business day to help you
                evaluate the fit and get started.
              </p>
            </motion.div>
          ) : (
            <motion.div key="form" exit={{ opacity: 0, y: -20 }}>
              <AnimateIn>
                <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-vc-coral">
                  Need Help Getting Started?
                </p>
                <h2 className="mt-3 text-center font-editorial text-4xl text-vc-indigo sm:text-5xl">
                  Talk to a real person
                </h2>
                <p className="mx-auto mt-4 max-w-md text-center text-lg text-vc-text-secondary">
                  Not sure if VolunteerCal is right for your organization? Share your details and we&apos;ll reach out to help you evaluate the fit.
                </p>
              </AnimateIn>

              <AnimateIn delay={0.2}>
                <form
                  onSubmit={handleSubmit}
                  className="mt-10 space-y-4 rounded-2xl border border-vc-border-light bg-white p-8 shadow-xl shadow-black/[0.03]"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-vc-indigo">
                        Your Name
                      </label>
                      <input
                        id="name"
                        name="name"
                        required
                        placeholder="Jason Paschall"
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-vc-indigo">
                        Email
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        placeholder="you@example.org"
                        className={inputClasses}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="church_name" className="mb-1.5 block text-sm font-medium text-vc-indigo">
                        Organization Name
                      </label>
                      <input
                        id="church_name"
                        name="church_name"
                        required
                        placeholder="Anchor Falls Church, Habitat for Humanity, etc."
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label htmlFor="team_size" className="mb-1.5 block text-sm font-medium text-vc-indigo">
                        Team Size
                      </label>
                      <input
                        id="team_size"
                        name="team_size"
                        type="number"
                        placeholder="50 volunteers"
                        min={1}
                        className={inputClasses}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="current_tool" className="mb-1.5 block text-sm font-medium text-vc-indigo">
                      Current Scheduling Tool
                    </label>
                    <select
                      id="current_tool"
                      name="current_tool"
                      required
                      defaultValue=""
                      className={selectClasses}
                    >
                      {CURRENT_TOOL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} disabled={opt.value === ""}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="workflow_preference" className="mb-1.5 block text-sm font-medium text-vc-indigo">
                      Preferred Workflow
                    </label>
                    <select
                      id="workflow_preference"
                      name="workflow_preference"
                      required
                      defaultValue=""
                      className={selectClasses}
                    >
                      {WORKFLOW_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} disabled={opt.value === ""}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-vc-indigo">
                      Phone <span className="text-vc-text-muted">(optional)</span>
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      className={inputClasses}
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-full bg-vc-coral px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-vc-coral/20 transition-all hover:bg-vc-coral-dark hover:shadow-xl hover:shadow-vc-coral/30 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Joining...
                      </span>
                    ) : (
                      "Send My Info"
                    )}
                  </button>

                  <p className="text-center text-xs text-vc-text-muted">
                    No spam, ever. We&apos;ll only reach out to help with VolunteerCal.
                  </p>
                </form>
              </AnimateIn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
