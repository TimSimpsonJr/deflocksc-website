import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { generateOgImage } from "../../../lib/og-image";

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = (await getCollection("blog")).filter((p) => !p.data.draft);
  return posts
    .filter((post) => !post.data.ogImage)
    .map((post) => ({
      params: { slug: post.id },
      props: { title: post.data.title, featuredImage: post.data.featuredImage },
    }));
};

export const GET: APIRoute = async ({ props }) => {
  const png = await generateOgImage(props.title, props.featuredImage);
  return new Response(png, {
    headers: { "Content-Type": "image/png" },
  });
};
