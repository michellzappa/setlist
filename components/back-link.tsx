import Link from "next/link";

type Props = {
  href: string;
  label: string;
  className?: string;
};

// Pill-style back button. Shared by PageHeader's `back` prop and by pages
// that render their own headers (e.g. training session flows).
export function BackLink({ href, label, className }: Props) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-foreground/30 hover:bg-muted" +
        (className ? ` ${className}` : "")
      }
    >
      <span aria-hidden>←</span>
      <span>{label}</span>
    </Link>
  );
}
