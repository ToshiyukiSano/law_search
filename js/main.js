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

  var CACHE_KEY = 'lawlist-cache';
  var CACHE_TTL = 24 * 60 * 60 * 1000; // 1日
  var lawCache = null; // [{id, name}, ...]

  function buildLawUrl(lawId) {
    var base = 'law.html?id=' + lawId;
    if (cbAmended.checked) base += '&amended=1';
    return base;
  }

  function renderResults(laws) {
    elLawSearchResults.removeAttribute('hidden');
    if (laws.length === 0) {
      elLawSearchResults.innerHTML = '<p class="no-result">該当する法令が見つかりませんでした。</p>';
      return;
    }
    var shown = laws.slice(0, 50);
    var label = '<p class="search-result-label">検索結果: ' + laws.length + '件' + (laws.length > 50 ? '（上位50件表示）' : '') + '</p>';
    var items = shown.map(function (law) {
      var url = buildLawUrl(law.id);
      var target = cbNewtab.checked ? ' target="_blank" rel="noopener noreferrer"' : '';
      return '<li><a href="' + url + '"' + target + '>' + law.name + '</a></li>';
    }).join('');
    elLawSearchResults.innerHTML = label + '<ul>' + items + '</ul>';
  }

  function filterAndRender(keyword) {
    var kw = keyword.trim();
    if (!kw) return;
    var chars = kw.split('');
    var results = lawCache.filter(function (l) {
      return chars.every(function (c) { return l.name.indexOf(c) !== -1; });
    });
    results.sort(function (a, b) { return a.name.length - b.name.length; });
    renderResults(results);
  }

  function loadCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        if (Date.now() - obj.ts < CACHE_TTL) return obj.data;
      }
    } catch (e) {}
    return null;
  }

  function saveCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) {}
  }

  function fetchLawList() {
    return fetch('https://laws.e-gov.go.jp/api/1/lawlists/1')
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var parser = new DOMParser();
        var xml = parser.parseFromString(text, 'text/xml');
        var items = xml.querySelectorAll('LawNameListInfo');
        var data = Array.from(items).map(function (item) {
          return {
            id:   (item.querySelector('LawId')   || {}).textContent || '',
            name: (item.querySelector('LawName') || {}).textContent || ''
          };
        }).filter(function (l) { return l.id; });
        saveCache(data);
        return data;
      });
  }

  function searchLaws() {
    var keyword = elLawSearchInput.value.trim();
    if (!keyword) return;

    if (lawCache) {
      filterAndRender(keyword);
      return;
    }

    elLawSearchResults.removeAttribute('hidden');
    elLawSearchResults.innerHTML = '<p class="no-result">法令リストを読み込み中…（初回のみ時間がかかります）</p>';

    var cached = loadCache();
    if (cached) {
      lawCache = cached;
      filterAndRender(keyword);
      return;
    }

    fetchLawList()
      .then(function (data) {
        lawCache = data;
        filterAndRender(keyword);
      })
      .catch(function () {
        elLawSearchResults.innerHTML = '<p class="no-result">法令リストの取得に失敗しました。</p>';
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
