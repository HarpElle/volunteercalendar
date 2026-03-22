"use client";

import { type ReactNode, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface HelpSection {
  title: string;
  content: ReactNode;
}

const gettingStarted: HelpSection[] = [
  {
    title: "1. Create your organization",
    content: (
      <p>
        After registering, the setup wizard walks you through naming your
        organization, choosing your type (church, nonprofit, or other), and
        selecting a scheduling workflow. You can always change these later in
        Organization Settings.
      </p>
    ),
  },
  {
    title: "2. Add your volunteers",
    content: (
      <p>
        Go to the People page to add volunteers one by one, or use CSV Import to
        upload your entire roster at once. Each volunteer can have a name, email,
        phone, preferred frequency, and availability notes.
      </p>
    ),
  },
  {
    title: "3. Create teams and roles",
    content: (
      <p>
        In Services &amp; Events, create your recurring services (e.g., Sunday
        Morning) and define roles within each team (e.g., Lead Vocalist, Sound
        Tech). Assign volunteers to teams based on their skills and interests.
      </p>
    ),
  },
  {
    title: "4. Generate a schedule",
    content: (
      <p>
        From the Scheduling Dashboard, create a new schedule covering 4&ndash;8
        weeks. The auto-draft algorithm generates a fair rotation respecting
        availability, household connections, and preferred frequency limits.
      </p>
    ),
  },
  {
    title: "5. Review and approve",
    content: (
      <p>
        The draft schedule appears in the Schedule Matrix where you can review
        assignments, make manual swaps, and resolve any conflicts. Once
        satisfied, approve and publish the schedule.
      </p>
    ),
  },
  {
    title: "6. Notify volunteers",
    content: (
      <p>
        Published schedules trigger notifications to assigned volunteers via
        their preferred channel (email or SMS). Volunteers confirm or decline
        directly from the notification or their My Schedule page.
      </p>
    ),
  },
];

const featureGuides: HelpSection[] = [
  {
    title: "Understanding Volunteer Health",
    content: (
      <>
        <p>
          The Volunteer Health dashboard classifies each volunteer based on their
          scheduling patterns:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>
            <strong>Healthy</strong> &mdash; Regular participation, no
            concerning patterns.
          </li>
          <li>
            <strong>At Risk (Burnout)</strong> &mdash; Scheduled more often than
            their preferred frequency. Consider reducing their assignments.
          </li>
          <li>
            <strong>Declining</strong> &mdash; Three or more declined
            assignments recently. Their availability may have changed &mdash;
            reach out to check in.
          </li>
          <li>
            <strong>No-Show Pattern</strong> &mdash; Two or more unexcused
            no-shows. A personal conversation may be more effective than another
            notification.
          </li>
          <li>
            <strong>Inactive</strong> &mdash; 60+ days since last service, or
            never scheduled. May need re-engagement or removal from the active
            roster.
          </li>
        </ul>
        <p className="mt-3">
          Classifications update automatically based on scheduling data. Use the
          outreach tools to send a thoughtful check-in email directly from the
          dashboard.
        </p>
      </>
    ),
  },
  {
    title: "How Auto-Scheduling Works",
    content: (
      <>
        <p>
          The scheduling algorithm builds fair rotations by considering:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>Volunteer availability and blackout dates</li>
          <li>
            Preferred scheduling frequency (weekly, biweekly, monthly)
          </li>
          <li>
            Household connections &mdash; linked members won&apos;t be scheduled
            for conflicting slots
          </li>
          <li>
            Role qualifications &mdash; only qualified volunteers are assigned to
            specialized roles
          </li>
          <li>
            Recent history &mdash; the algorithm avoids scheduling the same
            person repeatedly while others are underutilized
          </li>
        </ul>
        <p className="mt-3">
          The result is a draft that you review before anyone is notified. You
          always have the final say.
        </p>
      </>
    ),
  },
  {
    title: "Calendar Feeds",
    content: (
      <>
        <p>
          Each volunteer gets a personal iCal feed URL that syncs their
          assignments to any calendar app.
        </p>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="font-medium text-vc-text">Google Calendar</dt>
            <dd className="mt-1">
              Settings &rarr; Add calendar &rarr; From URL &rarr; paste the feed
              link.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Apple Calendar</dt>
            <dd className="mt-1">
              File &rarr; New Calendar Subscription &rarr; paste the feed link.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Outlook</dt>
            <dd className="mt-1">
              Settings &rarr; Calendar &rarr; Shared calendars &rarr; Subscribe
              from web &rarr; paste the feed link.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Calendar feeds update automatically when schedules change. Volunteers
          can find their feed URL on the My Schedule page.
        </p>
      </>
    ),
  },
  {
    title: "Check-In Methods",
    content: (
      <>
        <p>
          VolunteerCal offers three ways for volunteers to check in:
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">QR Code</dt>
            <dd className="mt-1">
              Generate a QR code for any service date from the Scheduling
              Dashboard. Display it on a screen or print it out. Volunteers scan
              the code, confirm their identity, and attendance logs
              automatically.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Smart Check-In</dt>
            <dd className="mt-1">
              When a volunteer opens the app near a scheduled service time, a
              banner prompts them to check in with one tap. The time window is
              configurable (default: 60 minutes before, 30 minutes after service
              start).
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Proximity Check-In</dt>
            <dd className="mt-1">
              If a campus has a street address with coordinates (entered via
              address autocomplete), volunteers near the venue receive a
              location-aware prompt. This requires the proximity setting to be
              enabled and the volunteer to allow location access.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          All three methods log attendance automatically and feed into Volunteer
          Health classifications. Admins can configure check-in settings
          (self-check-in toggle, time windows, proximity radius) in Organization
          Settings.
        </p>
        <dl className="mt-4 space-y-3">
          <div>
            <dt className="font-medium text-vc-text">
              Admin/Scheduler Attendance
            </dt>
            <dd className="mt-1">
              Schedulers and Admins can also mark attendance manually. On the
              Services &amp; Events page, click the Roster button on any service
              or event card to open the roster modal. Switch to the Attendance
              tab to mark individuals present or use &ldquo;Mark all
              present.&rdquo; The Attendance tab is available for both past and
              upcoming dates, so you can familiarize yourself with the interface
              before the service day.
            </dd>
          </div>
        </dl>
      </>
    ),
  },
  {
    title: "Shift Swaps",
    content: (
      <>
        <p>
          When a volunteer can&apos;t make their assigned date, they can request
          a shift swap from their My Schedule page. The system identifies
          eligible replacements based on availability and qualifications. Once a
          replacement accepts, the scheduler reviews and approves the swap.
        </p>
        <p className="mt-3">
          The original volunteer, the replacement, and the scheduler all receive
          notifications at each step. No group texts or email chains needed.
        </p>
      </>
    ),
  },
  {
    title: "Onboarding Pipeline",
    content: (
      <>
        <p>
          Define the requirements volunteers must complete before serving &mdash;
          things like background checks, training classes, or orientation
          sessions.
        </p>
        <p className="mt-3">
          On the Onboarding page, use the &ldquo;Manage Prerequisites&rdquo; tab
          to set up organization-wide requirements (applied to every team) and
          team-specific requirements. Then switch to the &ldquo;Volunteer
          Progress&rdquo; tab to track each volunteer&apos;s status through the
          pipeline. Volunteers won&apos;t appear as available for scheduling
          until they&apos;ve completed all required prerequisites &mdash; both
          org-wide and team-specific.
        </p>
      </>
    ),
  },
  {
    title: "Absence Alerts",
    content: (
      <>
        <p>
          When a volunteer can&apos;t make a scheduled assignment, they can tap
          &ldquo;Can&apos;t Make It&rdquo; on their My Schedule page. They can
          optionally add a note explaining why.
        </p>
        <p className="mt-3">
          Schedulers and admins for that team are automatically notified via
          their preferred channels (email and/or SMS). This gives schedulers
          immediate visibility into gaps so they can find a replacement or adjust
          plans.
        </p>
        <p className="mt-3">
          The volunteer&apos;s assignment is flagged but not removed &mdash; the
          scheduler decides next steps. If the volunteer&apos;s situation
          changes, the scheduler can clear the flag.
        </p>
      </>
    ),
  },
  {
    title: "Archive, Restore, and Remove Volunteers",
    content: (
      <>
        <p>
          When a volunteer stops serving, you have two options depending on whether
          you want to keep them in the organization or remove them entirely.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Archive</dt>
            <dd className="mt-1">
              Archiving sets a volunteer to an inactive state. They&apos;re removed
              from all teams, excluded from future scheduling and event invitations,
              but can still see the organization. You can restore them later.
              On the People page, click the menu on a volunteer&apos;s row and
              select &ldquo;Archive.&rdquo;
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Restore</dt>
            <dd className="mt-1">
              Restoring an archived volunteer sets their status back to active.
              They&apos;ll need to be re-added to teams manually, since archiving
              clears team assignments. Filter the People page to
              &ldquo;Archived&rdquo; to find them, then click &ldquo;Restore.&rdquo;
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Remove from Organization</dt>
            <dd className="mt-1">
              Removing a volunteer permanently deletes their record and revokes
              their access to the organization. They won&apos;t be able to see the
              org unless re-invited. This cannot be undone. Use the menu on their
              row and select &ldquo;Remove from Organization.&rdquo;
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          The People page defaults to showing active volunteers. Use the Status
          filter to switch between Active, Archived, and All. You can also filter
          by team membership to find volunteers who aren&apos;t assigned to any team.
        </p>
      </>
    ),
  },
  {
    title: "Scheduler Notification Preferences",
    content: (
      <>
        <p>
          Schedulers and admins can customize which notifications they receive
          and how.
        </p>
        <p className="mt-3">
          Go to Account Settings &rarr; Scheduler Notifications to configure:
        </p>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="font-medium text-vc-text">Notification Types</dt>
            <dd className="mt-1">
              Toggle on/off for each type: absence alerts, self-removals, swap
              requests, and swap completions. Types marked &ldquo;Urgent&rdquo;
              (like absence alerts) use the urgent channel; others use the
              standard channel.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Standard Channel</dt>
            <dd className="mt-1">
              Choose Email or None for routine notifications like completed
              swaps.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Urgent Channel</dt>
            <dd className="mt-1">
              Choose Email, SMS, or None for time-sensitive notifications like
              last-minute absences. SMS is available on Starter plans and above.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Ministry Scope</dt>
            <dd className="mt-1">
              Optionally limit notifications to specific teams. Leave empty to
              receive alerts for all teams you manage.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Preferences are per-organization, so if you&apos;re a scheduler in
          multiple orgs, each has its own settings.
        </p>
      </>
    ),
  },
  {
    title: "Installing VolunteerCal as an App",
    content: (
      <>
        <p>
          VolunteerCal is a Progressive Web App (PWA) &mdash; you can install it
          on any device for quick access and a native app experience.
        </p>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="font-medium text-vc-text">
              Chrome (Android/Desktop)
            </dt>
            <dd className="mt-1">
              Look for the &ldquo;Install&rdquo; prompt in the address bar, or
              open the browser menu and select &ldquo;Install app&rdquo; or
              &ldquo;Add to Home Screen.&rdquo;
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">iPhone/iPad (Safari)</dt>
            <dd className="mt-1">
              Tap the Share button (square with arrow), then tap &ldquo;Add to
              Home Screen.&rdquo;
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Once installed, VolunteerCal opens in its own window with an app icon
          on your home screen &mdash; no app store download required.
        </p>
      </>
    ),
  },
  {
    title: "Workflow Modes",
    content: (
      <>
        <p>
          VolunteerCal supports four scheduling workflow modes. Choose the one
          that fits how your organization operates:
        </p>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="font-medium text-vc-text">Centralized</dt>
            <dd className="mt-1">
              Admin drafts the full schedule. Team leads review and approve.
              Admin publishes globally. Best for smaller orgs or those that want
              tight control.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Team-First</dt>
            <dd className="mt-1">
              Each team lead generates and publishes their own schedule
              independently. Admin monitors for cross-team conflicts. Best for
              organizations with autonomous ministry teams.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Hybrid</dt>
            <dd className="mt-1">
              Auto-draft creates templates. Leaders tweak their sections
              independently. Admin sees cross-team alerts. Best for mid-size
              organizations that want structure with flexibility.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Self-Service</dt>
            <dd className="mt-1">
              Volunteers sign up for open slots directly. No approval workflow.
              Best for events or low-stakes roles.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Free tier is limited to Centralized. Starter and above have access to
          all four modes. You can change your workflow mode when creating each
          new schedule.
        </p>
      </>
    ),
  },
  {
    title: "Availability Campaigns",
    content: (
      <>
        <p>
          Before generating a schedule, you can request availability from your
          volunteers.
        </p>
        <p className="mt-3">
          When creating a new schedule, set an availability due date in Step 2 of
          the wizard. Optionally add a custom message. After generating the
          draft, click &ldquo;Send Availability Request&rdquo; to email all
          active volunteers.
        </p>
        <p className="mt-3">
          Volunteers see a banner on their dashboard with the coverage period and
          a link to submit their availability. You can track response rates on
          the Scheduling Dashboard.
        </p>
        <p className="mt-3">
          This ensures your auto-generated schedule reflects real availability
          rather than assumptions.
        </p>
      </>
    ),
  },
  {
    title: "Multi-Stage Approval",
    content: (
      <>
        <p>
          For organizations with multiple teams, multi-stage approval ensures
          every team lead signs off before a schedule goes live.
        </p>
        <p className="mt-3">The workflow:</p>
        <ol className="mt-2 list-decimal space-y-2 pl-6">
          <li>Admin generates a draft schedule</li>
          <li>Admin submits the schedule for review</li>
          <li>
            Each team lead reviews their team&apos;s assignments and clicks
            Approve
          </li>
          <li>
            Once all teams have approved, the admin can publish
          </li>
        </ol>
        <p className="mt-3">
          The approval countdown shows how many teams have approved (e.g.,
          &ldquo;2 of 3 teams approved&rdquo;). You can also use the cross-team
          coordination modal to see shared volunteers and resolve conflicts
          before publishing.
        </p>
        <p className="mt-3">
          Multi-stage approval is available on Growth tier and above.
        </p>
      </>
    ),
  },
  {
    title: "Household Scheduling",
    content: (
      <>
        <p>
          Link family members so the scheduler respects real-life connections.
        </p>
        <p className="mt-3">
          Go to People &rarr; Families tab &rarr; Add Family. Give the household
          a name, select members, and set constraints:
        </p>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="font-medium text-vc-text">Never same service</dt>
            <dd className="mt-1">
              Family members won&apos;t be scheduled to the same service on the
              same date. Useful when one parent needs to be free for childcare.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Never same time</dt>
            <dd className="mt-1">
              Family members won&apos;t be scheduled to ANY service on the same
              date. For families that attend together.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Prefer same service</dt>
            <dd className="mt-1">
              The scheduler tries to place family members on the same service
              when possible. For families that like to serve together.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Constraint violations are flagged during schedule review with household
          conflict cards. You can add notes to each household for context (e.g.,
          &ldquo;Dad travels every other weekend&rdquo;).
        </p>
      </>
    ),
  },
  {
    title: "Song Library & Service Plans",
    content: (
      <>
        <p>
          The worship module (Growth tier and above) lets you manage songs and
          build service plans.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Song Library</dt>
            <dd className="mt-1">
              Navigate to Worship &rarr; Songs. Add songs with title, CCLI
              number, default key, available keys, artist/writer credits,
              copyright, tags, and lyrics. Filter by status (active, archived),
              rotation status, or search by title. Songs track usage count and
              last-used date automatically.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Service Plans</dt>
            <dd className="mt-1">
              Navigate to Worship &rarr; Service Plans. Create a plan for a
              specific service and date. Add items: songs (with key overrides),
              prayers, announcements, sermons, offerings, videos, or custom
              items. Reorder items with drag-and-drop. Add arrangement notes per
              item.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Publishing</dt>
            <dd className="mt-1">
              When you publish a plan, VolunteerCal automatically creates song
              usage records for CCLI compliance. Each song&apos;s use count and
              last-used date update in real time.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          The Reports page (Worship &rarr; Reports) shows song usage over time
          for CCLI reporting.
        </p>
      </>
    ),
  },
  {
    title: "SongSelect Import & Chord Charts",
    content: (
      <>
        <p>
          Import songs from CCLI SongSelect into your library by uploading
          ChordPro files (Premium) or PDF chord charts. No account connection
          required &mdash; just download from SongSelect and upload here.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">How to Export from SongSelect</dt>
            <dd className="mt-1">
              Sign in at songselect.ccli.com, find your song, and click the
              download icon. Choose &ldquo;ChordPro&rdquo; (Premium subscription)
              for the best quality, or &ldquo;Chord Chart&rdquo; (PDF) which is
              available to all subscribers.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Uploading &amp; Importing</dt>
            <dd className="mt-1">
              Go to Worship &rarr; Songs and click &ldquo;Import Songs.&rdquo;
              Drag and drop your ChordPro (.pro, .chordpro) or PDF files.
              ChordPro files are parsed instantly; PDFs are converted automatically.
              You&apos;ll see a preview with title, key, tempo, CCLI metadata, and
              a chord-over-lyric preview before importing.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">CCLI Compliance</dt>
            <dd className="mt-1">
              Your church&apos;s CCLI number must be on file before importing
              (Settings &rarr; General). All songs are stored privately per
              church and your CCLI number is included in usage reports.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Chord Chart Viewer</dt>
            <dd className="mt-1">
              View imported songs with a full chord chart viewer featuring
              transposition to any key, chart types (Standard, Nashville,
              Solfege), 1 or 2 column layout, font scaling, and fit-to-page
              options. Charts display chords above lyrics and can be printed.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Arrangements</dt>
            <dd className="mt-1">
              Create multiple arrangements per song with different keys, chart
              types, and formatting. Set a default arrangement and link specific
              arrangements to service plan items.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Supported Formats</dt>
            <dd className="mt-1">
              ChordPro (.pro, .chordpro, .cho) and PDF chord charts from
              SongSelect. You can upload multiple files at once.
            </dd>
          </div>
        </dl>
      </>
    ),
  },
  {
    title: "Stage Sync",
    content: (
      <>
        <p>
          Stage Sync lets you broadcast your order of service in real time so
          your worship team can follow along on any device.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Starting a Session</dt>
            <dd className="mt-1">
              Open a published service plan and click &ldquo;Start Stage
              Sync.&rdquo; A share modal appears with a QR code and a direct
              URL. Share either with your team members.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Conductor View</dt>
            <dd className="mt-1">
              The conductor page shows your full order of service with the
              current item highlighted. Use the Next and Previous buttons to
              advance through the plan, or use keyboard shortcuts: Right Arrow or
              Space to advance, Left Arrow to go back.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Participant View</dt>
            <dd className="mt-1">
              Team members open the shared link or scan the QR code on their
              phone, tablet, or laptop. The current item displays in a clear,
              large format that updates in real time as the conductor advances.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Reconnection</dt>
            <dd className="mt-1">
              If a participant loses their connection briefly (e.g., switching
              between apps), the view automatically resumes at the current item
              when they reconnect. No manual refresh needed.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Stage Sync is available on Growth tier and above.
        </p>
      </>
    ),
  },
  {
    title: "Song Usage Reports",
    content: (
      <>
        <p>
          Track which songs your church uses and how often &mdash; built for
          CCLI compliance reporting.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Viewing Reports</dt>
            <dd className="mt-1">
              Navigate to Worship &rarr; Reports. The page shows a table of
              songs used across your published service plans, with use counts and
              date information.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Date Range Filtering</dt>
            <dd className="mt-1">
              Use the date range picker to narrow results to a specific period.
              This is especially helpful for quarterly or annual CCLI reporting
              windows.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Aggregation</dt>
            <dd className="mt-1">
              Each song&apos;s use count reflects the number of published service
              plans containing that song within your selected date range.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">CSV Export</dt>
            <dd className="mt-1">
              Click &ldquo;Export CSV&rdquo; to download a spreadsheet with song
              titles, CCLI numbers, use counts, and dates. You can upload this
              directly to your CCLI reporting portal or keep it for your records.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Song usage reports are available on Growth tier and above.
        </p>
      </>
    ),
  },
  {
    title: "ProPresenter Export",
    content: (
      <>
        <p>
          Export your service plans in a format compatible with ProPresenter, the
          popular worship presentation software.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Manual Export</dt>
            <dd className="mt-1">
              Open any service plan and click &ldquo;Export for
              ProPresenter.&rdquo; A JSON file downloads containing your plan
              items in ProPresenter-compatible format. Import this file into
              ProPresenter to set up your slides for the service.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">
              Auto-Email Delivery
            </dt>
            <dd className="mt-1">
              A daily background process can automatically email ProPresenter
              exports to your designated recipients (e.g., your media team lead).
              This ensures the presentation team always has the latest plan
              without needing to log in and export manually.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          ProPresenter export is available on Growth tier and above.
        </p>
      </>
    ),
  },
];

function AccordionItem({ id, title, content, isOpen, onToggle }: {
  id: string;
  title: string;
  content: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const panelId = `${id}-panel`;
  return (
    <div className="border-b border-vc-border-light last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span className="text-base font-medium text-vc-indigo">{title}</span>
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-vc-bg-warm text-vc-text-muted"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            role="region"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pb-4 text-sm leading-relaxed text-vc-text-secondary">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HelpPage() {
  const [openGettingStarted, setOpenGettingStarted] = useState<number | null>(null);
  const [openGuide, setOpenGuide] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Help Center</h1>
        <p className="mt-1 text-vc-text-secondary">
          Guides and answers to help you get the most out of VolunteerCal.
        </p>
      </div>

      {/* Getting Started */}
      <section className="mb-8">
        <h2 className="mb-4 font-display text-xl text-vc-indigo">Getting Started</h2>
        <div className="rounded-xl border border-vc-border-light bg-white px-5">
          {gettingStarted.map((item, i) => (
            <AccordionItem
              key={i}
              id={`gs-${i}`}
              title={item.title}
              content={item.content}
              isOpen={openGettingStarted === i}
              onToggle={() => setOpenGettingStarted(openGettingStarted === i ? null : i)}
            />
          ))}
        </div>
      </section>

      {/* Feature Guides */}
      <section className="mb-8">
        <h2 className="mb-4 font-display text-xl text-vc-indigo">Feature Guides</h2>
        <div className="rounded-xl border border-vc-border-light bg-white px-5">
          {featureGuides.map((item, i) => (
            <AccordionItem
              key={i}
              id={`fg-${i}`}
              title={item.title}
              content={item.content}
              isOpen={openGuide === i}
              onToggle={() => setOpenGuide(openGuide === i ? null : i)}
            />
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h2 className="font-display text-xl text-vc-indigo">Need more help?</h2>
        <p className="mt-2 text-sm text-vc-text-secondary">
          We&apos;re here to help you get the most out of VolunteerCal. Reach out anytime.
        </p>
        <a
          href="mailto:hello@volunteercal.com"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-vc-coral px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-vc-coral-dark active:scale-[0.98]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
          Email Us
        </a>
      </section>
    </div>
  );
}
