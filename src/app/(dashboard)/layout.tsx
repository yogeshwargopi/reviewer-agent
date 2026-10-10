import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { auth } = await import("@/server/auth");
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return (
    <Shell user={{ name: session.user.name, image: session.user.image, login: session.user.githubLogin }}>
      {children}
    </Shell>
  );
}
