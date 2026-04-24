// Dynamic favicon / apple-touch-icon. Reads `icon_color` from /api/settings
// so users can re-theme the browser tab icon and iOS home-screen icon from
// the settings page without editing files. Falls back to the fixed Septena
// brand accent when no override is set.

const BACKEND = process.env.SEPTENA_BACKEND_URL ?? "http://127.0.0.1:7000";
// Keep this in sync with `--brand-accent` in app/globals.css.
const FALLBACK = "#3b82f6";

export const dynamic = "force-dynamic";

async function loadColor(): Promise<string> {
  try {
    const res = await fetch(`${BACKEND}/api/settings`, { cache: "no-store" });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as { icon_color?: unknown };
    const c = typeof data.icon_color === "string" ? data.icon_color.trim() : "";
    return c || FALLBACK;
  } catch {
    return FALLBACK;
  }
}

function escapeColor(c: string): string {
  // SVG fill accepts hex, rgb(), hsl(), and named colors. Strip anything
  // that could break out of the attribute to keep the response safe even
  // if a malformed value lands in settings.yaml.
  return c.replace(/[<>"']/g, "");
}

export async function GET() {
  const color = escapeColor(await loadColor());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <style>
    .bg { fill: #ffffff; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #0a0a0a; }
    }
  </style>
  <rect class="bg" width="512" height="512" rx="108"/>
  <g>
    <circle cx="256" cy="107" r="49" fill="#ef4444"/>
    <circle cx="373" cy="162" r="49" fill="#f97316"/>
    <circle cx="402" cy="290" r="49" fill="#eab308"/>
    <circle cx="321" cy="391" r="49" fill="#22c55e"/>
    <circle cx="191" cy="391" r="49" fill="#06b6d4"/>
    <circle cx="110" cy="290" r="49" fill="#3b82f6"/>
    <circle cx="139" cy="162" r="49" fill="#8b5cf6"/>
  </g>
</svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store",
    },
  });
}
