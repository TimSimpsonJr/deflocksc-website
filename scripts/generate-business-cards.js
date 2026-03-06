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
 * Build the JSX tree for text-only cards with QR code (fallback).
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
 * Generate a "hero recreation" card with camera array illustration and light cones.
 * Used for the 1984 and surveillance cards.
 *
 * @param {object} card - Card data from toolkit-outreach.json
 * @param {string} qrDataUri - QR code as data URI
 * @param {Buffer} fontData - Inter Bold font buffer
 * @param {object} opts - Options: { coneAngle: number } rotation in degrees
 */
async function generateHeroCard(card, qrDataUri, fontData, opts = {}) {
  const coneAngle = opts.coneAngle || 0;

  // 1. Create dark canvas
  const canvas = await sharp({
    create: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      channels: 4,
      background: { r: 23, g: 23, b: 23, alpha: 255 },
    },
  })
    .png()
    .toBuffer();

  // 2. Load and prepare camera array image
  const cameraPath = resolve(ROOT, 'public/hero-cameras.png');
  const cameraResized = await sharp(cameraPath)
    .resize(CARD_WIDTH, null, { fit: 'cover', position: 'top' })
    .modulate({ brightness: 0.85 })
    .flatten({ background: '#171717' })
    .png()
    .toBuffer();

  const cameraMeta = await sharp(cameraResized).metadata();
  // Crop to fit within the upper portion of card (use top ~65% of card)
  const cameraHeight = Math.min(cameraMeta.height, Math.floor(CARD_HEIGHT * 0.65));
  const cameraCropped = await sharp(cameraResized)
    .extract({ left: 0, top: 0, width: CARD_WIDTH, height: cameraHeight })
    .png()
    .toBuffer();

  // Composite camera onto canvas
  let working = await sharp(canvas)
    .composite([{ input: cameraCropped, left: 0, top: 0 }])
    .png()
    .toBuffer();

  // 3. Generate static light cone SVG
  // Hero viewBox: 5098x2949. Scale to 700x400.
  // Inner 3 cone origins in hero space: (1206,1683), (2312,1389), (3891,1683)
  const scale = CARD_WIDTH / 5098;
  const coneOrigins = [
    { x: 1206, y: 1683 },
    { x: 2312, y: 1389 },
    { x: 3891, y: 1683 },
  ];

  // Build cone polygons - each cone spreads ~700px wide in hero space, extends 4000px down
  const coneSpreadHalf = 350; // half-width in hero space
  const coneLength = 4000; // length in hero space

  const conePolygons = coneOrigins
    .map((origin) => {
      const cx = origin.x * scale;
      const cy = origin.y * scale;
      const leftX = (origin.x - coneSpreadHalf) * scale;
      const rightX = (origin.x + coneSpreadHalf) * scale;
      const bottomY = (origin.y + coneLength) * scale;
      return `<polygon points="${cx},${cy} ${leftX},${bottomY} ${rightX},${bottomY}" fill="url(#cone-grad)" filter="url(#cone-blur)" />`;
    })
    .join('\n    ');

  const coneSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <linearGradient id="cone-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="white" stop-opacity="0.3" />
      <stop offset="100%" stop-color="white" stop-opacity="0" />
    </linearGradient>
    <filter id="cone-blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
    </filter>
  </defs>
  <g transform="rotate(${coneAngle}, ${CARD_WIDTH / 2}, ${CARD_HEIGHT / 2})">
    ${conePolygons}
  </g>
