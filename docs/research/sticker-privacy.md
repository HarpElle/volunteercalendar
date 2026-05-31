# Child name visibility on check-in stickers — industry research

**Status:** Synthesized from the deep-research workflow run `wf_35da7b1c-101` (2026-05-31). 106 agents, ~3.9M tokens, 22 sources surfaced and triaged by quality.
**Trigger:** A mother at the host church raised a concern that her child's first + last name is printed on the worn check-in sticker, worrying that as the church grows, an unauthorized adult could read the name and use it to "claim to know" the child. Jason asked for a cited industry view before either reassuring the mother or shipping a configurable change.
**Bottom line:** Her concern is **non-frivolous**. The name-recognition lure is recognized in law-enforcement / prevention literature, even though it isn't surfaced as a discrete category in peer-reviewed grooming research. Leading church-tech platforms (KidCheck, Planning Center, Breeze) increasingly treat label content as **admin-configurable**, validating it as a privacy/security surface worth surfacing as a setting. **Recommendation:** ship a configurable label-content option in Wave 10 W10-R.

---

## Executive summary

1. **The matching-code primitive (sticker code ↔ parent stub code) IS the actual pickup verification mechanism**, not name matching. This is confirmed by Breeze ChMS (primary vendor source) and the GuideOne Insurance sample policy (primary insurance source). Name visibility on the worn sticker adds **no additional defense** to the pickup protocol itself.

2. **Three independent platforms treat label content as configurable** — KidCheck offers selectable name-badge content, Planning Center defaults to redacting parent-side info AND supports number/barcode-only labels, Breeze allows per-event customization. This is **industry-level vendor consensus** that the question is a legitimate admin decision rather than a fixed safety primitive.

3. **No regulatory floor exists** for the typical church childcare context in Texas:
   - Texas Administrative Code Chapter 746 (licensed child-care) is **silent** on label content.
   - Most church childcare in Texas is **statutorily exempt** under Texas Human Resources Code § 42.041(b)(3) anyway.
   - ECAP v2 Standards require check-in procedures but **don't prescribe** label content.

4. **The "Name Recognition Lure" is a named concept in established child-safety literature** — Kenneth Wooden's Child Lures Prevention program enumerates it, multiple police departments (Cobb County, Manatee County) issue public warnings, and the concept is cited across mainstream child-safety outlets. **However:** peer-reviewed grooming research (Jeglic/Winters, PubMed 36577252) does not enumerate name-recognition as a discrete red flag — the consensus is practitioner-grade, not RCT-grade.

5. **Healthcare patient-ID best practice** (Joint Commission NPSG.01.01.01, WHO Patient Safety Solutions) explicitly recognizes that **standardized identification systems can compromise patient confidentiality** and treats visible identifier choice as a deliberate privacy tradeoff. Two patient identifiers are required, but **name is only one of several** acceptable identifiers — an assigned ID number is equally valid.

6. **The threat model splits**:
   - **Immediate physical handoff:** mitigated by the matching code. The mother's concern doesn't bear on this surface.
   - **Social-engineering pre-attack:** someone reads the name today and weaponizes it next week outside church. This is the **live concern** the matching code does NOT defend against, and it's exactly what Wooden's Child Lures literature warns about.

---

## (1) Threat-model analysis — is name visibility on a worn sticker safe or risky?

| Threat | Does name visibility add risk? | Is risk mitigated by matching code? |
|---|---|---|
| **Stranger abduction at pickup** | No additional risk | YES — matching code stops it |
| **Predatory grooming via false rapport (Name Recognition Lure)** | YES — verified in practitioner literature | NO — operates outside the pickup moment |
| **In-system fraud (someone claims to be a known relative)** | Marginal — code requirement is the gate | YES — matching code stops it |
| **Mistaken-release / look-alike confusion in chaotic dismissal** | Name is HELPFUL here | N/A — name aids volunteer accuracy |
| **Lost-child rapid reunification** | Name is HELPFUL here | N/A — name speeds reunification |

