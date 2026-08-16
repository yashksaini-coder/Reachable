import Link from "next/link";
import { Search, Unplug, type LucideIcon } from "lucide-react";

// Designed empty / missing / error states: a 44px muted icon circle, one sentence in --mut
// (max 44ch), one outlined orange action. Nothing else — that is the whole spec.
export function StateView({
  icon: Icon = Search,
  sentence,
  action,
  extra,
}: {
  icon?: LucideIcon;
  sentence: string;
  action?: { href?: string; label: string; onClick?: () => void };
  extra?: React.ReactNode;
}) {
  const cls =
    "inline-flex min-h-10 items-center rounded-lg border border-signal/40 px-[15px] text-[12px] font-medium leading-none text-signal transition-[background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-sigfill active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50";
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-[18px] p-10 text-center">
      <span className="grid size-11 place-items-center rounded-full border border-border text-dim" aria-hidden>
        <Icon className="size-[17px]" />
      </span>
      <p className="max-w-[44ch] text-pretty text-[13.5px] text-mut">{sentence}</p>
      {action &&
        (action.href ? (
          <Link href={action.href} className={cls}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={cls}>
            {action.label}
          </button>
        ))}
      {extra}
    </div>
  );
}

export function NotFoundView() {
  return <StateView icon={Search} sentence="No page at that address — the advisory or service may not be tracked yet." action={{ href: "/incidents", label: "Back to incidents" }} />;
}

export { Unplug };
