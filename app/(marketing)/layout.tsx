import Script from "next/script";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        defer
        data-domain="septena.app"
        src="https://plausible.io/js/script.js"
      />
      {children}
    </>
  );
}
