/**
 * Generate toolkit PDFs:
 * - 4 FOIA template PDFs (Task 15)
 * - 1 Council handout PDF (Task 16)
 * - 1 One-pager PDF (Task 18)
 *
 * Uses pdf-lib for text-based PDF generation.
 * Run: node scripts/generate-toolkit-pdfs.js
 */

import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Color constants
const DARK = rgb(0.09, 0.09, 0.09);       // #171717
const RED = rgb(0.863, 0.149, 0.149);      // #dc2626
const GRAY = rgb(0.45, 0.45, 0.45);        // #737373
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);  // #ededed
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const AMBER = rgb(0.984, 0.749, 0.141);    // #fbbf24

// Page dimensions in points (1 inch = 72 points)
const PAGE_WIDTH = 612;  // 8.5"
const PAGE_HEIGHT = 792; // 11"
const MARGIN = 54;       // 0.75"
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

/**
 * Wrap text to fit within a given width, returning an array of lines.
 */
function wrapText(text, font, fontSize, maxWidth) {
  const lines = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }

    const words = paragraph.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/**
 * Draw wrapped text and return the new Y position.
 */
function drawWrappedText(page, text, font, fontSize, x, y, maxWidth, color = BLACK, lineHeight = 1.4) {
  const lines = wrapText(text, font, fontSize, maxWidth);
  const leading = fontSize * lineHeight;
  let currentY = y;

  for (const line of lines) {
    if (currentY < MARGIN + 30) break; // Stop near bottom margin
    page.drawText(line, { x, y: currentY, size: fontSize, font, color });
    currentY -= leading;
  }

  return currentY;
}

/**
 * Draw a horizontal rule.
 */
function drawRule(page, y, color = LIGHT_GRAY) {
  page.drawRectangle({
    x: MARGIN,
    y,
    width: CONTENT_WIDTH,
    height: 1,
    color,
  });
  return y - 12;
}

// ─── FOIA Templates (Task 15) ───────────────────────────────────────────────