**Key citation — practitioner consensus on name-recognition lure (Finding 7):**
> Cobb County Police Precinct 3 Criminal Investigations Unit: *"If a child's name is visible, it may put them on a first-name basis with an abductor or a predator as they appear to 'know' the child"* and *"An adult calling your child's name often makes the child think the person must be alright."*
> Source: https://www.ajc.com/news/use-caution-when-labeling-children-items-protect-them/CEIjaWAJ6FxFmAt1CJ2dhP/

**Key citation — academic literature caveat (Finding 8):**
> Jeglic/Winters (PubMed 36577252) red-flag grooming behaviors are *"specifically those related to desensitizing the child to physical contact and sexual content"* with no mention of name use or information gathering as discrete categories. Practitioner consensus exists; RCT-grade empirical evidence does not.

**Bottom line:** Inside a supervised classroom with a matching pickup code, the immediate physical-handoff threat is mitigated. The remaining live concern is the **social-engineering pre-attack** that operates outside the pickup moment — which the matching code does not defend against, and which Wooden's Child Lures literature explicitly addresses.

---

## (2) What leading platforms actually do

| Platform | Default label content | Configurable? | Source |
|---|---|---|---|
| **KidCheck** | Configurable from System Settings → Printing Options | **YES** — child name, primary guardian, guardian phone, pickup guardian, birthday, medical/allergy info, security watermark are independently selectable | https://www.kidcheck.com/tutorial/selectable-name-badge-content/ |
| **Planning Center Check-Ins** | Child name on child label; parent-side info redacted by default ("automatically restricts certain information — such as child location, or contact information — from the parents' security label") | **YES** — supports number-and-barcode-only labels for enhanced privacy | https://pcocheck-ins.zendesk.com/hc/en-us/articles/360017769394-Security |
| **Breeze ChMS** | Child name + 3- or 4-digit shared security code (matching child/parent tags) | **YES** — per-event name tag customization; admins choose "what fields go where on the name tag" | https://support.breezechms.com/hc/en-us/articles/360004338353-Customizing-Check-In-Name-Tags |
| **Church Community Builder (Pushpay), Tithely, ServiceU** | Not surfaced from public-web research | Unknown | (open question for Wave 10) |

**Vendor consensus (Finding 1):** three independent vendors offering label-content configuration is industry-level evidence that **label content is a tunable privacy decision, not a fixed safety primitive**.

**Validating the matching-code-as-primitive frame (Finding 2):**
> Breeze: *"For added safety & security, you can include the 3 or 4 digit code which will print on the child's name tag and the parents. Security codes give staff confidence and peace of mind that they are releasing children to the correct person"* and *"having the parent show the corresponding tag when picking up the child increases security."*

---

## (3) What child-safety organizations recommend

**Reached primary sources:**

- **ECAP v2 Standards (Finding 4):** Indicator 2.1 requires *"Age-appropriate access controlled areas are managed by check-in and check-out procedures with attendance being recorded, as necessary,"* but explicitly leaves implementation to organizations. **No accreditation-level prescription on label content.**
  Source: https://ecap.net/wp-content/uploads/2023/01/ECAP-Standards-v2-1.6.23-Portrait.pdf

- **GuideOne Insurance (Finding 3):** Published sample child-protection policy models a *"claim-check"* matching token as the verification primitive:
  > *"For children below third grade, a security check-in/check-out procedure will be followed. The child will be signed in by a parent or guardian, who will receive a 'child check' for the child similar to a claim check. The parent or guardian must present the 'child check' in order to sign out the child from our care."*
  The document contains **zero occurrences** of "label," "sticker," "name tag," "badge," "photo," "privacy," "PII," "first name," or "last name." A meaningful silence in an otherwise thorough document.
  Source: https://www.guideone.com/sites/default/files/sr-child-protection-policy-church-pdf.pdf
  **CAVEAT:** This sample policy is from 2016 (~10 years old). Jason should verify with current GuideOne SafeChurch guidance if seeking authoritative insurance-driven policy language.

