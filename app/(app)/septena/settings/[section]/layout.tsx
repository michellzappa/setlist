import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  const label = section.charAt(0).toUpperCase() + section.slice(1);
  return { title: `Settings · ${label}` };
}

export default function SettingsSectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
