The single most important architectural question you are NOT asking—which is a direct consequence of the unified schema I just gave you—is:

**"How does unifying Child, Volunteer, and Adult into a single Firestore document interact with Firestore's document-level read security, and how do I prevent catastrophic data leaks?"**

By flattening the schema to optimize query performance, you have solved your database read limits but accidentally introduced a massive security vulnerability, a rigid domain constraint, and an identity resolution trap.

Here are the three critical blind spots you must instruct your AI assistant to address before writing any code:

### ---

**1\. The Firestore "All-or-Nothing" Read Trap (Data Bleed)**

**The Flaw:** In a traditional SQL database, you can query SELECT name, photo\_url FROM people WHERE is\_volunteer \= true. **Firestore does not support field-level read exclusions.** If your Firebase Security Rules grant a user permission to read a Person document (e.g., to load a schedule roster), the Firebase client SDK downloads the *entire document JSON* to the browser.

**The Threat:** By unifying the Person record, you have co-located operational data with highly sensitive data. If a 19-year-old worship leader opens your app to see who is on the band roster, their browser automatically downloads the Person document for everyone on that team. Even if your React UI hides it, that user can open the **Chrome DevTools Network tab** and read the child\_profile (medical notes, allergies, custody dispute info via authorized\_pickups) of any minor on that team. Based on your Perplexity research regarding church privacy and COPPA, this is a company-ending liability.

**The Fix:** Because you are on **Next.js 16**, you must instruct Claude to implement **The Server-Side DTO Wall**.

1. Set your firestore.rules to strictly deny all direct client-side reads to the people collection.  
2. Force all data fetching through React Server Components (RSCs) or Server Actions using the firebase-admin SDK.  
3. Fetch the full document securely on the server, explicitly strip the child\_profile and sensitive stats based on the requester's ABAC permissions, and send only a sanitized Data Transfer Object (DTO) payload to the browser.

### ---

**2\. The Blended Family Collapse (Domain Modeling)**

**The Flaw:** In the schema, I defined household\_id: string. This assumes a strict 1-to-N relationship where a child belongs to exactly one household. This fundamentally breaks for divorced parents with joint custody, which make up a massive chunk of modern church demographics.

**The Threat:** If 8-year-old "Timmy" splits time between Mom's house and Dad's house:

* If you assign him to Mom's household\_id, Dad cannot check him in at the kiosk because Dad's phone number pulls up Dad's household, which Timmy is not linked to.  
* If you try to hack a fix by merging Mom and Dad into one single "Household" record, your scheduling algorithm's never\_same\_time constraint will block Mom and Dad from serving at the same time, treating the divorced couple as a single unit.

**The Fix:** Instruct Claude to change the schema to **household\_ids: string\[\]** on the Person interface.

* **Check-in:** When searching by phone, find the adult's household ID, then query where("household\_ids", "array-contains", foundHouseholdId). Timmy appears seamlessly for both Mom and Dad.  
* **Scheduling:** The algorithm evaluates constraints by matching exact array intersections, allowing Mom and Dad to be scheduled independently while maintaining custody links.

### ---

**3\. The Duplicate Profile Nightmare (Identity Resolution)**

**The Flaw:** You have a user\_id: string | null field to link Firebase Auth to the Person record. However, in church software, admins create profiles *before* users ever log in (e.g., adding "John Doe" to a schedule manually). When John finally downloads your app and signs up with his phone number, Firebase Auth creates a brand new UID.

**The Threat:** If your onboarding flow blindly creates a *new* Person record for that new UID, John will log in and see an empty schedule. The admin will see an unresponsive volunteer on their roster. Your database is now polluted with two "John Does," and schedules are permanently fractured.

**The Fix:** Instruct Claude to implement a **Deterministic Identity Linkage Cloud Function**.

Write an auth.user().onCreate() Firebase Cloud Function. When a new user signs up, the function must query the people collection across your database matching the new user's verified phoneNumber or email. If it finds a match, it updates the *existing* pre-created Person record with the new user\_id and mints their Custom Claims, seamlessly linking the mobile app to the profile the admin already created.