(function () {
  'use strict';

  const LAWS = [
    { id: '321CONSTITUTION', name: '憲法' },
    { id: '129AC0000000089', name: '民法' },
    { id: '140AC0000000045', name: '刑法' },
    { id: '132AC0000000048', name: '商法' },
    { id: '417AC0000000086', name: '会社法' },
    { id: '408AC0000000109', name: '民事訴訟法' },
    { id: '323AC0000000131', name: '刑事訴訟法' },
  ];

  // ── Checkboxes: persist to localStorage ──────────────────
  const cbNewtab = document.getElementById('opt-newtab');
  const cbAmended = document.getElementById('opt-amended');

  cbNewtab.checked = localStorage.getItem('opt-newtab') === 'true';
  cbAmended.checked = localStorage.getItem('opt-amended') === 'true';

  cbNewtab.addEventListener('change', function () {
    localStorage.setItem('opt-newtab', this.checked);
    applyNewtab();
  });

  cbAmended.addEventListener('change', function () {
    localStorage.setItem('opt-amended', this.checked);
  });

  // ── Apply newtab setting to all law links ─────────────────
  function applyNewtab() {
    const links = document.querySelectorAll('#law-list a');
    links.forEach(function (a) {
      const base = 'law.html?id=' + a.dataset.lawId;
      const withAmended = cbAmended.checked ? '&amended=1' : '';
      a.href = base + withAmended;
      if (cbNewtab.checked) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      } else {
        a.removeAttribute('target');
        a.removeAttribute('rel');
      }
    });
  }

  applyNewtab();

  // Also update hrefs when amended checkbox changes
  cbAmended.addEventListener('change', applyNewtab);

  // ── Page-top button ───────────────────────────────────────
  const pageTopBtn = document.getElementById('page-top-btn');
  window.addEventListener('scroll', function () {
    if (window.scrollY > 200) {
      pageTopBtn.classList.add('visible');
    } else {
      pageTopBtn.classList.remove('visible');
    }
  });
  pageTopBtn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}());
