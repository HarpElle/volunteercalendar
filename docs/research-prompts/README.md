# VolunteerCal Research Prompts

Five prompts designed for five different AI platforms, each playing to that platform's strengths. Run them in order — each one builds on the findings of the previous.

## Execution Order

| # | File | Platform | Mode | Purpose | Est. Time |
|---|---|---|---|---|---|
| 1 | `01-perplexity-pro-market-research.md` | Perplexity Pro | **Deep Research** (toggle ON) | Factual foundation: market size, pricing, integrations, regulations | 5-10 min |
| 2 | `02-chatgpt-pro-ux-teardown.md` | ChatGPT Pro/Plus | **GPT-4o** (standard, NOT Deep Research) | UX competitor analysis, interaction patterns, gaps | 3-5 min |
| 3 | `03-supergrok-heavy-strategy.md` | Grok 3 | **DeepSearch** (toggle ON) | Business strategy, X/Twitter sentiment, pricing, GTM | 5-10 min |
| 4 | `04-gemini-ultra-architecture.md` | Gemini Advanced | **Standard chat** (use 1M context window) | Technical architecture: Person model, permissions, Firestore schema | 3-5 min |
| 5 | `05-claude-max-implementation.md` | Claude.ai (Max) | **Extended Thinking** (toggle ON) | Synthesis of all findings into executable implementation plan | 5-10 min |

## How to Use

### Step 1: Perplexity
1. Open perplexity.ai, ensure you're on Pro
2. Toggle **Deep Research** ON (top of input box)
3. Copy everything below the "---" separator line in `01-perplexity-pro-market-research.md`
4. Paste and submit
5. Save the full response (copy to a Google Doc or text file)

### Step 2: ChatGPT
1. Open chat.openai.com, select **GPT-4o**
2. Do NOT enable Deep Research — use standard mode
3. Copy everything below the "---" separator in `02-chatgpt-pro-ux-teardown.md`
4. Paste and submit
5. If output gets cut off, reply: "Continue from where you left off, starting with [last section heading]"
6. Save the full response

### Step 3: SuperGrok
1. Open grok.x.ai (or x.com/grok)
2. Toggle **DeepSearch** ON
3. First, paste a 5-10 line summary of key findings from Perplexity + ChatGPT as context
4. Then paste everything below the "---" separator in `03-supergrok-heavy-strategy.md`
5. Save the full response

### Step 4: Gemini
1. Open gemini.google.com, select **Gemini Advanced** (Ultra)
2. Use standard chat mode (NOT Deep Research)
3. First, paste: key Perplexity findings + ChatGPT comparison table + Grok's top 5 decisions + your `src/lib/types/index.ts` file
4. Then paste everything below the "---" separator in `04-gemini-ultra-architecture.md`
5. Save the full response

### Step 5: Claude
1. Open claude.ai (ensure Extended Thinking is on in Settings)
2. Paste in order: Perplexity highlights, ChatGPT synthesis, Grok roadmap, Gemini full architecture, your types file, your scheduler file
3. Then paste everything below the "---" separator in `05-claude-max-implementation.md`
4. Save the full response — this is the final implementation plan

### Step 6: Back to Claude Code
Take the Phase 0 checklist from the Claude.ai response and paste it into Claude Code (the CLI) as your starting instruction. Execute phase by phase.

## Key Points

- **Each prompt tells the AI to format output for machine consumption** — structured markdown, consistent headings, tables, and code blocks that Claude Code can parse
- **Each prompt builds on prior findings** — you paste context from earlier prompts into later ones
- **The Gemini and Claude prompts request exact TypeScript code** — not pseudocode, not descriptions
- **Total research time:** ~2-3 hours including reading and saving responses
- **After the follow-up question** ("What's the most important thing I'm NOT asking about?") on each platform, save those answers too — they surface different blind spots based on each AI's training data
