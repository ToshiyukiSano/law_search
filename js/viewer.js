(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  var API_BASE = 'https://laws.e-gov.go.jp/api/1/lawdata/';

  // ── State ──────────────────────────────────────────────────
  var xmlDoc = null;

  // ── DOM refs ───────────────────────────────────────────────
  var elLawTitle    = document.getElementById('law-title');
  var elLoading     = document.getElementById('loading');
  var elLawBody     = document.getElementById('law-body');
  var elArtInput    = document.getElementById('art-input');
  var elGoBtn       = document.getElementById('go-btn');
  var elCbAmend     = document.getElementById('opt-amended');
  var elToast       = document.getElementById('toast');
  var elPageTop     = document.getElementById('page-top-btn');
  var elSearchInput = document.getElementById('search-input');
  var elSearchBtn   = document.getElementById('search-btn');
  var elSearchPrev  = document.getElementById('search-prev');
  var elSearchNext  = document.getElementById('search-next');
  var elSearchCount = document.getElementById('search-count');
  var elSearchClear = document.getElementById('search-clear');
  var elSearchFloat = document.getElementById('search-float');

  // ── URL params ────────────────────────────────────────────
  function getParams() {
    var sp = new URLSearchParams(location.search);
    return {
      id:  sp.get('id') || '',
      art: sp.get('art') || null
    };
  }

  // ── Fetch + parse ─────────────────────────────────────────
  function fetchLaw(lawId) {
    return fetch(API_BASE + encodeURIComponent(lawId))
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        return new DOMParser().parseFromString(text, 'text/xml');
      });
  }

  // ── Text content helper ──────────────────────────────────
  function textOf(el) {
    return el ? el.textContent.trim() : '';
  }

  // ── Build sentence text from Sentence elements ────────────
  function sentenceText(container) {
    if (!container) return '';
    var sentences = container.querySelectorAll('Sentence');
    if (!sentences.length) return container.textContent.trim();
    return Array.from(sentences).map(function (s) { return s.textContent.trim(); }).join('');
  }

  // ── Render SubItems recursively ───────────────────────────
  function renderSubItems(parentEl, subItems) {
    if (!subItems.length) return;
    var ul = document.createElement('ul');
    ul.className = 'subitem-list';
    subItems.forEach(function (sub) {
      var li = document.createElement('li');
      var title = sub.querySelector(':scope > SubItemTitle');
      var sent  = sub.querySelector(':scope > SubItemSentence');
      if (title) {
        var t = document.createElement('span');
        t.className = 'item-title';
        t.textContent = textOf(title);
        li.appendChild(t);
      }
      if (sent) {
        li.appendChild(document.createTextNode(sentenceText(sent)));
      }
      // Deeper sub-items
      var deeper = Array.from(sub.querySelectorAll(':scope > SubItem'));
      renderSubItems(li, deeper);
      ul.appendChild(li);
    });
    parentEl.appendChild(ul);
  }

  // ── Render Items ──────────────────────────────────────────
  function renderItems(parentEl, items) {
    if (!items.length) return;
    var ul = document.createElement('ul');
    ul.className = 'item-list';
    items.forEach(function (item) {
      var li = document.createElement('li');
      var title = item.querySelector(':scope > ItemTitle');
      var sent  = item.querySelector(':scope > ItemSentence');
      if (title) {
        var t = document.createElement('span');
        t.className = 'item-title';
        t.textContent = textOf(title);
        li.appendChild(t);
      }
      if (sent) {
        li.appendChild(document.createTextNode(sentenceText(sent)));
      }
      var subItems = Array.from(item.querySelectorAll(':scope > SubItem'));
      renderSubItems(li, subItems);
      ul.appendChild(li);
    });
    parentEl.appendChild(ul);
  }

  // ── Render one Paragraph ──────────────────────────────────
  function renderParagraph(para) {
    var div = document.createElement('div');
    div.className = 'paragraph-block';

    var numEl = para.querySelector(':scope > ParagraphNum');
    var numText = numEl ? textOf(numEl) : '';

    var sentEl = para.querySelector(':scope > ParagraphSentence');
    var body = sentEl ? sentenceText(sentEl) : '';

    if (numText) {
      var n = document.createElement('span');
      n.className = 'paragraph-num';
      n.textContent = numText;
      div.appendChild(n);
    }
    div.appendChild(document.createTextNode(body));

    var items = Array.from(para.querySelectorAll(':scope > Item'));
    renderItems(div, items);

    return div;
  }

  // ── Render one Article ────────────────────────────────────
  function renderArticle(article) {
    var num = article.getAttribute('Num') || '';
    var div = document.createElement('div');
    div.className = 'article-block';
    div.id = 'art-' + num;

    // Header line: ArticleTitle [ArticleCaption]
    var header = document.createElement('div');
    header.className = 'article-header';

    var titleEl = article.querySelector(':scope > ArticleTitle');
    var capEl   = article.querySelector(':scope > ArticleCaption');

    if (titleEl) {
      var titleSpan = document.createElement('span');
      titleSpan.className = 'article-title';
      titleSpan.textContent = textOf(titleEl);
      titleSpan.dataset.artNum = num;
      titleSpan.addEventListener('click', function () {
        copyArticleUrl(num);
      });
      header.appendChild(titleSpan);
    }

    if (capEl) {
      var capSpan = document.createElement('span');
      capSpan.className = 'article-caption';
      capSpan.textContent = textOf(capEl);
      header.appendChild(capSpan);
    }

    div.appendChild(header);

    // Paragraphs
    var paragraphs = article.querySelectorAll(':scope > Paragraph');
    paragraphs.forEach(function (para) {
      div.appendChild(renderParagraph(para));
    });

    return div;
  }

  // ── Render SupplProvision block ───────────────────────────
  function renderSupplProvision(sp, isAmend) {
    var block = document.createElement('div');
    block.className = isAmend ? 'suppl-block suppl-amend' : 'suppl-block';

    var labelEl = sp.querySelector(':scope > SupplProvisionLabel');
    var titleDiv = document.createElement('div');
    titleDiv.className = isAmend ? 'suppl-amend-title' : 'suppl-title';

    if (isAmend) {
      var amendNum = sp.getAttribute('AmendLawNum') || '';
      titleDiv.textContent = '附則（' + amendNum + '）';
    } else {
      titleDiv.textContent = labelEl ? textOf(labelEl) : '附則';
    }
    block.appendChild(titleDiv);

    // Articles within SupplProvision
    var articles = sp.querySelectorAll(':scope > Article');
    articles.forEach(function (art) {
      block.appendChild(renderArticle(art));
    });

    // Paragraphs directly under SupplProvision (not in articles)
    var directParas = Array.from(sp.querySelectorAll(':scope > Paragraph'));
    directParas.forEach(function (para) {
      block.appendChild(renderParagraph(para));
    });

    return block;
  }

  // ── Render TOC ────────────────────────────────────────────
  function renderTOC(toc) {
    if (!toc) return null;
    var block = document.createElement('div');
    block.className = 'toc-block';
    block.id = 'art-0';

    var h2 = document.createElement('h2');
    h2.textContent = '目次';
    block.appendChild(h2);

    var ul = document.createElement('ul');
    ul.className = 'toc-list';

    // TOCPreamble
    var preamble = toc.querySelector('TOCPreamble');
    if (preamble) {
      var li = document.createElement('li');
      li.appendChild(makeTOCLink(textOf(preamble), '#art-00'));
      ul.appendChild(li);
    }

    // TOCPart > TOCChapter > TOCSection
    var tocParts = toc.querySelectorAll(':scope > TOCPart');
    if (tocParts.length) {
      tocParts.forEach(function (part) {
        var partNum = part.getAttribute('Num') || '';
        var li = document.createElement('li');
        var ptEl = part.querySelector('PartTitle');
        li.appendChild(makeTOCLink(ptEl ? textOf(ptEl) : textOf(part), partNum ? '#part-' + partNum : null));
        ul.appendChild(li);
        var chapters = part.querySelectorAll('TOCChapter');
        chapters.forEach(function (ch) { ul.appendChild(makeTOCChapterItem(ch, 1, partNum)); });
      });
    } else {
      var chapters = toc.querySelectorAll(':scope > TOCChapter');
      chapters.forEach(function (ch) { ul.appendChild(makeTOCChapterItem(ch, 0, '')); });
    }

    // TOCSupplProvision
    var tocSuppl = toc.querySelector('TOCSupplProvision');
    if (tocSuppl) {
      var li2 = document.createElement('li');
      li2.appendChild(makeTOCLink(textOf(tocSuppl), '#art-000'));
      ul.appendChild(li2);
    }

    block.appendChild(ul);
    return block;
  }

  function makeTOCLink(text, href) {
    if (!href) {
      var span = document.createElement('span');
      span.textContent = text;
      return span;
    }
    var a = document.createElement('a');
    a.textContent = text;
    a.href = href;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var target = document.querySelector(href);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return a;
  }

  function makeTOCChapterItem(ch, indent, partNum) {
    var li = document.createElement('li');
    if (indent) li.className = 'toc-indent';
    var chNum   = ch.getAttribute('Num') || '';
    var titleEl = ch.querySelector('ChapterTitle');
    var range   = ch.querySelector('ArticleRange');
    var text    = (titleEl ? textOf(titleEl) : '') + (range ? '（' + textOf(range) + '）' : '');
    var chId    = chNum ? '#ch-' + (partNum ? partNum + '-' : '') + chNum : null;
    li.appendChild(makeTOCLink(text, chId));
    var sections = ch.querySelectorAll(':scope > TOCSection');
    if (sections.length) {
      var ul2 = document.createElement('ul');
      ul2.className = 'toc-list';
      sections.forEach(function (sec) {
        var li2 = document.createElement('li');
        li2.className = 'toc-indent';
        var secNum = sec.getAttribute('Num') || '';
        var stEl   = sec.querySelector('SectionTitle');
        var sr     = sec.querySelector('ArticleRange');
        var txt    = (stEl ? textOf(stEl) : '') + (sr ? '（' + textOf(sr) + '）' : '');
        var secId  = secNum ? '#sec-' + (partNum ? partNum + '-' : '') + chNum + '-' + secNum : null;
        li2.appendChild(makeTOCLink(txt, secId));
        ul2.appendChild(li2);
      });
      li.appendChild(ul2);
    }
    return li;
  }

  // ── Main render function ──────────────────────────────────
  function renderLaw(doc) {
    var frag = document.createDocumentFragment();
    var body = doc.querySelector('LawBody');
    if (!body) {
      elLawBody.textContent = 'データを取得できませんでした。';
      return;
    }

    // Law title
    var titleEl = body.querySelector('LawTitle');
    if (titleEl) {
      document.title = textOf(titleEl) + ' — 法令検索';
      elLawTitle.textContent = textOf(titleEl);
    }

    // TOC
    var toc = body.querySelector(':scope > TOC');
    if (toc) {
      var tocBlock = renderTOC(toc);
      if (tocBlock) frag.appendChild(tocBlock);
    }

    // Preamble (art=00)
    var preamble = body.querySelector(':scope > Preamble');
    if (preamble) {
      var preBlock = document.createElement('div');
      preBlock.className = 'preamble-block';
      preBlock.id = 'art-00';

      var preTitle = document.createElement('div');
      preTitle.className = 'preamble-title';
      preTitle.textContent = '前文';
      preTitle.addEventListener('click', function () {
        copyArticleUrl('00');
      });
      preBlock.appendChild(preTitle);

      var sentences = preamble.querySelectorAll('Sentence');
      sentences.forEach(function (s) {
        var p = document.createElement('p');
        p.className = 'preamble-text';
        p.textContent = s.textContent.trim();
        preBlock.appendChild(p);
      });
      frag.appendChild(preBlock);
    }

    // MainProvision
    var main = body.querySelector(':scope > MainProvision');
    if (main) {
      // Check for Parts
      var parts = main.querySelectorAll(':scope > Part');
      if (parts.length) {
        parts.forEach(function (part) {
          var partNum = part.getAttribute('Num') || '';
          var partBlock = document.createElement('div');
          partBlock.className = 'part-block';
          if (partNum) partBlock.id = 'part-' + partNum;

          var ptEl = part.querySelector(':scope > PartTitle');
          if (ptEl) {
            var ptDiv = document.createElement('div');
            ptDiv.className = 'part-title';
            ptDiv.textContent = textOf(ptEl);
            partBlock.appendChild(ptDiv);
          }

          renderChapters(part, partBlock, partNum);
          frag.appendChild(partBlock);
        });
      } else {
        renderChapters(main, frag, '');
      }
    }

    // SupplProvisions
    var supplProvisions = body.querySelectorAll(':scope > SupplProvision');
    var firstSuppl = true;
    supplProvisions.forEach(function (sp) {
      var amendNum = sp.getAttribute('AmendLawNum');
      var isAmend = !!amendNum;
      var block = renderSupplProvision(sp, isAmend);
      if (!isAmend && firstSuppl) {
        block.id = 'art-000';
        firstSuppl = false;
      }
      if (isAmend) {
        block.classList.add('suppl-amend-block');
        block.style.display = elCbAmend.checked ? '' : 'none';
      }
      frag.appendChild(block);
    });

    elLawBody.appendChild(frag);
  }

  function renderChapters(parent, container, partNum) {
    // May have Chapters or direct Articles
    var chapters = parent.querySelectorAll(':scope > Chapter');
    if (chapters.length) {
      chapters.forEach(function (ch) {
        var chNum = ch.getAttribute('Num') || '';
        var chBlock = document.createElement('div');
        chBlock.className = 'chapter-block';
        if (chNum) chBlock.id = 'ch-' + (partNum ? partNum + '-' : '') + chNum;

        var ctEl = ch.querySelector(':scope > ChapterTitle');
        if (ctEl) {
          var ctDiv = document.createElement('div');
          ctDiv.className = 'chapter-title';
          ctDiv.textContent = textOf(ctEl);
          chBlock.appendChild(ctDiv);
        }

        // Sections or direct articles
        var sections = ch.querySelectorAll(':scope > Section');
        if (sections.length) {
          sections.forEach(function (sec) {
            var secNum = sec.getAttribute('Num') || '';
            var secBlock = document.createElement('div');
            secBlock.className = 'section-block';
            if (secNum) secBlock.id = 'sec-' + (partNum ? partNum + '-' : '') + chNum + '-' + secNum;

            var stEl = sec.querySelector(':scope > SectionTitle');
            if (stEl) {
              var stDiv = document.createElement('div');
              stDiv.className = 'section-title';
              stDiv.textContent = textOf(stEl);
              secBlock.appendChild(stDiv);
            }

            var subSecs = sec.querySelectorAll(':scope > Subsection');
            if (subSecs.length) {
              subSecs.forEach(function (sub) {
                renderArticleGroup(sub, secBlock);
              });
            } else {
              renderArticleGroup(sec, secBlock);
            }

            chBlock.appendChild(secBlock);
          });
        } else {
          renderArticleGroup(ch, chBlock);
        }

        container.appendChild(chBlock);
      });
    } else {
      // Flat: Articles directly under parent
      renderArticleGroup(parent, container);
    }
  }

  function renderArticleGroup(parent, container) {
    var articles = parent.querySelectorAll(':scope > Article');
    articles.forEach(function (art) {
      container.appendChild(renderArticle(art));
    });
  }

  // ── Navigation ────────────────────────────────────────────
  function normalizeArtRef(val) {
    // Accept "3.2", "3-2", "3_2" → "3_2"
    return val.trim().replace(/[.\-]/g, '_');
  }

  function navigateToArticle(artRef) {
    var id = 'art-' + artRef;
    var el = document.getElementById(id);
    if (el) {
      var headerEl = document.querySelector('header');
      var offset = headerEl ? headerEl.getBoundingClientRect().height : 0;
      var top = el.getBoundingClientRect().top + window.scrollY - offset - 8;
      window.scrollTo({ top: top, behavior: 'smooth' });
    } else {
      showToast('該当する条文が見つかりません: ' + artRef);
    }
  }

  function resolveArticleInput() {
    var raw = elArtInput.value.trim();
    if (!raw) return;
    var normalized = normalizeArtRef(raw);
    var params = getParams();
    var newUrl = location.pathname + '?id=' + params.id + '&art=' + encodeURIComponent(normalized);
    history.pushState({ art: normalized }, '', newUrl);
    navigateToArticle(normalized);
  }

  // ── Clipboard copy ────────────────────────────────────────
  function copyArticleUrl(artNum) {
    var params = getParams();
    var url = location.origin + location.pathname + '?id=' + params.id + '&art=' + encodeURIComponent(artNum);

    // Update URL bar too
    history.pushState({ art: artNum }, '', '?id=' + params.id + '&art=' + encodeURIComponent(artNum));

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showToast('URLをコピーしました');
      }).catch(function () {
        fallbackCopy(url);
      });
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      showToast('URLをコピーしました');
    } catch (e) {
      showToast('コピーできませんでした');
    }
    document.body.removeChild(ta);
  }

  // ── Toast ─────────────────────────────────────────────────
  var toastTimer = null;
  function showToast(msg) {
    elToast.textContent = msg;
    elToast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      elToast.classList.remove('show');
    }, 2000);
  }

  // ── Amendment toggle ──────────────────────────────────────
  function applyAmendToggle() {
    var show = elCbAmend.checked;
    var blocks = document.querySelectorAll('.suppl-amend-block');
    blocks.forEach(function (b) {
      b.style.display = show ? '' : 'none';
    });
    localStorage.setItem('opt-amended', show);
  }

  // ── Keyword search ────────────────────────────────────────
  var articleHits = [];
  var articleHitIndex = -1;

  function clearHighlights() {
    var marks = elLawBody.querySelectorAll('mark.search-hit');
    marks.forEach(function (m) {
      var parent = m.parentNode;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    });
    elLawBody.querySelectorAll('.article-hit-active').forEach(function (el) {
      el.classList.remove('article-hit-active');
    });
    articleHits = [];
    articleHitIndex = -1;
    elSearchCount.textContent = '';
    elSearchFloat.hidden = true;
  }

  function highlightInNode(node, re) {
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    var textNodes = [];
    var tn;
    while ((tn = walker.nextNode())) {
      re.lastIndex = 0;
      if (re.test(tn.textContent)) textNodes.push(tn);
    }
    textNodes.forEach(function (tn) {
      var text = tn.textContent;
      var frag = document.createDocumentFragment();
      var last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var mark = document.createElement('mark');
        mark.className = 'search-hit';
        mark.textContent = m[0];
        frag.appendChild(mark);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      tn.parentNode.replaceChild(frag, tn);
    });
  }

  function runSearch() {
    var query = elSearchInput.value.trim();
    clearHighlights();
    if (!query) return;

    // スペース区切りで複数キーワード（AND検索）
    var keywords = query.split(/\s+/).filter(Boolean);

    var allArticles = Array.from(elLawBody.querySelectorAll('.article-block'));
    allArticles.forEach(function (article) {
      var text = article.textContent;
      var matched = keywords.every(function (kw) {
        return text.toLowerCase().indexOf(kw.toLowerCase()) !== -1;
      });
      if (!matched) return;
      articleHits.push(article);
      keywords.forEach(function (kw) {
        var re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        highlightInNode(article, re);
      });
    });

    if (articleHits.length === 0) {
      elSearchCount.textContent = '見つかりません';
      return;
    }
    articleHitIndex = 0;
    elSearchFloat.hidden = false;
    scrollToArticle(articleHitIndex);
  }

  function scrollToArticle(i) {
    elLawBody.querySelectorAll('.article-hit-active').forEach(function (el) {
      el.classList.remove('article-hit-active');
    });
    var art = articleHits[i];
    art.classList.add('article-hit-active');
    var headerEl = document.querySelector('header');
    var offset = headerEl ? headerEl.getBoundingClientRect().height : 0;
    var top = art.getBoundingClientRect().top + window.scrollY - offset - 8;
    window.scrollTo({ top: top, behavior: 'smooth' });
    elSearchCount.textContent = (i + 1) + '件目 / ' + articleHits.length + '件';
  }

  elSearchBtn.addEventListener('click', runSearch);
  elSearchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') runSearch();
  });

  // キーワード入力で自動検索（デバウンス 600ms）
  var searchInputTimer = null;
  elSearchInput.addEventListener('input', function () {
    if (searchInputTimer) clearTimeout(searchInputTimer);
    searchInputTimer = setTimeout(function () {
      runSearch();
    }, 600);
  });
  elSearchPrev.addEventListener('click', function () {
    if (!articleHits.length) return;
    articleHitIndex = (articleHitIndex - 1 + articleHits.length) % articleHits.length;
    scrollToArticle(articleHitIndex);
  });
  elSearchNext.addEventListener('click', function () {
    if (!articleHits.length) return;
    articleHitIndex = (articleHitIndex + 1) % articleHits.length;
    scrollToArticle(articleHitIndex);
  });
  elSearchClear.addEventListener('click', function () {
    elSearchInput.value = '';
    clearHighlights();
  });

  // ── Page-top button ───────────────────────────────────────
  window.addEventListener('scroll', function () {
    if (window.scrollY > 200) {
      elPageTop.classList.add('visible');
    } else {
      elPageTop.classList.remove('visible');
    }
  });
  elPageTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── Event handlers ────────────────────────────────────────
  elGoBtn.addEventListener('click', resolveArticleInput);
  elArtInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') resolveArticleInput();
  });

  // 条番号を入力したら自動でその条文に移動（デバウンス 600ms）
  var artInputTimer = null;
  elArtInput.addEventListener('input', function () {
    if (artInputTimer) clearTimeout(artInputTimer);
    var raw = elArtInput.value.trim();
    if (!raw) return;
    artInputTimer = setTimeout(function () {
      resolveArticleInput();
    }, 600);
  });

  elCbAmend.addEventListener('change', applyAmendToggle);

  // ── Boot ──────────────────────────────────────────────────
  function init() {
    var params = getParams();
    if (!params.id) {
      elLoading.textContent = '法令IDが指定されていません。';
      return;
    }

    // Restore amended checkbox from localStorage
    var savedAmended = localStorage.getItem('opt-amended');
    if (savedAmended === 'true') {
      elCbAmend.checked = true;
    }

    elLoading.style.display = '';
    elLawBody.innerHTML = '';

    fetchLaw(params.id)
      .then(function (doc) {
        xmlDoc = doc;
        renderLaw(doc);
        elLoading.style.display = 'none';

        // Navigate to article if specified
        if (params.art !== null) {
          // Small delay to allow layout
          setTimeout(function () {
            navigateToArticle(params.art);
          }, 100);
        }
      })
      .catch(function (err) {
        elLoading.textContent = 'データを取得できませんでした。(' + err.message + ')';
      });
  }

  init();
}());