**Not reached (open questions):**
- Plan to Protect specific guidance
- MinistrySafe published label-content recommendations
- Brotherhood Mutual underwriting expectations
- Church Mutual underwriting expectations
- (Likely available in their paid training materials or member-only resources rather than free public web.)

---

## (4) Texas state law context

- **TAC Chapter 746 § 746.631(a)** requires licensed child-care to document *"the name of each child; the date, time of arrival, and time of departure; and the employee or parent's initials or other unique identifier code."* — internal records only, **silent on wearable ID** (Finding 5).
  Source: https://www.law.cornell.edu/regulations/texas/26-Tex-Admin-Code-SS-746-631

- **Texas Human Resources Code § 42.041(b)(3)** (Finding 6) statutorily exempts *"a facility that is operated in connection with a shopping center, business, religious organization, or establishment where children are cared for during short periods while parents or persons responsible for the children are attending religious services...on or near the premises."* → Most church nursery / Sunday school / VBS contexts fit squarely within this exemption.
  Source: https://www.hhs.texas.gov/handbooks/child-care-regulation-handbook/2300-exemption-categories-types

- **TAC § 746.3001 (Field Trips)** is the one place Chapter 746 *does* require worn ID — but it requires the **center's name + phone, NOT the child's name** (consistent with the "don't put the child's name visible" philosophy). Applies only to off-site contexts.

**Bottom line for Texas churches:** No statutory floor mandates any specific label-content practice. The decision is entirely policy.

---

## (5) "Best of both worlds" patterns surveyed

| Pattern | Adoption | Security pros | Cons / friction |
|---|---|---|---|
| **Name visible + matching code on parent stub** | Mainstream (Breeze, current VolunteerCal) | Code is the actual primitive; name aids volunteer fluency | Name visibility is the very concern the mother raised |
| **First name + last initial** | Common admin choice | Reduces social-engineering surface; still aids volunteer recognition | Mild — siblings with same first name need disambiguation |
| **First name only** | Less common | Better than full name | Still gives a predator the first name |
| **Initials only ("S.J.")** | Niche | Strong privacy posture | Hard for volunteers to disambiguate; awkward for visitors |
| **Security code only — operator asks child verbally** | KidCheck supports as "number-and-barcode only" | Strongest privacy posture | Requires verbal child / volunteer-name-knowledge; fails for non-verbal or young children |
| **QR / barcode that resolves to name on operator scan** | Planning Center barcode mode is adjacent | Server-side reveal + audit | Adds kiosk equipment; not all volunteer environments have scanner |
| **Tap-to-reveal on operator screen only** | Novel — would match P0-4 medical_visibility tap-to-reveal pattern | Strongest defense against social-engineering pre-attack | Volunteer workflow friction (operator needs device) |

**Pattern that fits VolunteerCal cleanly:** the **first name + last initial** default with config to first-name-only, initials-only, or code-only. Matches KidCheck's selectable-content model.

---

## (6) The matching-code threat model rigorously

The pickup-release security primitive is **the code match**, not the name match. The sticker code and parent stub code are generated from the same source at check-in and are typically a 3- or 4-digit shared secret. Any pickup attempt that doesn't present the matching stub fails the code check, regardless of name knowledge.

