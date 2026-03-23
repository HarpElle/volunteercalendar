"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { SentNotification } from "@/lib/types";

type Tab = "history" | "send";

export default function NotificationsPage() {
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;
  const [tab, setTab] = useState<Tab>("history");
  const [notifications, setNotifications] = useState<SentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ type: string; message: string } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ type: string; message: string } | null>(null);

  useEffect(() => {
    if (!churchId || !user) return;
    loadNotifications();
  }, [churchId, user]);

  async function loadNotifications() {
    if (!churchId || !user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/reminders?church_id=${churchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function sendReminders(hours: 24 | 48) {
    if (!churchId || !user) return;
    setSending(hours === 24 ? "24h" : "48h");
    setSendResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId, hours }),
      });
      const data = await res.json();
      if (res.ok) {
        setSendResult({
          type: "success",
          message: `Sent ${data.sent_email} email${data.sent_email !== 1 ? "s" : ""} and ${data.sent_sms} SMS for ${data.target_date}. ${data.skipped} skipped.${data.errors ? ` Errors: ${data.errors.length}` : ""}`,
        });
        loadNotifications();
      } else {
        setSendResult({ type: "error", message: data.error || "Failed to send reminders" });
      }
    } catch {
      setSendResult({ type: "error", message: "Network error" });
    } finally {
      setSending(null);
    }
  }

  async function sendTestEmail() {
    if (!user) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/test-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: "reminder", email: user.email }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ type: "success", message: data.message });
      } else {
        setTestResult({ type: "error", message: data.error || "Failed to send test email" });
      }
    } catch {
      setTestResult({ type: "error", message: "Network error" });
    } finally {
      setSendingTest(false);
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case "sent":
      case "delivered":
        return "vc-sage";
      case "failed":
      case "bounced":
        return "vc-danger";
      default:
        return "vc-text-muted";
    }
  }

  function getChannelIcon(channel: string) {
    if (channel === "sms") {
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
      );
    }
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
      </svg>
    );
  }

  // Stats
  const emailCount = notifications.filter((n) => n.channel === "email").length;
  const smsCount = notifications.filter((n) => n.channel === "sms").length;
  const failedCount = notifications.filter((n) => n.status === "failed" || n.status === "bounced").length;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">Reminders</h1>
          <p className="mt-1 text-vc-text-secondary">
            Send reminders to volunteers and view delivery history.
          </p>
        </div>
      </div>

      {/* Tab buttons */}
      <div className="mb-6 flex gap-1 rounded-xl bg-vc-bg-warm p-1">
        {([
          { key: "send" as Tab, label: "Send Reminders" },
          { key: "history" as Tab, label: "History" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              tab === t.key
                ? "bg-white text-vc-indigo shadow-sm"
                : "text-vc-text-secondary hover:text-vc-indigo"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Send Reminders Tab */}
      {tab === "send" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-vc-border-light bg-white p-6">
            <h2 className="text-lg font-semibold text-vc-indigo mb-2">Send Scheduled Reminders</h2>
            <p className="text-sm text-vc-text-secondary mb-6">
              Send reminders to volunteers with upcoming assignments. Each volunteer will be notified based on their
              preferred channel (email, SMS, or both).
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-vc-border-light p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-vc-sand/20">
                    <svg className="h-5 w-5 text-vc-sand-dark" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-vc-indigo">48-Hour Reminder</h3>
                    <p className="text-xs text-vc-text-muted">For assignments 2 days out</p>
                  </div>
                </div>
                <Button
                  onClick={() => sendReminders(48)}
                  loading={sending === "48h"}
                  className="w-full"
                  variant="secondary"
                >
                  Send 48hr Reminders
                </Button>
              </div>

              <div className="rounded-xl border border-vc-border-light p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-vc-coral/10">
                    <svg className="h-5 w-5 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-vc-indigo">24-Hour Reminder</h3>
                    <p className="text-xs text-vc-text-muted">For assignments tomorrow</p>
                  </div>
                </div>
                <Button
                  onClick={() => sendReminders(24)}
                  loading={sending === "24h"}
                  className="w-full"
                >
                  Send 24hr Reminders
                </Button>
              </div>
            </div>

            {sendResult && (
              <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                sendResult.type === "success"
                  ? "bg-vc-sage/10 text-vc-sage-dark"
                  : "bg-vc-danger/5 text-vc-danger"
              }`}>
                {sendResult.message}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-vc-border-light bg-white p-6">
            <h2 className="text-lg font-semibold text-vc-indigo mb-2">Automation</h2>
            <p className="text-sm text-vc-text-secondary">
              To automate reminders, set up a cron job that calls <code className="rounded bg-vc-bg-warm px-1.5 py-0.5 text-xs text-vc-indigo">/api/reminders</code> with
              the <code className="rounded bg-vc-bg-warm px-1.5 py-0.5 text-xs text-vc-indigo">x-cron-secret</code> header.
              Vercel Cron or an external scheduler can trigger this daily.
            </p>
          </div>

          <div className="rounded-xl border border-dashed border-vc-border-light bg-white p-6">
            <h2 className="text-lg font-semibold text-vc-indigo mb-2">Test Email</h2>
            <p className="text-sm text-vc-text-secondary mb-4">
              Send a sample reminder email to <strong>{user?.email}</strong> to preview how it looks in your inbox.
            </p>
            <Button
              onClick={sendTestEmail}
              loading={sendingTest}
              variant="secondary"
            >
              Send Test Email
            </Button>
            {testResult && (
              <div className={`mt-3 rounded-lg px-4 py-3 text-sm ${
                testResult.type === "success"
                  ? "bg-vc-sage/10 text-vc-sage-dark"
                  : "bg-vc-danger/5 text-vc-danger"
              }`}>
                {testResult.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === "history" && (
        <div>
          {/* Stats bar */}
          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl border border-vc-border-light bg-white px-4 py-3 text-center">
              <p className="text-2xl font-bold text-vc-indigo">{emailCount}</p>
              <p className="text-xs text-vc-text-muted">Emails Sent</p>
            </div>
            <div className="rounded-xl border border-vc-border-light bg-white px-4 py-3 text-center">
              <p className="text-2xl font-bold text-vc-indigo">{smsCount}</p>
              <p className="text-xs text-vc-text-muted">SMS Sent</p>
            </div>
            <div className="rounded-xl border border-vc-border-light bg-white px-4 py-3 text-center">
              <p className={`text-2xl font-bold ${failedCount > 0 ? "text-vc-danger" : "text-vc-sage"}`}>{failedCount}</p>
              <p className="text-xs text-vc-text-muted">Failed</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-xl border border-vc-border-light bg-white p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-vc-bg-warm">
                <svg className="h-7 w-7 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-vc-indigo">No notifications yet</h3>
              <p className="mt-1 text-sm text-vc-text-secondary">
                Sent reminders and confirmation emails will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notif) => {
                const sentDate = new Date(notif.sent_at);
                return (
                  <div
                    key={notif.id}
                    className="flex items-center gap-3 rounded-xl border border-vc-border-light bg-white px-4 py-3"
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      notif.channel === "sms" ? "bg-vc-indigo/5" : "bg-vc-coral/5"
                    }`}>
                      <span className={notif.channel === "sms" ? "text-vc-indigo" : "text-vc-coral"}>
                        {getChannelIcon(notif.channel)}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-vc-indigo truncate">
                        {notif.volunteer_name}
                      </p>
                      <p className="text-xs text-vc-text-muted truncate">
                        {notif.channel === "sms" ? notif.volunteer_phone : notif.volunteer_email}
                        {" · "}
                        {notif.type.replace("_", " ").replace("reminder ", "")}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <Badge variant={notif.status === "sent" || notif.status === "delivered" ? "success" : "danger"}>
                        {notif.status}
                      </Badge>
                      <p className="mt-0.5 text-[10px] text-vc-text-muted">
                        {sentDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" "}
                        {sentDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>

                    {notif.error_message && (
                      <div className="shrink-0" title={notif.error_message}>
                        <svg className="h-4 w-4 text-vc-danger" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {notifications.length > 0 && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={loadNotifications}
                className="text-sm text-vc-text-secondary hover:text-vc-coral transition-colors"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
