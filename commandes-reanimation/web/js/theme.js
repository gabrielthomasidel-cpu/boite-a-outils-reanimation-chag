/* Affichage clair ou sombre, mémorisé sur le poste et partagé entre les pages.
   Chargé dans <head> : le thème est appliqué avant le premier affichage. */
(() => {
  const key = 'commandes-theme';
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem(key) === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; } };
  const soleil = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>';
  const lune = '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>';

  function apply(theme) {
    root.dataset.theme = theme;
    const b = document.getElementById('btnTheme');
    if (!b) return;
    const label = theme === 'dark' ? 'Affichage clair' : 'Affichage sombre';
    b.innerHTML = '<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + (theme === 'dark' ? soleil : lune) + '</svg><span class="tool-label">' + label + '</span>';
    b.setAttribute('aria-label', label);
    b.title = label;
  }
  apply(read());

  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('button');
    b.id = 'btnTheme';
    b.type = 'button';
    b.className = 'tool-btn theme-toggle';
    const liste = document.getElementById('headerToolsList');
    if (liste) liste.appendChild(b);
    else (document.querySelector('.home-tools') || document.querySelector('header.masthead') || document.body).appendChild(b);
    b.addEventListener('click', () => {
      const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, theme); } catch (e) {}
      apply(theme);
    });
    apply(read());
  });
  window.addEventListener('pageshow', () => apply(read()));
  window.addEventListener('storage', e => { if (e.key === key) apply(read()); });
})();