async function generateFoiaTemplates() {
  const data = JSON.parse(
    await readFile(resolve(ROOT, 'src/data/toolkit-foia.json'), 'utf-8')
  );

  const outDir = resolve(ROOT, 'public/toolkit/foia');
  await mkdir(outDir, { recursive: true });

  for (const template of data) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

    let y = PAGE_HEIGHT - MARGIN;

    // Red accent bar (no header branding on FOIA templates)
    page.drawRectangle({
      x: MARGIN,
      y,
      width: 50,
      height: 4,
      color: RED,
    });

    y -= 28;

    // Title
    const titleLines = wrapText(template.title, helveticaBold, 18, CONTENT_WIDTH);
    for (const line of titleLines) {
      page.drawText(line, { x: MARGIN, y, size: 18, font: helveticaBold, color: DARK });
      y -= 24;
    }

    y -= 4;

    // Description
    y = drawWrappedText(page, template.description, helvetica, 10, MARGIN, y, CONTENT_WIDTH, GRAY);
    y -= 8;

    // Why this matters
    if (template.why) {
      y = drawRule(page, y);
      y -= 4;
      page.drawText('Why This Matters', { x: MARGIN, y, size: 11, font: helveticaBold, color: DARK });
      y -= 16;
      y = drawWrappedText(page, template.why, helvetica, 9.5, MARGIN, y, CONTENT_WIDTH, GRAY);
      y -= 8;
    }

    y = drawRule(page, y);
    y -= 8;

    // Template label
    page.drawText('TEMPLATE', { x: MARGIN, y, size: 8, font: helveticaBold, color: RED });
    y -= 16;

    // Template body — replace placeholders with form fields
    const form = doc.getForm();
    const templateText = template.template;

    // First pass: replace placeholders with underscores of equal visual width
    // to get accurate line wrapping, then render with fields
    const placeholderRegex = /\[([A-Z\s/()]+)\]/g;

    // Collect unique placeholder names for field creation
    const fieldCounter = new Map();

    // Word-wrap the raw template (with placeholders) to get line layout
    const templateLines = wrapText(templateText, helvetica, 10, CONTENT_WIDTH - 16);
    const leading = 14;

    // Draw light background for template area
    const templateHeight = templateLines.length * leading + 20;
    page.drawRectangle({
      x: MARGIN,
      y: y - templateHeight + leading,
      width: CONTENT_WIDTH,
      height: templateHeight,
      color: rgb(0.97, 0.97, 0.97),
    });

    const templateX = MARGIN + 8;
    for (const line of templateLines) {
      if (y < MARGIN + 60) break;

      // Check for placeholders in the line
      const lineRegex = /\[([A-Z\s/()]+)\]/g;
      let match;
      let lastIndex = 0;
      let xOffset = templateX;

      const lineStr = line;
      let hasPlaceholder = false;
      while ((match = lineRegex.exec(lineStr)) !== null) {
        hasPlaceholder = true;
        // Draw text before placeholder
        const before = lineStr.substring(lastIndex, match.index);
        if (before) {
          page.drawText(before, { x: xOffset, y, size: 10, font: helvetica, color: BLACK });
          xOffset += helvetica.widthOfTextAtSize(before, 10);
        }

        // Create form field instead of drawing placeholder text
        const placeholderName = match[1].trim();
        const count = fieldCounter.get(placeholderName) || 0;
        const fieldName = count > 0
          ? `${placeholderName}_${count}`
          : placeholderName;
        fieldCounter.set(placeholderName, count + 1);

        const placeholderWidth = helveticaBold.widthOfTextAtSize(match[0], 10);
        // If the placeholder is the only content on this line, use full width
        const isAloneLine = lineStr.trim() === match[0];
        const fieldWidth = isAloneLine
          ? CONTENT_WIDTH - 16
          : Math.max(placeholderWidth + 8, 80);

        const textField = form.createTextField(fieldName);
        textField.setText(placeholderName);
        textField.addToPage(page, {
          x: xOffset,
          y: y - 4,
          width: fieldWidth,
          height: 16,
          borderWidth: 1,
          borderColor: rgb(0.8, 0.8, 0.8),
          backgroundColor: rgb(1, 1, 1),
        });
        textField.setFontSize(10);

        xOffset += fieldWidth + 2;
        lastIndex = match.index + match[0].length;
      }

      if (hasPlaceholder) {
        const remaining = lineStr.substring(lastIndex);
        if (remaining) {
          page.drawText(remaining, { x: xOffset, y, size: 10, font: helvetica, color: BLACK });
        }
      } else {
        page.drawText(lineStr, { x: templateX, y, size: 10, font: helvetica, color: BLACK });
      }

      y -= leading;
    }

    y -= 16;

    // Filing instructions
    if (y > MARGIN + 80) {
      y = drawRule(page, y);
      y -= 4;
      page.drawText('Filing Instructions', { x: MARGIN, y, size: 11, font: helveticaBold, color: DARK });
      y -= 16;
      const instructions = [
        '1. Fill in all bracketed fields with your information and the target agency.',
        '2. Send via email, certified mail, or hand-deliver to the agency records custodian.',
        '3. The agency has 15 business days to respond under SC FOIA (S.C. Code 30-4-30).',
        '4. If denied, you may appeal to the circuit court within 15 business days.',
        '5. Keep a copy of your request and any agency correspondence.',
      ];
      for (const step of instructions) {
        y = drawWrappedText(page, step, helvetica, 9, MARGIN, y, CONTENT_WIDTH, GRAY);
        y -= 4;
      }
    }

    // Footer — no branding, just the free-to-distribute note
    page.drawRectangle({
      x: MARGIN,
      y: MARGIN,
      width: CONTENT_WIDTH,
      height: 1,
      color: LIGHT_GRAY,
    });
    const freeLabel = 'Free to copy and distribute';
    const freeLabelWidth = helvetica.widthOfTextAtSize(freeLabel, 8);
    page.drawText(freeLabel, {
      x: MARGIN + CONTENT_WIDTH - freeLabelWidth,
      y: MARGIN - 14,
      size: 8,
      font: helvetica,
      color: GRAY,
    });

    const outPath = resolve(outDir, `${template.id}.pdf`);
    const bytes = await doc.save();
    await writeFile(outPath, bytes);
    console.log(`  FOIA: ${outPath}`);
  }
}

// ─── Council Handout (Task 16) ──────────────────────────────────────────────

