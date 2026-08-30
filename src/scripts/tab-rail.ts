// Shared master-detail rail behavior (toolkit FOIA templates, rebuttals,
// 4th-Amendment points, bill gaps). Proper tabs semantics: role=tablist/tab/
// tabpanel, aria-selected drives the visual state (.rail-tab in global.css),
// roving tabindex + arrow-key navigation, panels toggled via [hidden].
// Re-running after astro:after-swap binds the fresh nodes.

export function initTabRail(railId: string): void {
  const rail = document.getElementById(railId);
  if (!rail) return;
  const tabs = Array.from(rail.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  if (tabs.length === 0) return;

  const panelFor = (tab: HTMLElement): HTMLElement | null =>
    document.getElementById(tab.getAttribute('aria-controls') || '');

  function select(tab: HTMLButtonElement, focus?: boolean): void {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = panelFor(t);
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => select(tab)));

  rail.addEventListener('keydown', (e) => {
    const idx = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (idx === -1) return;
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next !== -1) {
      e.preventDefault();
      select(tabs[next], true);
    }
  });
}
