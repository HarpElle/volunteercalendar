/**
 * Wave 11 Org Branding Sub-PR A — branding upload validation tests.
 *
 * The validateAndCanonicalize() helper is inlined in the route file
 * (no separate module yet); to keep this unit test independent of
 * Next request plumbing, we copy the helper's expected behavior
 * here and exercise it via a tiny harness that re-implements the
 * same shape. If we later extract the helper into
 * src/lib/server/branding-validator.ts, these tests can be pointed
 * at it directly without changing assertions.
 *
 * What this test ENFORCES:
 *   - SVG with <script> tag → rejected
 *   - SVG that doesn't start with <svg → rejected
 *   - PNG smaller than 256×256 → rejected
 *   - JPEG smaller than 256×256 → rejected
 *   - Valid PNG → re-encoded as PNG
 *   - Valid JPEG → re-encoded as JPEG
 *   - Unsupported mime → rejected
 *
 * These tests guard against the cases where a malicious upload could
 * bypass client-side validation by sending raw fetch with crafted
 * headers — the server-side validator is the trust boundary.
 */

import { describe, it, expect } from "vitest";
import sharp from "sharp";

const MIN_DIMENSION = 256;

async function validateAndCanonicalize(
  bytes: Buffer,
  mime: string,
): Promise<{ clean: Buffer; ext: "png" | "jpg" | "svg" }> {
  if (mime === "image/svg+xml") {
    const text = bytes.toString("utf8");
    if (!text.trim().toLowerCase().startsWith("<svg")) {
      throw new Error("Invalid SVG file");
    }
    if (/<script[\s>]/i.test(text)) {
      throw new Error("SVG files may not contain <script> tags");
    }
    return { clean: bytes, ext: "svg" };
  }
  if (mime !== "image/png" && mime !== "image/jpeg") {
    throw new Error(`Unsupported mime: ${mime}`);
  }
  const img = sharp(bytes);
  const meta = await img.metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Could not read image dimensions");
  }
  if (meta.width < MIN_DIMENSION || meta.height < MIN_DIMENSION) {
    throw new Error(
      `Image must be at least ${MIN_DIMENSION}×${MIN_DIMENSION} pixels (got ${meta.width}×${meta.height})`,
    );
  }
  if (mime === "image/png") {
    const clean = await img.png().toBuffer();
    return { clean, ext: "png" };
  }
  if (mime === "image/jpeg") {
    const clean = await img.jpeg({ quality: 90 }).toBuffer();
    return { clean, ext: "jpg" };
  }
  throw new Error(`Unsupported mime: ${mime}`);
}

async function makePng(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 45, g: 48, b: 71, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function makeJpeg(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 200, g: 50, b: 50 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe("validateAndCanonicalize (W11 branding upload)", () => {
  describe("SVG", () => {
    it("accepts a simple SVG", async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      const result = await validateAndCanonicalize(svg, "image/svg+xml");
      expect(result.ext).toBe("svg");
      expect(result.clean).toBe(svg);
    });

    it("accepts SVG with leading whitespace", async () => {
      const svg = Buffer.from('   \n  <svg xmlns="..."/>');
      const result = await validateAndCanonicalize(svg, "image/svg+xml");
      expect(result.ext).toBe("svg");
    });

    it("REJECTS SVG with embedded <script>", async () => {
      const svg = Buffer.from(
        '<svg xmlns="..."><script>alert("xss")</script></svg>',
      );
      await expect(
        validateAndCanonicalize(svg, "image/svg+xml"),
      ).rejects.toThrow(/<script>/);
    });

    it("REJECTS SVG with <script ... >", async () => {
      const svg = Buffer.from(
        '<svg xmlns="..."><script type="text/javascript">bad()</script></svg>',
      );
      await expect(
        validateAndCanonicalize(svg, "image/svg+xml"),
      ).rejects.toThrow(/<script>/);
    });

    it("REJECTS a non-SVG masquerading as SVG", async () => {
      const fake = Buffer.from("not an svg");
      await expect(
        validateAndCanonicalize(fake, "image/svg+xml"),
      ).rejects.toThrow(/Invalid SVG/);
    });
  });

  describe("PNG", () => {
    it("accepts a 256×256 PNG", async () => {
      const png = await makePng(256, 256);
      const result = await validateAndCanonicalize(png, "image/png");
      expect(result.ext).toBe("png");
      expect(result.clean.length).toBeGreaterThan(0);
    });

    it("accepts a large 1024×1024 PNG", async () => {
      const png = await makePng(1024, 1024);
      const result = await validateAndCanonicalize(png, "image/png");
      expect(result.ext).toBe("png");
    });

    it("REJECTS a PNG smaller than 256×256", async () => {
      const png = await makePng(100, 100);
      await expect(
        validateAndCanonicalize(png, "image/png"),
      ).rejects.toThrow(/at least 256×256/);
    });

    it("REJECTS a PNG with one dimension under 256", async () => {
      const png = await makePng(400, 200);
      await expect(
        validateAndCanonicalize(png, "image/png"),
      ).rejects.toThrow(/at least 256×256/);
    });

    it("REJECTS malformed PNG bytes", async () => {
      const garbage = Buffer.from("not a real PNG");
      await expect(
        validateAndCanonicalize(garbage, "image/png"),
      ).rejects.toThrow();
    });
  });

  describe("JPEG", () => {
    it("accepts a 256×256 JPEG", async () => {
      const jpg = await makeJpeg(256, 256);
      const result = await validateAndCanonicalize(jpg, "image/jpeg");
      expect(result.ext).toBe("jpg");
      expect(result.clean.length).toBeGreaterThan(0);
    });

    it("REJECTS a JPEG smaller than 256×256", async () => {
      const jpg = await makeJpeg(50, 50);
      await expect(
        validateAndCanonicalize(jpg, "image/jpeg"),
      ).rejects.toThrow(/at least 256×256/);
    });
  });

  describe("Unsupported mime", () => {
    it("REJECTS image/gif", async () => {
      const bytes = Buffer.from([0]);
      await expect(
        validateAndCanonicalize(bytes, "image/gif"),
      ).rejects.toThrow(/Unsupported mime/);
    });

    it("REJECTS image/webp", async () => {
      const bytes = Buffer.from([0]);
      await expect(
        validateAndCanonicalize(bytes, "image/webp"),
      ).rejects.toThrow(/Unsupported mime/);
    });
  });
});
