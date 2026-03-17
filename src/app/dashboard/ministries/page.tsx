"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  updateChurchDocument,
  removeChurchDocument,
} from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TIER_LIMITS } from "@/lib/constants";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import type { Ministry } from "@/lib/types";
import Link from "next/link";

const PRESET_COLORS = [
  "#E07A5F", // coral
  "#2D3047", // indigo
  "#81B29A", // sage
  "#F2CC8F", // sand
  "#7B68EE", // purple
  "#E84855", // red
  "#3D8BF2", // blue
  "#F29E4C", // orange
];

export default function MinistriesPage() {
  const { profile, user } = useAuth();
  const churchId = profile?.church_id;

  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [subscriptionTier, setSubscriptionTier] = useState("free");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!churchId) return;
    async function load() {
      try {
        const [docs, churchSnap] = await Promise.all([
          getChurchDocuments(churchId!, "ministries"),
          getDoc(doc(db, "churches", churchId!)),
        ]);
        setMinistries(docs as unknown as Ministry[]);
        if (churchSnap.exists()) {
          setSubscriptionTier((churchSnap.data().subscription_tier as string) || "free");
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  function resetForm() {
    setName("");
    setColor(PRESET_COLORS[0]);
    setDescription("");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(m: Ministry) {
    setName(m.name);
    setColor(m.color);
    setDescription(m.description);
    setEditingId(m.id);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!churchId || !user) return;
    setSaving(true);

    try {
      const data = {
        name,
        color,
        description,
        church_id: churchId,
        lead_user_id: user.uid,
        lead_email: user.email || "",
        ...(editingId ? {} : { created_at: new Date().toISOString() }),
      };

      if (editingId) {
        await updateChurchDocument(churchId, "ministries", editingId, data);
        setMinistries((prev) =>
          prev.map((m) => (m.id === editingId ? { ...m, ...data } : m))
        );
      } else {
        const ref = await addChurchDocument(churchId, "ministries", data);
        setMinistries((prev) => [...prev, { id: ref.id, ...data } as Ministry]);
      }
      resetForm();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!churchId) return;
    setDeleting(id);
    try {
      await removeChurchDocument(churchId, "ministries", id);
      setMinistries((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">Ministries</h1>
          <p className="mt-1 text-vc-text-secondary">
            Organize your volunteer teams by ministry.
          </p>
        </div>
        {!showForm && (() => {
          const limit = TIER_LIMITS[subscriptionTier]?.ministries ?? 1;
          const atLimit = limit !== Infinity && ministries.length >= limit;
          if (atLimit) {
            return (
              <Link href="/dashboard/billing">
                <Button variant="outline">
                  Upgrade to Add More Ministries
                </Button>
              </Link>
            );
          }
          return <Button onClick={() => setShowForm(true)}>Add Ministry</Button>;
        })()}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="mb-8 rounded-xl border border-vc-border-light bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-vc-indigo">
            {editingId ? "Edit Ministry" : "New Ministry"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Ministry Name"
              required
              placeholder="e.g., Worship, Kids, Tech"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Description"
              placeholder="Brief description of this ministry"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-vc-text">
                Color
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full transition-all ${
                      color === c ? "ring-2 ring-offset-2 ring-vc-indigo scale-110" : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="submit" loading={saving}>
                {editingId ? "Save Changes" : "Create Ministry"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Ministry list */}
      {loading ? (
        <div className="py-12 text-center text-vc-text-muted">Loading...</div>
      ) : ministries.length === 0 && !showForm ? (
        <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
          <p className="text-vc-text-secondary">No ministries yet.</p>
          <p className="mt-1 text-sm text-vc-text-muted">
            Add your first ministry to start organizing volunteers.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ministries.map((m) => (
            <div
              key={m.id}
              className="group relative rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                <div className="flex-1">
                  <h3 className="font-semibold text-vc-indigo">{m.name}</h3>
                  {m.description && (
                    <p className="mt-1 text-sm text-vc-text-muted">{m.description}</p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEdit(m)}
                  className="text-xs font-medium text-vc-text-secondary hover:text-vc-coral transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(m.id)}
                  disabled={deleting === m.id}
                  className="text-xs font-medium text-vc-text-muted hover:text-vc-danger transition-colors"
                >
                  {deleting === m.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
