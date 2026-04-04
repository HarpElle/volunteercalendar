# SuperGrok Heavy — Strategic & Business Analysis

## Platform & Mode

**Use:** Grok 3 with **DeepSearch** enabled. On the xAI/Grok interface, select the DeepSearch toggle before submitting. This causes Grok to search X/Twitter, the web, and news sources in real-time before synthesizing a response. This is critical for the sentiment analysis and competitive intelligence portions of this prompt.

**Why SuperGrok third:** By now you have Perplexity's market data and ChatGPT's UX analysis. Before pasting this prompt, add a brief context block at the top with 5-10 key findings from those two — Grok will use them to sharpen its strategic analysis.

**Grok's unique strength:** Real-time X/Twitter access. No other platform can tell you what church tech leaders are complaining about THIS WEEK. It's also the most opinionated of the bunch, which is what we want for strategic advice.

**Pre-prompt context to add:** Before the main prompt below, paste something like:

> "Context from prior research: [2-3 sentences on market size from Perplexity]. [2-3 sentences on UX gaps from ChatGPT]. [Your current pricing tiers]. Use this as a foundation for your analysis."

---

## Prompt (copy everything below this line)

---

I'm building VolunteerCal, a church volunteer scheduling SaaS expanding into a broader church management platform. Built on Next.js + Firebase. Currently has: volunteer scheduling with auto-schedule algorithm, children's check-in with kiosk UI and label printing, room/resource booking with approval workflow, service planning with stage sync (live conductor view for worship), ProPresenter export, digital room signage. Targeting US churches with 50-500 weekly attendees. 1 beta church currently. No giving module yet.

Current pricing tiers: Free (1 team, 10 volunteers), Starter $19/mo (3 teams, 25 vols), Growth $49/mo (unlimited teams, 100 vols, check-in), Pro $99/mo (unlimited everything, stage sync, rooms).

I need strategic business analysis — not feature lists. Be direct and opinionated. This response will be consumed by an AI coding assistant (Claude) for synthesis into product decisions, so optimize for structured, actionable output.

## Output Format Requirements