async function generateCouncilHandout() {
  const data = JSON.parse(
    await readFile(resolve(ROOT, 'src/data/toolkit-speaking.json'), 'utf-8')
  );

  const outDir = resolve(ROOT, 'public/toolkit/speaking');
  await mkdir(outDir, { recursive: true });

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;

  // Header bar
  page.drawRectangle({
    x: 0,
    y: y - 8,
    width: PAGE_WIDTH,
    height: 36,
    color: DARK,
  });
  page.drawText('DeflockSC.org', {
    x: MARGIN,
    y: y,
    size: 11,
    font: helveticaBold,
    color: WHITE,
  });

  y -= 52;

  // Red accent bar
  page.drawRectangle({ x: MARGIN, y, width: 50, height: 4, color: RED });
  y -= 30;

  // Main title
  page.drawText('License Plate Surveillance', {
    x: MARGIN, y, size: 22, font: helveticaBold, color: DARK,
  });
  y -= 28;
  page.drawText('in South Carolina', {
    x: MARGIN, y, size: 22, font: helveticaBold, color: DARK,
  });
  y -= 20;

  // Subtitle
  page.drawText('Key facts for your city or county council meeting', {
    x: MARGIN, y, size: 10, font: helvetica, color: GRAY,
  });
  y -= 24;

  y = drawRule(page, y, RED);
  y -= 4;

  // Key facts from talk track (picking strongest points)
  const keyFacts = [
    {
      stat: '422 million',
      label: "plate reads in SLED's statewide database, kept for 3 years",
    },
    {
      stat: '1,000+',
      label: 'Flock cameras on SC roads, scanning every car that passes',
    },
    {
      stat: '99%+',
      label: 'of scanned plates belong to people not suspected of any crime',
    },
    {
      stat: '200+',
      label: 'cameras installed on SC roads without SCDOT permits',
    },
    {
      stat: '0',
      label: 'SC laws governing ALPR data collection, sharing, or deletion',
    },
  ];

  page.drawText('BY THE NUMBERS', {
    x: MARGIN, y, size: 9, font: helveticaBold, color: RED,
  });
  y -= 18;

  for (const fact of keyFacts) {
    // Stat in bold
    page.drawText(fact.stat, {
      x: MARGIN, y, size: 14, font: helveticaBold, color: DARK,
    });
    const statWidth = helveticaBold.widthOfTextAtSize(fact.stat, 14);
    // Label after stat
    const labelLines = wrapText(fact.label, helvetica, 10, CONTENT_WIDTH - statWidth - 16);
    let labelY = y - 1;
    for (const line of labelLines) {
      page.drawText(line, {
        x: MARGIN + statWidth + 12, y: labelY, size: 10, font: helvetica, color: GRAY,
      });
      labelY -= 13;
    }
    y = Math.min(y - 20, labelY - 4);
  }

  y -= 8;

  // What happened section
  page.drawText('WHAT HAPPENED', {
    x: MARGIN, y, size: 9, font: helveticaBold, color: RED,
  });
  y -= 16;

  const incidents = [
    'Two Greenville women were handcuffed at gunpoint after a Flock camera wrongly flagged their rental car as stolen. They are suing.',
    'Flock secretly gave Border Patrol access to local police cameras nationwide without telling agencies. The CEO denied it on camera, then admitted it three weeks later.',
    'A SLED officer used the plate database to search for his own vehicle and altered the record. When a newspaper asked for misconduct records, SLED refused.',
    'Security researchers found Flock cameras can be hacked in under 30 seconds. They run software Google stopped updating in 2021.',
  ];

  for (const incident of incidents) {
    // Bullet
    page.drawText('\u2022', { x: MARGIN, y, size: 10, font: helvetica, color: RED });
    y = drawWrappedText(page, incident, helvetica, 9, MARGIN + 12, y, CONTENT_WIDTH - 12, DARK);
    y -= 6;
  }

  y -= 8;
  y = drawRule(page, y);
  y -= 4;

  // What we're asking for
  page.drawText("WHAT WE'RE ASKING FOR", {
    x: MARGIN, y, size: 9, font: helveticaBold, color: RED,
  });
  y -= 16;

  const asks = [
    ['Moratorium', 'Pause any expansion of ALPR cameras until oversight is in place.'],
    ['Oversight ordinance', 'Require council approval for data-sharing agreements and new camera deployments.'],
    ['Data audit', 'Public report on how many plates have been scanned, who has accessed the data, and how long it is retained.'],
    ['Retention limits', 'Set a local retention period shorter than SLED\'s 3-year default.'],
  ];

  for (const [title, desc] of asks) {
    page.drawText(title, { x: MARGIN, y, size: 10, font: helveticaBold, color: DARK });
    y -= 13;
    y = drawWrappedText(page, desc, helvetica, 9, MARGIN, y, CONTENT_WIDTH, GRAY);
    y -= 8;
  }

  // Footer
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: MARGIN - 10,
    color: DARK,
  });
  page.drawText('deflocksc.org', {
    x: MARGIN,
    y: 14,
    size: 10,
    font: helveticaBold,
    color: WHITE,
  });
  const moreInfo = 'Find your reps and send a letter at deflocksc.org';
  const moreInfoWidth = helvetica.widthOfTextAtSize(moreInfo, 8);
  page.drawText(moreInfo, {
    x: PAGE_WIDTH - MARGIN - moreInfoWidth,
    y: 16,
    size: 8,
    font: helvetica,
    color: rgb(0.6, 0.6, 0.6),
  });

  const outPath = resolve(outDir, 'council-handout.pdf');
  const bytes = await doc.save();
  await writeFile(outPath, bytes);
  console.log(`  Handout: ${outPath}`);
}

