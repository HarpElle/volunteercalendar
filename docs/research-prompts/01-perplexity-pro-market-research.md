# Perplexity Pro — Market Research & Competitive Intelligence

## Platform & Mode

**Use:** Perplexity Pro with **Deep Research** mode enabled (the toggle at the top of the input box). Deep Research will cause Perplexity to browse dozens of sources, synthesize across them, and produce a long-form cited report. This is critical — standard Perplexity gives short answers. Deep Research gives you the comprehensive, cited analysis we need.

**Why Perplexity first:** It's the only platform that reliably cites real sources with URLs. Everything it returns can be fact-checked. The data from this prompt feeds into every subsequent prompt on other platforms.

---

## Prompt (copy everything below this line)

---

I'm building a church management + volunteer scheduling SaaS called VolunteerCal, targeting US churches with 50-500 weekly attendees. I need comprehensive market research to inform product strategy, pricing, and competitive positioning. This research will be synthesized by an AI coding assistant (Claude) to drive architectural and business decisions, so please optimize your response for machine consumption.

## Output Format Requirements

Structure your entire response as clearly labeled sections with consistent formatting. For every factual claim, include an inline citation with the source name and URL. Use tables for any comparative data. Use bullet points, not paragraphs, for individual facts. Where exact numbers aren't available, state the confidence level (e.g., "estimated," "self-reported by vendor," "based on 2023 data"). Do NOT round aggressively — preserve specificity (e.g., "$14/mo for up to 75 people" not "about $15/mo").

When you're uncertain or data is outdated, say so explicitly rather than hedging with vague language. If a source contradicts another source, note both and which is more recent.

---

## Section A: Market Size & Adoption

1. How many churches exist in the US? Break down by weekly attendance bracket:
   - Under 50
   - 50-99
   - 100-249
   - 250-499
   - 500-999
   - 1,000-1,999
   - 2,000+
2. What percentage of US churches currently use dedicated scheduling/management software vs. spreadsheets/email vs. no digital tools at all?
3. What is the average annual software/technology budget for a church with 100-500 weekly attendees?
4. What are the top 10 church management software platforms by estimated market share or user count as of 2025-2026? Include both full ChMS platforms and scheduling-specific tools.
5. What is the total addressable market (TAM) for church management software in the US? Any estimates of current market size in revenue?
6. What is the growth rate of the church management software market?

## Section B: Competitive Pricing — Current & Verified

For each platform below, provide the exact current pricing as of 2025-2026. Use a table format with columns: Tier Name | Monthly Price | Included Features | Limits (people/teams/etc.) | Per-Person Fees if Any.

1. **Planning Center** — Price each module separately: Services, People, Check-Ins, Groups, Giving, Registrations, Publishing. What's free? What triggers paid tiers? What is the per-person pricing model?
2. **Breeze ChMS** — Current pricing. What's included at each tier? Any per-person fees? What add-ons cost extra?
3. **ChurchTrac** — All tiers with limits and features at each level
4. **Elvanto / Tithely Church Management** — Current pricing post-Tithely acquisition. Has it changed?
5. **Church Community Builder (Pushpay)** — Pricing model. Is it still available as standalone?
6. **Subsplash** — Pricing for church app + giving + engagement platform
7. **Faithlife Equip / Proclaim** — Current pricing and what's included
8. **FellowshipOne (now Ministry Brands)** — Still available? Pricing?
9. **Rock RMS** — Open source, but what are hosting/support costs?
10. **Any notable newcomers** in the 2024-2026 timeframe

## Section C: Switching Behavior & Decision-Making

1. What are the top 3-5 reasons churches switch from one management platform to another? Cite Lifeway Research, Barna Group, ECFA, ChurchTechToday, or similar sources if available.
2. What is the average contract length or commitment period for the major platforms? Which ones have annual contracts vs. month-to-month?
3. Who makes software purchasing decisions in a typical church? (Senior pastor? Executive pastor? Admin staff? Volunteer coordinator? Committee?) How long does the decision process typically take?
4. What is the typical churn rate for church SaaS products? How does this compare to general B2B SaaS?
5. What are the most common migration paths? (e.g., "Churches moving FROM spreadsheets TO Planning Center" or "FROM CCB TO Breeze")

## Section D: Integration Landscape

1. **Background checks:** Which providers do churches commonly use? (Protect My Ministry, MinistrySafe, Sterling Volunteers, Checkr, etc.) Which ones offer REST APIs or integration partnerships? What is the typical cost per check?
2. **Calendar integrations:** What calendar platforms matter most for churches? (Google Calendar, Apple Calendar, Outlook/Exchange, iCal feeds) Do any ChMS platforms offer two-way calendar sync?
3. **Giving/payment platforms:** What giving platforms do churches use beyond their primary ChMS? (Tithe.ly Giving, Pushpay, Givelify, Stripe direct, Square, Vanco, easyTithe) What percentage of churches use their ChMS's built-in giving vs. a standalone giving platform?
4. **Communication tools:** What do churches use for bulk email and SMS? (Mailchimp, Constant Contact, Twilio, Postmark, PastorsLine, Clearstream, Text In Church) Which integrations between ChMS and communication tools exist?
5. **Presentation/worship:** ProPresenter, EasyWorship, OpenLP, MediaShout — do any of these integrate with ChMS platforms? How?
6. **Accounting:** What accounting integrations matter? (QuickBooks, Xero, church-specific like ACS, Aplos)

## Section E: Regulatory & Compliance

1. What data privacy regulations apply to churches handling children's check-in data in the US? Are churches exempt from certain regulations?
2. Are there state-specific requirements for background checks on children's ministry volunteers? Which states have the strictest requirements?
3. Does COPPA apply to church check-in systems that store children's names, birthdays, and medical information? What's the legal consensus?
4. What are the PCI DSS implications if a church platform handles giving/donations?
5. Are there any denomination-specific data handling requirements? (e.g., Catholic diocese reporting, SBC requirements)

## Section F: Technology Trends

1. What technology trends are emerging in church management? (AI scheduling, mobile-first, kiosk hardware, QR code check-in, digital giving trends)
2. What percentage of churches have adopted mobile apps for their congregation? Which platforms provide white-label apps?
3. Is there movement toward open-source church management solutions? What's the adoption of Rock RMS?
4. What role does multi-site/multi-campus management play? What percentage of churches in the 250-500 range are multi-site?

---

## Final Synthesis

After completing all sections, provide a 10-bullet "Key Takeaways" summary highlighting the most actionable findings for a new entrant targeting the 50-500 attendee market with a unified scheduling + check-in + service planning platform priced between $0-$99/month.
