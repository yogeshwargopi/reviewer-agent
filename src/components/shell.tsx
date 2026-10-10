import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { signOutAction } from "@/server/actions";
import { NavLink } from "./nav-link";

const links = [
  { href: "/overview", label: "Overview" },
  { href: "/reviews", label: "Reviews" },
  { href: "/policies", label: "Policies" },
  { href: "/settings", label: "Settings" },
];

export function Shell({
  user,
  children,
}: {
  user: { name?: string | null; image?: string | null; login?: string | null };
  children: React.ReactNode;
}) {
  const label = user.login ?? user.name ?? "Signed in";
  return (
    <div className="min-h-screen bg-canvas text-ink md:grid md:h-dvh md:grid-cols-[248px_1fr] md:overflow-hidden">
      <aside className="flex flex-col border-b border-line bg-paper md:h-full md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="px-5 pb-4 pt-6">
          <Link href="/overview" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-copper text-sm font-medium text-paper">L</span>
            <span className="font-serif text-[1.65rem] leading-none tracking-tight">{PRODUCT_NAME}</span>
          </Link>
          <p className="mt-3 text-xs leading-5 text-muted">Pull requests, with a point of view.</p>
        </div>
        <nav className="flex gap-1 px-3 md:flex-col">
          {links.map((link) => (
            <NavLink key={link.href} href={link.href}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line px-5 py-4">
          <p className="truncate text-sm font-medium">{label}</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-xs text-muted">GitHub</p>
            <form action={signOutAction}>
              <button type="submit" className="text-xs text-muted transition hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="md:min-h-0 md:overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10 md:py-12">{children}</div>
      </div>
    </div>
  );
}
