/**
 * Generate business card PNGs and Avery 8371 print sheets (Task 17).
 *
 * Uses satori for JSX-to-SVG, sharp for SVG-to-PNG and image composition,
 * pdf-lib for Avery print sheet PDFs, and qrcode for QR code generation.
 *
 * Run: node scripts/generate-business-cards.js
 */

import satori from 'satori';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Card dimensions for web preview (3.5" x 2" at 200dpi)
const CARD_WIDTH = 700;
const CARD_HEIGHT = 400;

// Avery 8371 specs in PDF points (72 points = 1 inch)
const AVERY = {
  pageWidth: 612,    // 8.5"
  pageHeight: 792,   // 11"
  cardWidth: 252,    // 3.5"
  cardHeight: 144,   // 2"
  marginTop: 36,     // 0.5"
  marginLeft: 54,    // 0.75"
  cols: 2,
  rows: 5,
};

/**
 * Generate a QR code as a data URI (white on transparent).
 */
async function generateQRDataUri(url) {
  const dataUri = await QRCode.toDataURL(url, {
    width: 200,
    margin: 0,
    color: {
      dark: '#FFFFFF',
      light: '#00000000', // transparent background
    },
    errorCorrectionLevel: 'M',
  });
  return dataUri;
}

/**
 * Load the Inter Bold font for satori.
 */
async function loadFont() {
  const fontPath = resolve(ROOT, 'src/assets/fonts/Inter-Bold.ttf');
  return await readFile(fontPath);
}

/**
 * Render a satori JSX tree to a PNG buffer.
 */
async function renderCardToPng(jsx, fontData) {
  const svg = await satori(jsx, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [
      {
        name: 'Inter',
        data: fontData,
        weight: 700,
        style: 'normal',
      },
    ],
  });

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Build the JSX tree for cards 1-3 (text-only cards with QR code).
 */
