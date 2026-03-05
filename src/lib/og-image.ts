import satori from "satori";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const INTER_BOLD = await readFile(
  resolve(process.cwd(), "src/assets/fonts/Inter-Bold.ttf")
);

export async function generateOgImage(title: string): Promise<Buffer> {
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
          backgroundColor: "#171717",
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
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Inter",
          data: INTER_BOLD,
          weight: 700,
          style: "normal",
        },
      ],
    }
  );

  return await sharp(Buffer.from(svg)).png().toBuffer();
}
