"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import type { UserNotification, UserNotificationType } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Type → icon / color mapping                                        */
/* ------------------------------------------------------------------ */

const NOTIF_META: Record<
  UserNotificationType,
  { iconPath: string; color: string }
> = {
  schedule_assignment: {
    iconPath:
      "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
    color: "text-vc-coral",
  },
  reminder: {
    iconPath:
      "M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0",
    color: "text-vc-coral",
  },
  assignment_change: {
    iconPath:
      "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182",
    color: "text-vc-indigo",
  },
  replacement_assignment: {
    iconPath:
      "M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z",
    color: "text-vc-coral",
  },
  swap_request: {
    iconPath:
      "M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
    color: "text-vc-indigo",
  },
  swap_resolved: {
    iconPath:
      "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    color: "text-vc-sage",
  },
  membership_approved: {
    iconPath:
      "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
    color: "text-vc-sage",
  },
  role_promotion: {
    iconPath:
      "M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z",
    color: "text-vc-indigo",
  },
  prerequisite_milestone: {
    iconPath:
      "M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5",
    color: "text-vc-sage",
  },
  prerequisite_expiry: {
    iconPath:
      "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z",
    color: "text-vc-coral",
  },
  absence_alert: {
    iconPath:
      "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z",
    color: "text-vc-coral",
  },
  self_removal_alert: {
    iconPath:
      "M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z",
    color: "text-vc-coral",
  },
};

/* ------------------------------------------------------------------ */
/*  Relative time helper                                               */
/* ------------------------------------------------------------------ */

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/*  Date grouping                                                      */
/* ------------------------------------------------------------------ */

type DateGroup = "Today" | "Yesterday" | "Earlier";

function getDateGroup(iso: string): DateGroup {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d >= today) return "Today";
  if (d >= yesterday) return "Yesterday";
  return "Earlier";
}

function groupNotifications(
  notifications: UserNotification[],
): { label: DateGroup; items: UserNotification[] }[] {
  const groups: Map<DateGroup, UserNotification[]> = new Map();
  for (const n of notifications) {
    const group = getDateGroup(n.created_at);
    const existing = groups.get(group) || [];
    existing.push(n);
    groups.set(group, existing);
  }
  const order: DateGroup[] = ["Today", "Yesterday", "Earlier"];
  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, items: groups.get(label)! }));
}

/* ------------------------------------------------------------------ */
/*  NotificationRow                                                    */
/* ------------------------------------------------------------------ */

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: UserNotification;
  onMarkRead: (n: UserNotification) => void;
}) {
  const meta = NOTIF_META[notification.type] ?? NOTIF_META.reminder;

  return (
    <button
      onClick={() => onMarkRead(notification)}
      className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-vc-sand/20 active:bg-vc-sand/30 sm:px-5 ${
        !notification.read ? "bg-vc-bg-warm" : ""
      }`}
    >
      {/* Icon */}
      <div className={`mt-0.5 shrink-0 ${meta.color}`}>
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d={meta.iconPath}
          />
        </svg>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm leading-snug ${
            !notification.read
              ? "font-semibold text-vc-indigo"
              : "font-medium text-vc-text-secondary"
          }`}
        >
          {notification.title}
        </p>
        <p className="mt-0.5 truncate text-sm text-vc-text-muted">
          {notification.body}
        </p>
        <p className="mt-1 text-xs text-vc-text-muted/70">
          {relativeTime(notification.created_at)}
        </p>
      </div>

      {/* Unread dot */}
      {!notification.read && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-vc-coral" />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function InboxPage() {
  const router = useRouter();
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  /* ---- Fetch notifications ---- */
  const fetchNotifications = useCallback(
    async (cursor?: string) => {
      if (!churchId || !user) return;

      const isLoadMore = !!cursor;
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({ church_id: churchId, limit: "30" });
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(`/api/user/notifications?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const fetched: UserNotification[] = data.notifications ?? [];
          setNotifications((prev) =>
            isLoadMore ? [...prev, ...fetched] : fetched,
          );
          setHasMore(data.has_more ?? false);
          setNextCursor(data.next_cursor ?? null);
        }
      } catch {
        // silent
      } finally {
        if (isLoadMore) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [churchId, user],
  );

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  /* ---- Mark single as read + navigate ---- */
  const handleMarkRead = useCallback(
    async (n: UserNotification) => {
      if (!user || !churchId) return;

      // Optimistic update
      if (!n.read) {
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
        );
      }

      // Navigate first for responsiveness
      const linkHref = n.metadata?.link_href;
      if (linkHref) {
        router.push(linkHref);
      }

      // Fire mark-read in background
      if (!n.read) {
        try {
          const token = await user.getIdToken();
          await fetch("/api/user/notifications/read", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              notification_id: n.id,
              church_id: churchId,
            }),
          });
        } catch {
          // silent — optimistic update already applied
        }
      }
    },
    [user, churchId, router],
  );

  /* ---- Mark all as read ---- */
  const handleMarkAllRead = useCallback(async () => {
    if (!user || !churchId) return;
    setMarkingAll(true);

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    try {
      const token = await user.getIdToken();
      await fetch("/api/user/notifications/read", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId }),
      });
    } catch {
      // Revert on failure
      fetchNotifications();
    } finally {
      setMarkingAll(false);
    }
  }, [user, churchId, fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const grouped = groupNotifications(notifications);

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-vc-indigo">
            Inbox
          </h1>
          {unreadCount > 0 && (
            <p className="mt-0.5 text-sm text-vc-text-muted">
              {unreadCount} unread
            </p>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-vc-coral transition-colors hover:bg-vc-coral/10 active:bg-vc-coral/20 disabled:opacity-50"
          >
            {markingAll ? (
              <Spinner size="sm" />
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            )}
            Mark all read
          </button>
        )}
      </div>

      {/* Empty state */}
      {notifications.length === 0 && (
        <EmptyState
          icon={
            <svg
              className="h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
              />
            </svg>
          }
          title="You're all caught up"
          description="No notifications yet. You'll see schedule assignments, reminders, and updates here."
        />
      )}

      {/* Notification list */}
      {notifications.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-vc-border-light bg-white shadow-sm">
          {grouped.map((group, gi) => (
            <div key={group.label}>
              {/* Section header */}
              <div
                className={`border-b border-vc-border-light bg-vc-bg px-4 py-2 sm:px-5 ${
                  gi > 0 ? "border-t" : ""
                }`}
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                  {group.label}
                </span>
              </div>

              {/* Items */}
              {group.items.map((n, ni) => (
                <div
                  key={n.id}
                  className={
                    ni < group.items.length - 1
                      ? "border-b border-vc-border-light"
                      : ""
                  }
                >
                  <NotificationRow
                    notification={n}
                    onMarkRead={handleMarkRead}
                  />
                </div>
              ))}
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="border-t border-vc-border-light px-4 py-3 text-center sm:px-5">
              <button
                onClick={() => {
                  if (nextCursor) fetchNotifications(nextCursor);
                }}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-vc-indigo transition-colors hover:bg-vc-sand/30 active:bg-vc-sand/50 disabled:opacity-50"
              >
                {loadingMore ? (
                  <Spinner size="sm" />
                ) : (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m19.5 8.25-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                )}
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