</svg>`;

  // 4. Render cone SVG to PNG
  const conePng = await sharp(Buffer.from(coneSvg)).png().toBuffer();

  // 5. Composite cones onto working image
  working = await sharp(working)
    .composite([{ input: conePng, left: 0, top: 0 }])
    .png()
    .toBuffer();

  // 6. Bottom-fade gradient overlay (transparent top to #171717 bottom, covering lower 60%)
  const fadeTop = Math.floor(CARD_HEIGHT * 0.4);
  const fadeHeight = CARD_HEIGHT - fadeTop;
  const fadeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#171717" stop-opacity="0" />
      <stop offset="100%" stop-color="#171717" stop-opacity="1" />
    </linearGradient>
  </defs>
  <rect x="0" y="${fadeTop}" width="${CARD_WIDTH}" height="${fadeHeight}" fill="url(#fade)" />
</svg>`;

  const fadePng = await sharp(Buffer.from(fadeSvg)).png().toBuffer();

  working = await sharp(working)
    .composite([{ input: fadePng, left: 0, top: 0 }])
    .png()
    .toBuffer();

  // 7. Render text overlay via satori on transparent background
  const headlineFontSize = card.headline.length > 80 ? 20 : card.headline.length > 50 ? 24 : 30;

  const textJsx = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        fontFamily: 'Inter',
        padding: '28px',
        backgroundColor: 'transparent',
      },
      children: [
        // Left: text content
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              flex: 1,
              paddingRight: '20px',
            },
            children: [
              // Red accent bar
              {
                type: 'div',
                props: {
                  style: {
                    width: '36px',
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
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#a3a3a3',
                  },
                },
              },
            ],
          },
        },
        // Right: QR code (bottom-right)
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              alignItems: 'center',
              width: '110px',
            },
            children: [
              {
                type: 'img',
                props: {
                  src: qrDataUri,
                  width: 90,
                  height: 90,
                  style: {
                    width: '90px',
                    height: '90px',
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  const textSvg = await satori(textJsx, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [{ name: 'Inter', data: fontData, weight: 700, style: 'normal' }],
  });

  const textPng = await sharp(Buffer.from(textSvg)).png().toBuffer();

  // 8. Composite text on top
  return await sharp(working)
    .composite([{ input: textPng, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

/**
 * Generate the city-council card with a single camera illustration.
 *
 * @param {object} card - Card data from toolkit-outreach.json
 * @param {string} qrDataUri - QR code as data URI
 * @param {Buffer} fontData - Inter Bold font buffer
 */
async function generateSingleCameraCard(card, qrDataUri, fontData) {
  // 1. Create dark canvas
  const canvas = await sharp({
    create: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      channels: 4,
      background: { r: 23, g: 23, b: 23, alpha: 255 },
    },
  })
    .png()
    .toBuffer();

  // 2. Load and prepare single camera image (has transparent bg)
  const cameraPath = resolve(ROOT, 'public/toolkit/outreach/single-camera.png');
  const targetHeight = Math.floor(CARD_HEIGHT * 0.55);

  const cameraResized = await sharp(cameraPath)
    .resize(null, targetHeight, { fit: 'inside', withoutEnlargement: false })
    .modulate({ brightness: 0.9 })
    .png()
    .toBuffer();

  const cameraMeta = await sharp(cameraResized).metadata();
  const cameraWidth = cameraMeta.width || targetHeight;
  const cameraActualHeight = cameraMeta.height || targetHeight;

  // Position right-of-center
  const cameraLeft = Math.floor(CARD_WIDTH * 0.55);
  const cameraTop = Math.floor((CARD_HEIGHT - cameraActualHeight) / 2);

  // Composite camera onto canvas
  const working = await sharp(canvas)
    .composite([{ input: cameraResized, left: cameraLeft, top: cameraTop }])
    .png()
    .toBuffer();

  // 3. Render text + QR via satori on transparent background
  const headlineFontSize = card.headline.length > 80 ? 18 : card.headline.length > 50 ? 22 : 28;

  const textJsx = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        fontFamily: 'Inter',
        padding: '28px',
        backgroundColor: 'transparent',
      },
      children: [
        // Left: text content (takes ~55% of width)
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              width: '380px',
            },
            children: [
              // Red accent bar
              {
                type: 'div',
                props: {
                  style: {
                    width: '36px',
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
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#a3a3a3',
                  },
                },
              },
            ],
          },
        },
        // Right: QR code (bottom-right, partially overlapping camera area)
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              alignItems: 'flex-end',
              flex: 1,
            },
            children: [
              {
                type: 'img',
                props: {
                  src: qrDataUri,
                  width: 90,
                  height: 90,
                  style: {
                    width: '90px',
                    height: '90px',
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  const textSvg = await satori(textJsx, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [{ name: 'Inter', data: fontData, weight: 700, style: 'normal' }],
  });

  const textPng = await sharp(Buffer.from(textSvg)).png().toBuffer();

  // 4. Composite text on top
  return await sharp(working)
    .composite([{ input: textPng, left: 0, top: 0 }])
    .png()
    .toBuffer();
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
      pngBuffer = await generateEyeCard(card, qrDataUri, fontData);
    } else if (card.id === '1984') {
      pngBuffer = await generateHeroCard(card, qrDataUri, fontData, { coneAngle: 5 });
    } else if (card.id === 'surveillance') {
      pngBuffer = await generateHeroCard(card, qrDataUri, fontData, { coneAngle: -8 });
    } else if (card.id === 'city-council') {
      pngBuffer = await generateSingleCameraCard(card, qrDataUri, fontData);
    } else {
      // Fallback: text-only card
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
