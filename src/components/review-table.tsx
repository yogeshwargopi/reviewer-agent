import Link from "next/link";
import { Pill } from "@/components/pill";
import { formatWhen, shortSha } from "@/lib/format";

export function ReviewTable({
  reviews,
}: {
  reviews: Array<{
    id: string;
    status: string;
    pullNumber: number;
    prTitle: string | null;
    fullName: string;
    headSha: string;
    dryRun: boolean;
    createdAt: Date;
  }>;
}) {
  if (reviews.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-6 py-10 text-sm text-muted">
        Reviews appear here after an enabled repository opens a pull request.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-paper-2">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-[0.12em] text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Pull request</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="hidden px-4 py-3 font-medium md:table-cell">Commit</th>
            <th className="hidden px-4 py-3 font-medium sm:table-cell">When</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <tr key={review.id} className="border-t border-line">
              <td className="px-4 py-3">
                <Link href={`/reviews/${review.id}`} className="font-medium hover:text-copper">
                  {review.fullName} #{review.pullNumber}
                </Link>
                <p className="truncate text-muted">
                  {review.prTitle ?? "Untitled"}
                  {review.dryRun ? " · dry run" : ""}
                </p>
              </td>
              <td className="px-4 py-3">
                <Pill value={review.status} />
              </td>
              <td className="hidden px-4 py-3 font-mono text-xs md:table-cell">{shortSha(review.headSha)}</td>
              <td className="hidden px-4 py-3 text-muted sm:table-cell">{formatWhen(review.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
