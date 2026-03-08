import type { ActionLetter, StateLegislators, LocalCouncils, Council, DistrictMatch, RepGroup, Rep } from './types.js';

function findLetter(actionLetters: ActionLetter[], patternSubstring: string): ActionLetter | null {
  for (let i = 0; i < actionLetters.length; i++) {
    if (actionLetters[i].divisionPattern.indexOf(patternSubstring) !== -1) {
      return actionLetters[i];
    }
  }
  return null;
}

function findLocalLetter(actionLetters: ActionLetter[], councilKey: string): ActionLetter | null {
  for (let i = 0; i < actionLetters.length; i++) {
    if (actionLetters[i].divisionPattern.indexOf(councilKey) !== -1 && actionLetters[i].category === 'local') {
      return actionLetters[i];
    }
  }
  return null;
}

function findMatchedMember(council: Council | undefined, districtNum: string | null) {
  if (!council || !council.members || !districtNum) return null;
  const needleD = 'District ' + districtNum;
  const needleS = 'Seat ' + districtNum;
  for (let i = 0; i < council.members.length; i++) {
    const title = council.members[i].title || '';
    if (title.indexOf(needleD) !== -1 || title.indexOf(needleS) !== -1) {
      return council.members[i];
    }
  }
  return null;
}

function findCatchAllLocal(actionLetters: ActionLetter[]): ActionLetter | null {
  for (let i = 0; i < actionLetters.length; i++) {
    if (actionLetters[i].divisionPattern === 'state:sc/' && actionLetters[i].category === 'local') {
      return actionLetters[i];
    }
  }
  return null;
}

export function buildGroups(
  match: DistrictMatch,
  actionLetters: ActionLetter[],
  stateLegislators: StateLegislators,
  localCouncils: LocalCouncils
): RepGroup[] {
  const groups: RepGroup[] = [];

  // 1. State Senator
  const senateLetter = findLetter(actionLetters, 'sldu:');
  if (senateLetter) {
    const senator = match.senate ? stateLegislators.senate[match.senate] : null;
    groups.push({
      label: senateLetter.label,
      category: 'state',
      subject: senateLetter.subject,
      body: senateLetter.body,
      reps: senator ? [{
        name: senator.name, party: senator.party || '', office: 'State Senator, District ' + match.senate,
        email: senator.email, phone: senator.phone || '', photoUrl: senator.photoUrl || '', website: senator.website || ''
      }] : []
    });
  }

  // 2. State Representative
  const houseLetter = findLetter(actionLetters, 'sldl:');
  if (houseLetter) {
    const houseRep = match.house ? stateLegislators.house[match.house] : null;
    groups.push({
      label: houseLetter.label,
      category: 'state',
      subject: houseLetter.subject,
      body: houseLetter.body,
      reps: houseRep ? [{
        name: houseRep.name, party: houseRep.party || '', office: 'State Representative, District ' + match.house,
        email: houseRep.email, phone: houseRep.phone || '', photoUrl: houseRep.photoUrl || '', website: houseRep.website || ''
      }] : []
    });
  }

  // 3. Local matched reps (district-matched only)
  const localMatchedReps: Rep[] = [];
  const countyKey = match.county ? 'county:' + match.county : null;
  const cityKey = match.city ? 'place:' + match.city : null;
  const countyCouncil = countyKey ? localCouncils[countyKey] : undefined;
  const cityCouncil = cityKey ? localCouncils[cityKey] : undefined;

  const matchedCountyMember = findMatchedMember(countyCouncil, match.countyDistrict);
  if (matchedCountyMember && matchedCountyMember.name && matchedCountyMember.name !== 'Vacant' && countyCouncil) {
    localMatchedReps.push({
      name: matchedCountyMember.name,
      office: matchedCountyMember.title + ' — ' + countyCouncil.label,
      email: matchedCountyMember.email || '',
      phone: matchedCountyMember.phone || ''
    });
  }

  const matchedCityMember = findMatchedMember(cityCouncil, match.cityDistrict);
  if (matchedCityMember && matchedCityMember.name && matchedCityMember.name !== 'Vacant' && cityCouncil) {
    localMatchedReps.push({
      name: matchedCityMember.name,
      office: matchedCityMember.title + ' — ' + cityCouncil.label,
      email: matchedCityMember.email || '',
      phone: matchedCityMember.phone || ''
    });
  }

  if (localMatchedReps.length > 0) {
    let localMatchedLetter = (countyKey && findLocalLetter(actionLetters, countyKey)) ||
                             (cityKey && findLocalLetter(actionLetters, cityKey)) ||
                             findCatchAllLocal(actionLetters);
    if (localMatchedLetter) {
      groups.push({
        label: 'Your Local Representatives',
        category: 'local-matched',
        subject: localMatchedLetter.subject,
        body: localMatchedLetter.body,
        reps: localMatchedReps
      });
    }
  }

  // 4. Full county council
  if (countyCouncil && countyKey) {
    const countyLetter = findLocalLetter(actionLetters, countyKey);
    if (countyLetter) {
      const countyReps: Rep[] = [];
      for (let cm = 0; cm < countyCouncil.members.length; cm++) {
        const member = countyCouncil.members[cm];
        if (!member.name || member.name === 'Vacant') continue;
        const isMatched = !!(matchedCountyMember && member.name === matchedCountyMember.name);
        countyReps.push({
          name: member.name, office: member.title, email: member.email || '',
          phone: member.phone || '', isMatchedDistrict: isMatched
        });
      }
      countyReps.sort((a, b) => (b.isMatchedDistrict ? 1 : 0) - (a.isMatchedDistrict ? 1 : 0));
      groups.push({
        label: countyLetter.label, category: 'local', subject: countyLetter.subject, body: countyLetter.body,
        reps: countyReps, countyKey, matchedDistrict: match.countyDistrict || null
      });
    }
  }

  // 5. Full city council
  if (cityCouncil && cityKey) {
    const cityLetter = findLocalLetter(actionLetters, cityKey);
    if (cityLetter) {
      const cityReps: Rep[] = [];
      for (let cim = 0; cim < cityCouncil.members.length; cim++) {
        const cmember = cityCouncil.members[cim];
        if (!cmember.name || cmember.name === 'Vacant') continue;
        const isCityMatched = !!(matchedCityMember && cmember.name === matchedCityMember.name);
        cityReps.push({
          name: cmember.name, office: cmember.title, email: cmember.email || '',
          phone: cmember.phone || '', isMatchedDistrict: isCityMatched
        });
      }
      cityReps.sort((a, b) => (b.isMatchedDistrict ? 1 : 0) - (a.isMatchedDistrict ? 1 : 0));
      groups.push({
        label: cityLetter.label, category: 'local', subject: cityLetter.subject, body: cityLetter.body,
        reps: cityReps, cityKey, matchedDistrict: match.cityDistrict || null
      });
    }
  }

  // If no local council groups, add catch-all
  const hasLocal = groups.some(g => g.category === 'local' || g.category === 'local-matched');
  if (!hasLocal) {
    const catchAll = findCatchAllLocal(actionLetters);
    if (catchAll) {
      groups.push({
        label: catchAll.label, category: 'local', subject: catchAll.subject, body: catchAll.body, reps: []
      });
    }
  }

  return groups;
}
