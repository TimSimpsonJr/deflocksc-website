const WORDS_PER_MINUTE = 200;

/** Estimate reading time in minutes from raw markdown content. */
export function estimateReadTime(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

interface PostData {
  title: string;
  tags?: string[];
  date: Date;
  summary: string;
  draft?: boolean;
}

interface Post {
  id: string;
  data: PostData;
}

/**
 * Find related posts by counting shared tags.
 * Returns up to 3 posts, sorted by relevance (shared tag count desc, then date desc).
 */
export function findRelatedPosts(
  currentId: string,
  currentTags: string[],
  allPosts: Post[],
): Post[] {
  if (!currentTags || currentTags.length === 0) return [];

  const tagSet = new Set(currentTags);

  return allPosts
    .filter((p) => p.id !== currentId && p.data.tags && p.data.tags.length > 0)
    .map((p) => ({
      post: p,
      shared: p.data.tags!.filter((t) => tagSet.has(t)).length,
    }))
    .filter((r) => r.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.post.data.date.getTime() - a.post.data.date.getTime())
    .slice(0, 3)
    .map((r) => r.post);
}
