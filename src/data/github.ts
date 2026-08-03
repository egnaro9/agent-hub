// The first real seam: read-only, unauthenticated GitHub — public data only.
// Called lazily per project when its stage opens; any failure (offline, rate
// limit, renamed repo) silently leaves the curated mock feed in place.

const OWNER = "egnaro9";

const rel = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
};

export async function fetchRecentCommits(repo: string): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/commits?per_page=3`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return [];
  const data: { commit: { message: string; author?: { date?: string } } }[] = await res.json();
  return data
    .map((c) => {
      const title = c.commit.message.split("\n")[0];
      const when = c.commit.author?.date ? rel(c.commit.author.date) : "";
      return when ? `${title} · ${when}` : title;
    })
    .slice(0, 3);
}
