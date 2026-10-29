<script>
/* v3: search across all notes + personal highlighter. Separate from the main script; reads the DOM only. */
(function(){
  'use strict';
  var root = document.querySelector('.viz-root'); if(!root) return;
  // the overlays are written outside .viz-root; move them in so they pick up its colour variables
  ['hlbar','sx','ask','ask-fab','kb'].forEach(function(id){ var n = document.getElementById(id); if(n && n.parentNode !== root) root.appendChild(n); });
  function $(s, r){ return (r||document).querySelector(s); }
  function $$(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function escH(t){ return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function escRe(t){ return t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function reduced(){ return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }

  var COURSES = {
    micro:{n:'Microeconomics', c:'var(--blue)'},
    mkt:{n:'Marketing', c:'var(--orange)'},
    hr:{n:'HR Management', c:'var(--hrc)'},
    sa:{n:'Search Analytics', c:'var(--grn)'},
    phl:{n:'Philosophy', c:'var(--phl)'}
  };
  var BLOCK = {P:1,LI:1,TD:1,TH:1,DIV:1,SECTION:1,H1:1,H2:1,H3:1,H4:1,SUMMARY:1,UL:1,OL:1,TABLE:1,TR:1,ARTICLE:1,ASIDE:1,DETAILS:1,FIGURE:1,FIGCAPTION:1,NAV:1,BLOCKQUOTE:1,DT:1,DD:1,DL:1,PRE:1,MAIN:1};
  var HL_SKIP = 'script,style,svg,button,select,textarea,input,summary,.q,.selftest,.wp-rail,.wp-jump,.week-nav,.weektabs,.worked-bar,.q-bar,.tbtns,.infoline,.hero-chip,.hero-meta,.dl-list,.dl-foot,[data-nohl]';
  var SX_SKIP = 'script,style,svg,button,select,textarea,input,.q,.selftest,.wp-rail,.wp-jump,.week-nav,.weektabs,.worked-bar,.q-bar,.tbtns';

  function walkTexts(container, skipSel){
    var out = [];
    var w = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: function(n){
      if(n.nodeType === 1) return n.matches(skipSel) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    }});
    var n; while((n = w.nextNode())) out.push(n);
    return out;
  }
  function nv(n){ return n.nodeValue; }

  /* ================================================================== highlighter */
  var HL = {};
  try{ HL = JSON.parse(lsGet('s5v3-hl') || '{}') || {}; }catch(e){ HL = {}; }
  function saveHL(){ lsSet('s5v3-hl', JSON.stringify(HL)); }
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
  function elOf(node){ return node ? (node.nodeType === 1 ? node : node.parentElement) : null; }
  function panelOf(node){ var e = elOf(node); return e ? e.closest('.week-panel') : null; }
  function keyOf(p){ var cp = p.closest('.course-panel'); return (cp ? cp.dataset.course : '?') + ':' + p.dataset.week; }
  function prefix(nodes){ var a = [0], acc = 0; for(var i=0;i<nodes.length;i++){ acc += nodes[i].nodeValue.length; a.push(acc); } return a; }

  var R = document.createRange();
  function pointOffset(nodes, pre, pn, po){
    var lo = 0, hi = nodes.length;
    while(lo < hi){
      var mid = (lo + hi) >> 1, t = nodes[mid], c;
      R.setStart(t, t.nodeValue.length); R.collapse(true);
      try{ c = R.comparePoint(pn, po); }catch(e){ c = 1; }
      if(c < 0) hi = mid; else lo = mid + 1;
    }
    if(lo >= nodes.length) return pre[nodes.length];
    var acc = pre[lo];
    if(nodes[lo] === pn) acc += po;
    return acc;
  }
  function makeHL(full, s, e, c, id){
    return { id:id || uid(), s:s, e:e, c:c, n:e-s, a:full.slice(s, Math.min(e, s+120)), z:full.slice(Math.max(s, e-120), e) };
  }
  function valid(full, h){
    return full.substr(h.s, h.a.length) === h.a && full.slice(h.e - h.z.length, h.e) === h.z && h.e - h.s === h.n;
  }
  function realign(full, h){
    var best = -1, bd = 1e9, i = full.indexOf(h.a);
    while(i !== -1){
      var e = i + h.n;
      if(e <= full.length && full.slice(e - h.z.length, e) === h.z){
        var d = Math.abs(i - h.s); if(d < bd){ bd = d; best = i; }
      }
      i = full.indexOf(h.a, i + 1);
    }
    if(best < 0) return false;
    h.s = best; h.e = best + h.n; return true;
  }
  function subtract(list, full, s, e){
    var out = [];
    list.forEach(function(h){
      if(h.e <= s || h.s >= e){ out.push(h); return; }
      if(h.s < s) out.push(makeHL(full, h.s, s, h.c));
      if(h.e > e) out.push(makeHL(full, e, h.e, h.c));
    });
    return out;
  }
  var NOWRAP = {TABLE:1,THEAD:1,TBODY:1,TFOOT:1,TR:1,UL:1,OL:1,DL:1,SELECT:1,COLGROUP:1,OPTGROUP:1};
  function render(p){
    var key = keyOf(p), list = HL[key] || [];
    var parents = [];
    $$('mark.hl', p).forEach(function(m){
      var par = m.parentNode; if(!par) return;
      while(m.firstChild) par.insertBefore(m.firstChild, m);
      par.removeChild(m);
      if(parents.indexOf(par) < 0) parents.push(par);
    });
    parents.forEach(function(x){ x.normalize(); });
    if(!list.length) return;
    var nodes = textsOf(p), pre = prefix(nodes), full = nodes.map(nv).join('');
    var segs = {}, changed = false;
    list.forEach(function(h){
      var s0 = h.s, ok = valid(full, h) || (realign(full, h) && (changed = true));
      if(!ok) return;
      for(var i = 0; i < nodes.length; i++){
        if(pre[i+1] <= h.s) continue;
        if(pre[i] >= h.e) break;
        var a = Math.max(h.s - pre[i], 0), b = Math.min(h.e - pre[i], nodes[i].nodeValue.length);
        if(b > a) (segs[i] || (segs[i] = [])).push({a:a, b:b, h:h});
      }
    });
    Object.keys(segs).forEach(function(k){
      var node = nodes[+k], arr = segs[k].sort(function(x, y){ return y.a - x.a; });
      var par = node.parentNode; if(!par || NOWRAP[par.tagName]) return;
      arr.forEach(function(sg){
        if(sg.b < node.nodeValue.length) node.splitText(sg.b);
        var mid = sg.a > 0 ? node.splitText(sg.a) : node;
        if(!/\S/.test(mid.nodeValue)) return;
        var m = document.createElement('mark'); m.className = 'hl hl-' + sg.h.c; m.setAttribute('data-hid', sg.h.id);
        mid.parentNode.insertBefore(m, mid); m.appendChild(mid);
      });
    });
    if(changed) saveHL();
  }
  function textsOf(p){ return walkTexts(p, HL_SKIP); }

  var bar = $('#hlbar'), pend = null, anchor = null, barDown = false, selTimer = null;
  function placeBar(rect){
    bar.hidden = false;
    var bw = bar.offsetWidth || 230, bh = bar.offsetHeight || 44, vw = window.innerWidth, vh = window.innerHeight;
    var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    var x = rect.left + rect.width / 2 - bw / 2; x = Math.max(8, Math.min(vw - bw - 8, x));
    var above = rect.top - bh - 10, below = rect.bottom + 12;
    var y = (coarse || above < 72) ? below : above;
    y = Math.max(72, Math.min(vh - bh - 8, y));
    bar.style.left = x + 'px'; bar.style.top = y + 'px';
  }
  function hideBar(){ bar.hidden = true; pend = null; anchor = null; }
  function onSelChange(){
    clearTimeout(selTimer);
    selTimer = setTimeout(function(){
      var sel = window.getSelection();
      if(!sel || sel.rangeCount === 0 || sel.isCollapsed){ if(!barDown && !(pend && pend.hid)) hideBar(); return; }
      var r = sel.getRangeAt(0), p1 = panelOf(r.startContainer), p2 = panelOf(r.endContainer);
      if(!p1 || p1 !== p2 || p1.hidden){ hideBar(); return; }
      var ce = elOf(r.commonAncestorContainer);
      if(!ce || ce.closest(HL_SKIP)){ hideBar(); return; }
      var nodes = textsOf(p1), pre = prefix(nodes), full = nodes.map(nv).join('');
      var s = pointOffset(nodes, pre, r.startContainer, r.startOffset), e = pointOffset(nodes, pre, r.endContainer, r.endOffset);
      if(e - s < 1 || !/\S/.test(full.slice(s, e))){ hideBar(); return; }
      pend = { panel:p1, key:keyOf(p1), s:s, e:e };
      anchor = r.cloneRange();
      placeBar(r.getBoundingClientRect());
    }, 180);
  }
  function apply(c){
    var p = pend; if(!p) return;
    var panel = p.panel, nodes = textsOf(panel), full = nodes.map(nv).join('');
    var list = HL[p.key] || [];
    if(p.hid){
      var h = null; list.forEach(function(x){ if(x.id === p.hid) h = x; });
      if(h){
        if(c === 'x') list = list.filter(function(x){ return x !== h; });
        else h.c = c;
      }
    } else if(c === 'x'){
      list = subtract(list, full, p.s, p.e);
    } else {
      list = subtract(list, full, p.s, p.e);
      list.push(makeHL(full, p.s, p.e, c));
    }
    list.sort(function(a, b){ return a.s - b.s; });
    if(list.length) HL[p.key] = list; else delete HL[p.key];
    saveHL();
    var sel = window.getSelection(); if(sel) sel.removeAllRanges();
    hideBar();
    render(panel);
  }
  bar.addEventListener('pointerdown', function(e){ e.preventDefault(); barDown = true; });
  bar.addEventListener('mousedown', function(e){ e.preventDefault(); });
  bar.addEventListener('click', function(e){
    var b = e.target.closest('button'); if(b && pend) apply(b.dataset.c);
    setTimeout(function(){ barDown = false; }, 300);
  });
  document.addEventListener('selectionchange', onSelChange);
  document.addEventListener('click', function(e){
    var m = e.target.closest && e.target.closest('mark.hl'); if(!m) return;
    var sel = window.getSelection(); if(sel && !sel.isCollapsed) return;
    var p = panelOf(m); if(!p) return;
    var key = keyOf(p), id = m.getAttribute('data-hid'), h = null;
    (HL[key] || []).forEach(function(x){ if(x.id === id) h = x; });
    if(!h) return;
    pend = { panel:p, key:key, hid:h.id }; anchor = m; placeBar(m.getBoundingClientRect());
  });
  document.addEventListener('pointerdown', function(e){
    if(bar.hidden || bar.contains(e.target)) return;
    if(e.target.closest && e.target.closest('mark.hl')) return;
    if(pend && pend.hid) hideBar();
  });
  window.addEventListener('scroll', function(){
    if(bar.hidden || !anchor) return;
    var rect = anchor.getBoundingClientRect();
    if(rect.bottom < 64 || rect.top > window.innerHeight) hideBar(); else placeBar(rect);
  }, {passive:true});
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !bar.hidden) hideBar(); });

  // restore saved highlights
  $$('.week-panel').forEach(function(p){ if(HL[keyOf(p)]) render(p); });

  /* ================================================================== clean view (fewer boxes) */
  (function(){
    var b = $('#toggle-clean'); if(!b) return;
    function setClean(on, save){ root.classList.toggle('clean', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.title = on ? 'Back to boxes' : 'Fewer boxes'; if(save) lsSet('s5v3-clean', on ? '1' : '0'); }
    setClean(lsGet('s5v3-clean') === '1', false);
    b.addEventListener('click', function(){ setClean(!root.classList.contains('clean'), true); });
  })();

  /* ================================================================== page colour (white / paper / soft green / sepia) */
  (function(){
    var sw = $$('.pg-sw'); if(!sw.length) return;
    var NAMES = { paper:['Paper','\ud83d\udcc4'], pink:['Pink Pop','\ud83c\udf80'], green:['Matcha','\ud83c\udf75'], sepia:['Latte','\u2615'], sky:['Cloud','\u2601\ufe0f'], bay:['Bay Street','\ud83d\udcc8'] };
    sw.forEach(function(b){ var n = NAMES[b.dataset.bg]; if(n){ b.title = n[0]; b.setAttribute('aria-label', n[0]); } });
    var tEl = null, tTm = 0;
    function toast(t){
      if(!tEl){ tEl = document.createElement('div'); tEl.className = 'pg-toast'; tEl.setAttribute('role','status'); (document.querySelector('.viz-root') || document.body).appendChild(tEl); }
      tEl.textContent = t; tEl.classList.add('on'); clearTimeout(tTm); tTm = setTimeout(function(){ tEl.classList.remove('on'); }, 1500);
    }
    function setBg(v, save){
      if(!NAMES[v]) v = 'paper';
      if(v === 'paper' || !v){ root.removeAttribute('data-bg'); v = 'paper'; } else root.setAttribute('data-bg', v);
      sw.forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.bg === v ? 'true' : 'false'); });
      var nm = NAMES[v] || NAMES.paper, lab = $('.pg-row .pg-lab');
      if(lab) lab.innerHTML = 'Page colour<b>' + nm[0] + '</b>';
      if(save){ lsSet('s5v43-bg', v); toast(nm[1] + '  ' + nm[0]); }
    }
    var sv = lsGet('s5v43-bg'); if(sv === 'white') sv = 'paper'; setBg(sv || 'paper', false);
    sw.forEach(function(b){ b.addEventListener('click', function(e){ e.stopPropagation(); setBg(b.dataset.bg, true); }); });
  })();

  /* ================================================================== search */
  var sx = $('#sx'), input = $('#sx-in'), list = $('#sx-list'), empty = $('#sx-empty'), count = $('#sx-n'), chipsBox = $('#sx-chips'), body = $('#sx-body');
  var openBtn = $('#open-search'), IDX = null, results = [], sel = 0, filter = 'all', lastQ = '', opener = null;

  function tabLabel(tab, fallback){
    if(!tab) return fallback;
    var c = tab.cloneNode(true); $$('.mt,.nd', c).forEach(function(x){ x.remove(); });
    return c.textContent.replace(/\s+/g, ' ').trim() || fallback;
  }
  function blockOf(n, stop){
    var e = n.parentElement;
    while(e && e !== stop && !BLOCK[e.tagName]) e = e.parentElement;
    return e || stop;
  }
  function secOf(b){
    var s = b.closest('section');
    while(s && !$('.section-head h2', s)) s = s.parentElement ? s.parentElement.closest('section') : null;
    return s;
  }
  function buildIndex(){
    var out = [];
    $$('.course-panel').forEach(function(cp){
      var c = cp.dataset.course; if(!COURSES[c]) return;
      $$('.week-panel', cp).forEach(function(p){
        var w = p.dataset.week;
        var wl = tabLabel($('.weektabs[data-scope="' + c + '"] .weektab[data-week="' + w + '"]', cp), w);
        var groups = [], cur = null;
        walkTexts(p, SX_SKIP).forEach(function(n){
          var b = blockOf(n, p);
          if(!cur || cur.b !== b){ cur = { b:b, t:'' }; groups.push(cur); }
          cur.t += n.nodeValue;
        });
        groups.forEach(function(g){
          var t = g.t.replace(/\s+/g, ' ').trim(); if(t.length < 2) return;
          var s = secOf(g.b), h2 = s ? $('.section-head h2', s) : null;
          var tag = g.b.tagName;
          out.push({ c:c, w:w, wl:wl, sec:h2 ? h2.textContent.replace(/\s+/g,' ').trim() : '', sid:s ? s.id : '', t:t, tl:t.toLowerCase(), el:g.b, head:(tag==='H1'||tag==='H2'||tag==='H3'||tag==='H4'||tag==='SUMMARY') });
        });
      });
    });
    return out;
  }
  function tokensOf(q){ return q.toLowerCase().replace(/\s+/g, ' ').trim().split(' ').filter(function(x){ return x.length > 0; }); }
  function run(q){
    var toks = tokensOf(q); if(!toks.length || q.trim().length < 2) return { toks:toks, res:[], total:0 };
    var phrase = toks.join(' '), res = [];
    for(var i = 0; i < IDX.length; i++){
      var r = IDX[i]; if(filter !== 'all' && r.c !== filter) continue;
      var ok = true, sc = 0;
      for(var k = 0; k < toks.length; k++){
        var p = r.tl.indexOf(toks[k]);
        if(p < 0){ ok = false; break; }
        sc += 4 + (p === 0 ? 3 : 0);
      }
      if(!ok) continue;
      if(toks.length > 1 && r.tl.indexOf(phrase) >= 0) sc += 40;
      if(toks.length === 1 && r.tl.indexOf(phrase) >= 0) sc += 10;
      if(r.head) sc += 30;
      if(r.sec && r.sec.toLowerCase().indexOf(phrase) >= 0) sc += 12;
      sc += 14 / (1 + r.t.length / 160);
      res.push({ r:r, sc:sc, i:i });
    }
    res.sort(function(a, b){ return b.sc - a.sc || a.i - b.i; });
    return { toks:toks, res:res.slice(0, 60), total:res.length };
  }
  function snippet(r, toks){
    var tl = r.tl, pos = -1, phrase = toks.join(' ');
    pos = tl.indexOf(phrase);
    if(pos < 0){ toks.forEach(function(t){ var p = tl.indexOf(t); if(p >= 0 && (pos < 0 || p < pos)) pos = p; }); }
    if(pos < 0) pos = 0;
    var s = Math.max(0, pos - 70), e = Math.min(r.t.length, pos + 150);
    if(s > 0){ var sp = r.t.indexOf(' ', s); if(sp >= 0 && sp < pos) s = sp + 1; }
    var txt = r.t.slice(s, e);
    var re = new RegExp('(' + toks.slice().sort(function(a, b){ return b.length - a.length; }).map(escRe).join('|') + ')', 'gi');
    var parts = txt.split(re), html = '';
    parts.forEach(function(pt, i){ html += (i % 2 === 1) ? '<mark>' + escH(pt) + '</mark>' : escH(pt); });
    return (s > 0 ? '… ' : '') + html + (e < r.t.length ? ' …' : '');
  }
  var SUGS = ['opportunity cost', 'SWOT', 'Four Noble Truths', 'line authority', 'elasticity'];
  function paint(){
    var q = input.value, out = run(q), toks = out.toks;
    results = out.res; if(sel >= results.length) sel = 0;
    list.innerHTML = '';
    if(!results.length){
      empty.hidden = false;
      if(q.trim().length < 2){
        empty.innerHTML = '<b>Find anything in your notes.</b><br>Type a word or a phrase. It searches every course, chapter, definition and flashcard, and takes you to the exact spot.<div class="sx-sugs">' + SUGS.map(function(s){ return '<button type="button" data-q="' + escH(s) + '">' + escH(s) + '</button>'; }).join('') + '</div>';
        count.textContent = '';
      } else {
        empty.innerHTML = '<b>No match for “' + escH(q.trim()) + '”.</b><br>Try fewer words, or a different spelling.' + (filter !== 'all' ? ' You are searching one course only; pick <b>All</b> to widen it.' : '');
        count.textContent = '0 results';
      }
      input.removeAttribute('aria-activedescendant');
      return;
    }
    empty.hidden = true;
    var frag = document.createDocumentFragment();
    results.forEach(function(o, i){
      var r = o.r, li = document.createElement('li');
      li.id = 'sx-o' + i; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', i === sel ? 'true' : 'false');
      li.dataset.i = i; li.className = (i === sel ? 'on ' : '') + (r.head ? 'head' : '');
      li.style.setProperty('--cc', COURSES[r.c].c);
      li.innerHTML = '<div class="sx-where"><i></i><span>' + escH(COURSES[r.c].n) + ' · ' + escH(r.wl) + (r.sec && !r.head ? ' · ' + escH(r.sec) : '') + '</span></div><div class="sx-snip">' + snippet(r, toks) + '</div>';
      frag.appendChild(li);
    });
    list.appendChild(frag);
    count.textContent = out.total > results.length ? 'Showing ' + results.length + ' of ' + out.total + ' · add a word to narrow' : out.total + (out.total === 1 ? ' result' : ' results');
    input.setAttribute('aria-activedescendant', 'sx-o' + sel);
    body.scrollTop = 0;
  }
  function markSel(){
    $$('li', list).forEach(function(li, i){ var on = i === sel; li.classList.toggle('on', on); li.setAttribute('aria-selected', on ? 'true' : 'false'); if(on){ input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({block:'nearest'}); } });
  }
  function buildChips(){
    chipsBox.innerHTML = '';
    var all = document.createElement('button'); all.type = 'button'; all.className = 'sx-chip'; all.dataset.f = 'all'; all.setAttribute('aria-pressed', 'true'); all.textContent = 'All courses';
    chipsBox.appendChild(all);
    Object.keys(COURSES).forEach(function(c){
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sx-chip'; b.dataset.f = c; b.setAttribute('aria-pressed', 'false');
      b.style.setProperty('--cc', COURSES[c].c); b.innerHTML = '<i></i>' + escH(COURSES[c].n);
      chipsBox.appendChild(b);
    });
  }
  function setFilter(f){
    filter = f;
    $$('.sx-chip', chipsBox).forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.f === f ? 'true' : 'false'); });
    sel = 0; paint();
  }
  function openSX(from){
    if(!IDX) IDX = buildIndex();
    opener = from || document.activeElement;
    sx.classList.add('open');
    // default to the course you are in, but let the person widen it
    input.focus(); input.select(); paint();
  }
  function closeSX(){
    sx.classList.remove('open');
    if(opener && opener.focus){ try{ opener.focus(); }catch(e){} }
  }
  function flashAt(el, toks){
    $$('.sx-flash').forEach(function(x){ x.classList.remove('sx-flash'); }); void el.offsetWidth; el.classList.add('sx-flash');
    setTimeout(function(){ el.classList.remove('sx-flash'); }, 2800);
    if(!(window.CSS && CSS.highlights && window.Highlight)) return;
    try{
      var nodes = walkTexts(el, 'script,style'), full = '', starts = [];
      nodes.forEach(function(n){ starts.push(full.length); full += n.nodeValue; });
      var low = full.toLowerCase(), phrase = toks.join(' '), p = low.indexOf(phrase), len = phrase.length;
      if(p < 0){ p = low.indexOf(toks[0]); len = toks[0].length; }
      if(p < 0) return;
      function at(off){ for(var i = nodes.length - 1; i >= 0; i--){ if(starts[i] <= off) return [nodes[i], off - starts[i]]; } return [nodes[0], 0]; }
      var a = at(p), b = at(p + len), rg = document.createRange();
      rg.setStart(a[0], Math.min(a[1], a[0].nodeValue.length)); rg.setEnd(b[0], Math.min(b[1], b[0].nodeValue.length));
      CSS.highlights.set('s5-find', new Highlight(rg));
      setTimeout(function(){ try{ CSS.highlights.delete('s5-find'); }catch(e){} }, 3600);
    }catch(e){}
  }
  function openResult(o){
    var r = o.r, toks = tokensOf(input.value);
    closeSX();
    if(window.__s5 && window.__s5.go){ window.__s5.go(r.c, r.w); }
    else {
      var ct = $('.coursetab[data-course="' + r.c + '"]'); if(ct) ct.click();
      var wt = $('.course-panel[data-course="' + r.c + '"] .weektab[data-week="' + r.w + '"]'); if(wt) wt.click();
    }
    setTimeout(function(){
      var el = r.el;
      if(!document.contains(el)) el = (r.sid && document.getElementById(r.sid)) || null;
      if(!el) return;
      var d = el.closest('details'); while(d){ d.open = true; d = d.parentElement ? d.parentElement.closest('details') : null; }
      var gp = el.closest('.grading-panel');
      if(gp && gp.hidden){ var tb = $('[data-target="' + gp.id + '"]'); if(tb) tb.click(); else gp.hidden = false; }
      el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block:'center' });
      flashAt(el, toks);
    }, 140);
  }

  buildChips();
  openBtn.addEventListener('click', function(){ openSX(openBtn); });
  $('#sx-x').addEventListener('click', closeSX);
  $('#sx-bg').addEventListener('click', closeSX);
  chipsBox.addEventListener('click', function(e){ var b = e.target.closest('.sx-chip'); if(b) setFilter(b.dataset.f); });
  empty.addEventListener('click', function(e){ var b = e.target.closest('button[data-q]'); if(b){ input.value = b.dataset.q; sel = 0; paint(); input.focus(); } });
  var typing = null;
  input.addEventListener('input', function(){ clearTimeout(typing); typing = setTimeout(function(){ sel = 0; paint(); }, 70); });
  input.addEventListener('keydown', function(e){
    if(e.key === 'ArrowDown'){ e.preventDefault(); if(results.length){ sel = (sel + 1) % results.length; markSel(); } }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); if(results.length){ sel = (sel - 1 + results.length) % results.length; markSel(); } }
    else if(e.key === 'Enter'){ e.preventDefault(); if(results[sel]) openResult(results[sel]); }
    else if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeSX(); }
  });
  list.addEventListener('click', function(e){ var li = e.target.closest('li'); if(li && results[+li.dataset.i]) openResult(results[+li.dataset.i]); });
  list.addEventListener('mousemove', function(e){ var li = e.target.closest('li'); if(li && +li.dataset.i !== sel){ sel = +li.dataset.i; markSel(); } });
  document.addEventListener('keydown', function(e){
    var t = e.target, typingNow = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    var isK = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
    if(!sx.classList.contains('open') && (isK || (e.key === '/' && !typingNow && !e.metaKey && !e.ctrlKey && !e.altKey))){ e.preventDefault(); openSX(document.activeElement); }
    else if(sx.classList.contains('open') && e.key === 'Escape'){ closeSX(); }
  });

  /* ================================================================== ask AI (answers from the notes) */
  var askBox = $('#ask'), askBody = $('#ask-body'), askQ = $('#ask-q'), askForm = $('#ask-form'), askSend = $('#ask-send'), askNew = $('#ask-new');
  var askTop = $('#open-ask'), askFab = $('#ask-fab'), sampleFn = null, turns = [], askBusy = false, askCtl = null, lastPassages = [];
  var MODEL = 'claude-haiku-5-5';
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  var OPT = isMac ? '⌥' : 'Alt';
  var STOP = {}; ('a an the is are was were be been being of to in on at for and or but if then than that this these those it its as by with from about into over under how what why when where which who whom whose do does did can could should would will may might me my we our you your i he she they them their there here not no yes just also more most some any each other such so very explain tell give show mean means meaning define definition please example examples simple simply quiz').split(' ').forEach(function(w){ STOP[w] = 1; });
  function stem(w){ var s = w.replace(/(ings?|ed|es|s|e|ly)$/, ''); return s.length >= 3 ? s : w; }
  function activeWeek(){
    var cp = $('.course-panel:not([hidden])'); if(!cp || !COURSES[cp.dataset.course]) return null;
    var wp = $('.week-panel:not([hidden])', cp); if(!wp) return null;
    return { c: cp.dataset.course, w: wp.dataset.week };
  }
  function passageFrom(recs, n){
    var best = recs[0]; recs.forEach(function(r){ if(r._sc > best._sc) best = r; });
    var text = recs.map(function(r){ return r.t; }).join(' ').slice(0, 1100);
    return { n:n, c:best.c, w:best.w, wl:best.wl, sec:best.sec, sid:best.sid, el:best.el, text:text };
  }
  function retrieve(question){
    if(!IDX) IDX = buildIndex();
    var cur = activeWeek();
    var wholeChapter = /\b(this|current|the)\s+(chapter|week|lecture|section|page|unit)\b|\bsummari[sz]e\b|\bkey (points|terms|ideas?)\b/i.test(question);
    var words = question.toLowerCase().replace(/[^a-z0-9$%\s\-]/g, ' ').split(/\s+/).filter(function(w){ return w.length > 1 && !STOP[w]; });
    var toks = words.map(stem).filter(function(w, i, a){ return a.indexOf(w) === i; });
    // whole-chapter questions: a few lines from every section of the chapter you are on
    if(cur && (wholeChapter || !toks.length)){
      var secs = [], by = {};
      IDX.forEach(function(r){
        if(r.c !== cur.c || r.w !== cur.w) return;
        var k = r.sid || r.sec || 'x';
        if(!by[k]){ by[k] = []; secs.push(by[k]); }
        if(by[k].length < 6) by[k].push(r);
      });
      var out = [], total = 0;
      secs.forEach(function(g){
        if(out.length >= 14 || total > 11000) return;
        g.forEach(function(r){ r._sc = r.head ? 2 : 1; });
        var p = passageFrom(g.map(function(r){ var c = Object.create(r); c.t = r.t.slice(0, 320); return c; }), out.length + 1);
        p.el = g[0].el; total += p.text.length; out.push(p);
      });
      if(out.length) return { passages: out, toks: toks };
    }
    if(!toks.length) return { passages: [], toks: toks };
    var N = IDX.length, df = toks.map(function(t){ var c = 0; for(var i = 0; i < N; i++){ if(IDX[i].tl.indexOf(t) >= 0) c++; } return c; });
    var idf = df.map(function(d){ return Math.log(1 + N / (1 + d)); });
    var phrase = words.join(' '), need = toks.length >= 3 ? Math.ceil(toks.length * 0.5) : toks.length;
    var scored = [];
    for(var i = 0; i < N; i++){
      var r = IDX[i], m = 0, sc = 0;
      for(var k = 0; k < toks.length; k++){
        if(r.tl.indexOf(toks[k]) >= 0){ m++; sc += idf[k]; if(r.sec && r.sec.toLowerCase().indexOf(toks[k]) >= 0) sc += idf[k] * 0.4; }
      }
      if(m < need || !m) continue;
      if(words.length > 1 && r.tl.indexOf(phrase) >= 0) sc += 6;
      if(r.head) sc += 2.5;
      if(cur){ if(r.c === cur.c) sc *= 1.2; if(r.c === cur.c && r.w === cur.w) sc *= 1.15; }
      if(r.t.length < 25) sc *= 0.6;
      r._sc = sc; scored.push(r);
    }
    scored.sort(function(a, b){ return b._sc - a._sc; });
    var picked = [], seen = {};
    for(var j = 0; j < scored.length && picked.length < 8; j++){
      var r0 = scored[j], idx = IDX.indexOf(r0);
      if(seen[idx]) continue;
      var grp = [r0]; seen[idx] = 1;
      // a heading or a very short line is not an answer on its own: take what follows it
      if(r0.head || r0.t.length < 80){
        for(var a = 1; a <= 2; a++){ var nx = IDX[idx + a]; if(nx && nx.c === r0.c && nx.w === r0.w && !seen[idx + a] && !nx.head){ nx._sc = r0._sc * 0.5; grp.push(nx); seen[idx + a] = 1; } }
      }
      picked.push(passageFrom(grp, picked.length + 1));
    }
    return { passages: picked, toks: toks };
  }

  var RULES = 'You are a friendly study helper for a college student. They are reading one chapter of their own course notes, named in the QUESTION message. The numbered NOTES passages are the best matches from their notes and slides. Rules: use plain, simple words a first-year student can follow, and keep it under 150 words. Start from the notes: use their terms and cite a passage like [1] or [2] after each sentence that uses it. You may also use your general knowledge to explain, give a real-world example, or go deeper. Put anything that does not come from the notes in its own short paragraph that begins exactly with "Beyond your slides:". If the notes do not cover the question, just answer from general knowledge in a "Beyond your slides:" paragraph. Never invent numbers, names, dates or quotes, and say when you are unsure. Course rules, deadlines and grades only come from the notes, so never guess those. When asked to quiz, ask ONE question at a time and wait for the reply before giving the answer. Use short paragraphs or a simple list. No headings.';
  function chapterLabel(){
    var cur = activeWeek(); if(!cur) return '';
    var t = $('.course-panel[data-course="' + cur.c + '"] .weektab.active');
    return COURSES[cur.c].n + (t ? ' · ' + t.textContent.replace(/\s+/g, ' ').trim() : '');
  }
  function notesBlock(passages){
    if(!passages.length) return 'NOTES:\n(no matching passages found)';
    return 'NOTES:\n' + passages.map(function(p){ return '[' + p.n + '] (' + COURSES[p.c].n + ' · ' + p.wl + (p.sec ? ' · ' + p.sec : '') + ')\n' + p.text; }).join('\n\n');
  }
  function inlineMd(s){ return escH(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
  function fmt(text){
    var cited = [];
    var t = text.replace(/\s*\[(\d+(?:\s*,\s*\d+)*)\]/g, function(m, g){ g.split(',').forEach(function(x){ x = +x.trim(); if(cited.indexOf(x) < 0) cited.push(x); }); return ''; });
    t = t.replace(/\s*\[[\d,\s]*$/, '');
    var html = '', list = null;
    function close(){ if(list){ html += '</' + list + '>'; list = null; } }
    t.split('\n').forEach(function(ln){
      var m = ln.match(/^\s*[-•*]\s+(.*)$/), n = ln.match(/^\s*\d+[.)]\s+(.*)$/);
      if(m || n){ var tag = m ? 'ul' : 'ol'; if(list !== tag){ close(); html += '<' + tag + '>'; list = tag; } html += '<li>' + inlineMd(m ? m[1] : n[1]) + '</li>'; }
      else { close(); var bm = ln.match(/^\s*\**\s*Beyond your (slides|notes):?\s*\**\s*(.*)$/i); if(bm) html += '<div class="ask-warn"><b>Beyond your slides:</b> ' + inlineMd(bm[2]) + '</div>'; else if(ln.trim()) html += '<p>' + inlineMd(ln) + '</p>'; }
    });
    close();
    return { html: html, cited: cited };
  }
  function errCopy(code){
    switch(code){
      case 'not_granted': return 'Ask AI needs your OK to use Claude. Close and reopen it, then choose Allow.';
      case 'sampling_disabled': case 'not_declared': case 'capability_disabled': case 'capability_removed': return 'Ask AI is not available on this account.';
      case 'rate_limited': return 'You have hit a usage limit for now. Try again a bit later.';
      case 'session_expired': return 'Please sign in to Claude again, then retry.';
      case 'prompt_too_large': return 'That question pulled in too much text. Try a shorter, more specific one.';
      case 'refused': return 'I cannot help with that one. Try asking it differently.';
      case 'empty_completion': return 'No answer came back. Try rephrasing.';
      default: return 'Something went wrong. Tap send to try again.';
    }
  }
  var SUG_BY = { micro:'What is opportunity cost?', mkt:'What is a SWOT analysis?', hr:'What is line authority?', phl:'What are the Four Noble Truths?' };
  function scrollEnd(){ askBody.scrollTop = askBody.scrollHeight; }
  function showIntro(){
    askBody.innerHTML = ''; askNew.hidden = true;
    var cur = activeWeek(), s = [];
    if(cur && SUG_BY[cur.c]) s.push(SUG_BY[cur.c]);
    s.push('Summarize this chapter', 'Quiz me on this chapter');
    var d = document.createElement('div'); d.className = 'ask-intro';
    d.innerHTML = '<b>Ask about this chapter</b>Quick questions, simple answers. It starts from your notes, and goes further when your slides stop.';
    var sg = document.createElement('div'); sg.className = 'ask-sug';
    s.forEach(function(t){ var b = document.createElement('button'); b.type = 'button'; b.textContent = t; sg.appendChild(b); });
    askBody.appendChild(d); askBody.appendChild(sg);
  }
  function setBusy(on){
    askBusy = on; askSend.textContent = on ? '■' : '↑'; askSend.setAttribute('aria-label', on ? 'Stop' : 'Send');
  }
  function addSources(host, cited, passages){
    var box = host.querySelector('.ask-srcs'); box.innerHTML = '';
    cited.filter(function(n){ return passages[n - 1]; }).slice(0, 3).forEach(function(n){
      var p = passages[n - 1], b = document.createElement('button'); b.type = 'button'; b.className = 'ask-src'; b.style.setProperty('--cc', COURSES[p.c].c);
      b.dataset.n = n;
      b.innerHTML = '<i></i><span><b>' + escH(p.sec || p.wl) + '</b><small>' + escH(COURSES[p.c].n + ' · ' + p.wl) + '</small></span><em>Open ↗</em>';
      b._p = p; box.appendChild(b);
    });
  }
  function addFollowups(host){
    $$('.ask-sug.fu', askBody).forEach(function(x){ x.remove(); });
    var sg = document.createElement('div'); sg.className = 'ask-sug fu';
    ['Quiz me on this', 'Explain it simpler', 'Another example'].forEach(function(t){ var b = document.createElement('button'); b.type = 'button'; b.textContent = t; sg.appendChild(b); });
    host.appendChild(sg);
  }
  function ask(question){
    question = question.trim(); if(!question || askBusy || !sampleFn) return;
    if(!turns.length) askBody.innerHTML = '';
    $$('.ask-sug.fu', askBody).forEach(function(x){ x.remove(); });
    askNew.hidden = false;
    var u = document.createElement('div'); u.className = 'ask-m u'; u.textContent = question; askBody.appendChild(u);
    var a = document.createElement('div'); a.className = 'ask-m a';
    a.innerHTML = '<div class="ask-txt"><span class="ask-think">Thinking…</span></div><div class="ask-srcs"></div>';
    askBody.appendChild(a); scrollEnd();
    // look things up with this question plus the one before it, so "explain it simpler" still knows the topic
    var prev = ''; for(var i = turns.length - 1; i >= 0; i--){ if(turns[i].role === 'user'){ prev = turns[i].q || ''; break; } }
    var found = retrieve(/^(quiz me|explain|another|simpler|why|how|what about|and )/i.test(question) && prev ? prev + ' ' + question : question);
    var passages = found.passages; lastPassages = passages;
    var hist = turns.slice(-6).map(function(t){ return { role: t.role, content: t.content }; });
    var input = [{ role: 'user', content: RULES }].concat(hist, [{ role: 'user', content: notesBlock(passages) + '\n\nREADING NOW: ' + (chapterLabel() || 'not on a chapter') + '\n\nQUESTION: ' + question }]);
    window.__askLast = { input: input, passages: passages };
    askCtl = new AbortController(); setBusy(true);
    var txt = a.querySelector('.ask-txt');
    sampleFn(input, { model: MODEL, modelTier: 'quick', cache: false, signal: askCtl.signal, onText: function(up){ var f = fmt(up.text); txt.innerHTML = f.html || '<span class="ask-think">…</span>'; scrollEnd(); } })
      .then(function(res){
        var f = fmt(res.text); txt.innerHTML = f.html;
        turns.push({ role: 'user', content: question, q: question }, { role: 'assistant', content: res.text.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '') });
        addSources(a, f.cited, passages);
        if(res.truncated){ var n = document.createElement('div'); n.className = 'ask-err'; n.textContent = 'The answer was cut short. Ask for a smaller piece.'; a.appendChild(n); }
        addFollowups(a);
      })
      .catch(function(e){
        e = e || {};
        if(e.code === 'cancelled'){ if(!(e.text || '').trim()){ a.remove(); u.remove(); } else { txt.innerHTML = fmt(e.text).html; turns.push({ role:'user', content:question, q:question }, { role:'assistant', content:e.text }); } if(!askBody.children.length) showIntro(); return; }
        if(e.code === 'refused' || !(e.text || '').trim()) txt.innerHTML = ''; else txt.innerHTML = fmt(e.text).html;
        var er = document.createElement('div'); er.className = 'ask-err'; er.textContent = errCopy(e.code); a.appendChild(er);
        if(/^(not_granted|sampling_disabled|not_declared|capability_disabled|capability_removed)$/.test(e.code)){ askFab.hidden = true; askTop.hidden = true; }
      })
      .then(function(){ setBusy(false); askCtl = null; scrollEnd(); });
  }
  function jumpTo(r, toks){
    if(window.__s5 && window.__s5.go){ window.__s5.go(r.c, r.w); }
    else {
      var ct = $('.coursetab[data-course="' + r.c + '"]'); if(ct) ct.click();
      var wt = $('.course-panel[data-course="' + r.c + '"] .weektab[data-week="' + r.w + '"]'); if(wt) wt.click();
    }
    setTimeout(function(){
      var el = r.el;
      if(!el || !document.contains(el)) el = (r.sid && document.getElementById(r.sid)) || null;
      if(!el) return;
      var d = el.closest('details'); while(d){ d.open = true; d = d.parentElement ? d.parentElement.closest('details') : null; }
      var gp = el.closest('.grading-panel');
      if(gp && gp.hidden){ var tb = $('[data-target="' + gp.id + '"]'); if(tb) tb.click(); else gp.hidden = false; }
      el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block:'center' });
      flashAt(el, toks || ['']);
    }, 140);
  }
  function openAsk(){
    if(!sampleFn) return;
    if(sx.classList.contains('open')) closeSX();
    var nd = $('#notes-drawer'); if(nd && !nd.hidden){ var c = $('#nd-close'); if(c) c.click(); }
    if(!turns.length && !askBody.children.length) showIntro();
    askBox.hidden = false; askTop.setAttribute('aria-expanded', 'true'); askFab.setAttribute('aria-expanded', 'true');
    if(!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) setTimeout(function(){ askQ.focus(); }, 30);
  }
  function closeAsk(){
    if(askBox.hidden) return;
    askBox.hidden = true; askTop.setAttribute('aria-expanded', 'false'); askFab.setAttribute('aria-expanded', 'false');
    if(askCtl){ try{ askCtl.abort(); }catch(e){} }
  }
  function toggleAsk(){ if(askBox.hidden) openAsk(); else closeAsk(); }
  function sizeQ(){ askQ.style.height = 'auto'; askQ.style.height = Math.min(askQ.scrollHeight, 120) + 'px'; }

  if(window.claude && typeof window.claude.use === 'function'){
    try{
      window.claude.use('sample').then(function(s){ if(s){ sampleFn = s; askTop.hidden = false; askFab.hidden = false; } }, function(){});
    }catch(e){}
  }
  askTop.addEventListener('click', toggleAsk);
  askFab.addEventListener('click', toggleAsk);
  $('#ask-x').addEventListener('click', closeAsk);
  $('#ask-bg').addEventListener('click', closeAsk);
  askNew.addEventListener('click', function(){ if(askCtl){ try{ askCtl.abort(); }catch(e){} } turns = []; showIntro(); askQ.focus(); });
  askForm.addEventListener('submit', function(e){
    e.preventDefault();
    if(askBusy){ if(askCtl) askCtl.abort(); return; }
    var q = askQ.value; if(!q.trim()) return; askQ.value = ''; sizeQ(); ask(q);
  });
  askQ.addEventListener('input', sizeQ);
  askQ.addEventListener('keydown', function(e){
    if(e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); askForm.requestSubmit ? askForm.requestSubmit() : askForm.dispatchEvent(new Event('submit', {cancelable:true})); }
    else if(e.key === 'Escape'){ e.preventDefault(); closeAsk(); }
  });
  askBody.addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b) return;
    if(b.classList.contains('ask-src') && b._p){
      var p = b._p; jumpTo({ c:p.c, w:p.w, el:p.el, sid:p.sid }, tokensOf(p.text.split(' ').slice(0, 3).join(' ')));
      if(window.matchMedia && matchMedia('(max-width: 640px)').matches) closeAsk();
    } else if(b.closest('.ask-sug')){ ask(b.textContent); }
  });
  var ndFab = $('#notes-fab'); if(ndFab) ndFab.addEventListener('click', closeAsk);
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !askBox.hidden && !sx.classList.contains('open') && !($('#kb') && !$('#kb').hidden)){ closeAsk(); } });

  /* ================================================================== keyboard shortcuts */
  (function(){
    var kb = $('#kb');
    function row(keys, label){ return '<div class="kr"><span>' + label + '</span><span class="ks">' + keys.split(' ').map(function(k){ return '<kbd>' + k + '</kbd>'; }).join('') + '</span></div>'; }
    function ul(items){ return '<ul>' + items.map(function(t){ return '<li>' + t + '</li>'; }).join('') + '</ul>'; }
    function keys(a){ return '<div class="hp-keys">' + a.map(function(r){ return row(r[0], r[1]); }).join('') + '</div>'; }
    function ol(items){ return '<ol class="hp-ol">' + items.map(function(t){ return '<li>' + t + '</li>'; }).join('') + '</ol>'; }
    function btn(name, text){ return '<div class="hp-b"><b>' + name + '</b><span>' + text + '</span></div>'; }
    function step8(n, title, where, line, sec, go, goLabel){
      return '<div class="rd-step"><span class="rd-n">' + n + '</span><div class="rd-b"><b>' + title + '</b><em>' + where + '</em><p>' + line + '</p><div class="rd-a">' +
        (sec ? '<button type="button" data-sec="' + sec + '">How it works</button>' : '') +
        (go ? '<button type="button" class="rd-go" data-go="' + go + '">' + goLabel + '</button>' : '') + '</div></div></div>';
    }
    var SECS = [
      { id:'road', n:'Roadmap', h:'Your roadmap', lead:'Go through it once, top to bottom. After that you mostly use steps 3 and 5.',
        html:'<div class="rd-list">' +
          step8(1, 'Pick your course', 'Course menu, top left (' + OPT + ' C)', 'Pick a course, or <b>Plan</b> for your home screen with what to study today.', 'plan', '', '') +
          step8(2, 'Add your slides', 'Course menu, then Add lecture slides', 'Drop in a PDF or PowerPoint. You get notes and practice questions. <b>Fast</b> is cheaper, <b>Better</b> writes stronger questions.', '', '#open-slides', 'Add slides') +
          step8(3, 'Study a chapter', 'Chapter pill under the course title', 'Read it top to bottom, highlight what matters, then do the <b>self-test</b> at the end. That is what fills your progress.', 'learn', '', '') +
          step8(4, 'Ask AI when you are stuck', 'Blue Ask AI button, bottom right', 'Good for "why", examples and quizzing yourself. It starts from your notes, so check big things against your slides.', 'ask', '#ask-fab', 'Open Ask AI') +
          step8(5, 'Exam mode', 'Top right', 'Pick chapters, set Timed or not, and go. You can also add your own questions from a photo, PDF or text.', 'tools', '#open-exam', 'Open Exam mode') +
          step8(6, 'Before the test', 'Cheat sheet, top right. Plan tab for weak spots and dates', 'Read the cheat sheet, redo what you missed, and check the timeline.', 'time', '#open-sheet', 'Open cheat sheet') +
          step8(7, 'Make it yours', 'Palette icon, top bar', 'Page colour, font, stickers and clean view. There is a dark theme for nights.', '', '#open-look', 'Open Look &amp; feel') +
          step8(8, 'iPad and phone', 'Draw and Notes, bottom right', 'Draw with the Apple Pencil (one finger still scrolls). The floating buttons hide while you scroll. Notes has a sketch page.', 'tools', '', '') +
        '</div><div class="tip">Lost? Tap <b>Roadmap</b> in Help any time. <b>Shortcuts</b> has every key.</div>' },
      { id:'start', n:'Start here', h:'Start here', lead:'Three steps, then every button in one line each.',
        html:'<h4>Your first minute</h4>' + ol([
          'Open the course menu (top left, or press <kbd>' + OPT + '</kbd> <kbd>C</kbd>) and pick <b>Plan</b>. Read <b>Today</b>. It tells you what to study next.',
          'Pick a course, then a chapter from the pill under its title (tap it to see the list). Read it top to bottom.',
          'Do the <b>self-test</b> at the end of the chapter. That is what fills in your progress.']) +
        '<h4>Every button, one line</h4>' +
        btn('Course menu', 'Top left, or press <kbd>' + OPT + '</kbd> <kbd>C</kbd>. Arrow keys and Enter to pick. Also has page colours and this Help.') +
        btn('Search (magnifier)', 'Top bar, small round icon. Find any word in any course. Press <kbd>/</kbd>.') +
        btn('Palette icon', 'Top bar. Page colour, font, stickers and Clean view (fewer boxes).') +
        btn('Cheat sheet', 'Top right. One page of definitions, traps and tricks.') +
        btn('Exam mode', 'Top right. Timed or untimed practice questions.') +
        btn('Ask AI', 'Blue button, bottom right. Ask a quick question about the chapter.') +
        btn('Notes', 'Bottom right, under Ask AI. Your own notepad.') +
        btn('Up arrow', 'Above Ask AI. Takes you back to the top of the page.') },
      { id:'plan', n:'Plan tab', h:'Plan tab', lead:'Your home screen. Open it first when you sit down to study.',
        html:'<h4>What to do</h4>' + ol([
          'Open the course menu and tap <b>Plan</b>.',
          'Read <b>Today</b>. Do those chapters first.',
          'Tap <b>Due for review</b> to practise the questions that are ready to come back.',
          'Under <b>Study a chapter</b>, pick a chapter and a way to study it. Each way is a loop of 3 steps with buttons.']) +
        '<h4>What each box means</h4>' +
        btn('Today', 'The next thing to study.') +
        btn('Deadlines and exams', 'Your dates with a countdown. "est." means the date is a guess, so check D2L.') +
        btn('Next tests', 'How ready you are for each test, in percent.') +
        btn('Weak spots', 'Topics you keep missing.') +
        btn('Study a chapter', 'Pick a chapter and a way to study it. Each way is a loop of 3 steps. "What is working for you" fills in after you have tried a few.') +
        '<div class="tip">The percents come from the questions you answer. A chapter with no answers yet shows 0%.</div>' },
      { id:'learn', n:'Practise', h:'Practise a chapter', lead:'Learn it, test it, and let the page bring it back later.',
        html:'<h4>What to do</h4>' + ol([
          'Read the chapter. Open the <b>worked examples</b> one step at a time, after you try them on paper.',
          'Tap the <b>key term</b> cards. Open the answer, then ask yourself if you knew it.',
          'Do the <b>self-test</b> at the end. Multiple choice is marked for you. For written answers, compare with the model answer and mark yourself.',
          'Tap <b>Sure</b> or <b>Guessing</b> before you answer. Wrong answers you were sure about get flagged in Plan.']) +
        '<h4>Coming back to it</h4>' + ul([
          'A right answer comes back after 1 day, then 3, 7, 14 and 30. A miss comes back right away.',
          'The number on the Exam mode button is how many are ready.',
          '<b>Reset this test</b> at the end of a chapter starts it over.']) },
      { id:'links', n:'Connections', h:'Connections tab', lead:'The last item in every course\'s chapter list. It shows how the chapters fit together.',
        html:'<h4>What to do</h4>' + ol([
          'Open a course, tap the chapter pill and pick <b>Connections</b> (last in the list).',
          'Read the line of chapters left to right.',
          'Check the table: where you first meet each idea, and where it comes back.',
          'Try the <b>one case</b> yourself before you read the answer.']) +
        '<h4>When to use it</h4>' + ul([
          'After the chapters, and the night before a test.',
          'When a question seems to mix two chapters.']) +
        '<div class="tip">This tab has no questions, so it is not in Exam mode or your percents. Search does find it.</div>' },
      { id:'time', n:'Timeline', h:'Timeline and dates', lead:'Every assignment and test in a course, on one line.',
        html:'<h4>What to do</h4>' + ol([
          'Open a course, tap the chapter pill and pick <b>Info &amp; grades</b> (first in the list).',
          'Scroll to <b>Timeline</b> at the bottom.',
          'Find the green <b>Today</b> marker. Everything to its right is still coming.']) +
        '<h4>How to read it</h4>' +
        btn('Big dot', 'A test or an exam.') +
        btn('Small dot', 'An assignment or smaller graded item.') +
        btn('Ring (empty dot)', 'The date is an estimate. Check D2L.') +
        btn('Grey dot', 'Already done.') +
        '<div class="tip">The Done, Soon and Upcoming tags in the key dates list update by themselves from the date. The same dates show in the Plan tab, with a countdown.</div>' },
      { id:'hl', n:'Highlight', h:'Highlight', lead:'Mark what matters, in your own colours.',
        html:'<h4>What to do</h4>' + ol([
          'Select any text in the notes. A small bar pops up.',
          'Pick yellow, green, pink or blue. (Keys <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> also work.)',
          'To remove one, select it again and tap <b>Clear</b>.']) +
        '<div class="tip">Highlights stay in this browser on this device only. A different laptop or phone starts empty.</div>' },
      { id:'search', n:'Search', h:'Search', lead:'Find a word across all five courses.',
        html:'<h4>What to do</h4>' + ol([
          'Tap <b>Search</b> (top bar) or press <kbd>/</kbd>.',
          'Type a word or two. Tap a course chip to narrow it down.',
          'Tap a result, or move with <kbd>↑</kbd> <kbd>↓</kbd> and press <kbd>Enter</kbd>. It jumps to the spot and flashes it.']) },
      { id:'ask', n:'Ask AI', h:'Ask AI', lead:'Quick questions without leaving the page.',
        html:'<h4>What to do</h4>' + ol([
          'Tap the blue <b>Ask AI</b> button, bottom right, above Notes. (Or press <kbd>' + OPT + '</kbd> <kbd>A</kbd>.)',
          'Type your question and send. It already knows which chapter you are on.',
          'Tap a source under the answer to open that part of your notes.',
          'Close it with <b>Close</b> or <kbd>Esc</kbd>.']) +
        '<h4>Good to know</h4>' + ul([
          'It starts from your notes. Anything beyond your slides sits in a yellow box.',
          'Best for "why" questions, examples and quizzing yourself. Check important things against your slides.']) +
        '<div class="tip">It runs on your own Claude account, so you may need to allow it the first time. If it is not available for you, the button does not show.</div>' },
      { id:'tools', n:'Notes & tools', h:'Notes, cheat sheet, exam, clean view', lead:'The study tools, one at a time.',
        html:'<h4>Notes</h4>' + ol([
          'Tap <b>Notes</b> (bottom right).',
          'Pick <b>Type</b> for this chapter, or <b>All notes</b> to see every note. It saves by itself.',
          'The quick buttons add a tag: Exam hint, Ask, Example or Def.']) +
        '<h4>Draw on any page (Apple Pencil)</h4>' + ol([
          'Open any chapter and tap <b>Draw</b> (pencil button above Ask AI). The tool bar comes up at the bottom.',
          'Pick <b>Pen</b>, <b>Marker</b> or <b>Eraser</b>. Pick a thickness, and tap the colour circle for colours. Press harder with the Pencil for a thicker line.',
          'The eraser has two modes: <b>Part</b> (the default) rubs out only the bit you touch. <b>Stroke</b> removes a whole line.',
          'Pencil draws and one finger scrolls. Turn <b>Finger</b> on to draw with a finger, then use two fingers to scroll.',
          '<b>Undo</b> and <b>Redo</b> are the arrows on the left. The bin clears the page (tap it twice). Tap <b>Done</b> when you are finished.']) +
        '<div class="tip">Drawings stay on the chapter you drew them on and sync with your notes. If a section opens or closes later, the drawing does not move with it.</div>' +
        '<h4>Sketch page in Notes</h4>' + ol([
          'Open <b>Notes</b> and tap <b>Sketch</b> for a blank page (graph, lined, dots or plain). It uses the same tool bar. The colour circle also picks the paper.']) +
        '<h4>Cheat sheet</h4>' + ol([
          'Tap <b>Cheat sheet</b> (top right).',
          'Pick the chapters you want.',
          'Read it, or tap <b>Copy as text</b> to paste it into your own notes.']) +
        '<h4>Exam mode</h4>' + ol([
          'Tap <b>Exam mode</b> (top right).',
          'Pick courses and chapters, then which questions: all, due for review, missed, or not tried.',
          'Choose multiple choice, written or both, how many, and Timed if you want.',
          'At the end, tap <b>Retry the ones I missed</b> to go over just those.']) +
        '<h4>Clean view</h4>' + ol([
          'Tap the palette icon in the top bar and switch on <b>Clean view</b> (or press <kbd>' + OPT + '</kbd> <kbd>V</kbd>).',
          'Most boxes disappear, every word stays. Tap it again to bring the boxes back. It remembers your choice.']) },
      { id:'keys', n:'Shortcuts', h:'Keyboard shortcuts', lead:isMac ? 'Mac keys. ⌥ is the Option key.' : 'Alt is the modifier key.',
        html:'<div class="kb-g"><div><h4>Chapters</h4>' + row('[', 'Previous chapter') + row(']', 'Next chapter') +
          '<h4>Tools</h4>' + row(OPT + ' C', 'Course menu') + row(OPT + ' T', 'Course menu (also)') + row('/', 'Search') + row(OPT + ' K', 'Search (also)') + row(OPT + ' A', 'Ask AI') + row(OPT + ' N', 'Notes') + row(OPT + ' S', 'Cheat sheet') + row(OPT + ' E', 'Exam mode') + row(OPT + ' V', 'Clean view') + row('Esc', 'Close any panel') + '</div>' +
          '<div><h4>Highlight (select text first)</h4>' + row('1', 'Yellow') + row('2', 'Green') + row('3', 'Pink') + row('4', 'Blue') + row('0', 'Clear highlight') +
          '<h4>Inside the course menu, Search and Ask AI</h4>' + row('↑ ↓', 'Move through the list') + row('↵', 'Pick / open / send') + '</div></div>' +
          '<div class="tip">Shortcuts stay off while you are typing in a box, so they never get in the way of your notes. On a phone you do not need any of them.</div>' },
      { id:'saved', n:'Saved & privacy', h:'Saved and privacy', lead:'Where your stuff is kept.',
        html:'<h4>Follows you (when you are signed in to Claude)</h4>' + ul([
          'Your notes and practice progress. They show up on your other devices.',
          'The save status in the Notes panel tells you when they are synced.']) +
        '<h4>Only in this browser</h4>' + ul([
          'Highlights, Clean view and the last course you opened.',
          'Clearing site data or using a private window wipes these.']) +
        '<div class="tip">Nothing you do here is visible to classmates.</div>' +
        '<h4>Ask AI</h4>' + ul([
          'Your question and the matching bits of your notes are sent to Claude to get the answer. It counts toward your own Claude usage. General knowledge can be wrong or differ from what your prof wants.']) }
    ];
    var hpOn = 'road';
    function hpRender(id){
      hpOn = id; var s = SECS.filter(function(x){ return x.id === id; })[0] || SECS[0];
      kb.innerHTML = '<div class="kb hp" role="document"><div class="kb-h"><b>Help</b><small>How to use these study maps</small><button class="ask-btn" type="button" id="kb-x">Esc</button></div>' +
        '<div class="hp-n" role="tablist">' + SECS.map(function(x){ return '<button type="button" role="tab" data-sec="' + x.id + '" aria-selected="' + (x.id === s.id) + '"' + (x.id === s.id ? ' class="on"' : '') + '>' + x.n + '</button>'; }).join('') + '</div>' +
        '<div class="hp-c" role="tabpanel"><h3>' + s.h + '</h3><p class="lead">' + s.lead + '</p>' + s.html + '</div></div>';
      var on = kb.querySelector('.hp-n .on'); if(on && on.scrollIntoView){ try{ on.scrollIntoView({block:'nearest', inline:'nearest'}); }catch(e){} }
    }
    function showKb(on, sec){ kb.hidden = !on; if(on){ hpRender(sec || hpOn); var x = $('#kb-x'); if(x) x.focus(); } }
    kb.addEventListener('click', function(e){ if(e.target === kb || e.target.id === 'kb-x'){ showKb(false); return; } var gb = e.target.closest('[data-go]'); if(gb){ var gs = gb.dataset.go; showKb(false); setTimeout(function(){ var t = $(gs); if(t) t.click(); }, 60); return; } var sb = e.target.closest('[data-sec]'); if(sb) hpRender(sb.dataset.sec); });
    var hbtn = $('#open-help'); if(hbtn) hbtn.addEventListener('click', function(){ var pk = $('#course-pick'); if(pk && pk.getAttribute('aria-expanded') === 'true') pk.click(); showKb(true, 'road'); });
    var tip = function(sel, t){ var n = $(sel); if(n) n.title = t; };
    tip('#open-search', 'Search ( / or ' + OPT + 'K )'); tip('#open-ask', 'Ask AI ( ' + OPT + 'A )'); tip('#ask-fab', 'Ask AI ( ' + OPT + 'A )');
    tip('#open-sheet', 'Cheat sheet ( ' + OPT + 'S )'); tip('#open-exam', 'Exam mode ( ' + OPT + 'E )'); tip('#notes-fab', 'Notes ( ' + OPT + 'N )'); tip('#course-pick', 'Course menu ( ' + OPT + 'C )');
    var cvb = $('#toggle-clean'); if(cvb) cvb.setAttribute('data-tip', OPT + 'V');
    function overlayOpen(){ var ex = $('#exam'), sh = $('#sheet'); return (ex && !ex.hidden) || (sh && !sh.hidden) || sx.classList.contains('open') || !kb.hidden; }
    function step(dir){
      var cp = $('.course-panel:not([hidden])'); if(!cp) return;
      var c = cp.dataset.course, tabs = $$('.weektabs[data-scope="' + c + '"] .weektab', cp); if(tabs.length < 2) return;
      var at = -1; tabs.forEach(function(t, i){ if(t.classList.contains('active')) at = i; });
      var to = at + dir; if(at < 0 || to < 0 || to >= tabs.length) return;
      if(window.__s5 && window.__s5.go) window.__s5.go(c, tabs[to].dataset.week); else tabs[to].click();
    }
    // course menu: Up/Down/Home/End move through the rows, Enter picks (native button), Esc closes (base page)
    document.addEventListener('keydown', function(e){
      var nav = $('#coursetabs'); if(!nav || !nav.classList.contains('open') || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if(['ArrowDown','ArrowUp','Home','End'].indexOf(e.key) < 0) return;
      var items = $$('button', nav).filter(function(b){ return b.offsetParent !== null; }); if(!items.length) return;
      var at = items.indexOf(document.activeElement), to = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (at + 1) % items.length : (at <= 0 ? items.length - 1 : at - 1);
      e.preventDefault(); items[to].focus();
    });
    try{ localStorage.setItem('s5v72-t','1'); if(!localStorage.getItem('s5v72-road')){ localStorage.setItem('s5v72-road','1'); setTimeout(function(){ if(kb.hidden) showKb(true, 'road'); }, 1200); } }catch(e){}
    var HLMAP = { '1':'y', '2':'g', '3':'p', '4':'b', '0':'x' };
    document.addEventListener('keydown', function(e){
      if(e.isComposing || e.defaultPrevented && e.key !== 'Escape') return;
      if(e.key === 'Escape'){ if(!kb.hidden){ e.preventDefault(); showKb(false); } return; }
      var t = e.target, typingNow = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if(typingNow || e.metaKey || e.ctrlKey) return;
      if(e.altKey){
        if(e.shiftKey || overlayOpen()) return;
        var done = true;
        switch(e.code){
          case 'KeyK': openSX(document.activeElement); break;
          case 'KeyA': if(sampleFn) toggleAsk(); else done = false; break;
          case 'KeyN': { var nd = $('#notes-drawer'); var b = nd && !nd.hidden ? $('#nd-close') : $('#notes-fab'); if(b) b.click(); else done = false; break; }
          case 'KeyS': { var sb = $('#open-sheet'); if(sb && !sb.hidden) sb.click(); else done = false; break; }
          case 'KeyE': { var eb = $('#open-exam'); if(eb) eb.click(); else done = false; break; }
          case 'KeyV': { var cb = $('#toggle-clean'); if(cb) cb.click(); else done = false; break; }
          case 'KeyC':
          case 'KeyT': { var pk = $('#course-pick'); if(pk){ pk.click(); setTimeout(function(){ var open = $('#coursetabs') && $('#coursetabs').classList.contains('open'), f = open ? ($('#coursetabs .coursetab.active') || $('#coursetabs button')) : pk; if(f) f.focus(); }, 0); } else done = false; break; }
          default: done = false;
        }
        if(done) e.preventDefault();
        return;
      }
      if(overlayOpen()) return;
      if(e.key === '[' || e.key === ']'){ e.preventDefault(); step(e.key === ']' ? 1 : -1); return; }
      if(HLMAP[e.key] && !bar.hidden && pend){ e.preventDefault(); apply(HLMAP[e.key]); }
    });
  })();
})();
</script>
