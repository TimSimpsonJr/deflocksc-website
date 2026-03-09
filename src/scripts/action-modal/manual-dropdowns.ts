import type { StateLegislators, Registry } from './types.js';

interface DistrictRange {
  start: number;
  end: number;
}

interface CityEntry {
  value: string;
  label: string;
  start: number;
  end: number;
}

function parseRange(rangeStr: string | undefined, fallbackEnd: number | undefined): DistrictRange {
  if (!rangeStr) return { start: 1, end: fallbackEnd || 1 };
  const parts = rangeStr.split('-');
  const s = parseInt(parts[0]), e = parseInt(parts[1]);
  return (!isNaN(s) && !isNaN(e)) ? { start: s, end: e } : { start: 1, end: fallbackEnd || 1 };
}

export function initManualDropdowns(stateLegislators: StateLegislators, registry: Registry): void {
  // Populate senate districts
  const senateSel = document.getElementById('manual-senate') as HTMLSelectElement | null;
  if (senateSel) {
    const senateNums = Object.keys(stateLegislators.senate).sort((a, b) => +a - +b);
    for (let i = 0; i < senateNums.length; i++) {
      const opt = document.createElement('option');
      opt.value = senateNums[i];
      opt.textContent = senateNums[i];
      senateSel.appendChild(opt);
    }
  }

  // Populate house districts
  const houseSel = document.getElementById('manual-house') as HTMLSelectElement | null;
  if (houseSel) {
    const houseNums = Object.keys(stateLegislators.house).sort((a, b) => +a - +b);
    for (let i = 0; i < houseNums.length; i++) {
      const opt = document.createElement('option');
      opt.value = houseNums[i];
      opt.textContent = houseNums[i];
      houseSel.appendChild(opt);
    }
  }

  // Build county district ranges and county-to-city mapping
  const countyDistrictRanges: Record<string, DistrictRange> = {};
  const countyCitiesMap: Record<string, CityEntry[]> = {};

  for (let i = 0; i < registry.jurisdictions.length; i++) {
    const j = registry.jurisdictions[i];
    const cLower = j.county.toLowerCase();
    if (j.type === 'county') {
      countyDistrictRanges[cLower] = parseRange(j.districtRange, j.districts);
    } else if (j.type === 'place') {
      const cityId = j.id.split(':')[1];
      const cityRange = parseRange(j.districtRange, j.districts);
      if (!countyCitiesMap[cLower]) countyCitiesMap[cLower] = [];
      const cityLabel = j.name
        ? j.name.replace(/\s+(City|Town)\s+Council$/i, '').replace(/\s+Council$/i, '')
        : cityId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      countyCitiesMap[cLower].push({ value: cityId, label: cityLabel, start: cityRange.start, end: cityRange.end });
    }
  }

  // County change handler
  document.getElementById('manual-county')?.addEventListener('change', function(this: HTMLSelectElement) {
    const county = this.value;
    const distSel = document.getElementById('manual-county-district') as HTMLSelectElement;
    const cityRow = document.getElementById('manual-city-row')!;
    const citySel = document.getElementById('manual-city') as HTMLSelectElement;
    const cityDistSel = document.getElementById('manual-city-district') as HTMLSelectElement;

    distSel.innerHTML = '<option value="">Select...</option>';
    if (county && countyDistrictRanges[county]) {
      const range = countyDistrictRanges[county];
      for (let d = range.start; d <= range.end; d++) {
        const opt = document.createElement('option');
        opt.value = String(d);
        opt.textContent = 'District ' + d;
        distSel.appendChild(opt);
      }
    }

    if (county && countyCitiesMap[county]) {
      cityRow.classList.remove('hidden');
      citySel.innerHTML = '<option value="">None</option>';
      const cities = countyCitiesMap[county];
      for (let c = 0; c < cities.length; c++) {
        const copt = document.createElement('option');
        copt.value = cities[c].value;
        copt.textContent = cities[c].label;
        citySel.appendChild(copt);
      }
    } else {
      cityRow.classList.add('hidden');
      citySel.innerHTML = '<option value="">None</option>';
    }
    cityDistSel.innerHTML = '<option value="">Select city first</option>';
  });

  // City change handler
  document.getElementById('manual-city')?.addEventListener('change', function(this: HTMLSelectElement) {
    const city = this.value;
    const county = (document.getElementById('manual-county') as HTMLSelectElement | null)?.value;
    const cityDistSel = document.getElementById('manual-city-district') as HTMLSelectElement;

    cityDistSel.innerHTML = '<option value="">Select...</option>';
    if (city && county && countyCitiesMap[county]) {
      const cityData = countyCitiesMap[county].find(c => c.value === city);
      if (cityData) {
        for (let d = cityData.start; d <= cityData.end; d++) {
          const opt = document.createElement('option');
          opt.value = String(d);
          opt.textContent = 'District ' + d;
          cityDistSel.appendChild(opt);
        }
      }
    }
  });
}
