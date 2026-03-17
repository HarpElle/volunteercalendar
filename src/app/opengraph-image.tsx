import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "VolunteerCal — Flexible Volunteer Scheduling";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#2D3A6E",
          gap: "24px",
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

        {/* Title */}
        <div
          style={{
            display: "flex",
            fontSize: "64px",
            fontWeight: 700,
            fontFamily: "Georgia, serif",
          }}
        >
          <span style={{ color: "#FEFCF9" }}>Volunteer</span>
          <span style={{ color: "#E07A5F" }}>Cal</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: "28px",
            color: "rgba(254, 252, 249, 0.8)",
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          Flexible Volunteer Scheduling
        </div>

        {/* URL */}
        <div
          style={{
            fontSize: "22px",
            color: "#D4A574",
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          volunteercal.com
        </div>
      </div>
    ),
    { ...size },
  );
}
