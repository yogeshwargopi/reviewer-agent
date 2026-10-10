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
    <div className="min-h-screen bg-paper text-ink md:grid md:h-dvh md:grid-cols-[240px_1fr] md:overflow-hidden">
      <aside className="flex flex-col border-b border-white/10 bg-sidebar text-paper md:h-full md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="px-6 py-7">
          <Link href="/overview" className="font-serif text-3xl tracking-tight text-paper">
            {PRODUCT_NAME}
          </Link>
          <p className="mt-2 text-sm text-paper/60">Pull requests, with a point of view.</p>
        </div>
        <nav className="flex gap-1 px-3 md:flex-col">
          {links.map((link) => (
            <NavLink key={link.href} href={link.href}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-3 px-6 py-6">
          <div className="min-w-0">
            <p className="truncate text-sm text-paper">{label}</p>
            <p className="text-xs text-paper/50">GitHub</p>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="text-xs uppercase tracking-[0.14em] text-paper/70 hover:text-paper">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="md:min-h-0 md:overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10 md:py-10">{children}</div>
      </div>
    </div>
  );
}