What name visibility on a worn sticker actually adds:
1. **No additional defense at the pickup moment** — the code does that.
2. **No additional defense against in-system fraud** — code does that too.
3. **One additional attack surface: social engineering** — outside the pickup moment, in a separate session, by a predator who reads the name now and weaponizes it later (Wooden Child Lures #11).

The pre-attack vector is the only place where name visibility creates marginal risk that the matching-code primitive doesn't already eliminate. It's also the threat model the prevention literature specifically warns about.

---

## (7) Trauma-informed care + cross-domain perspective

**Joint Commission NPSG.01.01.01** (Finding 9) explicitly recognizes patient-ID visibility as a deliberate privacy/security tradeoff:
> The standard requires at least two identifiers (name, ID number, telephone, DOB, or "other person-specific identifier"). Name is **one acceptable identifier, but not the only one** — assigned ID numbers are equally valid.

**WHO Patient Safety Solutions (May 2007):**
> Recommends at least two identifiers "to verify a patient's identity... Neither of these identifiers should be the patient's room number" AND explicitly lists *"Possible compromising of patient confidentiality and privacy by standardized identification systems"* as one of six Risks for Unintended Consequences.
Source: https://cdn.who.int/media/docs/default-source/patient-safety/patient-safety-solutions/ps-solution2-patient-identification.pdf

**Bottom line:** healthcare has been thinking about this longer than church check-in. The healthcare frame — "visible identifier choice is a deliberate tradeoff to be designed, not a default" — translates cleanly to the church check-in context.

**Open question:** specific pediatric hospital practices (wristband content for special-needs / non-verbal children, behavioral-health pediatric unit conventions) were not reached by this research. Would inform the "tap-to-reveal" design pattern.

---

## (8) Adjacent label-content best practices (briefly)

These topics were not exhaustively researched but are flagged for follow-up:

- **Photo on label:** not surfaced from primary sources. Codex's earlier P0-2 work covered authorized-pickup photos, but volunteer-visible child photo on the sticker is a separate question.
- **Parent's last name instead of child's first name:** not enumerated in any surfaced source.
- **Label durability / removability / disposal:** not surfaced. Common-sense guidance only.
- **Security code length:** Breeze documents 3- or 4-digit codes as the default. VolunteerCal uses 4-digit codes today; this matches industry default.

---

## (9) Denominational guidance — open question

The brief asked about SBC, Methodist, Catholic, ELCA, PCA/PCUSA, Pentecostal denominational policies. **Not reached.** Denominations publish safe-environment policies, but specific label-content guidance was not surfaced from public-web sources. (Likely embedded in clergy training materials rather than public-facing policy.) The ERLC (SBC) link surfaced was unreliable; the UMC Safe Sanctuaries link surfaced but didn't have label-specific content.

---

## (10) Blind spots a generalist would miss

What an experienced child-safety auditor or insurance underwriter would also ask:

- **Adversarial drill against the matching code:** if a parent loses the stub, what's the override path? (VolunteerCal's plan has "lost-sticker re-display workflow" deferred — worth revisiting.)
- **Repeat-attack across services:** if the same code is reused across services, the social-engineering pre-attack widens. (Current VolunteerCal codes are per-session.)
- **Family-of-origin photo on file:** matches the GuideOne claim-check style with biometric backup.
- **Sticker disposal:** parents who leave stickers in the church trash leave a sticker with the child's name on it.
- **Side-channel info on the sticker:** does the room name reveal the child's grade? (Current VolunteerCal prints room name; that's mild but worth flagging.)

---

## What to tell the mother

> *"Your concern about a stranger reading your child's name and using it to build false rapport is recognized by child-safety experts including Kenneth Wooden's Child Lures Prevention Program and is the explicit reason police departments like Cobb County warn parents against visible names on backpacks. The matching security code on your pickup tag and your child's sticker is what stops a stranger from leaving with your child — that's the actual primitive — and the name on the sticker doesn't add to or weaken that pickup defense. What name visibility CAN do is give someone the ability to call your child by name later, outside church, where the matching-code protocol doesn't apply. Because of this, we're adding a setting that lets our church choose between the current full-name default, first-name-only, first name + last initial, initials only, or code-only — matching what KidCheck and Planning Center already offer. We'll bring the change for review and let you know when it ships."*

(3 paragraphs, ~150 words — readable aloud.)

---

## Recommendation: ship a configurable label-content option (W10-R)

**Default after research:** `first name + last initial` (e.g. "Sarah J.")

**Configurable alternatives:**
- Full name (current behavior — back-compat default for migrating churches)
- First name + last initial (RECOMMENDED NEW DEFAULT for new churches)
- First name only
- Initials only
- Security code only

