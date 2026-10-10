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
        "rounded-md px-3 py-2 text-sm text-paper/70 transition hover:bg-white/5 hover:text-paper",
        active && "bg-white/10 text-paper",
      )}
    >
      {children}
    </Link>
  );
}
