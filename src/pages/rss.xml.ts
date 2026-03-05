import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog')).filter((post) => !post.data.draft);
  return rss({
    title: 'DeflockSC Blog',
    description: 'Campaign updates and research on license plate surveillance in South Carolina.',
    site: context.site ?? 'https://deflocksc.org',
    items: posts
      .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime())
      .map((post) => ({
        title: post.data.title,
        pubDate: new Date(post.data.date),
        description: post.data.summary,
        link: `/blog/${post.id}`,
      })),
  });
}
