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

  // ── Law name search ───────────────────────────────────────
  var elLawSearchInput   = document.getElementById('law-search-input');
  var elLawSearchBtn     = document.getElementById('law-search-btn');
  var elLawSearchResults = document.getElementById('law-search-results');

  function buildLawUrl(lawId) {
    var base = 'law.html?id=' + lawId;
    if (cbAmended && cbAmended.checked) base += '&amended=1';
    return base;
  }

  function renderResults(laws) {
    elLawSearchResults.removeAttribute('hidden');
    if (laws.length === 0) {
      elLawSearchResults.innerHTML = '<p class="no-result">該当する法令が見つかりませんでした。</p>';
      return;
    }
    var label = '<p class="search-result-label">検索結果: ' + laws.length + '件</p>';
    var items = laws.map(function (law) {
      var url = buildLawUrl(law.id);
      var target = cbNewtab && cbNewtab.checked ? ' target="_blank" rel="noopener noreferrer"' : '';
      return '<li><a href="' + url + '"' + target + '>' + law.name + '</a></li>';
    }).join('');
    elLawSearchResults.innerHTML = label + '<ul>' + items + '</ul>';
  }

  function searchLaws() {
    var keyword = elLawSearchInput.value.trim();
    if (!keyword) return;

    elLawSearchResults.removeAttribute('hidden');
    elLawSearchResults.innerHTML = '<p class="no-result">検索中…</p>';

    var url = 'https://laws.e-gov.go.jp/api/1/keyword?keyword=' + encodeURIComponent(keyword) + '&law_type=1&offset=0&limit=20';
    fetch(url)
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var parser = new DOMParser();
        var xml = parser.parseFromString(text, 'text/xml');
        var items = xml.querySelectorAll('ApplData LawNameListInfo');
        if (items.length === 0) {
          renderResults([]);
          return;
        }
        var laws = Array.from(items).map(function (item) {
          var nameEl = item.querySelector('LawName');
          var idEl   = item.querySelector('LawId');
          return {
            name: nameEl ? nameEl.textContent : '',
            id:   idEl   ? idEl.textContent   : ''
          };
        }).filter(function (l) { return l.id; });
        renderResults(laws);
      })
      .catch(function () {
        elLawSearchResults.innerHTML = '<p class="no-result">検索に失敗しました。</p>';
      });
  }

  elLawSearchBtn.addEventListener('click', searchLaws);
  elLawSearchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') searchLaws();
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
