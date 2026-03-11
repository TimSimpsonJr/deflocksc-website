import { describe, it, expect } from 'vitest';
import { estimateReadTime, findRelatedPosts } from './blog-utils';

describe('estimateReadTime', () => {
  it('returns 1 min for short content', () => {
    expect(estimateReadTime('hello world')).toBe(1);
  });

  it('calculates minutes from word count at 200 wpm', () => {
    const words = Array(600).fill('word').join(' ');
    expect(estimateReadTime(words)).toBe(3);
  });

  it('rounds up partial minutes', () => {
    const words = Array(250).fill('word').join(' ');
    expect(estimateReadTime(words)).toBe(2);
  });

  it('handles empty content', () => {
    expect(estimateReadTime('')).toBe(1);
  });
});

describe('findRelatedPosts', () => {
  const posts = [
    { id: 'a', data: { title: 'A', tags: ['research', 'greenville'], date: new Date('2026-03-10'), summary: '', draft: false } },
    { id: 'b', data: { title: 'B', tags: ['legislation'], date: new Date('2026-03-05'), summary: '', draft: false } },
    { id: 'c', data: { title: 'C', tags: ['research', 'campaign'], date: new Date('2026-02-28'), summary: '', draft: false } },
    { id: 'd', data: { title: 'D', tags: ['campaign'], date: new Date('2026-02-20'), summary: '', draft: false } },
  ];

  it('returns posts with shared tags, excluding current', () => {
    const related = findRelatedPosts('a', ['research', 'greenville'], posts);
    expect(related.map(p => p.id)).toContain('c');
    expect(related.map(p => p.id)).not.toContain('a');
  });

  it('returns at most 3 posts', () => {
    const related = findRelatedPosts('a', ['research', 'campaign', 'legislation'], posts);
    expect(related.length).toBeLessThanOrEqual(3);
  });

  it('ranks by number of shared tags', () => {
    const related = findRelatedPosts('a', ['research', 'campaign'], posts);
    // 'c' has both research + campaign, 'd' has only campaign
    expect(related[0].id).toBe('c');
  });

  it('returns empty array when no tags match', () => {
    const related = findRelatedPosts('a', ['unique-tag'], posts);
    expect(related).toEqual([]);
  });

  it('handles posts with no tags', () => {
    const postsWithNoTags = [
      ...posts,
      { id: 'e', data: { title: 'E', tags: undefined, date: new Date('2026-01-01'), summary: '', draft: false } },
    ];
    const related = findRelatedPosts('a', ['research'], postsWithNoTags);
    expect(related.map(p => p.id)).not.toContain('e');
  });
});
