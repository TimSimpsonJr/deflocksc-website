import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escape-html.js';

describe('escapeHtml', () => {
  it('escapes the ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes the less-than sign', () => {
    expect(escapeHtml('1 < 2')).toBe('1 &lt; 2');
  });

  it('escapes the greater-than sign', () => {
    expect(escapeHtml('2 > 1')).toBe('2 &gt; 1');
  });

  it('escapes the double quote', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('escapes the single quote', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes each source character exactly once (no double escaping)', () => {
    // The literal text `&lt;` must become `&amp;lt;`, not stay `&lt;`.
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves a string with no special characters untouched', () => {
    expect(escapeHtml('Flock Safety Falcon')).toBe('Flock Safety Falcon');
  });

  it('neutralises an attribute-breakout payload from an OSM manufacturer tag', () => {
    const payload = 'Flock" onerror="alert(1)';
    const escaped = escapeHtml(payload);

    // No raw double quote survives, so the payload cannot close a
    // src="..." / alt="..." attribute and inject a new one.
    expect(escaped).not.toContain('"');
    expect(escaped).toBe('Flock&quot; onerror=&quot;alert(1)');

    // In attribute context the payload is inert text, not markup.
    expect(`<img alt="${escaped}">`).toBe(
      '<img alt="Flock&quot; onerror=&quot;alert(1)">',
    );
  });
});