**Why first-name-+-last-initial as the new default:**
- Reduces social-engineering pre-attack surface vs. full name
- Preserves volunteer workflow fluency vs. initials-only or code-only
- Disambiguates same-first-name siblings (last initial differs only when last names differ — i.e., blended families where it actually matters)
- Matches the implicit pattern in the Wooden Child Lures literature

**Implementation sketch (~2 days; lands as Wave 10 W10-R after research-confirmed):**
- `CheckInSettings.label_content_format?: "full_name" | "first_last_initial" | "first_only" | "initials_only" | "code_only"`
- Migrate existing churches to `"full_name"` to preserve current behavior
- New churches default to `"first_last_initial"`
- Admin UI in Settings → Children → Medical privacy (already the right section heading — privacy panel)
- Label generator reads the format and renders accordingly
- Audit event `checkin.label_format_changed`

---

## Future research (open questions)

1. Plan to Protect, MinistrySafe, Brotherhood Mutual, Church Mutual published label-content guidance (likely paid / member-only).
2. Major US Protestant denominational official policies on label content (SBC, UMC, Catholic dioceses, ELCA, PCA/PCUSA, Pentecostal).
3. Quantitative adoption data — what % of churches using Planning Center / Breeze / KidCheck deviate from the name default?
4. Pediatric hospital wristband conventions for special-needs / non-verbal / behavioral-health pediatric units.

---

## Methodology + sources caveat

Generated by the deep-research workflow harness (106 agents, 22 distinct sources). Cross-domain analogical sources (healthcare patient-ID) are flagged as analogical, not directly on-point. Insurance sample policy (GuideOne) is from 2016 — 10 years old — and Jason should verify current GuideOne SafeChurch guidance if seeking authoritative insurance-driven policy language. Treat this report as **strong on what IS cited and explicitly silent on what wasn't reached** (denominational, several insurance underwriting bodies, pediatric hospital wristband conventions).

**Primary sources cited:**
- https://www.kidcheck.com/tutorial/selectable-name-badge-content/
- https://support.breezechms.com/hc/en-us/articles/360004338353-Customizing-Check-In-Name-Tags
- https://pcocheck-ins.zendesk.com/hc/en-us/articles/360017769394-Security
- https://www.guideone.com/sites/default/files/sr-child-protection-policy-church-pdf.pdf
- https://ecap.net/wp-content/uploads/2023/01/ECAP-Standards-v2-1.6.23-Portrait.pdf
- https://ministrysafe.com/the-safety-system/policies-procedures/
- https://www.law.cornell.edu/regulations/texas/26-Tex-Admin-Code-SS-746-631
- https://www.hhs.texas.gov/sites/default/files/documents/doing-business-with-hhs/provider-portal/protective-services/ccl/min-standards/chapter-746-centers.pdf
- https://www.hhs.texas.gov/handbooks/child-care-regulation-handbook/2300-exemption-categories-types
- https://www.jointcommission.org/en-us/knowledge-library/support-center/standards-interpretation/standards-faqs/000001545
- https://cdn.who.int/media/docs/default-source/patient-safety/patient-safety-solutions/ps-solution2-patient-identification.pdf
- https://pubmed.ncbi.nlm.nih.gov/36577252/
- https://www.umcdiscipleship.org/articles/safe-sanctuaries-policies-and-guidelines-for-smaller-congregations

**Secondary sources cited:**
- https://www.ajc.com/news/use-caution-when-labeling-children-items-protect-them/CEIjaWAJ6FxFmAt1CJ2dhP/ (Cobb County Police PIO statement reproduced)
- https://www.ortv.org/Charter/17_lures_predators_may_use.htm (Wooden Child Lures program summary)
- https://www.manateesheriff.com/child_abuse_prevention/common_child_lures.php (Manatee County Sheriff)
- https://www.kidcheck.com/feature/security-labels/ (KidCheck marketing)
- https://www.missingkids.org/blog/2025/backpacks-packed-dont-forget-these-safety-skills (NCMEC blog)
