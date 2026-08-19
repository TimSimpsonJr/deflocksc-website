import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseDirection, wikimediaThumbnailUrl, createConeImage } from './cameras.js';

describe('parseDirection', () => {
  it('returns null for undefined tags', () => {
    expect(parseDirection(undefined)).toBe(null);
  });

  it('returns null when no direction tag is present', () => {
    expect(parseDirection({ manufacturer: 'Flock Safety' })).toBe(null);
  });

  it('returns null for an empty direction value', () => {
    expect(parseDirection({ direction: '' })).toBe(null);
  });

  it('parses plain numeric degrees', () => {
    expect(parseDirection({ direction: '90' })).toBe(90);
  });

  it('parses zero degrees', () => {
    expect(parseDirection({ direction: '0' })).toBe(0);
  });

  it('parses fractional degrees', () => {
    expect(parseDirection({ direction: '112.5' })).toBe(112.5);
  });

  it('falls back to camera:direction', () => {
    expect(parseDirection({ 'camera:direction': '45' })).toBe(45);
  });

  it('prefers direction over camera:direction', () => {
    expect(parseDirection({ direction: '10', 'camera:direction': '200' })).toBe(10);
  });

  it('takes the midpoint of a range', () => {
    expect(parseDirection({ direction: '138-183' })).toBe(160.5);
  });

  it('takes the first value of a semicolon list', () => {
    expect(parseDirection({ direction: '90;270' })).toBe(90);
  });

  it('trims surrounding whitespace', () => {
    expect(parseDirection({ direction: '  225  ' })).toBe(225);
  });

  it('maps cardinal directions', () => {
    expect(parseDirection({ direction: 'N' })).toBe(0);
    expect(parseDirection({ direction: 'E' })).toBe(90);
    expect(parseDirection({ direction: 'S' })).toBe(180);
    expect(parseDirection({ direction: 'W' })).toBe(270);
  });

  it('maps intercardinal directions', () => {
    expect(parseDirection({ direction: 'NNE' })).toBe(22.5);
    expect(parseDirection({ direction: 'SW' })).toBe(225);
    expect(parseDirection({ direction: 'WNW' })).toBe(292.5);
  });

  it('is case-insensitive for cardinals', () => {
    expect(parseDirection({ direction: 'nw' })).toBe(315);
  });

  it('returns null for unparseable text', () => {
    expect(parseDirection({ direction: 'sideways' })).toBe(null);
  });
});

describe('wikimediaThumbnailUrl', () => {
  it('strips a leading File: prefix', () => {
    expect(wikimediaThumbnailUrl('File:Flock_camera.jpg')).toBe(
      'https://commons.wikimedia.org/w/thumb.php?f=Flock_camera.jpg&w=300',
    );
  });

  it('converts spaces to underscores', () => {
    expect(wikimediaThumbnailUrl('Flock camera front.jpg')).toBe(
      'https://commons.wikimedia.org/w/thumb.php?f=Flock_camera_front.jpg&w=300',
    );
  });

  it('strips the prefix and converts spaces together', () => {
    expect(wikimediaThumbnailUrl('File:Flock Safety Falcon.jpg')).toBe(
      'https://commons.wikimedia.org/w/thumb.php?f=Flock_Safety_Falcon.jpg&w=300',
    );
  });

  it('percent-encodes reserved and non-ASCII characters', () => {
    expect(wikimediaThumbnailUrl('Cam&ra é.jpg')).toBe(
      'https://commons.wikimedia.org/w/thumb.php?f=Cam%26ra_%C3%A9.jpg&w=300',
    );
  });

  it('strips only the first File: prefix', () => {
    expect(wikimediaThumbnailUrl('File:File:a.jpg')).toBe(
      'https://commons.wikimedia.org/w/thumb.php?f=File%3Aa.jpg&w=300',
    );
  });
});

// createConeImage rasterises through a canvas 2D context, which vitest's
// `environment: 'node'` does not provide. Rather than add jsdom + a native
// canvas backend for one function, these tests install a recording stub and
// assert the draw program: the geometry constants, the colours, and the
// read-back size. That catches an accidental edit to the cone during a move.
// It does NOT prove pixels were painted — the "cones actually render" check
// lives in the manual smoke checklist in Step 10.