function buildTextCard(card, qrDataUri) {
  // Choose font sizes based on headline length
  const headlineFontSize = card.headline.length > 80 ? 22 : card.headline.length > 50 ? 26 : 32;

  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        backgroundColor: '#0a0a0a',
        fontFamily: 'Inter',
        padding: '30px',
      },
      children: [
        // Left: text content
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flex: 1,
              paddingRight: '24px',
            },
            children: [
              // Red accent bar
              {
                type: 'div',
                props: {
                  style: {
                    width: '40px',
                    height: '4px',
                    backgroundColor: '#dc2626',
                    marginBottom: '16px',
                  },
                },
              },
              // Headline
              {
                type: 'div',
                props: {
                  children: card.headline,
                  style: {
                    fontSize: headlineFontSize,
                    fontWeight: 700,
                    color: '#ffffff',
                    lineHeight: 1.2,
                    marginBottom: '12px',
                  },
                },
              },
              // Subtext
              {
                type: 'div',
                props: {
                  children: card.subtext,
                  style: {
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#737373',
                  },
                },
              },
            ],
          },
        },
        // Right: QR code
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              width: '140px',
            },
            children: [
              {
                type: 'img',
                props: {
                  src: qrDataUri,
                  width: 120,
                  height: 120,
                  style: {
                    width: '120px',
                    height: '120px',
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };
}

/**
 * Generate the "1000 eyes" card with the eye graphic composited in.
 * This card uses sharp compositing rather than pure satori
 * because satori may not handle the PNG file embedding well.
 */
async function generateEyeCard(card, qrDataUri, fontData) {
  // First, generate a base card with satori (text + QR only, leaving space for the eye graphic)
  const headlineFontSize = 28;

  const baseJsx = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        backgroundColor: '#0a0a0a',
        fontFamily: 'Inter',
        padding: '30px',
      },
      children: [
        // Left: eye graphic area (will be composited later)
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              width: '280px',
              height: '100%',
            },
          },
        },
        // Right: text + QR
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flex: 1,
              paddingLeft: '16px',
            },
            children: [
              // Red accent bar
              {
                type: 'div',
                props: {
                  style: {
                    width: '40px',
                    height: '4px',
                    backgroundColor: '#dc2626',
                    marginBottom: '12px',
                  },
                },
              },
              // Headline
              {
                type: 'div',
                props: {
                  children: card.headline,
                  style: {
                    fontSize: headlineFontSize,
                    fontWeight: 700,
                    color: '#ffffff',
                    lineHeight: 1.2,
                    marginBottom: '8px',
                  },
                },
              },
              // Subtext
              {
                type: 'div',
                props: {
                  children: card.subtext,
                  style: {
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#737373',
                    marginBottom: '8px',
                  },
                },
              },
              // QR code (smaller)
              {
                type: 'img',
                props: {
                  src: qrDataUri,
                  width: 80,
                  height: 80,
                  style: {
                    width: '80px',
                    height: '80px',
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  // Render base card
  const svg = await satori(baseJsx, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [
      {
        name: 'Inter',
        data: fontData,
        weight: 700,
        style: 'normal',
      },
    ],
  });

  const basePng = await sharp(Buffer.from(svg)).png().toBuffer();

  // Load and resize the eye graphic
  const eyePath = resolve(ROOT, 'public/toolkit/outreach/eye-graphic.png');
  let eyeGraphic;
  try {
    eyeGraphic = await sharp(eyePath)
      .resize(240, null, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();
  } catch (err) {
    console.warn(`  Warning: Could not load eye graphic at ${eyePath}: ${err.message}`);
    console.warn('  Falling back to text-only card for 1000-eyes.');
    return basePng;
  }

  // Get eye graphic dimensions after resize
  const eyeMeta = await sharp(eyeGraphic).metadata();

  // Composite eye graphic onto the base card
  const eyeLeft = 30 + Math.floor((250 - (eyeMeta.width || 240)) / 2);
  const eyeTop = Math.floor((CARD_HEIGHT - (eyeMeta.height || 240)) / 2);

  return await sharp(basePng)
    .composite([
      {
        input: eyeGraphic,
        left: eyeLeft,
        top: eyeTop,
      },
    ])
    .png()
    .toBuffer();
}

/**
 * Create an Avery 8371 print sheet PDF from a card PNG buffer.
 */
async function createAverySheet(cardPngBuffer) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([AVERY.pageWidth, AVERY.pageHeight]);

  // Embed the card image
  const cardImage = await doc.embedPng(cardPngBuffer);

  // Place 10 cards (2 cols x 5 rows)
  for (let row = 0; row < AVERY.rows; row++) {
    for (let col = 0; col < AVERY.cols; col++) {
      const x = AVERY.marginLeft + col * AVERY.cardWidth;
      // PDF coordinates are bottom-up, so invert row order
      const y = AVERY.pageHeight - AVERY.marginTop - (row + 1) * AVERY.cardHeight;

      page.drawImage(cardImage, {
        x,
        y,
        width: AVERY.cardWidth,
        height: AVERY.cardHeight,
      });
    }
  }

  return await doc.save();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Generating business cards and print sheets...\n');

  const outDir = resolve(ROOT, 'public/toolkit/outreach');
  await mkdir(outDir, { recursive: true });

  // Load data
  const data = JSON.parse(
    await readFile(resolve(ROOT, 'src/data/toolkit-outreach.json'), 'utf-8')
  );

  // Load font
  const fontData = await loadFont();

  // Generate QR code
  const qrDataUri = await generateQRDataUri('https://deflocksc.org');

  for (const card of data.businessCards) {
    console.log(`  Card: ${card.id}`);

    let pngBuffer;

    if (card.id === '1000-eyes') {
      // Special card with eye graphic composite
      pngBuffer = await generateEyeCard(card, qrDataUri, fontData);
    } else {
      // Standard text card
      const jsx = buildTextCard(card, qrDataUri);
      pngBuffer = await renderCardToPng(jsx, fontData);
    }

    // Save card PNG
    const pngPath = resolve(outDir, `card-${card.id}.png`);
    await writeFile(pngPath, pngBuffer);
    console.log(`    PNG: ${pngPath}`);

    // Generate Avery print sheet
    const sheetBytes = await createAverySheet(pngBuffer);
    const sheetPath = resolve(outDir, `cards-${card.id}-print.pdf`);
    await writeFile(sheetPath, sheetBytes);
    console.log(`    Sheet: ${sheetPath}`);
  }

  console.log('\nAll business cards and print sheets generated.');
}

main().catch((err) => {
  console.error('Business card generation failed:', err);
  process.exit(1);
});
