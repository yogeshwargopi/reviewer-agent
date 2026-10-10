import { redirect } from "next/navigation";
import { ReviewTable } from "@/components/review-table";
import { auth } from "@/server/auth";
import { loadWorkspace } from "@/server/queries";

export const metadata = { title: "Reviews" };

export default async function ReviewsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const data = await loadWorkspace(session.user.id);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl tracking-tight">Reviews</h1>
        <p className="mt-2 text-muted">Every run, including skips, failures, and dry runs.</p>
      </header>
      <ReviewTable reviews={data.reviews} />
    </div>
  );
}
