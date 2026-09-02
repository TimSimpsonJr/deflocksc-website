import { describe, it, expect } from 'vitest';
import { decideApiAuth, decideHost, loopbackHosts, loopbackOrigins } from './codes-ui-guard.js';

const TOKEN = 'a'.repeat(64);
const HOSTS = loopbackHosts(4919);
const ORIGINS = loopbackOrigins(4919);
const EXPECTED = { token: TOKEN, origins: ORIGINS };

describe('decideHost', () => {
  it('accepts 127.0.0.1 with the right port', () => {
    expect(decideHost(HOSTS, '127.0.0.1:4919')).toEqual({ ok: true, value: true });
  });

  it('accepts localhost with the right port, case-normalized', () => {
    expect(decideHost(HOSTS, 'localhost:4919')).toEqual({ ok: true, value: true });
    expect(decideHost(HOSTS, 'LocalHost:4919')).toEqual({ ok: true, value: true });
  });

  it('rejects a missing Host', () => {
    expect(decideHost(HOSTS, undefined)).toEqual({ ok: false, code: 'bad_host' });
    expect(decideHost(HOSTS, '')).toEqual({ ok: false, code: 'bad_host' });
  });

  it('rejects a foreign host even when it resolves to loopback (DNS rebinding)', () => {
    expect(decideHost(HOSTS, 'evil.example:4919')).toEqual({ ok: false, code: 'bad_host' });
    expect(decideHost(HOSTS, 'evil.example')).toEqual({ ok: false, code: 'bad_host' });
  });

  it('rejects a loopback host with the wrong port', () => {
    expect(decideHost(HOSTS, '127.0.0.1:9999')).toEqual({ ok: false, code: 'bad_host' });
    expect(decideHost(HOSTS, 'localhost')).toEqual({ ok: false, code: 'bad_host' });
  });
});

describe('decideApiAuth', () => {
  it('rejects a missing token', () => {
    expect(decideApiAuth(EXPECTED, { token: undefined, origin: undefined, secFetchSite: undefined }))
      .toEqual({ ok: false, code: 'missing_token' });
  });

  it('rejects an empty token', () => {
    expect(decideApiAuth(EXPECTED, { token: '', origin: undefined, secFetchSite: undefined }))
      .toEqual({ ok: false, code: 'missing_token' });
  });

  it('rejects a wrong token', () => {
    expect(decideApiAuth(EXPECTED, { token: 'b'.repeat(64), origin: undefined, secFetchSite: undefined }))
      .toEqual({ ok: false, code: 'bad_token' });
  });

  it('accepts a valid token with no Origin and no Sec-Fetch-Site (curl)', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: undefined, secFetchSite: undefined }))
      .toEqual({ ok: true, value: true });
  });

  it('accepts a valid token with the 127.0.0.1 origin', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: 'http://127.0.0.1:4919', secFetchSite: 'same-origin' }))
      .toEqual({ ok: true, value: true });
  });

  it('accepts a valid token with the localhost origin (both loopback origins are allowed)', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: 'http://localhost:4919', secFetchSite: 'same-origin' }))
      .toEqual({ ok: true, value: true });
  });

  it('rejects a cross-site Origin even with a valid token', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: 'https://evil.example', secFetchSite: undefined }))
      .toEqual({ ok: false, code: 'cross_site' });
  });

  it('rejects Sec-Fetch-Site cross-site even with a valid token', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: undefined, secFetchSite: 'cross-site' }))
      .toEqual({ ok: false, code: 'cross_site' });
  });

  it('rejects Sec-Fetch-Site same-site (a subdomain is still not this page)', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: undefined, secFetchSite: 'same-site' }))
      .toEqual({ ok: false, code: 'cross_site' });
  });

  it('accepts Sec-Fetch-Site none with a valid token (address-bar / curl-like)', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: undefined, secFetchSite: 'none' }))
      .toEqual({ ok: true, value: true });
  });

  it('reports cross_site before any token verdict, so a foreign page learns nothing about the token', () => {
    expect(decideApiAuth(EXPECTED, { token: undefined, origin: 'https://evil.example', secFetchSite: 'cross-site' }))
      .toEqual({ ok: false, code: 'cross_site' });
  });
});
