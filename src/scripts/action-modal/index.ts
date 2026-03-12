import { matchDistricts, geocodeAddress } from '../../lib/district-matcher.js';
import type { ModalData, DistrictMatch } from './types.js';
import { buildGroups } from './group-builder.js';
import { renderResults, initResultsEventDelegation } from './results-renderer.js';
import { initModalController, openModal, showState, showError } from './modal-controller.js';
import { initManualDropdowns } from './manual-dropdowns.js';

// Read server-injected data from the JSON data island
const dataEl = document.getElementById('action-modal-data');
if (dataEl) {
  const data: ModalData = JSON.parse(dataEl.textContent!);
  init(data);
}

function init(data: ModalData): void {
  const { actionLetters, stateLegislators, localCouncils, registry, cameraCounts } = data;

  initModalController();
  initResultsEventDelegation(localCouncils);
  initManualDropdowns(stateLegislators, registry);

  // Modal triggers
  document.querySelectorAll('[data-open-action]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      openModal(btn as HTMLElement);
    });
  });

  // Helper: complete the lookup flow
  function handleMatch(match: DistrictMatch): void {
    const groups = buildGroups(match, actionLetters, stateLegislators, localCouncils);
    showState('results');
    renderResults(groups, cameraCounts);
    document.getElementById('action-results')?.focus();
  }

  // Geolocation button
  document.getElementById('action-geo')?.addEventListener('click', async function() {
    showState('loading');
    try {
      const pos = await new Promise<GeolocationPosition>(function(resolve, reject) {
        if (!navigator.geolocation) return reject(new Error('Your browser does not support location services. Type your address below instead.'));
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      const match = await matchDistricts(pos.coords.latitude, pos.coords.longitude);
      if (!match.senate && !match.house) {
        throw new Error("Your location didn't match any SC legislative districts. Try typing your street address instead.");
      }
      handleMatch(match);
    } catch (err: unknown) {
      if (err instanceof Object && 'code' in err && (err as { code: number }).code === 1) {
        showError('Location access was blocked by your browser. You can type your address below instead.');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        showError(msg || 'We could not determine your location. Try entering your street address instead.');
      }
    }
  });

  // Address form
  document.getElementById('action-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const address = (document.getElementById('action-address') as HTMLInputElement | null)?.value?.trim();
    if (!address) return;

    if (address.length < 5) {
      showError('Please enter a full street address (e.g. "123 Main St, Greenville, SC 29601").');
      return;
    }
    if (!/[a-zA-Z]/.test(address)) {
      showError('Please enter a valid street address with a street name.');
      return;
    }

    showState('loading');
    try {
      const geo = await geocodeAddress(address);
      if (!geo.lat || !geo.lng) {
        throw new Error("That address didn't return a match. Double-check the street, city, and state, then try again.");
      }

      if (geo.lat < 31.5 || geo.lat > 35.5 || geo.lng < -84.0 || geo.lng > -78.0) {
        throw new Error("That address doesn't appear to be in South Carolina. Please enter a SC address.");
      }

      const match = await matchDistricts(geo.lat, geo.lng);
      if (geo.senate) match.senate = geo.senate;
      if (geo.house) match.house = geo.house;
      handleMatch(match);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showError(msg || 'The address lookup did not return results. Check the address and try again, or select your district manually below.');
    }
  });

  // Manual submit
  document.getElementById('action-manual-submit')?.addEventListener('click', function() {
    const match: DistrictMatch = {
      senate: (document.getElementById('manual-senate') as HTMLSelectElement | null)?.value || null,
      house: (document.getElementById('manual-house') as HTMLSelectElement | null)?.value || null,
      county: (document.getElementById('manual-county') as HTMLSelectElement | null)?.value || null,
      countyDistrict: (document.getElementById('manual-county-district') as HTMLSelectElement | null)?.value || null,
      city: (document.getElementById('manual-city') as HTMLSelectElement | null)?.value || null,
      cityDistrict: (document.getElementById('manual-city-district') as HTMLSelectElement | null)?.value || null
    };
    if (!match.senate && !match.house) {
      showError('Pick at least a Senate or House district so we can find your representatives.');
      return;
    }
    if (match.county && !match.countyDistrict) {
      showError('Please also select your county council district, or clear the county selection.');
      return;
    }
    if (match.city && !match.cityDistrict) {
      showError('Please also select your city council district, or clear the city selection.');
      return;
    }
    handleMatch(match);
  });

  // Reset + retry
  document.getElementById('action-reset')?.addEventListener('click', function() {
    showState('input');
    document.getElementById('action-address')?.focus();
  });

  document.getElementById('action-retry')?.addEventListener('click', function() {
    showState('input');
    document.getElementById('action-address')?.focus();
  });
}