// ─── One-Pager (Task 18) ────────────────────────────────────────────────────

async function generateOnePager() {
  const data = JSON.parse(
    await readFile(resolve(ROOT, 'src/data/toolkit-outreach.json'), 'utf-8')
  );

  const outDir = resolve(ROOT, 'public/toolkit/outreach');
  await mkdir(outDir, { recursive: true });

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;

  // Header bar
  page.drawRectangle({
    x: 0,
    y: y - 8,
    width: PAGE_WIDTH,
    height: 36,
    color: DARK,
  });
  page.drawText('DeflockSC.org', {
    x: MARGIN,
    y: y,
    size: 11,
    font: helveticaBold,
    color: WHITE,
  });

  y -= 52;

  // Red accent bar
  page.drawRectangle({ x: MARGIN, y, width: 50, height: 4, color: RED });
  y -= 30;

  // Title
  const titleText = data.onePager.title;
  const titleLines = wrapText(titleText, helveticaBold, 20, CONTENT_WIDTH);
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y, size: 20, font: helveticaBold, color: DARK });
    y -= 26;
  }

  y -= 10;

  // Sections
  for (let i = 0; i < data.onePager.sections.length; i++) {
    const section = data.onePager.sections[i];

    if (y < MARGIN + 60) break;

    // Section number + heading
    const numLabel = `${i + 1}`;
    page.drawRectangle({
      x: MARGIN,
      y: y - 4,
      width: 20,
      height: 20,
      color: RED,
    });
    page.drawText(numLabel, {
      x: MARGIN + 7,
      y: y,
      size: 12,
      font: helveticaBold,
      color: WHITE,
    });

    page.drawText(section.heading, {
      x: MARGIN + 28,
      y,
      size: 13,
      font: helveticaBold,
      color: DARK,
    });
    y -= 20;

    // Section body
    y = drawWrappedText(page, section.text, helvetica, 10, MARGIN, y, CONTENT_WIDTH, DARK, 1.5);
    y -= 18;

    // Separator between sections (but not after the last)
    if (i < data.onePager.sections.length - 1 && y > MARGIN + 60) {
      y = drawRule(page, y, LIGHT_GRAY);
      y -= 4;
    }
  }

  // Footer
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: MARGIN - 10,
    color: DARK,
  });

  page.drawText('deflocksc.org', {
    x: MARGIN,
    y: 14,
    size: 10,
    font: helveticaBold,
    color: WHITE,
  });

  const tagline = 'Find your reps, file a FOIA request, or send a letter';
  const taglineWidth = helvetica.widthOfTextAtSize(tagline, 8);
  page.drawText(tagline, {
    x: PAGE_WIDTH - MARGIN - taglineWidth,
    y: 16,
    size: 8,
    font: helvetica,
    color: rgb(0.6, 0.6, 0.6),
  });

  const outPath = resolve(outDir, 'one-pager.pdf');
  const bytes = await doc.save();
  await writeFile(outPath, bytes);
  console.log(`  One-pager: ${outPath}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Generating toolkit PDFs...\n');

  console.log('Task 15: FOIA Templates');
  await generateFoiaTemplates();

  console.log('\nTask 16: Council Handout');
  await generateCouncilHandout();

  console.log('\nTask 18: One-Pager');
  await generateOnePager();

  console.log('\nAll PDFs generated.');
}

main().catch((err) => {
  console.error('PDF generation failed:', err);
  process.exit(1);
});
