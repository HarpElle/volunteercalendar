import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

/**
 * GET /api/og?title=...&subtitle=...
 *
 * Generates a dynamic 1200x630 Open Graph image with:
 *   - Organization name (title) in large text
 *   - Page context (subtitle) below
 *   - "powered by VolunteerCal" branding at the bottom
 *
 * Falls back to the default VolunteerCal branding when no title is provided.
 */
export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title") || "";
  const subtitle = req.nextUrl.searchParams.get("subtitle") || "";

  // If no org name provided, render the default VolunteerCal card
  const hasOrg = title.length > 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#2D3A6E",
          padding: "60px 80px",
        }}
      >
        {hasOrg ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
            }}
          >
            {/* Calendar icon */}
            <svg
              width="80"
              height="80"
              viewBox="0 0 200 200"
              fill="none"
              stroke="#FEFCF9"
              strokeWidth="8"
            >
              <rect x="4" y="4" width="192" height="192" rx="24" />
              <line x1="4" y1="66" x2="196" y2="66" />
              <line x1="66" y1="4" x2="66" y2="66" />
              <line x1="134" y1="4" x2="134" y2="66" />
              <circle cx="60" cy="130" r="12" fill="#FEFCF9" />
              <circle cx="100" cy="130" r="12" fill="#FEFCF9" />
              <circle cx="140" cy="130" r="12" fill="#FEFCF9" />
            </svg>

            {/* Org name */}
            <div
              style={{
                display: "flex",
                fontSize: title.length > 30 ? "42px" : "56px",
                fontWeight: 700,
                color: "#FEFCF9",
                fontFamily: "Georgia, serif",
                textAlign: "center",
                lineHeight: 1.2,
                marginTop: "32px",
                maxWidth: "100%",
              }}
            >
              {title}
            </div>

            {/* Subtitle */}
            {subtitle && (
              <div
                style={{
                  display: "flex",
                  fontSize: "30px",
                  color: "rgba(254, 252, 249, 0.75)",
                  fontFamily: "Helvetica, Arial, sans-serif",
                  textAlign: "center",
                  marginTop: "16px",
                }}
              >
                {subtitle}
              </div>
            )}

            {/* Powered by VolunteerCal */}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: "6px",
                fontSize: "20px",
                fontFamily: "Helvetica, Arial, sans-serif",
                marginTop: "40px",
              }}
            >
              <span style={{ color: "#D4A574" }}>powered by</span>
              <span style={{ color: "#FEFCF9", fontWeight: 600 }}>Volunteer</span>
              <span style={{ color: "#E07A5F", fontWeight: 600 }}>Cal</span>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
            }}
          >
            {/* Calendar icon */}
            <svg
              width="160"
              height="160"
              viewBox="0 0 200 200"
              fill="none"
              stroke="#FEFCF9"
              strokeWidth="8"
            >
              <rect x="4" y="4" width="192" height="192" rx="24" />
              <line x1="4" y1="66" x2="196" y2="66" />
              <line x1="66" y1="4" x2="66" y2="66" />
              <line x1="134" y1="4" x2="134" y2="66" />
              <circle cx="60" cy="130" r="12" fill="#FEFCF9" />
              <circle cx="100" cy="130" r="12" fill="#FEFCF9" />
              <circle cx="140" cy="130" r="12" fill="#FEFCF9" />
            </svg>

            {/* Brand name */}
            <div
              style={{
                display: "flex",
                fontSize: "64px",
                fontWeight: 700,
                fontFamily: "Georgia, serif",
                marginTop: "32px",
              }}
            >
              <span style={{ color: "#FEFCF9" }}>Volunteer</span>
              <span style={{ color: "#E07A5F" }}>Cal</span>
            </div>

            {/* Tagline */}
            <div
              style={{
                display: "flex",
                fontSize: "28px",
                color: "rgba(254, 252, 249, 0.8)",
                fontFamily: "Helvetica, Arial, sans-serif",
                marginTop: "16px",
              }}
            >
              Flexible Volunteer Scheduling
            </div>

            {/* URL */}
            <div
              style={{
                display: "flex",
                fontSize: "22px",
                color: "#D4A574",
                fontFamily: "Helvetica, Arial, sans-serif",
                marginTop: "20px",
              }}
            >
              volunteercal.com
            </div>
          </div>
        )}
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