type DrawOp = {
  op: string;
  args: number[];
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
};

function installCanvasRecorder(): { ops: DrawOp[]; canvas: { width: number; height: number } } {
  const ops: DrawOp[] = [];

  const ctx: any = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    getImageData: (...args: number[]) => {
      record('getImageData', args);
      return { data: new Uint8ClampedArray(args[2] * args[3] * 4) };
    },
  };

  function record(op: string, args: number[]): void {
    ops.push({
      op,
      args,
      fillStyle: ctx.fillStyle,
      strokeStyle: ctx.strokeStyle,
      lineWidth: ctx.lineWidth,
    });
  }

  for (const name of ['beginPath', 'moveTo', 'arc', 'closePath', 'fill', 'stroke']) {
    ctx[name] = (...args: number[]) => record(name, args);
  }

  const canvas = { width: 0, height: 0, getContext: () => ctx };
  vi.stubGlobal('document', { createElement: () => canvas });

  return { ops, canvas };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createConeImage', () => {
  it('returns an 80x80 RGBA buffer', () => {
    installCanvasRecorder();
    const img = createConeImage();
    expect(img.width).toBe(80);
    expect(img.height).toBe(80);
    expect(img.data.length).toBe(80 * 80 * 4);
  });

  it('sizes the backing canvas to match the returned image', () => {
    const { canvas } = installCanvasRecorder();
    const img = createConeImage();
    expect(canvas.width).toBe(img.width);
    expect(canvas.height).toBe(img.height);
  });

  it('reads back the whole canvas', () => {
    const { ops } = installCanvasRecorder();
    createConeImage();
    const read = ops.find((o) => o.op === 'getImageData')!;
    expect(read.args).toEqual([0, 0, 80, 80]);
  });

  it('draws a 50-degree wedge centred on north', () => {
    const { ops } = installCanvasRecorder();
    createConeImage();
    const wedge = ops.filter((o) => o.op === 'arc')[0];
    const [cx, cy, radius, startAngle, endAngle] = wedge.args;
    expect([cx, cy]).toEqual([40, 40]);
    expect(radius).toBe(36);
    expect(endAngle - startAngle).toBeCloseTo(50 * (Math.PI / 180), 10);
    expect((startAngle + endAngle) / 2).toBeCloseTo(-Math.PI / 2, 10);
  });

  it('fills the wedge with translucent red', () => {
    const { ops } = installCanvasRecorder();
    createConeImage();
    expect(ops.filter((o) => o.op === 'fill')[0].fillStyle).toBe('rgba(239, 68, 68, 0.45)');
  });

  it('draws a solid centre dot inside the wedge radius', () => {
    const { ops } = installCanvasRecorder();
    createConeImage();
    const dot = ops.filter((o) => o.op === 'arc')[1];
    const [cx, cy, radius, start, end] = dot.args;
    expect([cx, cy]).toEqual([40, 40]);
    expect(radius).toBe(7);
    expect(radius).toBeLessThan(36);
    expect(end - start).toBeCloseTo(Math.PI * 2, 10);
    expect(ops.filter((o) => o.op === 'fill')[1].fillStyle).toBe('#ef4444');
  });

  it('outlines the centre dot with a darker red hairline', () => {
    const { ops } = installCanvasRecorder();
    createConeImage();
    const stroke = ops.find((o) => o.op === 'stroke')!;
    expect(stroke.strokeStyle).toBe('#991b1b');
    expect(stroke.lineWidth).toBe(1);
  });

  it('keeps the whole cone inside the image bounds', () => {
    const { ops } = installCanvasRecorder();
    const img = createConeImage();
    const [cx, cy, radius] = ops.filter((o) => o.op === 'arc')[0].args;
    expect(cx + radius).toBeLessThanOrEqual(img.width);
    expect(cy + radius).toBeLessThanOrEqual(img.height);
    expect(cx - radius).toBeGreaterThanOrEqual(0);
    expect(cy - radius).toBeGreaterThanOrEqual(0);
  });
});
