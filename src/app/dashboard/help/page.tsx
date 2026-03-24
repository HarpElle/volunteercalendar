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
          background checks, training classes, orientation sessions, and more.
          Volunteers won&apos;t appear as available for scheduling until all
          required prerequisites are complete.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Creating Prerequisites</dt>
            <dd className="mt-1">
              <ol className="mt-2 list-decimal space-y-1.5 pl-6">
                <li>Go to People &rarr; Onboarding in the sidebar.</li>
                <li>Open the &ldquo;Manage Prerequisites&rdquo; tab.</li>
                <li>Click &ldquo;+ Add prerequisite&rdquo; and choose a type:
                  orientation class, background check, minimum services,
                  ministry tenure, shadow, or custom.</li>
                <li>Set the scope: all roles, teams only, events only, or
                  specific roles.</li>
                <li>Use the quick-add presets for common requirements like
                  orientation or background check.</li>
                <li>Prerequisites auto-save as you add them.</li>
              </ol>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">
              Assigning &amp; Tracking Progress
            </dt>
            <dd className="mt-1">
              <ol className="mt-2 list-decimal space-y-1.5 pl-6">
                <li>Switch to the &ldquo;Volunteer Progress&rdquo; tab.</li>
                <li>The table shows every volunteer with their name, overall
                  status (Not Started, In Progress, or Cleared to Serve), and
                  a progress bar.</li>
                <li>Click a volunteer&apos;s row to expand and see individual
                  prerequisite status.</li>
                <li>Use the dropdown on each step to change status:
                  Pending &rarr; In Progress &rarr; Completed or Waived.</li>
                <li>Changes auto-save with your user ID as verifier and a
                  timestamp.</li>
              </ol>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">
              Volunteer&apos;s View (My Journey)
            </dt>
            <dd className="mt-1">
              <p>Volunteers see their personal progress at Account
                Settings &rarr; My Journey. The page shows prerequisites
                grouped by organization-wide and per-team, with status badges
                (Not Started, In Progress, Complete, Waived) and completion
                dates. An &ldquo;all clear&rdquo; state displays when
                everything is complete.</p>
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          See the &ldquo;Training Sessions&rdquo; guide below for scheduling
          group training events tied to prerequisites.
        </p>
      </>
    ),
  },
  {
    title: "Training Sessions",
    content: (
      <>
        <p>
          Training sessions let admins schedule group training events tied to
          specific onboarding prerequisites. When volunteers attend a session,
          the associated prerequisite step is automatically marked complete
          &mdash; no manual follow-up needed.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Creating a Session</dt>
            <dd className="mt-1">
              On the Onboarding page, open the &ldquo;Training Sessions&rdquo;
              tab and click &ldquo;New Session.&rdquo; Give it a title, choose
              the prerequisite step it satisfies, set a date, time, and
              location, and optionally add a capacity limit or notes.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Sending Invitations</dt>
            <dd className="mt-1">
              After creating a session, click &ldquo;Send Invitations&rdquo; to
              email all volunteers who still have that prerequisite step
              pending. The invitation includes the session details and an RSVP
              link.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Volunteer RSVP</dt>
            <dd className="mt-1">
              Volunteers receive an email with Accept and Decline buttons. When
              they accept, they&apos;re added to the session&apos;s attendee
              list. Declined responses are recorded so admins can follow up if
              needed.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Completing a Session</dt>
            <dd className="mt-1">
              After the training takes place, mark the session as completed.
              VolunteerCal automatically marks the linked prerequisite step as
              complete for every attendee, updating their onboarding progress
              instantly.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Training sessions are a powerful way to move multiple volunteers
          through the onboarding pipeline at once, especially for recurring
          requirements like safety orientations or policy reviews.
        </p>
      </>
    ),
  },
  {
    title: "Trainee & Shadow Assignments",
    content: (
      <>
        <p>
          Trainee assignments let schedulers pair new volunteers with
          experienced team members so they can observe and learn before serving
          independently.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Assigning a Trainee</dt>
            <dd className="mt-1">
              When building a schedule, assign a volunteer to a role and set
              their assignment type to &ldquo;Trainee.&rdquo; The trainee is
              paired with the primary volunteer already assigned to that role.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Visual Indicators</dt>
            <dd className="mt-1">
              Trainees are easy to spot throughout the interface. In the
              schedule matrix, trainee cells appear with a dashed border and a
              &ldquo;Shadowing&rdquo; badge. Matrix column headers show a
              &ldquo;(shadow)&rdquo; label next to the trainee&apos;s name.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Slot Counting</dt>
            <dd className="mt-1">
              Trainees do not count toward a role&apos;s filled slot total.
              If a role requires two volunteers, a trainee shadowing one of
              them won&apos;t inflate the count &mdash; you&apos;ll still see
              the accurate number of serving volunteers.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Best Practices</dt>
            <dd className="mt-1">
              Shadow assignments work well for roles with a learning curve,
              such as sound tech, lighting, or children&apos;s ministry.
              Schedule a volunteer as a trainee for a few weeks before moving
              them to a regular assignment.
            </dd>
          </div>
        </dl>
      </>
    ),
  },
  {
    title: "Prerequisite Notifications",
    content: (
      <>
        <p>
          VolunteerCal sends automatic email notifications at key onboarding
          milestones so volunteers stay on track and schedulers stay informed.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Step Completed</dt>
            <dd className="mt-1">
              When a volunteer completes a prerequisite step, they receive an
              email confirming the step is done. The email includes a visual
              progress bar showing how far along they are in the full
              onboarding pipeline.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">All Prerequisites Completed</dt>
            <dd className="mt-1">
              When a volunteer finishes every required prerequisite (both
              org-wide and team-specific), schedulers are notified that the
              volunteer is now eligible for scheduling. The volunteer also
              receives a congratulatory email.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Expiry Warning</dt>
            <dd className="mt-1">
              Some prerequisites expire (e.g., annual background checks or
              certifications). VolunteerCal sends a reminder email 30 days
              before a completed step expires, giving the volunteer time to
              renew before losing eligibility.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Stalled Progress Nudge</dt>
            <dd className="mt-1">
              If a volunteer&apos;s onboarding progress stalls &mdash; no steps
              completed for an extended period &mdash; the system sends a
              friendly nudge email encouraging them to pick up where they left
              off. This helps prevent volunteers from falling through the
              cracks.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          All prerequisite notifications are sent automatically by a background
          process. Admins do not need to configure or trigger them manually.
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
          your worship team can follow along on any device. Available on
          Growth tier and above.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Starting a Session</dt>
            <dd className="mt-1">
              <ol className="mt-2 list-decimal space-y-1.5 pl-6">
                <li>Go to Worship &rarr; Service Plans and open the plan you
                  want to present.</li>
                <li>Click the &ldquo;Stage Sync&rdquo; button on the plan
                  detail page.</li>
                <li>A share modal opens with two links:
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    <li><strong>Conductor link</strong> &mdash; for the person
                      controlling the presentation.</li>
                    <li><strong>Viewer link</strong> &mdash; for band members
                      and participants to follow along.</li>
                  </ul>
                </li>
                <li>Share the viewer link with your team via QR code or direct
                  URL.</li>
              </ol>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Conductor View</dt>
            <dd className="mt-1">
              <p>Open the conductor link to get a full-screen control
                interface.</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li>Use the <strong>Next</strong> and <strong>Previous</strong>
                  buttons on screen to advance through the plan.</li>
                <li>Keyboard shortcuts: <strong>Space</strong>,{" "}
                  <strong>Enter</strong>, or <strong>Right Arrow</strong> to
                  advance; <strong>Left Arrow</strong> to go back.</li>
                <li>Click any progress dot to jump directly to a specific
                  item.</li>
                <li>Current item shows title, type, key (if a song), and chord
                  chart (if available).</li>
              </ul>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Participant / Viewer</dt>
            <dd className="mt-1">
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li>Open the viewer link on any device &mdash; phone, tablet,
                  or laptop.</li>
                <li>The display automatically follows the conductor in real
                  time via live sync.</li>
                <li>Chord charts display at a larger scale for easy
                  readability.</li>
                <li>If connection drops, a &ldquo;Reconnecting&hellip;&rdquo;
                  banner appears and the view auto-resumes when back
                  online.</li>
              </ul>
            </dd>
          </div>
        </dl>
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
              From the Worship section, open Service Plans and click the
              &ldquo;Song Usage Reports&rdquo; link in the page header. The
              reports page shows a table of songs used across your published
              service plans, with use counts and date information.
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
  {
    title: "Children's Check-In",
    content: (
      <>
        <p>
          VolunteerCal includes a dedicated children&apos;s check-in system
          designed for safety, speed, and simplicity. Available on Growth tier
          and above.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Setting Up Check-In</dt>
            <dd className="mt-1">
              <ol className="mt-2 list-decimal space-y-1.5 pl-6">
                <li>Go to Settings &rarr; Check-In tab.</li>
                <li>Add your service times (day, start time, end time). These
                  control pre-check-in windows and security code expiry.</li>
                <li>Optionally configure printers: station name, printer type
                  (Brother QL, Zebra ZD, or Dymo), IP address, and label size.</li>
                <li>Use the &ldquo;Test&rdquo; button to verify printer connectivity.</li>
              </ol>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Registering Households</dt>
            <dd className="mt-1">
              <ol className="mt-2 list-decimal space-y-1.5 pl-6">
                <li>Go to Kids Check-In &rarr; Households in the sidebar.</li>
                <li>Click &ldquo;Add Household&rdquo; and enter the primary
                  guardian&apos;s name and phone number. Optionally add a
                  secondary guardian.</li>
                <li>Add children: first/last name, grade, default room,
                  allergies, and medical notes.</li>
                <li>Each household receives a QR token for fast kiosk lookup.</li>
              </ol>
              <p className="mt-2">
                Families can also self-register at the kiosk during their first
                visit (see below), or you can bulk import from Breeze CSV via
                Kids Check-In &rarr; Dashboard &rarr; Import.
              </p>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Running the Kiosk</dt>
            <dd className="mt-1">
              <ol className="mt-2 list-decimal space-y-1.5 pl-6">
                <li>From the <strong>Check-In Dashboard</strong>, click
                  the <strong>Launch Kiosk</strong> button to open the kiosk in a
                  new tab. Use <strong>Copy URL</strong> to bookmark it on a
                  tablet. No login is required on the kiosk device.</li>
                <li><strong>Returning families:</strong> scan their household QR
                  code, or enter the last 4 digits of the guardian&apos;s phone
                  number.</li>
                <li><strong>New families:</strong> tap &ldquo;New Family&rdquo;
                  to open the visitor registration form &mdash; enter guardian
                  info, add children, and review.</li>
                <li>Select which children to check in, then acknowledge any
                  allergy or medical alerts.</li>
                <li>The success screen shows a 4-character security code and
                  prints labels (child name tag + guardian receipt).</li>
                <li>The kiosk auto-resets after 30 seconds of inactivity.</li>
              </ol>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Pick-Up / Checkout</dt>
            <dd className="mt-1">
              <ol className="mt-2 list-decimal space-y-1.5 pl-6">
                <li>The guardian presents their receipt label with the security
                  code.</li>
                <li>A volunteer matches the code on the guardian&apos;s receipt
                  to the code on the child&apos;s name tag.</li>
                <li>Mark the child as checked out from the Kids Check-In
                  dashboard.</li>
              </ol>
            </dd>
          </div>
        </dl>
      </>
    ),
  },
  {
    title: "Room & Resource Scheduling",
    content: (
      <>
        <p>
          Book and manage rooms, equipment, and shared spaces with a visual
          calendar and approval workflow.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Booking a Room</dt>
            <dd className="mt-1">
              Go to Rooms &rarr; Bookings and click &ldquo;New Booking.&rdquo;
              The booking wizard walks you through selecting a room, choosing
              a date and time, requesting equipment, and adding setup notes.
              If approval is required, your request goes to an admin for
              review.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Recurring Reservations</dt>
            <dd className="mt-1">
              Set up weekly, biweekly, or monthly recurring reservations.
              Individual occurrences can be modified or cancelled without
              affecting the rest of the series. Available on Growth tier and
              above.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Conflict Detection</dt>
            <dd className="mt-1">
              The booking wizard automatically checks for scheduling conflicts.
              If another reservation already occupies your requested time slot,
              you&apos;ll see a warning before submitting.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Room Display Signage</dt>
            <dd className="mt-1">
              Mount a tablet or screen outside a room to show its live
              schedule. See the dedicated &ldquo;Room Display Setup&rdquo;
              guide below for step-by-step device setup instructions.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">iCal Feeds</dt>
            <dd className="mt-1">
              Subscribe to a room&apos;s calendar feed from Google Calendar,
              Outlook, or Apple Calendar. The feed updates automatically when
              reservations change. Find feed URLs in Settings &rarr; Rooms.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Room scheduling starts at the Starter tier (5 rooms). Growth and
          above unlock recurring reservations, public calendars, and more rooms.
          Configure rooms in Settings &rarr; Rooms.
        </p>
      </>
    ),
  },
  {
    title: "Room Display Setup",
    content: (
      <>
        <p>
          Mount a tablet or screen outside any room to show a live status
          display. The page stays on permanently and refreshes automatically.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Setting Up a Device</dt>
            <dd className="mt-1">
              <ol className="mt-2 list-decimal space-y-1.5 pl-6">
                <li>Go to Settings &rarr; Rooms and select the room you want
                  to display.</li>
                <li>Copy the room&apos;s display URL. It follows the pattern:
                  <strong> /display/room/[roomId]?token=[calendar_token]&amp;church_id=[your_church_id]</strong></li>
                <li>On your wall-mounted tablet or screen, open that URL in a
                  browser.</li>
                <li>Set the browser to full-screen mode (F11 on desktop, or
                  enable Kiosk Mode on a tablet).</li>
                <li>The page uses Screen Wake Lock to prevent the device from
                  sleeping &mdash; no screen-saver app needed.</li>
              </ol>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">What the Display Shows</dt>
            <dd className="mt-1">
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li><strong>Room name</strong> in large header text.</li>
                <li><strong>Live clock</strong> that updates every second.</li>
                <li><strong>Status badge:</strong> green &ldquo;Available,&rdquo;
                  coral &ldquo;In Use,&rdquo; or amber &ldquo;Starting
                  Soon&rdquo; (within 15 minutes).</li>
                <li><strong>Countdown timer:</strong> time remaining (if in use)
                  or time until next event (if starting soon).</li>
                <li><strong>Today&apos;s schedule strip</strong> at the bottom
                  showing all confirmed reservations.</li>
              </ul>
              <p className="mt-2">
                The display polls for updated data every 30 seconds
                automatically.
              </p>
            </dd>
          </div>
        </dl>
      </>
    ),
  },
  {
    title: "Label Printing Setup",
    content: (
      <>
        <p>
          VolunteerCal prints children&apos;s check-in labels (name tags and
          guardian receipts) using a companion print service that runs on your
          local network.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Install the Print Service</dt>
            <dd className="mt-1">
              Download the VolunteerCal Print Service for your platform (Windows
              or macOS). Install and launch it &mdash; the service runs in the
              background and listens for print jobs from VolunteerCal.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Configure Printers</dt>
            <dd className="mt-1">
              In Settings &rarr; Check-In, add your label printers. Specify
              the printer name (as it appears on your computer), label size,
              and which rooms each printer serves.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Label Types</dt>
            <dd className="mt-1">
              Two labels print per check-in: a child name tag (with name, room,
              and security code) and a guardian receipt (with child name, room,
              and matching security code for pickup verification).
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Label printing requires the companion print service and is available
          on Growth tier and above.
        </p>
      </>
    ),
  },
  {
    title: "Your Availability",
    content: (
      <>
        <p>
          Let your team know when you&apos;re unavailable so the scheduler can
          plan around your schedule.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Setting Unavailable Dates</dt>
            <dd className="mt-1">
              Open the Dates tab (mobile) or My Availability page (desktop).
              Click &ldquo;Add Dates&rdquo; to select a start and end date.
              Optionally add a reason (e.g., &ldquo;Family vacation&rdquo;).
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">How It&apos;s Used</dt>
            <dd className="mt-1">
              When a scheduler generates a schedule, your unavailable dates are
              factored in automatically. You won&apos;t be assigned to any
              service that falls within your blocked periods.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Managing Your Dates</dt>
            <dd className="mt-1">
              View all your upcoming unavailable periods in a list. Remove any
              that are no longer needed by clicking the delete button.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Availability is shared across all organizations you belong to. If
          you&apos;re unavailable, no org will schedule you during that period.
        </p>
      </>
    ),
  },
  {
    title: "Managing Multiple Organizations",
    content: (
      <>
        <p>
          If you serve at more than one church or organization, VolunteerCal
          lets you manage them all from a single account.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Switching Organizations</dt>
            <dd className="mt-1">
              Use the organization switcher at the bottom of the sidebar
              (desktop) or in the More menu (mobile) to switch between your
              organizations. Your dashboard, schedule, and settings update
              instantly.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Joining an Organization</dt>
            <dd className="mt-1">
              If you receive an invitation email, click the link to accept and
              join the organization. You can also create a new organization
              from the My Organizations page.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Per-Org Roles</dt>
            <dd className="mt-1">
              Your role (admin, scheduler, volunteer) is set independently for
              each organization. You might be an admin at one church and a
              volunteer at another.
            </dd>
          </div>
        </dl>
      </>
    ),
  },
  {
    title: "Shared Facility Scheduling",
    content: (
      <>
        <p>
          When multiple organizations share the same physical building,
          shared facility scheduling lets everyone see room reservations
          across groups &mdash; preventing double-bookings and coordination
          issues.
        </p>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-medium text-vc-text">Creating a Facility Group</dt>
            <dd className="mt-1">
              Go to Settings &rarr; Rooms and scroll to the Shared Facility
              section. Enter a name for the facility group (e.g., &ldquo;Main
              Campus&rdquo;) and click Create. Your organization is
              automatically added as the first member.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Inviting Another Organization</dt>
            <dd className="mt-1">
              Click &ldquo;Invite Org&rdquo; on your facility group and enter
              the other organization&apos;s ID. They&apos;ll receive an email
              notification and can accept or decline from their own Settings
              page. Both organizations must consent &mdash; sharing is mutual.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">How It Works</dt>
            <dd className="mt-1">
              Once linked, each organization retains full control of their own
              rooms and reservations. When viewing the room calendar,
              reservations from linked organizations appear as read-only
              blocks &mdash; you can see the time and event name, but cannot
              edit or delete them. The booking wizard also checks for conflicts
              across all linked organizations.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-vc-text">Linking Rooms</dt>
            <dd className="mt-1">
              Each organization chooses which rooms to share by assigning them
              to the facility group. Only rooms marked for sharing will be
              visible to linked organizations.
            </dd>
          </div>
        </dl>
        <p className="mt-3">
          Shared facility scheduling is available on Growth tier and above.
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
          href="mailto:info@volunteercal.com"
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
