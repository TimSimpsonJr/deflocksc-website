import satori from "satori";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const INTER_BOLD = await readFile(
  resolve(process.cwd(), "src/assets/fonts/Inter-Bold.ttf")
);

const FONTS = [
  { name: "Inter", data: INTER_BOLD, weight: 700 as const, style: "normal" as const },
];

/** Render the DEFLOCK/SC logo overlay as a transparent PNG via Satori. */
async function renderLogoOverlay(): Promise<Buffer> {
  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-end",
          padding: "32px 40px",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "10px",
              },
              children: [
                // Red dot
                {
                  type: "div",
                  props: {
                    style: {
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: "#dc2626",
                    },
                  },
                },
                // DEFLOCK
                {
                  type: "span",
                  props: {
                    children: "DEFLOCK",
                    style: {
                      fontSize: 22,
                      fontWeight: 700,
                      color: "#ffffff",
                      letterSpacing: "0.12em",
                      fontFamily: "Inter",
                    },
                  },
                },
                // /
                {
                  type: "span",
                  props: {
                    children: "/",
                    style: {
                      fontSize: 22,
                      fontWeight: 700,
                      color: "#dc2626",
                      letterSpacing: "0.12em",
                      fontFamily: "Inter",
                    },
                  },
                },
                // SC
                {
                  type: "span",
                  props: {
                    children: "SC",
                    style: {
                      fontSize: 22,
                      fontWeight: 700,
                      color: "#ffffff",
                      letterSpacing: "0.12em",
                      fontFamily: "Inter",
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    { width: OG_WIDTH, height: OG_HEIGHT, fonts: FONTS }
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Generate OG image with featured image + logo overlay. */
async function generateWithImage(featuredImage: string): Promise<Buffer> {
  // Read the image from public/
  const imgPath = resolve(process.cwd(), "public", featuredImage.replace(/^\//, ""));
  const imgBuf = await readFile(imgPath);

  // Resize to cover OG dimensions on a dark background
  const base = await sharp(imgBuf)
    .resize(OG_WIDTH, OG_HEIGHT, { fit: "contain", background: "#111111" })
    .png()
    .toBuffer();

  const logo = await renderLogoOverlay();

  return sharp(base)
    .composite([{ input: logo, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/** Generate text-only OG card (fallback when no featured image). */
async function generateTextCard(title: string): Promise<Buffer> {
  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "60px",
          backgroundColor: "#111111",
          fontFamily: "Inter",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                width: "80px",
                height: "6px",
                backgroundColor: "#dc2626",
                marginBottom: "24px",
              },
            },
          },
          {
            type: "div",
            props: {
              children: title,
              style: {
                fontSize: title.length > 60 ? 48 : 64,
                fontWeight: 700,
                color: "#ffffff",
                lineHeight: 1.2,
                marginBottom: "24px",
              },
            },
          },
          {
            type: "div",
            props: {
              children: "DeflockSC",
              style: {
                fontSize: 24,
                color: "#737373",
                fontWeight: 700,
              },
            },
          },
        ],
      },
    },
    { width: OG_WIDTH, height: OG_HEIGHT, fonts: FONTS }
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function generateOgImage(
  title: string,
  featuredImage?: string
): Promise<Buffer> {
  if (featuredImage) {
    return generateWithImage(featuredImage);
  }
  return generateTextCard(title);
}
