import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import Anthropic from "@anthropic-ai/sdk";
import type { SongChartData } from "@/lib/types";

const MAX_PDF_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/songselect/convert-pdf
 *
 * Accept a PDF chord chart file, send it to Claude Vision API
 * for structured extraction, and return SongChartData JSON.
 *
 * Requires ANTHROPIC_API_KEY env var.
 */
export async function POST(req: NextRequest) {
  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    await adminAuth.verifyIdToken(token);

    // --- Check for API key ---
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "PDF conversion is not configured. ANTHROPIC_API_KEY is missing." },
        { status: 503 },
      );
    }

    // --- Read form data ---
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file in form data" }, { status: 400 });
    }

    if (!file.type.includes("pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 400 },
      );
    }

    if (file.size > MAX_PDF_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 5 MB)" },
        { status: 400 },
      );
    }

    // --- Convert PDF to base64 ---
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    // --- Call Claude Vision API ---
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            {
              type: "text",
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    // --- Extract JSON from response ---
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text response from AI conversion" },
        { status: 502 },
      );
    }

    // Parse the JSON from the response (may be wrapped in ```json ... ```)
    const raw = textBlock.text;
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Could not extract structured data from PDF" },
        { status: 422 },
      );
    }

    const chartData: SongChartData = JSON.parse(jsonMatch[1]);

    // Basic validation
    if (!chartData.metadata || !Array.isArray(chartData.sections)) {
      return NextResponse.json(
        { error: "AI response did not match expected format" },
        { status: 422 },
      );
    }

    return NextResponse.json({ chart_data: chartData });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Failed to parse AI response as JSON" },
        { status: 422 },
      );
    }
    console.error("[POST /api/songselect/convert-pdf]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Extraction prompt for Claude Vision
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPT = `You are extracting structured chord chart data from a SongSelect PDF chord chart.

Analyze this PDF and return a JSON object with this exact structure:

{
  "metadata": {
    "title": "Song Title",
    "artist": "Artist Name" or null,
    "writers": "Writer 1, Writer 2" or null,
    "original_key": "G" or null,
    "tempo": 120 or null,
    "time_signature": "4/4" or null,
    "ccli_number": "1234567" or null,
    "copyright": "Copyright text" or null
  },
  "sections": [
    {
      "id": "sec_1",
      "type": "verse",
      "label": "Verse 1",
      "lines": [
        {
          "segments": [
            { "chord": "G", "lyrics": "Amazing grace how " },
            { "chord": "C", "lyrics": "sweet the " },
            { "chord": "G", "lyrics": "sound" }
          ]
        }
      ]
    }
  ]
}

Rules:
- Each section has a "type" from: verse, chorus, pre-chorus, bridge, intro, outro, ending, interlude, tag, instrumental, vamp, turnaround, misc
- Each line's "segments" array pairs chords with the lyrics that follow them
- If lyrics appear before any chord, use { "chord": null, "lyrics": "text" }
- If a chord appears with no lyrics (e.g., instrumental), use { "chord": "G", "lyrics": "" }
- Preserve the exact chord symbols as written (e.g., "D/F#", "Cadd9", "Em7")
- Section IDs should be "sec_1", "sec_2", etc.
- Extract all metadata visible on the page (title, CCLI number, copyright, key, etc.)
- Return ONLY the JSON object wrapped in \`\`\`json ... \`\`\` markers, no other text`;
