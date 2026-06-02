/**
 * Wave 12 B — pins the override-prefs contract for day-of urgency.
 *
 * The whole reason this helper exists is to make the contrast
 * between "normal" and "urgent" obvious + regression-tested:
 * urgent absences must reach the scheduler even if they've opted
 * out of SMS or email, because the church needs the news in time
 * to react. If a future change starts honoring SMS prefs on the
 * urgent path, this test fails before prod sees it.
 */

import { describe, it, expect } from "vitest";
import { decideAbsenceChannels } from "@/lib/server/absence-channels";

describe("decideAbsenceChannels", () => {
  describe("normal (non-urgent) path", () => {
    it("respects both prefs when both are on", () => {
      const d = decideAbsenceChannels({
        urgent: false,
        prefsEmail: true,
        prefsSms: true,
        hasEmail: true,
        hasPhone: true,
      });
      expect(d).toEqual({ email: true, sms: true });
    });

    it("suppresses SMS when prefsSms=false", () => {
      const d = decideAbsenceChannels({
        urgent: false,
        prefsEmail: true,
        prefsSms: false,
        hasEmail: true,
        hasPhone: true,
      });
      expect(d).toEqual({ email: true, sms: false });
    });

    it("suppresses email when prefsEmail=false", () => {
      const d = decideAbsenceChannels({
        urgent: false,
        prefsEmail: false,
        prefsSms: true,
        hasEmail: true,
        hasPhone: true,
      });
      expect(d).toEqual({ email: false, sms: true });
    });

    it("can't send email with no email on file even if pref is on", () => {
      const d = decideAbsenceChannels({
        urgent: false,
        prefsEmail: true,
        prefsSms: true,
        hasEmail: false,
        hasPhone: true,
      });
      expect(d.email).toBe(false);
    });

    it("can't send SMS with no phone on file even if pref is on", () => {
      const d = decideAbsenceChannels({
        urgent: false,
        prefsEmail: true,
        prefsSms: true,
        hasEmail: true,
        hasPhone: false,
      });
      expect(d.sms).toBe(false);
    });
  });

  describe("urgent (day-of) path — OVERRIDES PREFS", () => {
    it("sends BOTH email and SMS even when both prefs are off", () => {
      // THE regression we're pinning: urgent must override opt-out.
      const d = decideAbsenceChannels({
        urgent: true,
        prefsEmail: false,
        prefsSms: false,
        hasEmail: true,
        hasPhone: true,
      });
      expect(d).toEqual({ email: true, sms: true });
    });

    it("sends SMS to a scheduler who explicitly opted out of SMS", () => {
      const d = decideAbsenceChannels({
        urgent: true,
        prefsEmail: true,
        prefsSms: false,
        hasEmail: true,
        hasPhone: true,
      });
      expect(d.sms).toBe(true);
    });

    it("sends email to a scheduler who explicitly opted out of email", () => {
      const d = decideAbsenceChannels({
        urgent: true,
        prefsEmail: false,
        prefsSms: true,
        hasEmail: true,
        hasPhone: true,
      });
      expect(d.email).toBe(true);
    });

    it("still can't send email if no email on file", () => {
      // We never invent contact info. Override prefs, NOT physics.
      const d = decideAbsenceChannels({
        urgent: true,
        prefsEmail: true,
        prefsSms: true,
        hasEmail: false,
        hasPhone: true,
      });
      expect(d.email).toBe(false);
    });

    it("still can't send SMS if no phone on file", () => {
      const d = decideAbsenceChannels({
        urgent: true,
        prefsEmail: true,
        prefsSms: true,
        hasEmail: true,
        hasPhone: false,
      });
      expect(d.sms).toBe(false);
    });

    it("returns both false if recipient has no contact info at all", () => {
      // Edge case: account with no email and no phone. We can't
      // notify them on any channel, urgent or not.
      const d = decideAbsenceChannels({
        urgent: true,
        prefsEmail: true,
        prefsSms: true,
        hasEmail: false,
        hasPhone: false,
      });
      expect(d).toEqual({ email: false, sms: false });
    });
  });
});
