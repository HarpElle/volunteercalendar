a1-ipad-enrollment-with-code - Chrome extension UI blocked automation on /kiosk before I could fill the temporary activation code; the temporary activation was cleaned up.
a1-kiosk-landing-after-activation - Skipped to avoid consuming/persisting a kiosk token after Chrome automation became blocked; no fake landing state captured.
a1-ipad-pwa-add-to-home-screen - Requires real iPad Safari share sheet / iOS browser chrome, which Codex Chrome automation cannot capture.
a2-kiosk-start-screen - No usable enrolled kiosk token after temp activation cleanup, and Chrome automation became blocked on /kiosk.
a2-kiosk-qr-scanner-active - Requires active enrolled kiosk plus camera/permission UI; Chrome automation was blocked before kiosk activation.
a2-kiosk-phone-last4 - Requires active enrolled kiosk token and production household lookup; Chrome automation was blocked before kiosk activation.
a2-kiosk-child-selection-with-badges - Requires active kiosk plus allergy and blocked-pickup household state; no test harness endpoint was present and Chrome automation was blocked.
a2-kiosk-allergy-confirm - Requires active kiosk check-in flow with selected allergic child; no test harness endpoint was present and Chrome automation was blocked.
a2-kiosk-recipient-selection - Requires active kiosk check-in flow with authorized pickup contacts; no test harness endpoint was present and Chrome automation was blocked.
a2-kiosk-success-with-code - Requires completing a live check-in session; skipped to avoid leaving production sessions.
a2-kiosk-pickup-ready-button-visible - Requires a currently checked-in child; production dashboard showed 0 checked-in children.
a3-teacher-view-empty-state - Requires phone viewport/volunteer-role capture; exact phone viewport was unavailable and Chrome automation became blocked.
a3-teacher-view-with-children - Requires a volunteer checked into a room with multiple checked-in children; production dashboard showed 0 checked-in children.
a3-teacher-view-pickup-ready-state - Depends on teacher room fixture plus pickup-ready POST; no checked-in child/teacher fixture was available.
a3-teacher-view-acknowledged-state - Depends on the skipped pickup-ready teacher fixture.
a3-page-parent-modal - Depends on teacher room fixture with children; no checked-in child/teacher fixture was available.
a4-checkin-dashboard-with-clickable-rooms - Production dashboard showed 0 checked-in children and no room cards today.
a4-room-drilldown-typical - Requires a populated room today; production dashboard showed 0 checked-in children.
a4-room-drilldown-no-adults-warning - Requires a room with children and no adults; no populated room fixture was available.
a4-room-drilldown-with-medical-alerts - Requires a populated room with a medical-alert child; no populated room fixture was available.
a5-roster-typical - Emergency roster requires checked-in children; production dashboard showed 0 checked-in children.
a5-roster-with-reported-absent-badge - Requires teacher attendance marking on an active checked-in child; no checked-in child/teacher fixture was available.
a5-roster-print-preview - Browser/OS print preview was not capturable through the available Chrome automation, and the roster was empty.
b1-ios-wallet-add-sheet - Requires real iPhone Safari / Wallet add sheet, which Codex Chrome automation cannot capture.
b1-pass-on-lock-screen-near-church - Requires being physically near the church campus with a pass installed.
b2-kiosk-pickup-ready-success - Requires active kiosk plus currently checked-in child; production dashboard showed 0 checked-in children.
b3-page-parent-button - Depends on teacher room fixture with children; no checked-in child/teacher fixture was available.
b3-page-parent-cooldown-state - Depends on submitting Page Parent from a teacher room fixture; no checked-in child/teacher fixture was available.
b4-add-blocked-modal - Chrome automation became blocked before I could scroll/capture the full modal with all fields; the partial capture was removed.
b4-kiosk-blocked-review-modal - Requires a live staffed-kiosk checkout flow with an open child session; skipped to avoid leaving production sessions.
b5-attendance-pills-unmarked - Depends on teacher room fixture with children; no checked-in child/teacher fixture was available.
b5-attendance-pills-present - Depends on teacher room fixture with children; no checked-in child/teacher fixture was available.
b5-attendance-pills-not-in-room - Depends on teacher room fixture with children; no checked-in child/teacher fixture was available.
