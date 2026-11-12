/*
 * 条文読み上げプレイヤー
 *  - Web Speech API (speechSynthesis) で条文を読み上げる
 *  - 読み上げ位置を法令ごとに localStorage へ自動保存（ブックマーク）し、次回は続きから再生
 *  - 読み上げ速度・音声を変更可能（設定は localStorage に保存）
 */
(function () {
  'use strict';

  var synth = window.speechSynthesis;
  var BM_PREFIX = 'reader-bm-';      // 法令ごとのブックマーク
  var BM_INDEX = 'reader-bm-index';  // ブックマークがある法令IDの一覧
  var RATE_KEY = 'reader-rate';
  var VOICE_KEY = 'reader-voice';

  // ── DOM ───────────────────────────────────────────────────
  var elPlayer   = document.getElementById('reader');
  var elPlay     = document.getElementById('reader-play');
  var elPrev     = document.getElementById('reader-prev');
  var elNext     = document.getElementById('reader-next');
  var elStop     = document.getElementById('reader-stop');
  var elStatus   = document.getElementById('reader-status');
  var elRate     = document.getElementById('reader-rate');
  var elRateVal  = document.getElementById('reader-rate-val');
  var elVoice    = document.getElementById('reader-voice');
  var elSettings = document.getElementById('reader-settings-btn');
  var elPanel    = document.getElementById('reader-panel');
  var elResume   = document.getElementById('reader-resume');
  var elResumeTx = document.getElementById('reader-resume-text');
  var elResumeGo = document.getElementById('reader-resume-go');
  var elResumeNo = document.getElementById('reader-resume-close');
  var elLawBody  = document.getElementById('law-body');

  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    elStatus.textContent = 'このブラウザは読み上げに対応していません';
    [elPlay, elPrev, elNext, elStop].forEach(function (b) { b.disabled = true; });
    return;
  }

  // ── State ─────────────────────────────────────────────────
  var lawId = new URLSearchParams(location.search).get('id') || '';
  var segments = [];      // [{text, el, art, artLabel}]
  var current = 0;        // 現在（または次に読む）セグメント番号
  var playing = false;
  var token = 0;          // 古い utterance のコールバックを無視するための世代番号
  var activeEl = null;
  var voices = [];
  var currentUtterance = null;

  // ── 設定 ──────────────────────────────────────────────────
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var RATE_MIN = 0.5, RATE_MAX = 2.0;
  var rate = Math.min(RATE_MAX, Math.max(RATE_MIN, parseFloat(lsGet(RATE_KEY)) || 1.0));
  elRate.value = rate;
  updateRateLabel();

  function updateRateLabel() {
    // 1.25 のような値は小数2桁、1.5 などは1桁で表示
    var t = rate.toFixed(2).replace(/0$/, '');
    elRateVal.textContent = t + 'x';
  }

  function loadVoices() {
    voices = synth.getVoices().filter(function (v) { return /^ja/i.test(v.lang); });
    var saved = lsGet(VOICE_KEY);
    elVoice.innerHTML = '';
    var def = document.createElement('option');
    def.value = '';
    def.textContent = '既定の日本語音声';
    elVoice.appendChild(def);
    var nameCount = {};
    voices.forEach(function (v) { nameCount[v.name] = (nameCount[v.name] || 0) + 1; });
    var seen = {};
    voices.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = v.name + voiceQuality(v) + (v.localService ? '' : '（オンライン）');
      // 同名の音声が複数あり品質の区別もつかない場合は番号を付ける
      if (nameCount[v.name] > 1 && !voiceQuality(v)) {
        seen[v.name] = (seen[v.name] || 0) + 1;
        o.textContent += ' ' + seen[v.name];
      }
      if (v.voiceURI === saved) o.selected = true;
      elVoice.appendChild(o);
    });
  }
  loadVoices();
  if ('onvoiceschanged' in synth) synth.addEventListener('voiceschanged', loadVoices);

  // iOS などでは voiceURI に品質が含まれる（例: com.apple.voice.enhanced.ja-JP.Kyoko）
  function voiceQuality(v) {
    var uri = v.voiceURI || '';
    if (/premium/i.test(uri)) return '（プレミアム）';
    if (/enhanced/i.test(uri)) return '（高品質）';
    if (/compact/i.test(uri)) return '（標準）';
    return '';
  }

  // 「既定」のときは音声を指定せず OS に任せる。
  // iOS はダウンロードしていない音声も一覧に出し、それを指定すると無音になるため。
  function selectedVoice() {
    var uri = elVoice.value;
    if (!uri) return null;
    for (var i = 0; i < voices.length; i++) if (voices[i].voiceURI === uri) return voices[i];
    return null;
  }

  function makeUtterance(text) {
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = rate;
    var v = selectedVoice();
    if (v) u.voice = v;
    return u;
  }

  // ── 読み上げ用テキストの構築 ──────────────────────────────
  function toHalfDigits(s) {
    return s.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  }

  // 要素の直下テキスト（ネストしたリストは除く）
  function ownText(el) {
    var t = '';
    el.childNodes.forEach(function (n) {
      if (n.nodeType === 1 && (n.tagName === 'UL' || n.classList.contains('reader-art-btn'))) return;
      t += n.textContent;
    });
    return t.trim();
  }

  // 長文は Chrome で途中停止することがあるため句点で分割
  function splitSentences(text) {
    var parts = text.match(/[^。]+。?/g) || [];
    var out = [];
    parts.forEach(function (p) {
      p = p.trim();
      if (!p) return;
      // それでも長すぎる場合は読点で区切る
      while (p.length > 160) {
        var cut = p.lastIndexOf('、', 160);
        if (cut < 40) cut = 160;
        out.push(p.slice(0, cut + 1));
        p = p.slice(cut + 1);
      }
      if (p) out.push(p);
    });
    return out;
  }

  function isHidden(el) {
    return !!el.closest('.suppl-amend-block') && el.closest('.suppl-amend-block').style.display === 'none';
  }

  function buildSegments() {
    var list = [];
    function push(text, el, art, label) {
      splitSentences(text).forEach(function (s) {
        list.push({ text: s, el: el, art: art, artLabel: label });
      });
    }

    var TITLE_SEL = '.part-title, .chapter-title, .section-title, .subsection-title, .division-title, .suppl-title, .suppl-amend-title';
    var pendingTitles = []; // 編・章・節などの見出しは直後の条と一緒に読む

    function flushTitles(art, label) {
      pendingTitles.forEach(function (t) {
        var tx = t.textContent.trim().replace(/^附\s*則/, '附則').replace(/\s+/g, '　');
        push(tx + '。', t, art, label);
      });
      pendingTitles = [];
    }

    var blocks = elLawBody.querySelectorAll(TITLE_SEL + ', .preamble-block, .article-block, .suppl-block > .paragraph-block');
    blocks.forEach(function (block) {
      if (isHidden(block)) return;

      if (block.matches(TITLE_SEL)) {
        pendingTitles.push(block);
        return;
      }

      // 附則の条文外の項
      if (block.classList.contains('paragraph-block')) {
        var sb = block.closest('.suppl-block');
        var sid = sb.id || 'suppl-' + Array.prototype.indexOf.call(elLawBody.children, sb);
        flushTitles('p:' + sid, '附則');
        pushParagraph(block, 'p:' + sid, '附則');
        return;
      }

      if (block.classList.contains('preamble-block')) {
        push('前文。', block.querySelector('.preamble-title') || block, 'art-00', '前文');
        block.querySelectorAll('.preamble-text').forEach(function (p) {
          push(p.textContent, p, 'art-00', '前文');
        });
        return;
      }

      var art = block.id;
      var titleEl = block.querySelector('.article-title');
      var capEl = block.querySelector('.article-caption');
      var label = titleEl ? titleEl.textContent.trim() : art;
      var suppl = block.closest('.suppl-block');
      if (suppl) label = '附則 ' + label;
      flushTitles(art, label);
      var header = block.querySelector('.article-header');
      push((titleEl ? titleEl.textContent.trim() : '') + (capEl ? '　' + capEl.textContent.trim() : '') + '。', header, art, label);

      block.querySelectorAll(':scope > .paragraph-block').forEach(function (p) {
        pushParagraph(p, art, label);
      });
    });

    function pushParagraph(p, art, label) {
      var numEl = p.querySelector(':scope > .paragraph-num');
      var num = numEl ? toHalfDigits(numEl.textContent.trim()) : '';
      var body = ownText(p);
      if (numEl) body = body.replace(numEl.textContent.trim(), '').trim();
      if (/^\d+$/.test(num) && num !== '1') body = '第' + num + '項　' + body;
      if (body) push(body, p, art, label);
      p.querySelectorAll('li').forEach(function (li) {
        var tEl = li.querySelector(':scope > .item-title');
        var t = ownText(li);
        if (tEl) {
          var title = tEl.textContent.trim();
          t = t.replace(title, '').trim();
          // 「一」→「第一号」、「イ」はそのまま
          if (/^[一二三四五六七八九十百]+(の[一二三四五六七八九十]+)*$/.test(title) && li.parentNode.classList.contains('item-list')) {
            title = '第' + title + '号';
          }
          t = title + '　' + t;
        }
        if (t) push(t, li, art, label);
      });
    }

    segments = list;
  }

  // ── 再生制御 ──────────────────────────────────────────────
  function setActive(el) {
    if (activeEl === el) return;
    if (activeEl) activeEl.classList.remove('reader-active');
    activeEl = el;
    if (!el) return;
    el.classList.add('reader-active');
    var r = el.getBoundingClientRect();
    var headerH = (document.querySelector('header') || { offsetHeight: 0 }).offsetHeight;
    if (r.top < headerH + 8 || r.bottom > window.innerHeight - elPlayer.offsetHeight - 8) {
      var top = r.top + window.scrollY - headerH - 80;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  }

  function speakCurrent() {
    var myToken = ++token;
    if (current >= segments.length) {
      finish();
      return;
    }
    var seg = segments[current];
    setActive(seg.el);
    elStatus.textContent = seg.artLabel + ' を読み上げ中';
    saveBookmark();

    var u = makeUtterance(seg.text);
    u.onend = function () {
      if (myToken !== token || !playing) return;
      current++;
      speakCurrent();
    };
    u.onerror = function (e) {
      if (myToken !== token || !playing) return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      current++;
      speakCurrent();
    };
    currentUtterance = u; // GC されると onend が発火しない不具合への対策
    synth.speak(u);
  }

  function play(from) {
    if (!segments.length) buildSegments();
    if (!segments.length) return;
    if (typeof from === 'number') current = Math.max(0, Math.min(from, segments.length - 1));
    if (current >= segments.length) current = 0;
    hideResume();
    playing = true;
    token++;
    updateButtons();
    var busy = synth.speaking || synth.pending;
    // iOS Safari は、ユーザー操作（タップ）の処理中に同期的に speak() しないと
    // 音を出さずに無視する。最初のタップで無音の発話を流して読み上げを許可させる。
    unlockSpeech();
    if (busy) {
      synth.cancel();
      // cancel 直後の speak が無視されるブラウザ対策
      setTimeout(function () { if (playing) speakCurrent(); }, 50);
    } else {
      speakCurrent();
    }
  }

  var unlocked = false;
  function unlockSpeech() {
    if (unlocked) return;
    unlocked = true;
    var u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    u.lang = 'ja-JP';
    synth.speak(u);
  }

  // 一時停止は「現在の文の頭から再開」方式（pause/resume は環境依存で不安定なため）
  function pause() {
    playing = false;
    token++;
    synth.cancel();
    saveBookmark();
    updateButtons();
    if (segments[current]) elStatus.textContent = segments[current].artLabel + ' で一時停止中';
  }

  function stop() {
    pause();
    setActive(null);
    elStatus.textContent = segments[current]
      ? '停止（' + segments[current].artLabel + ' をブックマーク）'
      : '停止';
  }

  function finish() {
    playing = false;
    setActive(null);
    current = 0;
    clearBookmark();
    updateButtons();
    elStatus.textContent = '最後まで読み上げました';
  }

  function jumpArticle(dir) {
    if (!segments.length) buildSegments();
    if (!segments.length) return;
    var art = segments[Math.min(current, segments.length - 1)].art;
    var i = current;
    if (dir > 0) {
      while (i < segments.length && segments[i].art === art) i++;
      if (i >= segments.length) return;
    } else {
      // 条の途中なら条の先頭へ、先頭なら前の条の先頭へ
      var start = i;
      while (start > 0 && segments[start - 1].art === art) start--;
      if (start === i || (playing && i - start <= 1)) {
        if (start === 0) { i = 0; } else {
          var prevArt = segments[start - 1].art;
          i = start - 1;
          while (i > 0 && segments[i - 1].art === prevArt) i--;
        }
      } else {
        i = start;
      }
    }
    if (playing) {
      play(i);
    } else {
      current = i;
      setActive(segments[i].el);
      elStatus.textContent = segments[i].artLabel + ' から再生できます';
      saveBookmark();
    }
  }

  function updateButtons() {
    elPlay.textContent = playing ? '❚❚' : '▶';
    elPlay.title = playing ? '一時停止' : '再生';
    elPlay.setAttribute('aria-label', elPlay.title);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }

  // ── ブックマーク ──────────────────────────────────────────
  function bookmarkFor(id) {
    try { return JSON.parse(lsGet(BM_PREFIX + id) || 'null'); } catch (e) { return null; }
  }

  function saveBookmark() {
    if (!lawId || !segments[current]) return;
    var seg = segments[current];
    var artStart = current;
    while (artStart > 0 && segments[artStart - 1].art === seg.art) artStart--;
    var title = (document.getElementById('law-title') || {}).textContent || lawId;
    lsSet(BM_PREFIX + lawId, JSON.stringify({
      art: seg.art,
      offset: current - artStart,
      label: seg.artLabel,
      title: title,
      ts: Date.now()
    }));
    var idx = [];
    try { idx = JSON.parse(lsGet(BM_INDEX) || '[]'); } catch (e) {}
    idx = idx.filter(function (x) { return x !== lawId; });
    idx.unshift(lawId);
    lsSet(BM_INDEX, JSON.stringify(idx.slice(0, 50)));
  }

  function clearBookmark() {
    lsDel(BM_PREFIX + lawId);
    var idx = [];
    try { idx = JSON.parse(lsGet(BM_INDEX) || '[]'); } catch (e) {}
    lsSet(BM_INDEX, JSON.stringify(idx.filter(function (x) { return x !== lawId; })));
  }

  function indexFromBookmark(bm) {
    if (!bm) return -1;
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].art === bm.art) {
        var j = i + (bm.offset || 0);
        // 条の範囲を超えないように
        while (j > i && (j >= segments.length || segments[j].art !== bm.art)) j--;
        return j;
      }
    }
    return -1;
  }

  function showResume(bm) {
    var d = new Date(bm.ts);
    elResumeTx.textContent = '前回の続き：' + bm.label + '（' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') + '）';
    elResume.hidden = false;
  }
  function hideResume() { elResume.hidden = true; }

  // ── 条文ごとの「ここから読む」ボタン ─────────────────────
  function addArticleButtons() {
    elLawBody.querySelectorAll('.article-header, .preamble-title').forEach(function (h) {
      if (h.querySelector('.reader-art-btn')) return;
      var b = document.createElement('button');
      b.className = 'reader-art-btn';
      b.type = 'button';
      b.title = 'ここから読み上げ';
      b.setAttribute('aria-label', 'ここから読み上げ');
      b.textContent = '▶';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        buildSegments();
        var block = h.closest('.article-block, .preamble-block');
        for (var i = 0; i < segments.length; i++) {
          if (segments[i].art === block.id) { play(i); return; }
        }
      });
      h.appendChild(b);
    });
  }

  // ── イベント ──────────────────────────────────────────────
  elPlay.addEventListener('click', function () {
    if (playing) { pause(); return; }
    play();
  });
  elStop.addEventListener('click', stop);
  elPrev.addEventListener('click', function () { jumpArticle(-1); });
  elNext.addEventListener('click', function () { jumpArticle(1); });

  elRate.addEventListener('input', function () {
    rate = parseFloat(elRate.value);
    updateRateLabel();
  });
  elRate.addEventListener('change', function () {
    lsSet(RATE_KEY, String(rate));
    if (playing) play(current); // 新しい速度で現在の文から読み直す
  });
  elVoice.addEventListener('change', function () {
    lsSet(VOICE_KEY, elVoice.value);
    if (playing) play(current);
  });
  // 試聴（タップ処理中に同期的に speak する）
  document.getElementById('reader-voice-test').addEventListener('click', function () {
    if (playing) pause();
    token++;
    synth.cancel();
    unlocked = true;
    synth.speak(makeUtterance('この音声で読み上げます。'));
  });

  elSettings.addEventListener('click', function () {
    elPanel.hidden = !elPanel.hidden;
    elSettings.setAttribute('aria-expanded', String(!elPanel.hidden));
  });

  elResumeGo.addEventListener('click', function () {
    buildSegments();
    var i = indexFromBookmark(bookmarkFor(lawId));
    play(i >= 0 ? i : 0);
  });
  elResumeNo.addEventListener('click', hideResume);

  // 本文の描画完了（viewer.js から通知）
  document.addEventListener('law:rendered', function () {
    buildSegments();
    addArticleButtons();
    var bm = bookmarkFor(lawId);
    var i = indexFromBookmark(bm);
    if (i >= 0) {
      current = i;
      showResume(bm);
      elStatus.textContent = '▶ で ' + bm.label + ' から再生';
      if (new URLSearchParams(location.search).get('resume') === '1') {
        setTimeout(function () { setActive(segments[i].el); }, 200);
      }
    } else {
      elStatus.textContent = '▶ で冒頭から読み上げ';
    }
  });

  // 改正法附則の表示切替などでセグメントを作り直す
  document.addEventListener('law:changed', function () {
    var bmArt = segments[current] ? { art: segments[current].art, offset: 0 } : null;
    var wasPlaying = playing;
    if (wasPlaying) pause();
    buildSegments();
    var i = indexFromBookmark(bmArt);
    current = i >= 0 ? i : 0;
    if (wasPlaying) play(current);
  });

  // ページを離れる時は位置を保存し、読み上げを止める
  window.addEventListener('pagehide', function () {
    if (playing) saveBookmark();
    synth.cancel();
  });

  // キーボード: スペースで再生/一時停止（入力欄以外）
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return;
    if (e.code === 'Space') { e.preventDefault(); elPlay.click(); }
  });

  // ロック画面・イヤホンのボタン操作
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', function () { if (!playing) play(); });
      navigator.mediaSession.setActionHandler('pause', function () { if (playing) pause(); });
      navigator.mediaSession.setActionHandler('previoustrack', function () { jumpArticle(-1); });
      navigator.mediaSession.setActionHandler('nexttrack', function () { jumpArticle(1); });
    } catch (e) {}
  }

  updateButtons();
}());
