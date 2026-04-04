# ChatGPT Pro — UX/UI Competitor Teardown

## Platform & Mode

**Use:** ChatGPT Pro (or Plus) with **GPT-4o**. Do NOT use Deep Research mode here — ChatGPT's Deep Research is slow (30+ minutes) and optimized for academic-style reports, not UX analysis. Standard GPT-4o with browsing enabled will give you faster, more practical results.

**If you have ChatGPT Pro:** You could optionally use **o1-pro** for the final synthesis question at the end, but GPT-4o is better for the descriptive UX walkthrough portions.

**Why ChatGPT second:** It's strong at structured comparisons and descriptive analysis. By now you have Perplexity's pricing data, so you can mentally validate what ChatGPT describes against real numbers.

**Tip:** If the response is getting cut off (ChatGPT sometimes truncates long outputs), reply with "Continue from where you left off, starting with [last section heading]." You may need to do this 2-3 times given the length of this prompt.

---

## Prompt (copy everything below this line)

---

I'm building a church volunteer scheduling + management SaaS and need a detailed UX/UI teardown of the major competitors. I'll be feeding your response to an AI coding assistant (Claude) that will use it to inform UI/UX architecture decisions, so please optimize for machine readability.

## Output Format Requirements

For each platform, use this exact structure with consistent heading levels. Use markdown tables for any comparative data. Be specific about UI elements — describe layouts (sidebar? top nav? tabs?), button placements, color usage, and interaction patterns. When describing a flow, number each step with the exact click/tap sequence. If you're uncertain about a specific UI detail, say "unverified" rather than guessing. Include the approximate date of your knowledge for each platform (since UIs change).

Use this template for each platform:

```
### [Platform Name]
**Knowledge date:** [approximate]
**Primary URL:** [url]

#### Navigation & Information Architecture
- Main nav structure: [describe]
- Hierarchy depth: [levels]
- Home/dashboard contents: [describe]

#### Schedule Generation Flow
1. [Step-by-step with click counts]

#### Volunteer Experience
- [Structured sub-items]

#### Check-In System
- [If applicable]

#### Service Planning
- [If applicable]

#### Strengths
- [Bullet points]

#### Weaknesses & User Complaints
- [Bullet points with sources if possible]
```

---

## Platforms to Analyze

### 1. Planning Center Services (services.planningcenteronline.com)

**Navigation & IA:**
- What are the main navigation sections in Planning Center Services specifically (not the full PCO suite)?
- How does PCO Services relate to PCO People, PCO Check-Ins, etc.? Is navigation between modules seamless or jarring?
- What's on the Services home/dashboard screen?

**Schedule Generation Flow:**
1. Starting from the PCO Services dashboard, walk me through every click to generate a 4-week Sunday morning schedule for 3 teams (Audio, Video, Worship Band) where each team has 2-4 positions.
2. What does the scheduling matrix/grid look like? Is it a calendar view, list view, or something else?
3. How does auto-scheduling work? What algorithm options or preferences can you set?
4. How are scheduling conflicts displayed? (Double-booked, blackout dates, max frequency exceeded)
5. Can you drag-and-drop assignments? What does the interaction feel like?
6. What does the draft vs. published state look like visually?
7. How do you send schedule notifications to volunteers?

**Volunteer Experience:**
1. What does a volunteer see when they open Planning Center? (Web and mobile app)
2. How do they accept or decline a scheduling request? Exact flow with tap count.
3. How do they set their availability? (Blockout dates — what's the UI?)
4. Can they request swaps? What's the approval process?
5. What does the mobile app (Church Center) look like for a volunteer?
6. How do volunteers see their upcoming schedule? Calendar view? List?

**Check-In (PCO Check-Ins):**
1. What does the kiosk interface look like? Describe the visual design.
2. How does check-in link to the volunteer roster? Can a service leader see check-in status alongside the schedule?
3. Label printing — what information is on the label? Can it be customized?
4. How does the self-check-in flow work for families?

**Service Planning:**
1. How do you build a service plan (order of service) in PCO Services?
2. Can you add songs, notes, media, and headers to the plan?
3. How does PCO Services Live work? What does the production director see?
4. Is there a stage display? What information shows on it?
5. How tightly is the service plan linked to the schedule? Same screen or separate?

---

### 2. Breeze ChMS (breezechms.com)

Same questions as above, adjusted for Breeze's capabilities. Breeze is known for simplicity — describe how that simplicity manifests in the UI. What does Breeze NOT have that PCO does? Where does simplicity become a limitation?

---

### 3. Elvanto / Tithely Church Management (tithe.ly/church-management or elvanto.com)

Same questions. Note: Elvanto was acquired by Tithely. Describe the current state — is it still Elvanto's UI rebranded, or has Tithely rebuilt it? How does it integrate with Tithely Giving?

---

### 4. ChurchTrac (churchtrac.com)

Same questions. ChurchTrac targets smaller/budget-conscious churches. How does the UX reflect this? Is it modern or dated? What compromises come with the lower price?

---

### 5. Church Community Builder / Pushpay (churchcommunitybuilder.com)

Same questions. CCB targets larger churches. How does the complexity scale? What's the learning curve? How does it integrate with Pushpay giving?

---

## Cross-Platform Comparison Table

After all 5 teardowns, provide a comparison table with these columns:

| Feature | PCO Services | Breeze | Elvanto/Tithely | ChurchTrac | CCB/Pushpay |
|---|---|---|---|---|---|
| Clicks to generate 4-week schedule | | | | | |
| Auto-schedule capability | | | | | |
| Drag-and-drop scheduling | | | | | |
| Conflict visualization | | | | | |
| Volunteer mobile app | | | | | |
| Accept/decline tap count | | | | | |
| Swap request flow | | | | | |
| Availability/blockout UI | | | | | |
| Children's check-in | | | | | |
| Kiosk UI quality | | | | | |
| Label printing | | | | | |
| Service planning | | | | | |
| Live/stage display | | | | | |
| API availability | | | | | |
| Multi-site support | | | | | |
| Overall UX polish (1-10) | | | | | |

## Best-of-All-Worlds Synthesis

Based on your analysis, describe the ideal scheduling + management platform UX by taking the best patterns from each competitor:

1. **Navigation structure** — whose is best and why? What would you keep/change?
2. **Schedule generation** — describe the ideal flow combining the best elements
3. **Volunteer experience** — what's the gold standard for mobile schedule management?
4. **Check-in** — what's the ideal kiosk + admin experience?
5. **Service planning** — what's the ideal integration between planning and scheduling?
6. **The one thing nobody does well** — what gap exists across ALL platforms that a new entrant could own?

## Gaps & Opportunities

List 5-10 specific features or UX patterns that NO current platform does well, where a new entrant has an opportunity to differentiate. For each, describe:
- What the gap is
- Why incumbents haven't solved it
- How it could be implemented
- Which church size segment would value it most
