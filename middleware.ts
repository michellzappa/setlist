import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const url = req.nextUrl.clone();

  if (process.env.VERCEL) {
    // On Vercel there's no Python backend / YAML vault, so /septena/* can't
    // render real data. Send those hits to the demo instead.
    if (pathname === "/septena") {
      url.pathname = "/demo";
      return NextResponse.redirect(url);
    }
    if (pathname.startsWith("/septena/")) {
      url.pathname = "/demo/" + pathname.slice("/septena/".length);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Local / self-hosted: marketing page doesn't really apply — the owner
  // wants to land in the app. Bounce root to /septena.
  if (pathname === "/") {
    url.pathname = "/septena";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|demo|favicon|icon|manifest|screenshots|.*\\.).*)"],
};
