"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/overview" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-canvas hover:text-ink",
        active && "bg-copper-soft font-medium text-copper hover:bg-copper-soft hover:text-copper",
      )}
    >
      {children}
    </Link>
  );
}
