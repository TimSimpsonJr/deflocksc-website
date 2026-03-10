import type { RepGroup, LocalCouncils } from './types.js';

declare const umami: { track: (event: string) => void } | undefined;

let currentGroups: RepGroup[] | null = null;

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function buildMailto(emails: string[], subject: string, body: string): string {
  if (typeof umami !== 'undefined') umami.track('email-rep-clicked');
  const to = emails.join(',');
  return 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}

async function copyToClipboard(text: string, button: HTMLElement): Promise<void> {
  if (typeof umami !== 'undefined') umami.track('letter-copied');
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => { button.textContent = original; }, 2000);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    const original = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => { button.textContent = original; }, 2000);
  }
}

function replaceGreeting(body: string, name: string): string {
  return body.replace(/^Dear .+,/m, 'Dear ' + name + ',');
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function animateCount(el: HTMLElement, target: number): void {
  const duration = 1000;
  const start = performance.now();
  function tick(now: number): void {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out: 1 - (1 - t)^3
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = String(Math.round(eased * target));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export function renderResults(groups: RepGroup[], cameraCounts?: Record<string, number>): void {
  currentGroups = groups;
  const container = document.getElementById('action-results-list');
  if (!container) return;
  container.innerHTML = '';

  // Camera counter stat line
  if (cameraCounts) {
    let countyKey: string | undefined;
    let cityKey: string | undefined;
    for (const g of groups) {
      if (g.countyKey && !countyKey) countyKey = g.countyKey;
      if (g.cityKey && !cityKey) cityKey = g.cityKey;
    }

    const cityCount = cityKey ? (cameraCounts[cityKey] || 0) : 0;
    const countyCount = countyKey ? (cameraCounts[countyKey] || 0) : 0;

    if (cityCount > 0 || countyCount > 0) {
      const statDiv = document.createElement('div');
      statDiv.className = 'text-[#a3a3a3] text-sm mb-6 pb-4 border-b border-[#404040]';

      const parts: string[] = [];

      if (cityCount > 0) {
        const cityName = cityKey!.split(':')[1];
        parts.push('<span class="text-white font-semibold" data-count="' + cityCount + '">0</span> cameras in City of ' + titleCase(cityName));
      }

      if (countyCount > 0) {
        const countyName = countyKey!.split(':')[1];
        const label = cityCount > 0
          ? ' in ' + titleCase(countyName) + ' County'
          : ' cameras in ' + titleCase(countyName) + ' County';
        parts.push('<span class="text-white font-semibold" data-count="' + countyCount + '">0</span>' + label);
      }

      statDiv.innerHTML = parts.join(' <span class="mx-1">\u00b7</span> ');

      container.appendChild(statDiv);

      statDiv.querySelectorAll('[data-count]').forEach(el => {
        const target = parseInt(el.getAttribute('data-count')!, 10);
        animateCount(el as HTMLElement, target);
      });
    }
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const groupId = 'action-group-' + gi;

    const groupDiv = document.createElement('div');
    groupDiv.className = gi > 0 ? 'mt-8 pt-8 border-t border-[#404040]' : '';

    // Header
    const headerLabel = group.category === 'state'
      ? ('YOUR ' + group.label.toUpperCase())
      : group.label.toUpperCase();
    const header = document.createElement('h3');
    header.className = 'text-[#737373] text-xs font-bold tracking-wider uppercase mb-4';
    header.textContent = headerLabel;

    if (group.category === 'local' && (group.countyKey || group.cityKey)) {
      const wrongLink = document.createElement('button');
      wrongLink.type = 'button';
      wrongLink.className = 'text-[#a3a3a3] hover:text-[#d4d4d4] text-xs font-medium transition-colors cursor-pointer bg-transparent border-none ml-2';
      wrongLink.textContent = group.matchedDistrict ? 'Wrong district?' : 'Select your district';
      wrongLink.setAttribute('data-action', 'wrong-district');
      wrongLink.setAttribute('data-group', String(gi));
      header.appendChild(wrongLink);
    }

    groupDiv.appendChild(header);

    // Rep list
    const repListDiv = document.createElement('div');
    repListDiv.className = 'space-y-3';

    for (let ri = 0; ri < group.reps.length; ri++) {
      const rep = group.reps[ri];
      const repDiv = document.createElement('div');
      repDiv.className = 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'flex items-start gap-3';

      if (rep.photoUrl) {
        const photoImg = document.createElement('img');
        photoImg.src = rep.photoUrl;
        photoImg.alt = '';
        photoImg.className = 'w-10 h-10 rounded-full object-cover flex-shrink-0 mt-0.5';
        photoImg.loading = 'lazy';
        infoDiv.appendChild(photoImg);
      }

      const textDiv = document.createElement('div');
      const nameRow = document.createElement('div');
      nameRow.className = 'flex items-baseline gap-2';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'text-white font-semibold';
      nameSpan.textContent = rep.name;
      if (rep.party) {
        const partySpan = document.createElement('span');
        partySpan.className = 'text-xs font-normal ml-1.5 ' + (rep.party === 'R' ? 'text-red-400' : rep.party === 'D' ? 'text-blue-400' : 'text-[#a3a3a3]');
        partySpan.textContent = '(' + rep.party + ')';
        nameSpan.appendChild(partySpan);
      }
      nameRow.appendChild(nameSpan);
      if (rep.website) {
        const siteLink = document.createElement('a');
        siteLink.href = rep.website;
        siteLink.target = '_blank';
        siteLink.rel = 'noopener noreferrer';
        siteLink.className = 'text-[#a3a3a3] hover:text-white text-xs transition-colors';
        siteLink.textContent = 'Profile \u2192\uFE0E';
        nameRow.appendChild(siteLink);
      }
      textDiv.appendChild(nameRow);

      const officeSpan = document.createElement('span');
      officeSpan.className = 'text-[#a3a3a3] text-sm block';
      officeSpan.textContent = rep.office;
      textDiv.appendChild(officeSpan);

      if (rep.isMatchedDistrict) {
        const badge = document.createElement('span');
        badge.className = 'text-[#a3a3a3] text-xs font-medium block';
        badge.textContent = 'Your district';
        textDiv.appendChild(badge);
      }

      if (rep.phone) {
        const phoneLink = document.createElement('a');
        phoneLink.href = 'tel:' + rep.phone.replace(/[^+\d]/g, '');
        phoneLink.className = 'text-[#fbbf24] hover:text-[#fcd34d] text-sm block transition-colors';
        phoneLink.textContent = rep.phone;
        textDiv.appendChild(phoneLink);
      }
      infoDiv.appendChild(textDiv);
      repDiv.appendChild(infoDiv);

      // Buttons
      const btnRow = document.createElement('div');
      btnRow.className = 'flex gap-2 flex-shrink-0';

      if (rep.email) {
        const sendBtn = document.createElement('button');
        sendBtn.type = 'button';
        sendBtn.className = 'bg-[#ef4444] hover:bg-[#dc2626] text-white font-medium rounded px-4 py-2 text-sm min-h-[44px] transition-colors cursor-pointer inline-flex items-center';
        sendBtn.textContent = 'Send Email';
        sendBtn.setAttribute('aria-label', 'Send email to ' + rep.name);
        sendBtn.setAttribute('data-group', String(gi));
        sendBtn.setAttribute('data-rep', String(ri));
        const sendAction = (group.category === 'state' || group.category === 'local-matched') ? 'send-state' : 'send-local-individual';
        sendBtn.setAttribute('data-action', sendAction);
        btnRow.appendChild(sendBtn);
      }

      repDiv.appendChild(btnRow);
      repListDiv.appendChild(repDiv);
    }

    // No-rep note for state groups
    if (group.category === 'state' && group.reps.length === 0) {
      const noRepDiv = document.createElement('div');
      noRepDiv.className = 'py-2';
      const noRepText = document.createElement('p');
      noRepText.className = 'text-[#a3a3a3] text-sm italic';
      noRepText.textContent = 'Enter a full street address to find your specific ' + group.label.toLowerCase() + '.';
      noRepDiv.appendChild(noRepText);
      repListDiv.appendChild(noRepDiv);
    }

    groupDiv.appendChild(repListDiv);

    // Group-level buttons for local councils
    if (group.category === 'local') {
      const groupBtnRow = document.createElement('div');
      groupBtnRow.className = 'flex gap-2 mt-4 pt-4 border-t border-[#404040]';

      const emailSet = new Set<string>();
      const allEmails: string[] = [];
      for (let re = 0; re < group.reps.length; re++) {
        if (group.reps[re].email && !emailSet.has(group.reps[re].email)) {
          emailSet.add(group.reps[re].email);
          allEmails.push(group.reps[re].email);
        }
      }

      if (allEmails.length > 1) {
        const sendAllBtn = document.createElement('button');
        sendAllBtn.type = 'button';
        sendAllBtn.className = 'bg-[#ef4444] hover:bg-[#dc2626] text-white font-medium rounded px-4 py-2 text-sm min-h-[44px] transition-colors cursor-pointer inline-flex items-center';
        sendAllBtn.textContent = 'Email All Members';
        sendAllBtn.setAttribute('aria-label', 'Send email to all ' + group.label + ' members');
        sendAllBtn.setAttribute('data-group', String(gi));
        sendAllBtn.setAttribute('data-action', 'send-local');
        groupBtnRow.appendChild(sendAllBtn);
      }

      const copyGroupBtn = document.createElement('button');
      copyGroupBtn.className = 'bg-[#404040] hover:bg-[#475569] text-[#e2e8f0] font-medium rounded px-4 py-2 text-sm min-h-[44px] transition-colors cursor-pointer';
      copyGroupBtn.textContent = 'Copy Letter';
      copyGroupBtn.setAttribute('data-group', String(gi));
      copyGroupBtn.setAttribute('data-action', 'copy-local');
      copyGroupBtn.type = 'button';
      groupBtnRow.appendChild(copyGroupBtn);

      groupDiv.appendChild(groupBtnRow);
    }

    // Collapsible letter preview
    const details = document.createElement('details');
    details.className = 'mt-4';

    const summary = document.createElement('summary');
    summary.className = 'text-[#a3a3a3] hover:text-[#d4d4d4] text-sm font-medium cursor-pointer transition-colors';
    summary.textContent = 'Preview & edit letter';
    details.appendChild(summary);

    const previewDiv = document.createElement('div');
    previewDiv.className = 'mt-3 space-y-3';

    const subjectP = document.createElement('p');
    subjectP.className = 'text-[#a3a3a3] text-sm';
    subjectP.innerHTML = '<span class="text-[#737373]">Subject:</span> ' + escapeHtml(group.subject);
    previewDiv.appendChild(subjectP);

    const textarea = document.createElement('textarea');
    textarea.id = groupId + '-body';
    textarea.className = 'bg-[#171717] border border-[#404040] text-[#d4d4d4] rounded p-4 w-full text-sm min-h-[200px] focus:outline-none focus:border-[#d4d4d4] focus:ring-2 focus:ring-[#d4d4d4] transition-colors resize-y';

    let prefilledBody = group.body;
    if ((group.category === 'state' || group.category === 'local-matched') && group.reps.length > 0) {
      prefilledBody = group.body.replace(/\[NAME\]/g, group.reps[0].name);
    } else if (group.category === 'state') {
      const placeholder = group.label === 'State Senator' ? 'Senator' : 'Representative';
      prefilledBody = group.body.replace(/\[NAME\]/g, placeholder);
    } else if (group.category === 'local' || group.category === 'local-matched') {
      prefilledBody = group.body.replace(/\[NAME\]/g, 'Council Member');
    }
    textarea.value = prefilledBody;
    previewDiv.appendChild(textarea);

    if ((group.category === 'state' || group.category === 'local-matched') && group.reps.length > 1) {
      const noteP = document.createElement('p');
      noteP.className = 'text-[#737373] text-xs italic';
      noteP.textContent = 'The greeting will be personalized for each representative when you click Send Email.';
      previewDiv.appendChild(noteP);
    }

    details.appendChild(previewDiv);
    groupDiv.appendChild(details);
    container.appendChild(groupDiv);
  }
}

export function initResultsEventDelegation(localCouncils: LocalCouncils): void {
  document.getElementById('action-results-list')?.addEventListener('click', function(e) {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target || !currentGroups) return;

    const action = target.getAttribute('data-action');
    const groupIdx = parseInt(target.getAttribute('data-group') || '0');
    const repIdxStr = target.getAttribute('data-rep');
    const repIdx = repIdxStr ? parseInt(repIdxStr) : null;
    const group = currentGroups[groupIdx];
    if (!group) return;

    const textareaEl = document.getElementById('action-group-' + groupIdx + '-body') as HTMLTextAreaElement | null;
    const currentBody = textareaEl ? textareaEl.value : group.body;

    if (action === 'send-state') {
      const rep = repIdx !== null ? group.reps[repIdx] : null;
      if (!rep || !rep.email) return;
      const personalizedBody = replaceGreeting(currentBody, rep.name);
      window.location.href = buildMailto([rep.email], group.subject, personalizedBody);
    } else if (action === 'send-local-individual') {
      const localRep = repIdx !== null ? group.reps[repIdx] : null;
      if (!localRep || !localRep.email) return;
      const personalizedLocalBody = replaceGreeting(currentBody, localRep.name);
      window.location.href = buildMailto([localRep.email], group.subject, personalizedLocalBody);
    } else if (action === 'send-local') {
      const emailSet = new Set<string>();
      const allEmails: string[] = [];
      for (let i = 0; i < group.reps.length; i++) {
        if (group.reps[i].email && !emailSet.has(group.reps[i].email)) {
          emailSet.add(group.reps[i].email);
          allEmails.push(group.reps[i].email);
        }
      }
      if (allEmails.length === 0) return;
      window.location.href = buildMailto(allEmails, group.subject, currentBody);
    } else if (action === 'copy-local') {
      const copyText = 'Subject: ' + group.subject + '\n\n' + currentBody;
      copyToClipboard(copyText, target);
    } else if (action === 'wrong-district') {
      const existingDropdown = target.parentElement?.querySelector('.wrong-district-dropdown');
      if (existingDropdown) {
        existingDropdown.remove();
        return;
      }

      const wdGroup = currentGroups[groupIdx];
      if (!wdGroup) return;

      const dropdownDiv = document.createElement('div');
      dropdownDiv.className = 'wrong-district-dropdown mt-2 mb-3 flex items-center gap-2';

      const sel = document.createElement('select');
      sel.className = 'bg-[#262626] border border-[#404040] text-white rounded px-3 py-1 text-sm focus:outline-none focus:border-[#d4d4d4] focus:ring-2 focus:ring-[#d4d4d4]';
      sel.setAttribute('aria-label', 'Select your district');
      sel.innerHTML = '<option value="">Select district...</option>';

      const councilKey = wdGroup.countyKey || wdGroup.cityKey || null;
      if (councilKey && localCouncils[councilKey]) {
        const council = localCouncils[councilKey];
        const seen = new Set<string>();
        for (let di = 0; di < council.members.length; di++) {
          const titleMatch = council.members[di].title.match(/(?:District|Seat) (\d+)/);
          if (titleMatch && !seen.has(titleMatch[1])) {
            seen.add(titleMatch[1]);
            const opt = document.createElement('option');
            opt.value = titleMatch[1];
            opt.textContent = 'District ' + titleMatch[1];
            if (titleMatch[1] === String(wdGroup.matchedDistrict)) opt.selected = true;
            sel.appendChild(opt);
          }
        }
      }

      sel.addEventListener('change', function() {
        const newDistrict = sel.value;
        if (!newDistrict) return;
        wdGroup.matchedDistrict = newDistrict;
        for (let r = 0; r < wdGroup.reps.length; r++) {
          const repTitle = wdGroup.reps[r].office || '';
          const repDistMatch = repTitle.match(/(?:District|Seat) (\d+)/);
          wdGroup.reps[r].isMatchedDistrict = !!(repDistMatch && repDistMatch[1] === newDistrict);
        }
        wdGroup.reps.sort((a, b) => (b.isMatchedDistrict ? 1 : 0) - (a.isMatchedDistrict ? 1 : 0));
        renderResults(currentGroups!);
      });

      dropdownDiv.appendChild(sel);
      target.parentElement?.appendChild(dropdownDiv);
    }
  });
}
