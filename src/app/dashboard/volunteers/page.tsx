"use client";

import { useEffect, useState, useRef, type FormEvent } from "react";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  updateChurchDocument,
  removeChurchDocument,
} from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Volunteer, Ministry } from "@/lib/types";

export default function VolunteersPage() {
  const { profile } = useAuth();
  const churchId = profile?.church_id;

  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{ count: number; errors: string[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!churchId) return;
    async function load() {
      try {
        const [vols, mins] = await Promise.all([
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "ministries"),
        ]);
        setVolunteers(vols as unknown as Volunteer[]);
        setMinistries(mins as unknown as Ministry[]);
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
    setEmail("");
    setPhone("");
    setSelectedMinistries([]);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(v: Volunteer) {
    setName(v.name);
    setEmail(v.email);
    setPhone(v.phone || "");
    setSelectedMinistries(v.ministry_ids);
    setEditingId(v.id);
    setShowForm(true);
    setShowImport(false);
  }

  function toggleMinistry(id: string) {
    setSelectedMinistries((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!churchId) return;
    setSaving(true);

    try {
      const data: Omit<Volunteer, "id"> = {
        name,
        email,
        phone: phone || null,
        church_id: churchId,
        user_id: null,
        ministry_ids: selectedMinistries,
        role_ids: [],
        household_id: null,
        availability: {
          blockout_dates: [],
          recurring_unavailable: [],
          preferred_frequency: 2,
          max_roles_per_month: 4,
        },
        reminder_preferences: { channels: ["email"] },
        stats: {
          times_scheduled_last_90d: 0,
          last_served_date: null,
          decline_count: 0,
          no_show_count: 0,
        },
        imported_from: "manual",
        status: "active" as const,
        membership_id: null,
        created_at: new Date().toISOString(),
      };

      if (editingId) {
        const { created_at, imported_from, stats, ...updateData } = data;
        await updateChurchDocument(churchId, "volunteers", editingId, updateData);
        setVolunteers((prev) =>
          prev.map((v) => (v.id === editingId ? { ...v, ...updateData } : v))
        );
      } else {
        const ref = await addChurchDocument(churchId, "volunteers", data);
        setVolunteers((prev) => [...prev, { id: ref.id, ...data }]);
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
      await removeChurchDocument(churchId, "volunteers", id);
      setVolunteers((prev) => prev.filter((v) => v.id !== id));
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !churchId) return;
    setSaving(true);
    setImportStatus(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        setImportStatus({ count: 0, errors: ["CSV file is empty or has no data rows."] });
        setSaving(false);
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const nameIdx = headers.findIndex((h) => h === "name" || h === "full name" || h === "volunteer");
      const emailIdx = headers.findIndex((h) => h === "email" || h === "email address");
      const phoneIdx = headers.findIndex((h) => h === "phone" || h === "phone number" || h === "mobile");

      if (nameIdx === -1) {
        setImportStatus({ count: 0, errors: ["CSV must have a 'name' column."] });
        setSaving(false);
        return;
      }

      let imported = 0;
      const errors: string[] = [];
      const newVolunteers: Volunteer[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const volName = cols[nameIdx]?.trim();
        if (!volName) {
          errors.push(`Row ${i + 1}: missing name, skipped.`);
          continue;
        }

        const volData: Omit<Volunteer, "id"> = {
          name: volName,
          email: emailIdx >= 0 ? cols[emailIdx]?.trim() || "" : "",
          phone: phoneIdx >= 0 ? cols[phoneIdx]?.trim() || null : null,
          church_id: churchId,
          user_id: null,
          ministry_ids: [],
          role_ids: [],
          household_id: null,
          availability: {
            blockout_dates: [],
            recurring_unavailable: [],
            preferred_frequency: 2,
            max_roles_per_month: 4,
          },
          reminder_preferences: { channels: ["email"] },
          stats: {
            times_scheduled_last_90d: 0,
            last_served_date: null,
            decline_count: 0,
            no_show_count: 0,
          },
          imported_from: "csv",
          status: "active" as const,
          membership_id: null,
          created_at: new Date().toISOString(),
        };

        try {
          const ref = await addChurchDocument(churchId, "volunteers", volData);
          newVolunteers.push({ id: ref.id, ...volData });
          imported++;
        } catch {
          errors.push(`Row ${i + 1}: failed to save "${volName}".`);
        }
      }

      setVolunteers((prev) => [...prev, ...newVolunteers]);
      setImportStatus({ count: imported, errors });
    } catch {
      setImportStatus({ count: 0, errors: ["Failed to read CSV file."] });
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function getMinistryName(id: string) {
    return ministries.find((m) => m.id === id)?.name || id;
  }

  function getMinistryColor(id: string) {
    return ministries.find((m) => m.id === id)?.color || "#9A9BB5";
  }

  const filtered = searchQuery
    ? volunteers.filter(
        (v) =>
          v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : volunteers;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">Volunteers</h1>
          <p className="mt-1 text-vc-text-secondary">
            {volunteers.length} volunteer{volunteers.length !== 1 ? "s" : ""} in your church.
          </p>
        </div>
        {!showForm && !showImport && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowImport(true); setShowForm(false); }}>
              Import CSV
            </Button>
            <Button onClick={() => { setShowForm(true); setShowImport(false); }}>
              Add Volunteer
            </Button>
          </div>
        )}
      </div>

      {/* CSV Import */}
      {showImport && (
        <div className="mb-8 rounded-xl border border-vc-border-light bg-white p-6">
          <h2 className="mb-2 text-lg font-semibold text-vc-indigo">Import from CSV</h2>
          <p className="mb-4 text-sm text-vc-text-muted">
            Upload a CSV with columns: <strong>name</strong> (required), <strong>email</strong>, <strong>phone</strong>.
            You can assign ministries after import.
          </p>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCSVImport}
              className="text-sm text-vc-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-vc-coral file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:cursor-pointer hover:file:bg-vc-coral-dark"
            />
            <Button variant="ghost" onClick={() => { setShowImport(false); setImportStatus(null); }}>
              Cancel
            </Button>
          </div>
          {saving && <p className="mt-3 text-sm text-vc-text-muted">Importing...</p>}
          {importStatus && (
            <div className="mt-4">
              {importStatus.count > 0 && (
                <p className="text-sm font-medium text-vc-sage">
                  Successfully imported {importStatus.count} volunteer{importStatus.count !== 1 ? "s" : ""}.
                </p>
              )}
              {importStatus.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {importStatus.errors.map((err, i) => (
                    <p key={i} className="text-sm text-vc-danger">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manual form */}
      {showForm && (
        <div className="mb-8 rounded-xl border border-vc-border-light bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-vc-indigo">
            {editingId ? "Edit Volunteer" : "Add Volunteer"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full Name"
                required
                placeholder="Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                label="Email"
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Input
              label="Phone"
              type="tel"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            {ministries.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-vc-text">
                  Ministries
                </label>
                <div className="flex flex-wrap gap-2">
                  {ministries.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMinistry(m.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                        selectedMinistries.includes(m.id)
                          ? "border-transparent text-white"
                          : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                      }`}
                      style={
                        selectedMinistries.includes(m.id)
                          ? { backgroundColor: m.color }
                          : undefined
                      }
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: selectedMinistries.includes(m.id) ? "white" : m.color }}
                      />
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" loading={saving}>
                {editingId ? "Save Changes" : "Add Volunteer"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      {volunteers.length > 5 && (
        <div className="mb-4">
          <input
            type="search"
            placeholder="Search volunteers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-sm rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
          />
        </div>
      )}

      {/* Volunteer list */}
      {loading ? (
        <div className="py-12 text-center text-vc-text-muted">Loading...</div>
      ) : volunteers.length === 0 && !showForm && !showImport ? (
        <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
          <p className="text-vc-text-secondary">No volunteers yet.</p>
          <p className="mt-1 text-sm text-vc-text-muted">
            Add volunteers manually or import them from a CSV file.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-vc-border-light bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-vc-border-light">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Name</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Email</th>
                  <th className="hidden px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted sm:table-cell">Phone</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Ministries</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vc-border-light">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-vc-bg-warm/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-vc-indigo">{v.name}</td>
                    <td className="px-5 py-3 text-vc-text-secondary">{v.email || "—"}</td>
                    <td className="hidden px-5 py-3 text-vc-text-secondary sm:table-cell">{v.phone || "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {v.ministry_ids.length > 0 ? (
                          v.ministry_ids.map((mid) => (
                            <span
                              key={mid}
                              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
                              style={{ backgroundColor: getMinistryColor(mid) + "15", color: getMinistryColor(mid) }}
                            >
                              {getMinistryName(mid)}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-vc-text-muted">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(v)}
                          className="text-xs font-medium text-vc-text-secondary hover:text-vc-coral transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(v.id)}
                          disabled={deleting === v.id}
                          className="text-xs font-medium text-vc-text-muted hover:text-vc-danger transition-colors"
                        >
                          {deleting === v.id ? "..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && searchQuery && (
            <div className="px-5 py-8 text-center text-sm text-vc-text-muted">
              No volunteers match &ldquo;{searchQuery}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Parse a single CSV line handling quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
