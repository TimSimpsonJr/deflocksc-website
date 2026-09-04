// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SSR_EXACT = '1,624'; // impact-stats.json scTotal, comma-formatted
const SSR_FLOOR = '1,600'; // Math.floor(1624/100)*100, comma-formatted

// An exact surface mirrors the component markup after Task 6:
//   <TAG class=CLS data-live-sc="exact">
//     <span class="sr-only">V</span><span aria-hidden data-count-up>V</span>
//   </TAG>
function exactSurface(tag: string, cls: string, value: string): HTMLElement {
  const wrap = document.createElement(tag);
  wrap.className = cls;
  wrap.setAttribute('data-live-sc', 'exact');
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = value;
  const vis = document.createElement('span');
  vis.setAttribute('aria-hidden', 'true');
  vis.setAttribute('data-count-up', '');
  vis.textContent = value;
  wrap.append(sr, vis);
  return wrap;
}

// Two exact surfaces (ImpactBand istat-v + MapSection statline .n) and one floor
// surface (Hero prose span).
function buildHomepage(): void {
  document.body.replaceChildren();
  document.body.append(
    exactSurface('div', 'istat-v', SSR_EXACT),
    exactSurface('span', 'n', SSR_EXACT),
  );
  const floor = document.createElement('span');
  floor.setAttribute('data-live-sc', 'floor');
  floor.textContent = SSR_FLOOR;
  document.body.append(floor);
}

function surfaceTexts() {
  const exacts = Array.from(document.querySelectorAll('[data-live-sc="exact"]'));
  const floor = document.querySelector('[data-live-sc="floor"]')!;
  return {
    exactVisible: exacts.map((el) => el.querySelector('[data-count-up]')!.textContent),
    exactSr: exacts.map((el) => el.querySelector('.sr-only')!.textContent),
    floor: floor.textContent?.trim(),
  };
}

function jsonFetch(body: unknown) {
  return vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
}

// live-count.ts memoizes the fetch and guards init with module-level state, so
// each test re-imports the module to reset `started`/`cached`.
async function freshModule() {
  vi.resetModules();
  return import('./live-count.js');
}

beforeEach(() => {
  buildHomepage();
  // Force count-up.ts into its no-animation branch so the DOM lands on the FINAL
  // value synchronously — no IntersectionObserver callbacks (which never fire
  // without layout) to await, so assertions see the applied value, not a mid-
  // animation 0.
  vi.stubGlobal('IntersectionObserver', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('live-count DOM wiring (design §3.3, §7)', () => {
  it('a successful fetch updates all three surfaces (two exact + one floor)', async () => {
    const fetchMock = jsonFetch({ scTotal: 1725, jurisdictions: 40, stale: false });
    vi.stubGlobal('fetch', fetchMock);

    const { initLiveCount } = await freshModule();
    initLiveCount(document);
    await vi.waitFor(() => expect(surfaceTexts().floor).toBe('1,700'));

    const t = surfaceTexts();
    expect(t.exactVisible).toEqual(['1,725', '1,725']); // full total on both exact surfaces
    expect(t.exactSr).toEqual(['1,725', '1,725']); // sr-only mirror updated too
    expect(t.floor).toBe('1,700'); // cameraFloor(1725)
  });

  it('a stale response leaves all three surfaces at their SSR build values', async () => {
    const fetchMock = jsonFetch({ stale: true });
    vi.stubGlobal('fetch', fetchMock);

    const { initLiveCount } = await freshModule();
    initLiveCount(document);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Flush the full promise chain (fetch -> json -> parse -> observeBuildValues).
    await new Promise((resolve) => setTimeout(resolve, 0));

    const t = surfaceTexts();
    expect(t.exactVisible).toEqual([SSR_EXACT, SSR_EXACT]);
    expect(t.exactSr).toEqual([SSR_EXACT, SSR_EXACT]);
    expect(t.floor).toBe(SSR_FLOOR);
  });

  it('a rejected fetch also leaves the SSR build values unchanged', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    const { initLiveCount } = await freshModule();
    initLiveCount(document);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    const t = surfaceTexts();
    expect(t.exactVisible).toEqual([SSR_EXACT, SSR_EXACT]);
    expect(t.floor).toBe(SSR_FLOOR);
  });

  it('fetches exactly once per page even when all three components init', async () => {
    const fetchMock = jsonFetch({ scTotal: 1725, stale: false });
    vi.stubGlobal('fetch', fetchMock);

    const { initLiveCount } = await freshModule();
    // Hero, ImpactBand, and MapSection each call initLiveCount on load.
    initLiveCount(document);
    initLiveCount(document);
    initLiveCount(document);
    await vi.waitFor(() => expect(surfaceTexts().floor).toBe('1,700'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/sc-camera-count', expect.anything());
  });

  it('formats exact surfaces as the full total and the floor as the rounded-down hundred', async () => {
    const fetchMock = jsonFetch({ scTotal: 1699, stale: false });
    vi.stubGlobal('fetch', fetchMock);

    const { initLiveCount } = await freshModule();
    initLiveCount(document);
    await vi.waitFor(() => expect(surfaceTexts().exactVisible[0]).toBe('1,699'));

    const t = surfaceTexts();
    expect(t.exactVisible).toEqual(['1,699', '1,699']); // exact = full total
    expect(t.floor).toBe('1,600'); // floor = Math.floor(1699/100)*100
  });
});