Use this structure for every section: **Assertion** (your position), **Evidence** (data points, X/Twitter sentiment, market signals), **Recommendation** (specific action I should take), **Risk if ignored** (what happens if I don't do this). Keep assertions bold and direct — I need clear opinions, not "it depends." Use bullet points. If you reference X/Twitter posts or discussions, include the gist of the conversation and approximate date/reach.

---

## Section A: Market Positioning & Competitive Moat

1. Planning Center dominates the 200-2,000 seat church market with 15+ years of momentum and a modular pricing model. **What is the realistic path to competing?** Should I compete head-on, position as an alternative, or find an underserved niche?

2. Churches under 100 attendees are massively underserved — current tools are too expensive or too complex for a volunteer-run church with no paid staff. **Is this a viable primary market?** What's the realistic ARPU? Can you build a sustainable business on $0-19/month customers?

3. **What's the current sentiment on X/Twitter about Planning Center?** Search for recent posts about PCO pricing, PCO complaints, PCO alternatives, "switching from Planning Center," and church software frustrations. What do people love? What do they hate? Any recent controversies?

4. **Is there a "Notion for churches" opportunity?** One unified platform replacing 3-4 subscriptions (scheduling + check-in + giving + communication). Or do churches actually prefer best-of-breed modular tools? What does X/Twitter sentiment suggest?

5. **What about the international market?** Are there underserved church markets outside the US (UK, Australia, Africa, Latin America) where a modern platform could gain traction faster than in the US?

## Section B: Pricing Strategy

1. My current tiers: Free ($0, 1 team, 10 vols), Starter ($19/mo, 3 teams, 25 vols), Growth ($49/mo, unlimited teams, 100 vols, check-in), Pro ($99/mo, unlimited, stage sync, rooms).

   **How does this stack up against the market?** Am I underpriced, overpriced, or mispriced? Be specific about which tier has problems.

2. **Per-person pricing (like PCO) vs. flat tiers vs. hybrid** — which model works best for church software? What are the psychological dynamics? (Churches hate per-person because growth = higher bill. But flat tiers leave money on the table for large churches.)

3. **Should Giving be included or a separate module/revenue stream?** Giving is the highest-margin feature in church software (percentage of transactions). But it's also the most competitive space. What's the right play for a new entrant?

4. **"Church Starter Kit" bundle concept:** Scheduling + check-in + basic giving at an aggressive price ($29/mo?) to land small churches, then upsell. Viable? Or does bundling confuse the value proposition?

5. **Free tier strategy:** Does a free tier drive conversion in church software, or does it just create support costs? What do the conversion rates look like for freemium church tools? Search X/Twitter for discussions about free church software tools.

## Section C: Go-to-Market

1. **What are the most effective channels for reaching church decision-makers?** Rank these by effectiveness and cost:
   - Church tech conferences (which ones?)
   - Facebook groups (which ones?)
   - Pastoral networks / denominations
   - YouTube content marketing
   - Google Ads / SEO
   - Church tech blogs / review sites
   - Direct outreach to church admins
   - Partnership with church consultants

2. **How do I get from 1 beta church to 50 paying churches?** What's the realistic timeline? What's the playbook?

3. **Should I target a specific denomination first?** Non-denominational evangelical? Mainline Protestant? Catholic? Which segment is:
   - Most likely to adopt new software?
   - Least locked into existing platforms?
   - Most price-sensitive vs. most willing to pay?
   - Most likely to recommend to other churches?

4. **What role do church consultants / "church tech" influencers play?** Are there specific people on X/Twitter or YouTube who review church software? What would it take to get a review?

5. **Search X/Twitter for:** "church software recommendation," "Planning Center alternative," "best church management software 2025," "switching church software." What are people actually asking for and recommending?

## Section D: Build vs. Integrate vs. Skip

For each capability below, give me a clear **build / integrate / skip** recommendation with reasoning:

1. **Giving/donations** — Build on Stripe Connect? Integrate with Tithe.ly? Skip entirely and partner?
2. **Background checks** — Build a Protect My Ministry integration? Integrate with a different provider? Which has the best API?
3. **Bulk messaging** — I have Twilio for SMS. What about email? Build on Postmark/SES or integrate with Mailchimp/church-specific tools?
4. **Mobile app** — PWA (what I'm building) vs. native app in App Store/Play Store? Do churches care? Do volunteers care?
5. **Church directory / member management** — Build or position scheduling + check-in as complementary to an existing ChMS?
6. **Small groups management** — Important for mid-size churches. Build or skip?
7. **Event registration** — Churches do a lot of event signups. Build or integrate?
8. **Website builder** — Some platforms (Subsplash, Faithlife) include church website builders. Worth considering or total distraction?
9. **Accounting integration** — QuickBooks/Xero integration for giving data. Build or skip?

## Section E: Risks & Failure Modes

1. **What kills church SaaS startups?** Research and list the common failure modes. What happened to failed church tech companies? Search X/Twitter and the web for church software shutdowns, pivots, and failures.

2. **PCO has 15 years of momentum. What's my realistic moat?** What can a new entrant do that PCO structurally cannot or will not do?

3. **Firebase/Firestore at scale — when does this become a problem?** At what church count / data volume should I plan for migration? What are the cost inflection points? (I'm currently on Firebase's free/low-cost tier with 1 church.)

4. **Single-founder risk** — I'm building this solo with AI assistance. What's the honest assessment of viability? What milestones should I hit before considering this a real business vs. a side project?

5. **Platform risk** — Firebase, Vercel, Stripe, Twilio. What happens if any of these change pricing dramatically? Which dependency is the riskiest?

## Section F: The Big Picture Question

**If you were starting a church management SaaS from scratch today with $0 in funding, a working MVP with scheduling + check-in + service planning + room booking, and 1 beta church — what would you do in the next 6 months?** Give me a month-by-month roadmap with specific milestones and metrics.

---

## Final Output

End with a ranked list of the **5 most important strategic decisions** I need to make in the next 30 days, with your recommended answer for each.
