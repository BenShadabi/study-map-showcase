(function(){
  'use strict';
  var root = document.querySelector('.viz-root');
  root.classList.add('js');

  /* ------------------------------------------------------------------ config */
  var COURSES = {
    micro:{name:'Microeconomics', cc:'var(--blue)'},
    mkt:{name:'Marketing', cc:'var(--orange)'},
    hr:{name:'HR Management', cc:'var(--aqua)'},
    sa:{name:'Search Analytics', cc:'var(--grn)'},
    phl:{name:'Philosophy', cc:'var(--yellow)'}
  };
  var TESTS = [
    {course:'micro', title:'Test 1 · Ch. 1–4', date:'2026-10-16', weeks:['micro:ch1','micro:ch2','micro:ch3','micro:ch4']},
    {course:'phl', title:'Test 1 · online multiple choice', date:'2026-10-16', note:'Window Oct 16–19', weeks:['phl:w12','phl:w3','phl:w4','phl:w5']},
    {course:'mkt', title:'Midterm · 26%', date:'2026-10-22', note:'Ch. 1–5, 7–9, 11', weeks:['mkt:w1','mkt:w2','mkt:w3','mkt:w4','mkt:w5','mkt:w6','mkt:mr']},
    {course:'hr', title:'Midterm · Ch. 1–7', date:'2026-10-22', note:'In class', weeks:['hr:ch1','hr:ch2','hr:ch3','hr:ch4','hr:ch5','hr:ch6','hr:ch7']}
  ];
  var BOX = [0,1,3,7,14,30];          // days until a question is due again, by box
  var DAY = 86400000;

  /* ------------------------------------------------------------------ helpers */
  function $(s, r){ return (r||document).querySelector(s); }
  function $$(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function esc(t){ var d=document.createElement('div'); d.textContent=t==null?'':String(t); return d.innerHTML; }
  function el(tag, cls, html){ var e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function shuffle(a){ a=a.slice(); for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  function pad2(n){ return (n<10?'0':'')+n; }

  /* ------------------------------------------------------------------ state + storage */
  var S = { notes:{}, prog:{} };
  try{ S.notes = JSON.parse(lsGet('s5v2-notes')||'{}')||{}; }catch(e){}
  try{ S.prog = JSON.parse(lsGet('s5v2-prog')||'{}')||{}; }catch(e){}
  var dbState = { ok:false, uid:null, notesRef:null, progRef:null, timers:{}, busy:{}, dirty:{} };

  function setSaveStatus(t){
    var a=$('#nd-status'); if(a) a.textContent=t;
    var b=$('#plan-saved-t'); if(b) b.textContent = (dbState.ok ? t : 'Progress saves on this device');
  }
  function saveLocal(kind){ lsSet(kind==='notes'?'s5v2-notes':'s5v2-prog', JSON.stringify(kind==='notes'?S.notes:S.prog)); }
  function scheduleRemote(kind){
    saveLocal(kind);
    if(kind==='progress'){ try{ statTick(); }catch(e){} }
    if(!dbState.ok){ setSaveStatus('Saved on this device'); return; }
    setSaveStatus('Saving…');
    dbState.dirty[kind]=true;
    clearTimeout(dbState.timers[kind]);
    dbState.timers[kind]=setTimeout(function(){ flushRemote(kind); }, 400);
  }
  function flushRemote(kind){
    if(!dbState.ok) return;
    if(dbState.busy[kind]){ dbState.timers[kind]=setTimeout(function(){ flushRemote(kind); }, 400); return; }
    if(!dbState.dirty[kind]) return;
    dbState.dirty[kind]=false; dbState.busy[kind]=true;
    var ref = kind==='notes' ? dbState.notesRef : dbState.progRef;
    function done(ok){
      dbState.busy[kind]=false; setSaveStatus(ok ? 'Saved \u00b7 synced' : 'Saved on this device');
      var pend = dbState.pend && dbState.pend[kind]; if(pend){ dbState.pend[kind]=null; applyRemote(kind, pend); }
    }
    // read what is online first, so a stale device never wipes drawings made on another one
    Promise.resolve(ref.get()).then(function(snap){
      try{ if(snap && snap.exists && mergeRemote(kind, snap.data().data)){ saveLocal(kind); if(kind==='notes') refreshNotesUI(); else refreshAll(); } }catch(e){}
    }, function(){}).then(function(){
      return ref.set({ data: JSON.parse(JSON.stringify(kind==='notes'?S.notes:S.prog)), saved: Date.now() });
    }).then(function(){ done(true); }, function(){ done(false); });
  }
  function applyRemote(kind, data){
    if(mergeRemote(kind, data)){ saveLocal(kind); if(kind==='notes') refreshNotesUI(); else refreshAll(); }
  }
  function flushAll(){ ['notes','progress'].forEach(function(k){ if(dbState.dirty[k]){ clearTimeout(dbState.timers[k]); flushRemote(k); } }); }
  function mergeRemote(kind, remote){
    if(!remote || typeof remote!=='object') return false;
    var local = kind==='notes' ? S.notes : S.prog, changed=false, key = kind==='notes' ? 'u' : 't';
    Object.keys(remote).forEach(function(k){
      var r=remote[k], l=local[k];
      if(!l || (r && (r[key]||0) > (l[key]||0))){ local[k]=r; changed=true; }
    });
    return changed;
  }
  function initDb(){
    if(!window.claude || !window.claude.use) return;
    Promise.all([window.claude.use('user'), window.claude.use('db')]).then(function(r){
      var user=r[0], db=r[1]; if(!user || !db) return null;
      return user.id().then(function(uid){
        if(!uid) return null;
        dbState.uid=uid;
        dbState.notesRef = db.doc('data/users/'+uid+'/notes');
        dbState.progRef = db.doc('data/users/'+uid+'/progress');
        dbState.statsRef = db.doc('data/users/'+uid+'/stats');
        dbState.impRef = db.doc('data/users/'+uid+'/imports');
        dbState.stkRef = db.doc('data/users/'+uid+'/stickers');
        dbState.opRef = db.doc('data/users/'+uid+'/onepager');
        return Promise.all([dbState.notesRef.get(), dbState.progRef.get()]).then(function(snaps){
          dbState.ok = true; try{ statPull(); }catch(e){} try{ impPull(); }catch(e){} try{ stkPull(); }catch(e){} try{ opPull(); }catch(e){}
          var n = snaps[0].exists ? snaps[0].data().data : null, p = snaps[1].exists ? snaps[1].data().data : null;
          var c1 = mergeRemote('notes', n), c2 = mergeRemote('progress', p);
          if(c1) saveLocal('notes'); if(c2) saveLocal('progress');
          // push anything only we have
          dbState.dirty.notes = true; dbState.dirty.progress = true;
          flushRemote('notes'); flushRemote('progress');
          setSaveStatus('Saved · synced');
          refreshAll(); refreshNotesUI();
          dbState.notesRef.onSnapshot(function(s){
            if(s.exists){ dbState.pend = dbState.pend || {}; if(dbState.busy.notes) dbState.pend.notes = s.data().data; else applyRemote('notes', s.data().data); }
          }, function(){});
          dbState.progRef.onSnapshot(function(s){
            if(s.exists){ dbState.pend = dbState.pend || {}; if(dbState.busy.progress) dbState.pend.progress = s.data().data; else applyRemote('progress', s.data().data); }
          }, function(){});
        });
      });
    }).catch(function(){ /* stay local */ });
  }

  /* ------------------------------------------------------------------ navigation */
  var cur = { course:'micro', week:null };
  var weekNames = {};   // 'course:week' -> label
  function panelKey(c,w){ return c+':'+w; }
  function activeWeek(c){
    var p = $('.course-panel[data-course="'+c+'"] .week-panel:not([hidden])');
    return p ? p.dataset.week : null;
  }
  function showCourse(id, opts){
    opts = opts||{};
    $$('.coursetab').forEach(function(b){ b.classList.toggle('active', b.dataset.course===id); });
    $$('.course-panel').forEach(function(p){ p.hidden = p.dataset.course!==id; });
    cur.course = id; cur.week = activeWeek(id);
    updatePicker(); closePicker();
    if(!opts.silent) lsSet('s5-course', id);
    if(id==='plan') renderPlan();
    if(opts.scroll) window.scrollTo({top:0, behavior:'smooth'});
    onNav();
  }
  function updatePicker(){
    var a = $('.coursetab.active'), pk = $('#course-pick'); if(!a || !pk) return;
    var full = a.textContent.trim(), SHORT = {'Microeconomics':'Micro','Search Analytics':'Analytics','HR Management':'HR'};
    $('.pn', pk).innerHTML = '<span class="pf">'+esc(full)+'</span><span class="ps">'+esc(SHORT[full]||full)+'</span>';
    pk.setAttribute('aria-label', 'Course: '+full+'. Change course');
    pk.style.setProperty('--tc', a.style.getPropertyValue('--tc') || 'var(--gold)');
  }
  function openPicker(){ var m=$('#coursetabs'), pk=$('#course-pick'); m.classList.add('open'); pk.setAttribute('aria-expanded','true'); }
  function closePicker(){ var m=$('#coursetabs'), pk=$('#course-pick'); if(!m||!pk) return; m.classList.remove('open'); pk.setAttribute('aria-expanded','false'); }
  function showWeek(scope, id, opts){
    opts = opts||{};
    var course = $('.course-panel[data-course="'+scope+'"]'); if(!course) return;
    $$('.weektabs[data-scope="'+scope+'"] .weektab', course).forEach(function(b){ b.classList.toggle('active', b.dataset.week===id); });
    $$('.week-panel', course).forEach(function(p){ var on=p.dataset.week===id; p.hidden=!on; p.classList.toggle('active', on); });
    lsSet('s5-week-'+scope, id);
    if(cur.course===scope) cur.week = id;
    if(opts.scroll){ var nav=$('.chap[data-scope="'+scope+'"]', course) || $('.weektabs[data-scope="'+scope+'"]', course); if(nav && nav.getClientRects().length) nav.scrollIntoView({behavior:'smooth', block:'start'}); }
    var a = $('.weektabs[data-scope="'+scope+'"] .weektab.active', course); if(a && a.scrollIntoView) { try{ a.scrollIntoView({block:'nearest', inline:'nearest'}); }catch(e){} }
    if(typeof chapSync === 'function') chapSync(scope);
    onNav();
  }
  function go(c, w, qid){
    showCourse(c, {silent:false});
    if(w && String(w).indexOf('imp-') !== 0) showWeek(c, w);
    window.scrollTo({top:0});
    if(qid){
      setTimeout(function(){
        var n = $('.q[data-qid="'+qid+'"]'); if(n){ n.scrollIntoView({behavior:'smooth', block:'center'}); n.style.outline='2px solid var(--gold)'; setTimeout(function(){ n.style.outline=''; }, 2200); }
      }, 80);
    }
  }
  function onNav(){ if(typeof renderTimelines==='function') renderTimelines(); refreshNotesUI(); updateFab(); setupSpy(); var sb=$('#open-sheet'); if(sb) sb.hidden = false; var df=$('#draw-fab'); if(df) df.hidden = cur.course==='plan' || !cur.week; if(typeof PG!=='undefined' && PG.ready){ if(PG.on) pgExit(); else pgSync(); } }

  /* ------------------------------------------------------------------ panel enhancement */
  var Q = [];   // all questions
  function enhancePanel(panel, course){
    var week = panel.dataset.week, key = panelKey(course, week);
    panel.dataset.key = key;
    var tc = COURSES[course] ? COURSES[course].cc : 'var(--gold)';
    panel.style.setProperty('--tc', tc);

    // phone: tables turn into stacked cards, so each cell needs its column name
    $$('table.wt', panel).forEach(function(t){
      var ths = $$('thead th', t).map(function(h){ return h.textContent.replace(/\s+/g,' ').trim(); });
      var rows = $$('tbody tr', t), ok = ths.length>1 && rows.length>0;
      rows.forEach(function(r){
        var cells = Array.prototype.filter.call(r.children, function(c){ return c.tagName==='TD' || c.tagName==='TH'; });
        if(cells.length!==ths.length || cells.some(function(c){ return c.rowSpan>1 || c.colSpan>1; })) ok = false;
      });
      if(!ok) return;
      rows.forEach(function(r){
        Array.prototype.forEach.call(r.children, function(c, i){ c.setAttribute('data-label', ths[i]); });
      });
      t.classList.add('stack');
    });

    // wrap children
    var main = el('div','wp-main');
    while(panel.firstChild) main.appendChild(panel.firstChild);
    panel.appendChild(main);

    // numbering
    var outerSec = panel.closest('section');
    var secs = $$('section', main).filter(function(s){ return $('.section-head', s) && s.parentElement.closest('section')===outerSec; });
    var n = 0;
    secs.forEach(function(s){
      var h = $('.section-head', s), num = $('.num', h), h2 = $('h2', h);
      if(!h2) return;
      n++;
      if(!num){ num = el('span','num'); h.insertBefore(num, h.firstChild); }
      num.textContent = pad2(n);
      if(!s.id) s.id = key.replace(':','-')+'-s'+n;
    });

    // rail + mobile jump
    var rail = el('aside','wp-rail'); rail.appendChild(el('h4',null,'On this page'));
    var jump = el('select','wp-jump'); jump.setAttribute('aria-label','Jump to a section');
    jump.appendChild(new Option('Jump to a section…',''));
    secs.forEach(function(s){
      var h2=$('.section-head h2', s); if(!h2) return;
      var a = el('a',null, esc(h2.textContent)); a.dataset.target = s.id; a.href='#'; a.addEventListener('click', function(e){ e.preventDefault(); s.scrollIntoView({behavior:'smooth', block:'start'}); });
      rail.appendChild(a);
      jump.appendChild(new Option(h2.textContent, s.id));
    });
    jump.addEventListener('change', function(){ if(jump.value){ var t=document.getElementById(jump.value); if(t) t.scrollIntoView({behavior:'smooth', block:'start'}); jump.value=''; } });
    panel.insertBefore(rail, main);
    main.insertBefore(jump, main.firstChild);
    panel.classList.add('has-rail');

    // worked examples
    $$('.worked', main).forEach(function(w){ mountWorked(w); });
    $$('.worked-try', main).forEach(function(t){ mountTry(t); });

    // self-test: parse authored questions
    var qs = $$('.q', main);
    qs.forEach(function(qe, i){
      var q = parseQ(qe, key, i);
      Q.push(q);
      qe.dataset.qid = q.id;
    });
    $$('.selftest', main).forEach(function(st){
      if(!$('.st-head', st)){
        var head = el('div','st-head');
        head.appendChild(el('span','st-score',''));
        var rb = el('button','btn',''); rb.type='button'; rb.textContent='Reset this test'; rb.addEventListener('click', function(){ resetPanelQs(key, st.classList.contains('pearson') ? st : null); });
        head.appendChild(rb);
        var sub = $('.section-sub', st);
        if(sub) sub.after(head); else st.insertBefore(head, $('.q', st));
      }
    });
    qs.forEach(function(qe){ renderQ(qe, qById(qe.dataset.qid), 'chapter'); });

    // callout tags: auto-add labels if authors left them out
    return {panel:panel, main:main, key:key};
  }

  function mountWorked(w){
    var steps = $$('.worked-steps > li', w), ans = $('.worked-ans', w), idx = 0;
    if(!steps.length) return;
    steps.forEach(function(li){ li.classList.add('hid'); });
    if(ans) ans.classList.add('hid');
    var bar = el('div','worked-bar');
    var btn = el('button','btn solid',''); btn.type='button';
    var all = el('button','btn',''); all.type='button'; all.textContent='Show everything';
    var hint = el('span','hint','Try it on paper first, then reveal one step at a time.');
    bar.appendChild(btn); bar.appendChild(all); bar.appendChild(hint);
    var anchor = $('.worked-steps', w); anchor.after(bar);
    function paint(){
      steps.forEach(function(li,i){ li.classList.toggle('hid', i>=idx); });
      var done = idx>=steps.length;
      if(ans) ans.classList.toggle('hid', !done);
      btn.textContent = done ? 'Hide steps and try again' : (idx===0 ? 'Show step 1 of '+steps.length : 'Show step '+(idx+1)+' of '+steps.length);
      all.hidden = done;
      hint.hidden = idx>0;
    }
    btn.addEventListener('click', function(){ if(idx>=steps.length) idx=0; else idx++; paint(); });
    all.addEventListener('click', function(){ idx=steps.length; paint(); });
    paint();
    // keep the answer block after the bar
    if(ans) bar.after(ans);
  }
  function mountTry(t){
    var a = $('.try-a', t); if(!a) return;
    a.classList.add('hid');
    var b = el('button','btn',''); b.type='button'; b.textContent='Show answer';
    var q = $('.try-q', t); (q||t).after(b);
    b.addEventListener('click', function(){ var hid=a.classList.toggle('hid'); b.textContent = hid ? 'Show answer' : 'Hide answer'; });
  }

  /* ------------------------------------------------------------------ questions */
  function parseQ(qe, key, i){
    var kind = qe.dataset.kind || (qe.querySelector('.q-opts') ? 'mcq' : 'short');
    var lvl = parseInt(qe.dataset.lvl||'1',10)||1;
    var text = $('.q-text', qe), exp = $('.q-exp', qe);
    var opts = $$('.q-opts > li', qe).map(function(li){ return { html: li.innerHTML, ok: li.hasAttribute('data-correct') }; });
    if(kind==='mcq' && !opts.some(function(o){ return o.ok; })) { kind='short'; }
    if(kind==='multi' && opts.filter(function(o){ return o.ok; }).length<2) { kind='short'; }
    if(kind==='num' && isNaN(parseFloat(qe.dataset.answer))) { kind='short'; }
    return { id: key+'#'+(i+1), key: key, course: key.split(':')[0], week: key.split(':')[1], kind: kind, lvl: lvl,
             text: text ? text.innerHTML : '', exp: exp ? exp.innerHTML : '', opts: opts, tag: qe.dataset.tag || '', src: qe.dataset.src || '',
             ans: parseFloat(qe.dataset.answer), tol: parseFloat(qe.dataset.tol||'0')||0, unit: qe.dataset.unit || '' };
  }
  function qById(id){ for(var i=0;i<Q.length;i++) if(Q[i].id===id) return Q[i]; return null; }
  var KIND = { mcq:'Multiple choice', multi:'Select all that apply', num:'Number answer', short:'Short answer', apply:'Apply it', explain:'Explain it' };

  function record(q, grade, conf){
    var r = S.prog[q.id] || {b:0, n:0, e:0};
    r.n = (r.n||0)+1; r.t = Date.now(); r.s = grade; r.c = conf || null;
    if(grade==='miss'){ r.m = (r.m||0)+1; if(conf==='sure') r.sw = (r.sw||0)+1; }
    if(grade==='ok'){ r.b = Math.min((r.b||0)+1, BOX.length-1); r.e = 1; }
    else if(grade==='miss'){ r.b = 0; }
    S.prog[q.id] = r;
    if(typeof lpTrack==='function') lpTrack(q, grade);
    scheduleRemote('progress');
    refreshAll();
  }
  function resetPanelQs(key, root){
    var els = $$('.week-panel[data-key="'+key+'"] .q');
    if(root) els = els.filter(function(qe){ return root.contains(qe); });
    var ids = {}; els.forEach(function(qe){ ids[qe.dataset.qid] = 1; });
    Q.filter(function(q){ return q.key===key && (!root || ids[q.id]); }).forEach(function(q){ delete S.prog[q.id]; });
    scheduleRemote('progress');
    els.forEach(function(qe){ renderQ(qe, qById(qe.dataset.qid), 'chapter'); });
    refreshAll();
  }

  // renders the interactive card into container; mode = 'chapter' | 'exam'
  function renderQ(cont, q, mode, hooks){
    hooks = hooks || {};
    if(!q) return;
    cont.innerHTML = '';
    cont.dataset.qid = q.id;
    var prev = S.prog[q.id];
    var top = el('div','q-top');
    var qn = hooks.num, qt = hooks.of, stBox = (!qn && cont.closest) ? cont.closest('.selftest') : null;
    if(stBox){ var siblings = $$('.q', stBox); qn = siblings.indexOf(cont) + 1; qt = siblings.length; }
    if(!qn){ qn = parseInt(String(q.id).split('#')[1], 10); qt = Q.filter(function(z){ return z.key===q.key; }).length; }
    if(qn) top.appendChild(el('span','q-no','Q'+qn+(qt ? ' of '+qt : '')));
    top.appendChild(el('span','q-kind', KIND[q.kind] || 'Question'));
    top.appendChild(el('span','q-lvl', ['','recall','understand','apply'][q.lvl] || ''));
    if(q.src) top.appendChild(el('span','q-src', q.src));
    var st = el('span','q-state',''); top.appendChild(st);
    if(mode !== 'exam'){ var shb = el('button','q-shr','Share'); shb.type = 'button'; shb.setAttribute('aria-label','Share this question as a picture'); shb.addEventListener('click', function(){ qShare(q); }); top.appendChild(shb); }
    cont.appendChild(top);
    cont.appendChild(el('div','q-text', q.text));
    var answered = false;
    function setState(g){
      cont.dataset.state = g || '';
      st.textContent = g==='ok' ? 'Got it' : g==='miss' ? 'Review' : g==='part' ? 'Partly' : '';
    }
    if(mode==='chapter' && prev) setState(prev.s);

    if(q.kind==='mcq'){
      var conf = null, cr = el('div','q-conf','<span>How sure are you? <em>(optional)</em></span>');
      [['sure','Sure'],['guess','Guessing']].forEach(function(c){
        var b = el('button','cf',''); b.type='button'; b.textContent=c[1]; b.dataset.c=c[0];
        b.addEventListener('click', function(){ if(answered) return; conf = (conf===c[0]) ? null : c[0]; $$('.cf', cr).forEach(function(x){ x.classList.toggle('on', x.dataset.c===conf); }); });
        cr.appendChild(b);
      });
      cont.appendChild(cr);
      var order = q.opts.map(function(o,i){ return i; });
      if(mode==='exam') order = shuffle(order);
      var ul = el('ol','q-opts');
      order.forEach(function(oi){
        var o=q.opts[oi], li=el('li',null,o.html); li.dataset.i=oi;
        li.tabIndex=0; li.setAttribute('role','button');
        function pick(){
          if(answered) return; answered=true; ul.classList.add('done');
          var right = q.opts[oi].ok;
          $$('li', ul).forEach(function(x){ if(q.opts[x.dataset.i].ok) x.classList.add('right'); });
          if(!right) li.classList.add('wrong');
          var calib = (!right && conf==='sure') ? '<p><b>You were sure, and it was wrong.</b> These are the ones to fix first, because on a test you would not double-check them.</p>' : (right && conf==='guess') ? '<p><i>Right, but you were guessing. Say why it is right before moving on.</i></p>' : '';
          var ex = el('div','q-exp', (right ? '<p><b>Correct.</b></p>' : '<p><b>Not quite.</b></p>') + calib + q.exp);
          cont.appendChild(ex);
          cr.classList.add('locked');
          setState(right?'ok':'miss');
          record(q, right?'ok':'miss', conf);
          if(hooks.onAnswer) hooks.onAnswer(right?'ok':'miss');
          if(mode==='chapter'){
            var again = el('div','q-bar'); var b=el('button','btn',''); b.type='button'; b.textContent='Try again';
            b.addEventListener('click', function(){ renderQ(cont, q, 'chapter'); });
            again.appendChild(b); cont.appendChild(again);
          }
        }
        li.addEventListener('click', pick);
        li.addEventListener('keydown', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); pick(); } });
        ul.appendChild(li);
      });
      cont.appendChild(ul);
    } else if(q.kind==='multi'){
      var mconf = null, mcr = el('div','q-conf','<span>How sure are you? <em>(optional)</em></span>');
      [['sure','Sure'],['guess','Guessing']].forEach(function(c){
        var b = el('button','cf',''); b.type='button'; b.textContent=c[1]; b.dataset.c=c[0];
        b.addEventListener('click', function(){ if(answered) return; mconf = (mconf===c[0]) ? null : c[0]; $$('.cf', mcr).forEach(function(x){ x.classList.toggle('on', x.dataset.c===mconf); }); });
        mcr.appendChild(b);
      });
      cont.appendChild(mcr);
      cont.appendChild(el('p','q-hint','Pick every answer that applies, then press Check.'));
      var mul = el('ol','q-opts q-multi'), picked = {}, mbar = el('div','q-bar'), chk = el('button','btn solid','');
      chk.type='button'; chk.textContent='Check'; chk.disabled = true;
      var order2 = q.opts.map(function(o,i){ return i; }); if(mode==='exam') order2 = shuffle(order2);
      order2.forEach(function(oi){
        var li = el('li',null,q.opts[oi].html); li.dataset.i=oi; li.tabIndex=0; li.setAttribute('role','checkbox'); li.setAttribute('aria-checked','false');
        function tog(){ if(answered) return; picked[oi]=!picked[oi]; li.classList.toggle('sel', !!picked[oi]); li.setAttribute('aria-checked', picked[oi]?'true':'false'); chk.disabled = !Object.keys(picked).some(function(k){ return picked[k]; }); }
        li.addEventListener('click', tog);
        li.addEventListener('keydown', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); tog(); } });
        mul.appendChild(li);
      });
      cont.appendChild(mul);
      mbar.appendChild(chk); cont.appendChild(mbar);
      chk.addEventListener('click', function(){
        if(answered) return; answered = true; mul.classList.add('done'); chk.hidden = true;
        var wrongPick = 0, missed = 0;
        $$('li', mul).forEach(function(x){
          var i = x.dataset.i, ok = q.opts[i].ok, p = !!picked[i];
          x.classList.remove('sel');
          if(ok){ x.classList.add('right'); if(!p){ x.classList.add('missed'); missed++; } }
          else if(p){ x.classList.add('wrong'); wrongPick++; }
        });
        var g = (!wrongPick && !missed) ? 'ok' : (!wrongPick ? 'part' : 'miss');
        var head = g==='ok' ? '<p><b>Correct.</b> You found every one.</p>'
          : g==='part' ? '<p><b>Partly.</b> Everything you picked is right, but you missed '+missed+' (shown with a dotted border).</p>'
          : '<p><b>Not quite.</b> '+(wrongPick ? wrongPick+' of your picks '+(wrongPick===1?'is':'are')+' wrong' : '')+(missed ? (wrongPick ? ' and you missed '+missed : 'You missed '+missed) : '')+'.</p>';
        var calib = (g==='miss' && mconf==='sure') ? '<p><b>You were sure, and it was wrong.</b> Fix this one first.</p>' : '';
        cont.appendChild(el('div','q-exp', head + calib + q.exp));
        mcr.classList.add('locked');
        setState(g); record(q, g, mconf);
        if(hooks.onAnswer) hooks.onAnswer(g);
        if(mode==='chapter'){
          var again = el('div','q-bar'); var b2=el('button','btn',''); b2.type='button'; b2.textContent='Try again';
          b2.addEventListener('click', function(){ renderQ(cont, q, 'chapter'); });
          again.appendChild(b2); cont.appendChild(again);
        }
      });
    } else if(q.kind==='num'){
      var nrow = el('div','q-num');
      var inp = el('input','q-numin'); inp.type='text'; inp.setAttribute('inputmode','decimal'); inp.setAttribute('autocomplete','off'); inp.placeholder='Type a number'; inp.setAttribute('aria-label','Your answer');
      nrow.appendChild(inp); if(q.unit){ nrow.appendChild(el('span','q-unit', esc(q.unit))); }
      cont.appendChild(nrow);
      var nbar = el('div','q-bar'), nchk = el('button','btn solid','');
      nchk.type='button'; nchk.textContent='Check'; nbar.appendChild(nchk); cont.appendChild(nbar);
      function nGo(){
        if(answered) return;
        var raw = inp.value.replace(/[\s,$%]/g,'').replace(/−/g,'-');
        if(raw==='' || isNaN(Number(raw))){ inp.classList.add('bad'); inp.focus(); return; }
        inp.classList.remove('bad');
        answered = true; inp.disabled = true; nchk.hidden = true;
        var v = Number(raw), right = Math.abs(v - q.ans) <= Math.max(q.tol, 1e-9);
        var shown = String(Math.round(q.ans*100)/100) + (q.unit ? ' '+q.unit : '');
        inp.classList.add(right ? 'right' : 'wrong');
        cont.appendChild(el('div','q-exp', (right ? '<p><b>Correct.</b></p>' : '<p><b>Not quite.</b> You typed '+esc(inp.value.trim())+'. The answer is <b>'+esc(shown)+'</b>.</p>') + q.exp));
        setState(right?'ok':'miss'); record(q, right?'ok':'miss');
        if(hooks.onAnswer) hooks.onAnswer(right?'ok':'miss');
        if(mode==='chapter'){
          var again = el('div','q-bar'); var b3=el('button','btn',''); b3.type='button'; b3.textContent='Try again';
          b3.addEventListener('click', function(){ renderQ(cont, q, 'chapter'); });
          again.appendChild(b3); cont.appendChild(again);
        }
      }
      nchk.addEventListener('click', nGo);
      inp.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); nGo(); } });
    } else {
      var ta = el('textarea','q-write'); ta.placeholder = 'Write or say your answer first (optional), then check it…'; ta.rows = 2;
      ta.setAttribute('aria-label','Your answer');
      cont.appendChild(ta);
      var bar = el('div','q-bar');
      var show = el('button','btn solid',''); show.type='button'; show.textContent='Show model answer';
      bar.appendChild(show); cont.appendChild(bar);
      show.addEventListener('click', function(){
        if(answered) return; answered=true; show.hidden=true;
        var kwHtml = '';
        (function(){ var tmp = document.createElement('div'); tmp.innerHTML = q.exp; var ps = Array.prototype.slice.call(tmp.children);
          var kw = ps.filter(function(n){ return /^key words/i.test(n.textContent.trim()); })[0]; if(kw && ps.length>1) kwHtml = kw.outerHTML; })();
        var fullEx = null, fullBtn = null;
        var ex = el('div','q-exp', kwHtml || q.exp); cont.insertBefore(ex, bar);
        if(kwHtml){
          fullEx = el('div','q-exp q-full', q.exp); fullEx.hidden = true; cont.insertBefore(fullEx, bar);
          fullBtn = el('button','btn',''); fullBtn.type='button'; fullBtn.textContent='Show full model answer';
          fullBtn.addEventListener('click', function(){ fullEx.hidden = !fullEx.hidden; fullBtn.textContent = fullEx.hidden ? 'Show full model answer' : 'Hide full model answer'; });
          bar.appendChild(fullBtn);
        }
        var hint = el('span','hint','How did you do?'); bar.appendChild(hint);
        [['ok','Got it','good'],['part','Partly','mid'],['miss','Missed it','bad']].forEach(function(g){
          var b = el('button','btn '+g[2],''); b.type='button'; b.textContent=g[1];
          b.addEventListener('click', function(){
            $$('.btn', bar).forEach(function(x){ if(x!==fullBtn) x.disabled = true; });
            if(fullEx && g[0]!=='ok'){ fullEx.hidden = false; fullBtn.textContent = 'Hide full model answer'; }
            setState(g[0]); record(q, g[0]);
            if(hooks.onAnswer) hooks.onAnswer(g[0]);
            if(mode==='chapter'){
              var a2 = el('button','btn',''); a2.type='button'; a2.textContent='Try again';
              a2.addEventListener('click', function(){ renderQ(cont, q, 'chapter'); });
              bar.appendChild(a2);
            }
          });
          bar.appendChild(b);
        });
      });
    }
  }

  /* ------------------------------------------------------------------ stats */
  // mastery of one question, 0..1: not tried 0; miss 0.1; partly 0.3; correct 0.55 up to 1 as it survives longer gaps; drops when overdue
  function mastery(q){
    var r = S.prog[q.id]; if(!r) return 0;
    var b = r.b||0, base = r.s==='ok' ? 0.55+0.09*b : r.s==='part' ? 0.3 : 0.1;
    if(r.s==='ok'){ var age=(Date.now()-r.t)/DAY, due=BOX[b]; if(age>due) base -= Math.min(0.25, 0.25*((age-due)/Math.max(due,3))); }
    return Math.max(0.05, Math.min(1, base));
  }
  function readiness(keys){
    var qs = Q.filter(function(q){ return keys.indexOf(q.key)>-1; }); if(!qs.length) return 0;
    var t=0; qs.forEach(function(q){ t+=mastery(q); }); return t/qs.length;
  }
  function band(p){ return p<0.25 ? 'Just starting' : p<0.5 ? 'Building' : p<0.75 ? 'Getting there' : p<0.9 ? 'Solid' : 'Test ready'; }
  function titleCase(t){ return String(t||'general').replace(/\b\w/g,function(c){ return c.toUpperCase(); }); }
  function panelStats(key){
    var qs = Q.filter(function(q){ return q.key===key; }), ok=0, done=0, due=0, now=Date.now();
    qs.forEach(function(q){
      var r = S.prog[q.id]; if(!r) return;
      done++; if(r.s==='ok') ok++;
      if(r.t + BOX[r.b||0]*DAY <= now && (r.s!=='ok' || (r.b||0) < BOX.length)) due++;
    });
    return { total: qs.length, ok: ok, done: done, due: due };
  }
  function dueQs(){
    var now=Date.now();
    return Q.filter(function(q){ var r=S.prog[q.id]; return r && (r.t + BOX[r.b||0]*DAY) <= now; });
  }
  // result card at the end of a chapter self-test (same look as Exam results, shorter)
  function stResult(st, panel, ok, total, done){
    var complete = total > 0 && done === total, prev = st.dataset.stDone;
    st.dataset.stDone = complete ? '1' : '0';
    var old = $('.st-result', st);
    if(!complete){ if(old) old.remove(); return; }
    if(old && old.dataset.ok === String(ok)) return;
    if(old) old.remove();
    var celebrate = prev === '0';                          // only celebrate when the test was just finished, not on page load
    var course = panel.closest('.course-panel').dataset.course, week = panel.dataset.week, key = panelKey(course, week);
    var missed = Q.filter(function(q){ return q.key===key && S.prog[q.id] && S.prog[q.id].s!=='ok' && ($$('.q', st).some(function(qe){ return qe.dataset.qid===q.id; })); });
    var pct = Math.round(100*ok/total), low = pct < 50;
    var card = el('div','st-result res-anim' + (celebrate ? '' : ' still')); card.dataset.ok = String(ok);
    card.appendChild(resHero(ok, total, total, missed.length, celebrate));
    if(low) card.appendChild(resWhy());
    var steps = el('ol','res-steps'), i = 0;
    if(missed.length){
      var n = low ? Math.min(5, missed.length) : missed.length;
      steps.appendChild(resStep(i++, low ? 'Try just '+n+' of the ones you missed' : 'Retry the '+n+' you missed', (low ? 'Small on purpose, about ' : 'About ')+resMins(n)+' minutes', 'Start', function(){ openExam({preset:[key], misses:true}); X.count = n; startExam(); }));
    }
    steps.appendChild(resStep(i++, 'Open the cheat sheet for this chapter', 'Formulas, traps and tricks on one page', 'Open', function(){ openSheet(course, week); }));
    var nextBtn = $('.week-nav-btn.next:not(:disabled)', panel);
    if(nextBtn) steps.appendChild(resStep(i++, 'Go to the next chapter', (function(){ var t=$('.wn-text', nextBtn); if(!t) return 'Keep going'; var l=$('.wn-label', t); return (t.textContent||'').replace(l ? l.textContent : '', '').trim() || 'Keep going'; })(), 'Next', function(){ nextBtn.click(); }));
    else steps.appendChild(resStep(i++, 'See your plan', 'Your misses stay in the Plan tab under Due for review', 'Plan', function(){ go('plan'); }));
    card.appendChild(steps);
    card.appendChild(resCalm());
    st.appendChild(card);
  }
  function refreshAll(){
    // week tab meters + panel score chips
    $$('.weektab').forEach(function(tab){
      var scope = tab.closest('.weektabs').dataset.scope, key = panelKey(scope, tab.dataset.week), s = panelStats(key);
      var m = $('.mt i', tab); if(m) m.style.width = (s.total? Math.round(100*s.ok/s.total):0)+'%';
      tab.classList.toggle('has-note', noteHas(S.notes[key]));
    });
    $$('.week-panel').forEach(function(p){
      $$('.st-score', p).forEach(function(sc){
        var st = sc.closest('.selftest'), ids = st ? $$('.q', st).map(function(qe){ return qe.dataset.qid; }) : [];
        var total = ids.length, ok = 0, done = 0;
        ids.forEach(function(id){ var r = S.prog[id]; if(!r) return; done++; if(r.s==='ok') ok++; });
        sc.textContent = ok+' / '+total+' correct' + (done<total ? ' · '+(total-done)+' not tried' : '');
        if(st) stResult(st, p, ok, total, done);
      });
    });
    var due = dueQs().length, b = $('#exam-due'); if(b){ b.textContent = due; b.hidden = !due; }
    if(cur.course==='plan') renderPlan();
  }

  /* ------------------------------------------------------------------ notes */
  var drawerTab = 'this';
  function ctxKey(){ return cur.course==='plan' || !cur.week ? 'general' : panelKey(cur.course, cur.week); }
  function ctxLabel(k){
    if(k==='general') return 'General notes';
    var c = k.split(':')[0]; return (COURSES[c]?COURSES[c].name:c)+' · '+(weekNames[k]||k);
  }
  function noteHas(n){ return !!(n && ((n.t && n.t.trim()) || (n.d && n.d.s && n.d.s.length) || (n.p && n.p.s && n.p.s.length))); }
  function updateFab(){
    var f=$('#notes-fab'); if(!f) return;
    var any = Object.keys(S.notes).some(function(k){ return noteHas(S.notes[k]); });
    f.classList.toggle('has', any);
  }
  function refreshNotesUI(){
    var d = $('#notes-drawer'); updateFab(); if(typeof PG!=='undefined' && PG.ready && !PG.on) pgSync();
    $$('.weektab').forEach(function(tab){
      var scope = tab.closest('.weektabs').dataset.scope, key = panelKey(scope, tab.dataset.week);
      tab.classList.toggle('has-note', noteHas(S.notes[key]));
    });
    if(!d || d.hidden) return;
    var k = ctxKey();
    $('#nd-ctx').textContent = ctxLabel(k);
    var ta = $('#nd-area'), list=$('#nd-list'), quick=$('#nd-quick'), foot=$('#nd-foot'), skp=$('#sk');
    $$('.nd-tabs button').forEach(function(b){ b.classList.toggle('on', b.dataset.t===drawerTab); });
    d.classList.toggle('sk-on', drawerTab==='sketch'); skp.hidden = drawerTab!=='sketch';
    $('#nd-copy').hidden = drawerTab==='sketch'; $('#nd-count').hidden = drawerTab==='sketch';
    if(drawerTab==='sketch'){
      ta.hidden=true; quick.hidden=true; foot.hidden=false; list.hidden=true;
      var cn = S.notes[k];
      if(SK.k!==k || (!SK.cur && !SK.erasing && (cn?cn.u:0)!==SK.stamp)) skLoad(k);
      skFit();
    } else if(drawerTab==='this'){
      ta.hidden=false; quick.hidden=false; foot.hidden=false; list.hidden=true;
      var cv = (S.notes[k] && S.notes[k].t) || '';
      if(document.activeElement!==ta || ta.dataset.k!==k){ ta.value = cv; }
      ta.dataset.k = k;
    } else {
      ta.hidden=true; quick.hidden=true; foot.hidden=true; list.hidden=false;
      list.innerHTML='';
      var keys = Object.keys(S.notes).filter(function(x){ return noteHas(S.notes[x]); });
      keys.sort(function(a,b){ return (S.notes[b].u||0)-(S.notes[a].u||0); });
      if(!keys.length) list.appendChild(el('div','nd-ctx','No notes yet. Notes you write while the prof is talking will show up here.'));
      keys.forEach(function(x){
        var it = el('button','nd-item','<b>'+esc(ctxLabel(x))+(S.notes[x].d&&S.notes[x].d.s&&S.notes[x].d.s.length?' · sketch':'')+(S.notes[x].p&&S.notes[x].p.s&&S.notes[x].p.s.length?' · drawing':'')+'</b><span>'+esc(S.notes[x].t||'')+'</span>'); it.type='button';
        it.addEventListener('click', function(){
          if(x==='general'){ showCourse('plan'); } else { var p=x.split(':'); go(p[0], p[1]); }
          drawerTab=(S.notes[x].t&&S.notes[x].t.trim())?'this':'sketch'; refreshNotesUI();
        });
        list.appendChild(it);
      });
    }
  }

  /* ------------------------------------------------------------------ drawing: notes sketch tab and draw-on-page (Apple Pencil / mouse / finger) */
  var SK = { k:null, strokes:[], hist:[], redo:[], cur:null, pr:null, erasing:false, erased:false, eraseBefore:null, pid:null, stamp:0,
             scale:1, dpr:1, W:1000, H:750, cv:null, ctx:null, ready:false, clearT:null, ro:null, max:300000, wm:1 };
  var PG = { on:false, k:null, strokes:[], hist:[], redo:[], cur:null, pr:null, erasing:false, erased:false, eraseBefore:null, pid:null,
             scale:1, dpr:1, cv:null, ctx:null, ready:false, panel:null, touches:{}, scrolling:false, sy:0, raf:0, max:250000, wm:1, hintT:null };
  var TL = { tool:'pen', color:0, size:1, er:'part', finger:false, penSeen:0 };   // tool state shared by both surfaces
  var SK_COL = [null, '#2f6fe0', '#e03e3e', '#12a06e', '#f08a00', '#8a4fd8', '#0e9aa7', '#6b7280'];
  var SK_W = [3, 6, 11];
  var ER_PX = [12, 20, 32];     // eraser radius on screen, in px
  /* ================================================================== v68: study panel: daily goal + streak, focus timer, share cards */
  var STAT = { t:0, goal:20, d:{} };
  var EMO = { paper:'✨', pink:'🎀', green:'🍵', sepia:'☕', sky:'☁️', bay:'📈' };
  function themeKey(){ var r = $('.viz-root'); return (r && r.getAttribute('data-bg')) || 'paper'; }
  function dkey(t){ var d = t ? new Date(t) : new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
  function addDays(k, n){ var p = k.split('-'); return dkey(new Date(+p[0], +p[1]-1, +p[2]+n).getTime()); }
  function statHit(k){ var e = STAT.d[k]; return !!e && e[0] >= (e[1] || STAT.goal); }
  function streakNow(){ var k = dkey(); if(!statHit(k)) k = addDays(k, -1); var c = 0; while(statHit(k)){ c++; k = addDays(k, -1); } return c; }
  function streakBest(){ var ks = Object.keys(STAT.d).filter(statHit).sort(), best = 0, run = 0, prev = null; ks.forEach(function(k){ run = (prev && addDays(prev, 1) === k) ? run+1 : 1; if(run > best) best = run; prev = k; }); return best; }
  function statLoad(){ try{ var o = JSON.parse(lsGet('s5v68-stats') || 'null'); if(o && o.d){ STAT = o; if(!STAT.goal) STAT.goal = 20; } }catch(e){} }
  function statSaveLocal(){ lsSet('s5v68-stats', JSON.stringify(STAT)); }
  function statMerge(r){
    if(!r || typeof r !== 'object' || !r.d) return false; var ch = false;
    Object.keys(r.d).forEach(function(k){ var a = STAT.d[k], b = r.d[k]; if(!a || (b[0]||0) > (a[0]||0)){ STAT.d[k] = b; ch = true; } });
    if((r.t||0) > (STAT.t||0) && r.goal && r.goal !== STAT.goal){ STAT.goal = r.goal; STAT.t = r.t; ch = true; }
    return ch;
  }
  var statTm = 0, statBusy = false;
  function statPush(){
    clearTimeout(statTm);
    statTm = setTimeout(function(){
      if(!dbState.ok || !dbState.statsRef) return;
      if(statBusy){ statPush(); return; }
      statBusy = true;
      Promise.resolve(dbState.statsRef.get()).then(function(s){ try{ if(s && s.exists && statMerge(s.data().data)){ statSaveLocal(); statUi(); } }catch(e){} }, function(){})
        .then(function(){ return dbState.statsRef.set({ data: JSON.parse(JSON.stringify(STAT)), saved: Date.now() }); })
        .then(function(){ statBusy = false; }, function(){ statBusy = false; });
    }, 600);
  }
  function statPull(){
    if(!dbState.ok || !dbState.statsRef) return;
    Promise.resolve(dbState.statsRef.get()).then(function(s){ try{ if(s && s.exists && statMerge(s.data().data)){ statSaveLocal(); statUi(); } }catch(e){} statPush(); }, function(){});
  }
  function todayN(){ var ds0 = dayStart(), n = 0; Object.keys(S.prog).forEach(function(id){ if((S.prog[id].t||0) >= ds0) n++; }); return n; }
  function statTick(silent){
    var n = todayN(), k = dkey(), cur = STAT.d[k], prev = cur ? cur[0] : 0;
    if(cur && n <= prev){ statUi(); return; }
    STAT.d[k] = [Math.max(n, prev), cur ? cur[1] : STAT.goal];
    statSaveLocal(); statPush(); statUi();
    if(!silent && prev < STAT.d[k][1] && n >= STAT.d[k][1]) celebrate();
  }
  var stToastEl = null, stToastT = 0;
  function stToast(msg){
    if(!stToastEl){ stToastEl = document.createElement('div'); stToastEl.className = 'st-toast'; stToastEl.setAttribute('role', 'status'); host().appendChild(stToastEl); }
    stToastEl.textContent = msg; stToastEl.classList.add('on'); clearTimeout(stToastT); stToastT = setTimeout(function(){ stToastEl.classList.remove('on'); }, 2600);
  }
  function confetti(){
    if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var w = document.createElement('div'); w.className = 'cf-wrap'; w.setAttribute('aria-hidden', 'true'); host().appendChild(w);
    var set = [EMO[themeKey()], '⭐', '✨', '🔥'];
    for(var i = 0; i < 34; i++){
      var p = document.createElement('span'); p.className = 'cf-p'; p.textContent = set[i % set.length];
      p.style.left = (Math.random()*100)+'%'; p.style.setProperty('--x', ((Math.random()-.5)*160)+'px'); p.style.setProperty('--r', ((Math.random()-.5)*900)+'deg');
      p.style.setProperty('--d', (1.6 + Math.random()*1.4)+'s'); p.style.animationDelay = (Math.random()*0.5)+'s'; p.style.fontSize = (1.1 + Math.random()*1.1)+'rem'; w.appendChild(p);
    }
    setTimeout(function(){ if(w.parentNode) w.parentNode.removeChild(w); }, 3800);
  }
  function celebrate(){ confetti(); var s = streakNow(); stToast('Goal hit! ' + (s >= 1 ? '🔥 ' + s + ' day streak' : EMO[themeKey()] + ' nice work')); }

  /* ---- focus timer */
  var F = { kind:'focus', mins:25, left:1500, run:false, end:0, sound:'off', vol:0.5, tick:0 };
  function fLoad(){ try{ var o = JSON.parse(lsGet('s5v68-focus') || 'null'); if(o){ if(o.sound) F.sound = o.sound; if(typeof o.vol === 'number') F.vol = o.vol; if(o.mins){ F.mins = o.mins; F.left = o.mins*60; } if(o.kind) F.kind = o.kind; } }catch(e){} }
  function fSave(){ lsSet('s5v68-focus', JSON.stringify({ sound:F.sound, vol:F.vol, mins:F.mins, kind:F.kind })); }
  function fSess(){ try{ var o = JSON.parse(lsGet('s5v68-sess') || '{}'); return o.day === dkey() ? (o.n || 0) : 0; }catch(e){ return 0; } }
  function fSessAdd(){ lsSet('s5v68-sess', JSON.stringify({ day: dkey(), n: fSess() + 1 })); }
  function mmss(s){ s = Math.max(0, s); return pad2(Math.floor(s/60)) + ':' + pad2(s%60); }
  var AU = { ctx:null, master:null, nodes:[], timer:0, step:0 };
  function auCtx(){
    if(!AU.ctx){ var C = window.AudioContext || window.webkitAudioContext; if(!C) return null; AU.ctx = new C(); AU.master = AU.ctx.createGain(); AU.master.gain.value = F.vol; AU.master.connect(AU.ctx.destination); }
    if(AU.ctx.state === 'suspended') AU.ctx.resume();
    return AU.ctx;
  }
  function noiseBuf(c, brown){ var len = c.sampleRate*3, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0), last = 0; for(var i = 0; i < len; i++){ var w = Math.random()*2-1; if(brown){ last = (last + 0.02*w)/1.02; d[i] = last*3.5; } else d[i] = w; } return b; }
  function auAdd(n){ AU.nodes.push(n); return n; }
  function auStop(){ AU.nodes.forEach(function(n){ try{ if(n.stop) n.stop(); n.disconnect(); }catch(e){} }); AU.nodes = []; clearInterval(AU.timer); AU.timer = 0; }
  function loopNoise(c, brown){ var s = c.createBufferSource(); s.buffer = noiseBuf(c, brown); s.loop = true; auAdd(s); return s; }
  function auPlay(kind){
    auStop(); if(kind === 'off') return;
    var c = auCtx(); if(!c) return; AU.master.gain.value = F.vol;
    if(kind === 'rain'){
      var n1 = loopNoise(c, false), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.6;
      var g1 = c.createGain(); g1.gain.value = 0.5; n1.connect(bp); bp.connect(g1); g1.connect(AU.master); n1.start();
      var n2 = loopNoise(c, true), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; var g2 = c.createGain(); g2.gain.value = 0.7; n2.connect(lp); lp.connect(g2); g2.connect(AU.master); n2.start();
    } else if(kind === 'brown'){
      var n3 = loopNoise(c, true), lp2 = c.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 650; var g3 = c.createGain(); g3.gain.value = 0.9; n3.connect(lp2); lp2.connect(g3); g3.connect(AU.master); n3.start();
    } else if(kind === 'lofi'){
      var cr = loopNoise(c, false), hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500; var cg = c.createGain(); cg.gain.value = 0; cr.connect(hp); hp.connect(cg); cg.connect(AU.master); cr.start();
      var hum = loopNoise(c, true), hl = c.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 220; var hg = c.createGain(); hg.gain.value = 0.35; hum.connect(hl); hl.connect(hg); hg.connect(AU.master); hum.start();
      var CH = [[174.61,220,261.63,329.63],[164.81,196,246.94,293.66],[146.83,174.61,220,261.63],[196,246.94,293.66,349.23]];
      function chord(){
        var f = CH[AU.step++ % CH.length], t = c.currentTime;
        f.concat([f[0]/2]).forEach(function(fr, i){
          var o = c.createOscillator(); o.type = i === 4 ? 'sine' : 'triangle'; o.frequency.value = fr; o.detune.value = (Math.random()-.5)*14;
          var lp3 = c.createBiquadFilter(); lp3.type = 'lowpass'; lp3.frequency.value = 760;
          var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(i === 4 ? 0.2 : 0.09, t + 0.9); g.gain.linearRampToValueAtTime(0.0001, t + 4.4);
          o.connect(lp3); lp3.connect(g); g.connect(AU.master); o.start(t); o.stop(t + 4.6); auAdd(o);
        });
      }
      chord();
      AU.timer = setInterval(function(){
        if(!F.run && !AU.always){ return; }
        if(++AU.beat % 10 === 0) chord();
        if(Math.random() < 0.5){ var t2 = c.currentTime; cg.gain.cancelScheduledValues(t2); cg.gain.setValueAtTime(0.1 + Math.random()*0.1, t2); cg.gain.exponentialRampToValueAtTime(0.0008, t2 + 0.05 + Math.random()*0.05); }
      }, 400);
      AU.beat = 0;
    }
  }
  function chime(){
    var c = auCtx(); if(!c) return; var t = c.currentTime;
    [[880, 0], [1318.5, 0.22], [1760, 0.44]].forEach(function(n){ var o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = n[0]; g.gain.setValueAtTime(0.0001, t+n[1]); g.gain.exponentialRampToValueAtTime(0.28, t+n[1]+0.03); g.gain.exponentialRampToValueAtTime(0.0001, t+n[1]+1.4); o.connect(g); g.connect(AU.master || c.destination); o.start(t+n[1]); o.stop(t+n[1]+1.5); });
  }
  function fStart(){
    if(F.run) return; F.run = true; F.end = Date.now() + F.left*1000;
    if(F.sound !== 'off') auPlay(F.sound);
    clearInterval(F.tick); F.tick = setInterval(fTick, 250); fUi();
  }
  function fPause(){ if(!F.run) return; F.run = false; clearInterval(F.tick); F.left = Math.max(0, Math.ceil((F.end - Date.now())/1000)); auStop(); fUi(); }
  function fReset(){ F.run = false; clearInterval(F.tick); F.left = F.mins*60; auStop(); fUi(); }
  function fSet(kind, mins){ F.kind = kind; F.mins = mins; F.run = false; clearInterval(F.tick); F.left = mins*60; auStop(); fSave(); fUi(); }
  function fTick(){
    F.left = Math.max(0, Math.ceil((F.end - Date.now())/1000));
    if(F.left <= 0){
      F.run = false; clearInterval(F.tick); auStop(); chime();
      if(F.kind === 'focus'){ fSessAdd(); stToast('Focus session done. Take a break ☕'); fSet('break', 5); } else { stToast('Break over. Ready for another round?'); fSet('focus', 25); }
      return;
    }
    fUi(true);
  }
  function fUi(light){
    var t = $('#stp-time'), rf = $('#stp-fring'), top = $('#open-study .st-n'), btn = $('#open-study');
    if(t) t.textContent = mmss(F.left);
    var tot = F.mins*60, pct = tot ? Math.round((1 - F.left/tot)*100) : 0;
    if(rf){ rf.style.setProperty('--p', pct); rf.style.opacity = pct ? 1 : 0; }
    if(btn) btn.classList.toggle('run', F.run);
    if(top) top.textContent = F.run ? mmss(F.left) : '🔥' + streakNow();
    if(light) return;
    var go = $('#stp-go'); if(go) go.textContent = F.run ? 'Pause' : (F.left < F.mins*60 ? 'Resume' : 'Start');
    $$('#stp-modes .stp-chip').forEach(function(b){ b.classList.toggle('on', b.dataset.k === F.kind && +b.dataset.m === F.mins); });
    $$('#stp-snd .stp-chip').forEach(function(b){ b.classList.toggle('on', b.dataset.s === F.sound); });
    var v = $('#stp-vol'); if(v) v.value = Math.round(F.vol*100);
    var ss = $('#stp-sess'); if(ss) ss.textContent = fSess() + ' focus session' + (fSess() === 1 ? '' : 's') + ' today';
    var sub = $('#stp-fsub'); if(sub) sub.textContent = F.kind === 'focus' ? 'Focus' : 'Break';
  }

  /* ---- panel */
  function statUi(){
    var n = todayN(), g = (STAT.d[dkey()] && STAT.d[dkey()][1]) || STAT.goal, pct = Math.min(100, Math.round(n/g*100));
    var br = $('#open-study'); if(br){ br.style.setProperty('--p', pct); var ring = $('.st-fg', br); if(ring){ ring.style.setProperty('--p', pct); ring.style.opacity = pct ? 1 : 0; } }
    var rf = $('#stp-gring'); if(rf){ rf.style.setProperty('--p', pct); rf.style.opacity = pct ? 1 : 0; }
    var a = $('#stp-n'); if(a) a.textContent = n + '/' + g;
    var sn = streakNow(), sb = streakBest(), line = $('#stp-line');
    if(line) line.innerHTML = '<span>🔥 <b>' + sn + '</b> day' + (sn === 1 ? '' : 's') + ' streak</span><span>Best <b>' + sb + '</b></span>';
    var wk = $('#stp-week');
    if(wk){
      var h = '', k0 = dkey(), L = ['S','M','T','W','T','F','S'];
      for(var i = 6; i >= 0; i--){ var k = addDays(k0, -i), p = k.split('-'), dow = new Date(+p[0], +p[1]-1, +p[2]).getDay(), e = STAT.d[k];
        h += '<div class="stp-day' + (statHit(k) ? ' hit' : (e && e[0] ? ' part' : '')) + (i === 0 ? ' today' : '') + '"><i>' + (statHit(k) ? '✓' : '') + '</i><span>' + L[dow] + '</span></div>'; }
      wk.innerHTML = h;
    }
    $$('#stp-goals .stp-chip').forEach(function(b){ b.classList.toggle('on', +b.dataset.g === STAT.goal); });
    fUi(true);
  }
  function panelOpen(tab){ var p = $('#stp'); if(!p) return; p.hidden = false; panelTab(tab || 'goal'); statTick(true); statUi(); fUi(); }
  function panelClose(){ var p = $('#stp'); if(!p) return; p.classList.remove('fs'); p.hidden = true; }
  function panelTab(t){ $$('.stp-tabs button').forEach(function(b){ b.classList.toggle('on', b.dataset.t === t); }); $('#stp-goal').hidden = t !== 'goal'; $('#stp-focus').hidden = t !== 'focus'; }

  /* ---- share cards */
  function plain(h){ var d = document.createElement('div'); d.innerHTML = String(h == null ? '' : h); return (d.textContent || '').replace(/\s+/g, ' ').trim(); }
  function wrapText(c, text, maxW){ var words = String(text).split(' '), lines = [], line = ''; words.forEach(function(w){ var t = line ? line + ' ' + w : w; if(c.measureText(t).width > maxW && line){ lines.push(line); line = w; } else line = t; }); if(line) lines.push(line); return lines; }
  var cardEnd = 0;
  function makeCard(o, Hin){
    var W = 1080, H = Hin || 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d');
    var cs = getComputedStyle($('.viz-root')), tok = function(n, d){ return (cs.getPropertyValue(n) || '').trim() || d; };
    var page = tok('--page', '#f5f5f7'), surf = tok('--surface', '#fff'), ink = tok('--ink', '#111'), ink2 = tok('--ink-2', '#444'), muted = tok('--muted', '#777'), acc = tok('--blue', '#2a78d6'), onacc = tok('--on-accent', '#fff'), line = tok('--line', '#ddd'), soft = tok('--blue-soft', '#e8f1fb');
    var head = (tok('--f-head', 'Georgia, serif')), body = (tok('--f-body', 'system-ui, sans-serif'));
    c.fillStyle = page; c.fillRect(0, 0, W, H);
    var em = EMO[themeKey()], pos = [[90,120,-14],[930,90,12],[980,560,-8],[70,700,10],[900,1180,-12],[160,1250,14],[540,60,6],[1000,900,-16]];
    c.globalAlpha = 0.16; c.font = '86px serif'; c.textBaseline = 'middle'; c.textAlign = 'center';
    pos.forEach(function(p){ c.save(); c.translate(p[0], p[1]); c.rotate(p[2]*Math.PI/180); c.fillText(em, 0, 0); c.restore(); });
    c.globalAlpha = 1;
    var x = 70, y = 120, w = W - 140, h = H - 240, r = 44;
    c.fillStyle = surf; c.strokeStyle = line; c.lineWidth = 3; c.beginPath(); if(c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); c.fill(); c.stroke();
    var px = x + 64, pw = w - 128, cy = y + 76;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    if(o.kicker){ c.font = '600 30px ' + body; var kw = Math.min(pw, c.measureText(o.kicker).width + 44); c.fillStyle = soft; c.beginPath(); if(c.roundRect) c.roundRect(px, cy - 38, kw, 56, 28); else c.rect(px, cy - 38, kw, 56); c.fill(); c.fillStyle = acc; c.fillText(o.kicker, px + 22, cy); cy += 70; }
    if(o.big){ c.font = '700 190px ' + head; c.fillStyle = acc; c.fillText(o.big, px, cy + 150); cy += 200; }
    if(o.title){ c.font = '700 58px ' + head; c.fillStyle = ink; wrapText(c, o.title, pw).slice(0, o.big ? 2 : 6).forEach(function(l){ cy += 74; c.fillText(l, px, cy); }); cy += 26; }
    (o.blocks || []).forEach(function(b){
      var fs = b.size || 38; c.font = (b.bold ? '650 ' : '400 ') + fs + 'px ' + body;
      var lines = wrapText(c, b.t, pw - (b.box ? 56 : 0)), maxLines = Math.max(2, Math.floor((y + h - 150 - cy)/(fs*1.4)) - (b.box ? 1 : 0));
      if(lines.length > maxLines){ lines = lines.slice(0, maxLines); lines[lines.length-1] = lines[lines.length-1].replace(/\s*\S*$/, '') + '…'; }
      var bh = lines.length*fs*1.4 + (b.box ? 44 : 0);
      if(b.label){ c.font = '600 26px ' + body; c.fillStyle = muted; cy += 14; c.fillText(b.label.toUpperCase(), px, cy); cy += 26; c.font = (b.bold ? '650 ' : '400 ') + fs + 'px ' + body; }
      if(b.box){ c.fillStyle = soft; c.beginPath(); if(c.roundRect) c.roundRect(px, cy, pw, bh, 28); else c.rect(px, cy, pw, bh); c.fill(); }
      c.fillStyle = b.box ? ink : (b.muted ? ink2 : ink);
      lines.forEach(function(l, i){ c.fillText(l, px + (b.box ? 28 : 0), cy + (b.box ? 22 : 0) + (i+1)*fs*1.4 - fs*0.3); });
      cy += bh + 30;
    });
    cardEnd = cy;
    c.font = '600 30px ' + body; c.fillStyle = muted; c.textAlign = 'left'; c.fillText(o.foot || 'Semester 5 Study Map', px, y + h - 60);
    c.textAlign = 'right'; c.font = '48px serif'; c.fillText(em, x + w - 64, y + h - 56);
    return cv;
  }
  var shrCv = null;
  function shareOpen(o){
    makeCard(o); var hh = Math.max(900, Math.min(1350, cardEnd + 250)); shrCv = makeCard(o, hh); var ov = $('#shr-ov'), img = $('#shr-img');
    img.src = shrCv.toDataURL('image/png'); ov.hidden = false;
    var can = !!(navigator.share && navigator.canShare); $('#shr-share').hidden = !can;
  }
  function shrBlob(cb){ shrCv.toBlob(function(b){ cb(b); }, 'image/png'); }
  function shrDo(kind){
    shrBlob(function(b){
      if(!b){ stToast('Could not make the picture'); return; }
      if(kind === 'share'){
        var f = new File([b], 'study-card.png', { type:'image/png' });
        if(navigator.canShare && navigator.canShare({ files:[f] })) navigator.share({ files:[f] }).catch(function(){}); else stToast('Sharing is not available here. Press and hold the picture to save it.');
      } else if(kind === 'copy'){
        try{ navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function(){ stToast('Copied'); }, function(){ stToast('Copy is blocked here. Press and hold the picture to save it.'); }); }catch(e){ stToast('Copy is blocked here. Press and hold the picture to save it.'); }
      } else {
        try{ Promise.resolve(window.claude && window.claude.use ? window.claude.use('downloads') : null).then(function(dl){ if(!dl){ stToast('Saving is not available here. Press and hold the picture.'); return; } dl.save({ filename: 'study-card.png', data: b }).then(function(){ stToast('Saved'); }, function(err){ if(!err || err.code !== 'declined') stToast('Could not save. Press and hold the picture.'); }); }); }catch(e){ stToast('Press and hold the picture to save it.'); }
      }
    });
  }
  function panelCtx(el0){ var cp = el0.closest && el0.closest('.course-panel'), wp = el0.closest && el0.closest('.week-panel'); if(cp && wp){ var k = cp.dataset.course + ':' + wp.dataset.week; try{ return ctxLabel(k); }catch(e){} } return 'Study Map'; }
  function addFlashShare(){
    $$('.week-panel .flash').forEach(function(d){
      if(d.querySelector('.fl-shr')) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'fl-shr'; b.textContent = 'Share card'; b.setAttribute('aria-label', 'Share this flashcard as a picture');
      b.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); var s = d.querySelector('summary'), p = d.querySelector('p');
        shareOpen({ kicker: 'Flashcard', title: plain(s ? s.innerHTML : ''), blocks: [{ t: plain(p ? p.innerHTML : ''), box: true, size: 42 }], foot: panelCtx(d) }); });
      d.appendChild(b);
    });
  }
  function qShare(q){
    var right = (q.opts || []).filter(function(o){ return o.ok; }).map(function(o){ return plain(o.html); }).join(' / ');
    var blocks = [{ t: plain(q.text), size: 40, bold: true }];
    if(right) blocks.push({ label: 'Answer', t: right, box: true, size: 38 });
    if(q.exp) blocks.push({ label: 'Why', t: plain(q.exp), size: 32, muted: true });
    shareOpen({ kicker: 'Practice question', blocks: blocks, foot: panelCtx($('.week-panel:not([hidden])') || document.body) });
  }
  function streakShare(){
    var n = streakNow(), t = todayN();
    if(n === 0) shareOpen({ kicker: 'Today', big: String(t), title: t === 1 ? 'question answered today' : 'questions answered today', blocks: [{ t: 'Daily goal: ' + STAT.goal + ' questions.', size: 38, muted: true }], foot: 'Semester 5 Study Map' });
    else shareOpen({ kicker: 'Study streak', big: String(n), title: n === 1 ? 'day in a row' : 'days in a row', blocks: [{ t: t + ' questions answered today. Best streak: ' + streakBest() + ' days.', size: 38, muted: true }], foot: 'Semester 5 Study Map' });
  }


  /* ================================================================== v70: your own questions (photo / PDF / text -> Claude -> review -> exam bank) */
  var IMP = { sets: [] };
  var IMPD = null;   // the draft being read / reviewed
  function impLoad(){ try{ var o = JSON.parse(lsGet('s5v70-imp') || 'null'); if(o && o.sets) IMP = o; }catch(e){} }
  function impSaveLocal(){ lsSet('s5v70-imp', JSON.stringify(IMP)); }
  function impMerge(r){
    if(!r || !r.sets) return false; var ch = false;
    r.sets.forEach(function(rs){
      var ls = null; IMP.sets.forEach(function(s){ if(s.id === rs.id) ls = s; });
      if(!ls){ IMP.sets.push(rs); ch = true; }
      else if((rs.t||0) > (ls.t||0)){ IMP.sets[IMP.sets.indexOf(ls)] = rs; ch = true; }
    });
    return ch;
  }
  var impTm = 0, impBusy = false;
  function impPush(){
    clearTimeout(impTm);
    impTm = setTimeout(function(){
      if(!dbState.ok || !dbState.impRef) return;
      if(impBusy){ impPush(); return; }
      impBusy = true;
      Promise.resolve(dbState.impRef.get()).then(function(s){ try{ if(s && s.exists && impMerge(s.data().data)){ impSaveLocal(); impApply(); } }catch(e){} }, function(){})
        .then(function(){ return dbState.impRef.set({ data: JSON.parse(JSON.stringify(IMP)), saved: Date.now() }); })
        .then(function(){ impBusy = false; }, function(){ impBusy = false; });
    }, 600);
  }
  function impPull(){
    if(!dbState.ok || !dbState.impRef) return;
    Promise.resolve(dbState.impRef.get()).then(function(s){ try{ if(s && s.exists && impMerge(s.data().data)){ impSaveLocal(); impApply(); } }catch(e){} impPush(); }, function(){});
  }
  function impKeys(c){ return IMP.sets.filter(function(s){ return !s.del && s.course === c; }).map(function(s){ return s.course + ':imp-' + s.id; }); }
  function h(t){ return esc(t).replace(/\n/g, '<br>'); }
  // put the saved sets into the question bank (the same shape as the authored questions)
  function impApply(){
    for(var i = Q.length - 1; i >= 0; i--) if(Q[i].imp) Q.splice(i, 1);
    Object.keys(weekNames).forEach(function(k){ if(k.indexOf(':imp-') > -1) delete weekNames[k]; });
    IMP.sets.forEach(function(s){
      if(s.del || !COURSES[s.course]) return;
      var key = s.course + ':imp-' + s.id;
      weekNames[key] = '📎 ' + s.name;
      s.qs.forEach(function(x, n){
        Q.push({ id: key + '#' + (n+1), key: key, course: s.course, week: 'imp-' + s.id, kind: x.k, lvl: 1, text: x.x, exp: x.e || '',
                 opts: (x.o || []).map(function(o){ return { html: o.h, ok: !!o.ok }; }), tag: x.g || '', src: '', ans: x.a, tol: 0, unit: x.u || '', imp: true });
      });
    });
    try{ refreshAll(); }catch(e){}
    try{ slTabs(); }catch(e){}
    var ex = document.getElementById('exam'); if(ex && !ex.hidden && $('#ex-body .ex-grid')) renderSetup();
  }
  function impInit(){ impLoad(); impApply(); }

  /* ---- reading the files */
  function impReadText(file){
    return new Promise(function(res, rej){ var r = new FileReader(); r.onload = function(){ res(String(r.result || '')); }; r.onerror = function(){ rej(new Error('read')); }; r.readAsText(file); });
  }
  function impLoadPdfJs(){
    if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise(function(res, rej){
      var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = function(){ if(window.pdfjsLib){ window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); } else rej(new Error('pdf')); };
      s.onerror = function(){ rej(new Error('pdf')); };
      document.head.appendChild(s);
    });
  }
  // a PDF becomes text if it has a text layer, otherwise page pictures
  function impReadPdf(file, setMsg){
    return impLoadPdfJs().then(function(lib){
      return file.arrayBuffer().then(function(buf){ return lib.getDocument({ data: buf }).promise; });
    }).then(function(doc){
      var n = Math.min(doc.numPages, 40), texts = [], i = 1;
      function nextText(){
        if(i > n) return Promise.resolve();
        setMsg('Reading PDF page ' + i + ' of ' + n);
        return doc.getPage(i).then(function(p){ return p.getTextContent(); }).then(function(tc){
          texts.push(tc.items.map(function(it){ return it.str + (it.hasEOL ? '\n' : ' '); }).join('')); i++; return nextText();
        });
      }
      return nextText().then(function(){
        var all = texts.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
        if(all.replace(/\s/g, '').length > 80 * Math.min(n, 3)) return { text: all, images: [] };
        var imgs = [], j = 1;
        function nextImg(){
          if(j > Math.min(n, 12)) return Promise.resolve();
          setMsg('Turning PDF page ' + j + ' into a picture');
          return doc.getPage(j).then(function(p){
            var v0 = p.getViewport({ scale: 1 }), sc = Math.min(2, 1400 / Math.max(v0.width, v0.height) * 1.2), v = p.getViewport({ scale: sc });
            var cv = document.createElement('canvas'); cv.width = Math.round(v.width); cv.height = Math.round(v.height);
            return p.render({ canvasContext: cv.getContext('2d'), viewport: v }).promise.then(function(){
              return new Promise(function(r){ cv.toBlob(function(b){ if(b) imgs.push(b); r(); }, 'image/jpeg', 0.85); });
            });
          }).then(function(){ j++; return nextImg(); });
        }
        return nextImg().then(function(){ return { text: '', images: imgs }; });
      });
    });
  }
  var IMP_RULES = 'Turn this study material into practice questions for a student.\n' +
    'Return ONLY a JSON array, no other words and no code fences. Each item:\n' +
    '{"type":"mcq"|"multi"|"num"|"short","q":"the question text","options":["option text without the letter", ...],"correct":[0-based index numbers],"answer":number,"unit":"","exp":"1 to 3 plain sentences","known":true|false,"tag":"2 to 4 word topic"}\n' +
    'Rules:\n- Use the questions that are actually in the material. Keep their wording. Do not invent new topics.\n' +
    '- mcq = one correct option (correct has 1 number). multi = select all that apply (correct has 2 or more). num = a calculation with one number answer (put it in "answer"). short = written answer: put a good model answer in "exp".\n' +
    '- "known" is true only if the material shows the correct answer (an answer key, a tick, a highlighted option). If you worked it out yourself, known is false.\n' +
    '- "exp" says why the answer is right, in simple words. For short questions it is the model answer.\n' +
    '- If a question depends on a picture or graph you cannot read, still include it and write [see figure] in the question.\n- Skip titles, instructions and page numbers.\n';
  function impJson(t){
    var a = t.indexOf('['), b = t.lastIndexOf(']'); if(a < 0 || b <= a) return [];
    try{ var r = JSON.parse(t.slice(a, b + 1)); return Array.isArray(r) ? r : []; }catch(e){
      // a cut-off answer: keep every complete object up to the last closing brace
      var s = t.slice(a), k = s.lastIndexOf('},'); if(k < 0) return [];
      try{ return JSON.parse(s.slice(0, k + 1) + ']'); }catch(e2){ return []; }
    }
  }
  function impClean(r){
    if(!r || typeof r.q !== 'string' || r.q.trim().length < 6) return null;
    var type = String(r.type || 'short').toLowerCase(), opts = Array.isArray(r.options) ? r.options.map(function(o){ return String(o).replace(/^\s*[\(\[]?[A-Ha-h][\)\].:]\s+/, '').trim(); }).filter(Boolean) : [];
    var cor = Array.isArray(r.correct) ? r.correct.map(Number).filter(function(n){ return n >= 0 && n < opts.length; }) : [];
    var x = { x: h(r.q.trim()), e: r.exp ? h(String(r.exp).trim()) : '', g: r.tag ? String(r.tag).slice(0, 40) : '', w: r.known === false };
    if((type === 'mcq' || type === 'multi') && opts.length >= 2){
      if(type === 'mcq' && cor.length !== 1) type = cor.length > 1 ? 'multi' : 'mcq';
      if(!cor.length){ cor = [0]; x.w = true; }
      x.k = type === 'multi' && cor.length > 1 ? 'multi' : 'mcq'; if(x.k === 'mcq') cor = [cor[0]];
      x.o = opts.map(function(o, i){ return { h: h(o), ok: cor.indexOf(i) > -1 }; });
    } else if(type === 'num' && isFinite(parseFloat(r.answer))){ x.k = 'num'; x.a = parseFloat(r.answer); x.u = r.unit ? String(r.unit).slice(0, 12) : ''; }
    else { x.k = 'short'; if(!x.e) x.e = 'No model answer was found in the file. Check your notes.'; }
    return x;
  }
  function impChunks(text){
    var out = [], cur = '';
    text.split(/\n{2,}/).forEach(function(p){
      if((cur + p).length > 9000 && cur){ out.push(cur); cur = ''; }
      while(p.length > 9000){ out.push(p.slice(0, 9000)); p = p.slice(9000); }
      cur += (cur ? '\n\n' : '') + p;
    });
    if(cur.trim()) out.push(cur);
    return out.slice(0, 12);
  }
  function impAsk(prompt, images){
    var opt = { modelTier: 'default', cache: false, signal: IMPD && IMPD.ctl ? IMPD.ctl.signal : undefined };
    if(images && images.length) opt.images = images;
    return sampleFn2(prompt, opt);
  }
  var sampleFn2 = null;
  function impSample(){
    if(sampleFn2) return Promise.resolve(sampleFn2);
    if(!window.claude || !window.claude.use) return Promise.resolve(null);
    return Promise.resolve(window.claude.use('sample')).then(function(s){ sampleFn2 = s || null; return sampleFn2; }, function(){ return null; });
  }
  function impRun(draft, setMsg){
    return impSample().then(function(s){
      if(!s) throw { code: 'nosample' };
      var lim = null; try{ lim = s.limits ? s.limits() : null; }catch(e){}
      return Promise.resolve(lim).then(function(L){
        var maxN = (L && L.images && L.images.maxCount) || 4, jobs = [], units = [];
        var texts = [], imgs = [], i = 0;
        function nextFile(){
          if(i >= draft.files.length) return Promise.resolve();
          var f = draft.files[i++], nm = (f.name || '').toLowerCase();
          if(/^image\//.test(f.type)){ imgs.push(f); return nextFile(); }
          if(f.type === 'application/pdf' || /\.pdf$/.test(nm)) return impReadPdf(f, setMsg).then(function(r){ if(r.text) texts.push(r.text); r.images.forEach(function(b){ imgs.push(b); }); return nextFile(); });
          if(/\.docx$/.test(nm)) throw { code: 'docx' };
          return impReadText(f).then(function(t){ texts.push(t); return nextFile(); });
        }
        return nextFile().then(function(){
          if(draft.paste && draft.paste.trim()) texts.push(draft.paste);
          var chunks = impChunks(texts.join('\n\n'));
          if(chunks.length > 12) chunks.length = 12;
          for(var a = 0; a < chunks.length; a++) jobs.push({ text: chunks[a] });
          for(var b = 0; b < imgs.length; b += maxN) jobs.push({ images: imgs.slice(b, b + maxN) });
          if(!jobs.length) throw { code: 'empty' };
          var all = [], seen = {}, ji = 0;
          function nextJob(){
            if(ji >= jobs.length) return Promise.resolve(all);
            var j = jobs[ji++]; setMsg('Claude is reading part ' + ji + ' of ' + jobs.length + (all.length ? ' · ' + all.length + ' questions so far' : ''));
            var p = IMP_RULES + (j.text ? '\nThe material:\n"""\n' + j.text + '\n"""' : '\nThe material is in the attached picture(s), in order.');
            return impAsk(p, j.images).then(function(txt){
              impJson(txt).forEach(function(r){ var c = impClean(r); if(c){ var k = c.x.toLowerCase().slice(0, 80); if(!seen[k]){ seen[k] = 1; all.push(c); } } });
              return nextJob();
            });
          }
          return nextJob();
        });
      });
    });
  }

  /* ---- the sheet */
  function impEl(){ return document.getElementById('imp'); }
  function impOpen(){
    var p = impEl(); if(!p) return;
    var c0 = Object.keys(X.sel || {}).filter(function(c){ return X.sel[c]; })[0] || (cur && COURSES[cur.course] ? cur.course : 'micro');
    IMPD = { files: [], paste: '', course: c0, name: '', ctl: null, stage: 'pick', qs: [], err: '' };
    p.hidden = false; impPaint();
  }
  function impClose(){ var p = impEl(); if(!p) return; if(IMPD && IMPD.ctl){ try{ IMPD.ctl.abort(); }catch(e){} } p.hidden = true; IMPD = null; }
  function impPaint(){
    var p = impEl(), b = $('#imp-body'); if(!p || !b || !IMPD) return; b.innerHTML = '';
    var d = IMPD;
    if(d.stage === 'read'){ b.appendChild(el('div','imp-spin','<i></i><div id="imp-msg">Starting…</div><button class="stp-chip" type="button" id="imp-cancel">Cancel</button>')); $('#imp-cancel', b).addEventListener('click', function(){ if(d.ctl) try{ d.ctl.abort(); }catch(e){} d.stage = 'pick'; impPaint(); }); return; }
    if(d.stage === 'review'){ impPaintReview(b); return; }
    var lab = el('label','imp-lab','Course'); lab.setAttribute('for','imp-course'); b.appendChild(lab);
    var sel = el('select','imp-sel',''); sel.id = 'imp-course';
    Object.keys(COURSES).forEach(function(c){ var o = new Option(COURSES[c].name, c); if(c === d.course) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function(){ d.course = sel.value; }); b.appendChild(sel);
    var l2 = el('label','imp-lab','Name this set'); l2.setAttribute('for','imp-name'); b.appendChild(l2);
    var nm = el('input','imp-in',''); nm.id = 'imp-name'; nm.type = 'text'; nm.maxLength = 40; nm.placeholder = 'e.g. Pearson Ch. 5 practice'; nm.value = d.name;
    nm.addEventListener('input', function(){ d.name = nm.value; }); b.appendChild(nm);
    b.appendChild(el('span','imp-lab','Add the questions'));
    var dr = el('button','imp-drop','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l9.2-9.2a3.7 3.7 0 015.2 5.2l-9.2 9.2a1.8 1.8 0 01-2.6-2.6l8.4-8.4"/></svg><span>Attach photos, a PDF or a text file<small>Screenshots, camera photos, .pdf, .txt. Several files are fine.</small></span>');
    dr.type = 'button'; var fi = el('input',''); fi.type = 'file'; fi.multiple = true; fi.accept = 'image/*,application/pdf,.pdf,.txt,.md,.csv,text/plain'; fi.hidden = true;
    dr.addEventListener('click', function(){ fi.click(); });
    fi.addEventListener('change', function(){ Array.prototype.forEach.call(fi.files, function(f){ if(d.files.length < 30) d.files.push(f); }); if(!d.name && d.files.length) d.name = d.files[0].name.replace(/\.[^.]+$/, '').slice(0, 40); d.err = ''; impPaint(); });
    b.appendChild(dr); b.appendChild(fi);
    if(d.files.length){
      var fl = el('div','imp-files',''); d.files.forEach(function(f, i){ var s = el('span','','<b>' + esc(f.name) + '</b>'); var x = el('button','','✕'); x.type = 'button'; x.setAttribute('aria-label','Remove ' + f.name); x.addEventListener('click', function(){ d.files.splice(i, 1); impPaint(); }); s.appendChild(x); fl.appendChild(s); }); b.appendChild(fl);
    }
    var l3 = el('label','imp-lab','Or paste the text'); l3.setAttribute('for','imp-paste'); b.appendChild(l3);
    var ta = el('textarea','imp-ta',''); ta.id = 'imp-paste'; ta.placeholder = 'Paste questions here'; ta.value = d.paste;
    ta.addEventListener('input', function(){ d.paste = ta.value; go2.disabled = !(d.files.length || d.paste.trim()); }); b.appendChild(ta);
    if(d.err) b.appendChild(el('div','imp-msg err', esc(d.err)));
    var go2 = el('button','stp-btn imp-go','Read the questions'); go2.type = 'button'; go2.disabled = !(d.files.length || d.paste.trim());
    go2.addEventListener('click', impStart); b.appendChild(go2);
    b.appendChild(el('div','imp-msg','Claude reads your files and turns them into question cards. It uses a bit of your Claude usage, and you check every question before it is saved.'));
    impSets(b);
  }
  function impSets(b){
    var live = IMP.sets.filter(function(s){ return !s.del; }); if(!live.length) return;
    var w = el('div','imp-sets',''); w.appendChild(el('span','imp-lab','Your added sets'));
    live.forEach(function(s){
      var r = el('div','imp-set','<div><b>' + esc(s.name) + '</b><small>' + esc(COURSES[s.course] ? COURSES[s.course].name : s.course) + ' · ' + s.qs.length + ' questions</small></div>');
      var del = el('button','','Delete'); del.type = 'button'; var armed = 0;
      del.addEventListener('click', function(){
        if(!armed){ armed = 1; del.textContent = 'Tap again'; del.classList.add('sure'); setTimeout(function(){ armed = 0; del.textContent = 'Delete'; del.classList.remove('sure'); }, 3000); return; }
        s.del = true; s.t = Date.now(); s.qs = []; impSaveLocal(); impPush(); impApply(); impPaint();
      });
      r.appendChild(del); w.appendChild(r);
    });
    b.appendChild(w);
  }
  function impStart(){
    var d = IMPD; if(!d) return; d.stage = 'read'; d.err = ''; d.ctl = (typeof AbortController !== 'undefined') ? new AbortController() : { abort: function(){}, signal: undefined };
    impPaint();
    function setMsg(t){ var m = $('#imp-msg'); if(m) m.textContent = t; }
    impRun(d, setMsg).then(function(qs){
      if(IMPD !== d || d.stage !== 'read') return;
      if(!qs.length){ d.stage = 'pick'; d.err = 'I could not find any questions in that. Try a clearer photo, or paste the text.'; impPaint(); return; }
      d.qs = qs; d.stage = 'review'; if(!d.name) d.name = 'Imported ' + dkey(); impPaint();
    }, function(err){
      if(IMPD !== d || d.stage !== 'read') return;
      var c = err && err.code, m = 'Something went wrong while reading. Try again, or paste the text instead.';
      if(c === 'nosample' || c === 'not_granted') m = 'Reading files needs Claude to be allowed on this page. Allow it when asked, then try again.';
      else if(c === 'docx') m = 'Word files are not supported yet. Save it as a PDF, or paste the text.';
      else if(c === 'empty') m = 'There was nothing to read.';
      else if(c === 'images_unavailable') m = 'Sending pictures is not available here. Paste the text instead.';
      else if(c === 'rate_limited') m = 'Too many requests at once. Wait a moment and try again.';
      else if(err && err.message === 'pdf') m = 'Could not open the PDF here. Try a screenshot of the pages, or paste the text.';
      d.stage = 'pick'; d.err = m; impPaint();
    });
  }
  function impPaintReview(b){
    var d = IMPD, n = d.qs.length;
    b.appendChild(el('div','imp-msg', '<b>' + n + ' question' + (n === 1 ? '' : 's') + ' found.</b> Check them. Tap an option to change which one is right, and ✕ to drop a question.'));
    var worked = d.qs.filter(function(q){ return q.w; }).length;
    if(worked) b.appendChild(el('div','imp-msg', worked + ' have no answer key in your file, so Claude worked the answer out. Those say <b>check it</b>.'));
    d.qs.forEach(function(q, qi){
      var c = el('div','imp-q',''); var hd = el('div','imp-q-h','<p>' + (qi + 1) + '. ' + q.x + '</p>');
      var x = el('button','imp-q-x','✕'); x.type = 'button'; x.setAttribute('aria-label','Remove question ' + (qi + 1)); x.addEventListener('click', function(){ d.qs.splice(qi, 1); if(!d.qs.length){ d.stage = 'pick'; d.err = 'All questions were removed.'; } impPaint(); }); hd.appendChild(x); c.appendChild(hd);
      if(q.o) q.o.forEach(function(o, oi){
        var ob = el('button','imp-o' + (o.ok ? ' ok' : ''),'<i>' + (o.ok ? '✓' : '') + '</i><span>' + o.h + '</span>'); ob.type = 'button';
        ob.addEventListener('click', function(){ if(q.k === 'multi'){ o.ok = !o.ok; if(q.o.filter(function(z){ return z.ok; }).length < 2) o.ok = true; } else { q.o.forEach(function(z){ z.ok = false; }); o.ok = true; } q.w = false; impPaint(); });
        c.appendChild(ob);
      });
      if(q.k === 'num') c.appendChild(el('div','imp-exp','Answer: <b>' + q.a + (q.u ? ' ' + esc(q.u) : '') + '</b>'));
      if(q.k === 'short') c.appendChild(el('div','imp-exp','Written question. Model answer is shown after you try.'));
      if(q.w) c.appendChild(el('span','imp-tag','check it · answer worked out'));
      b.appendChild(c);
    });
    var sv = el('button','stp-btn imp-go','Save ' + n + ' question' + (n === 1 ? '' : 's')); sv.type = 'button'; sv.disabled = !n;
    sv.addEventListener('click', function(){
      var s = { id: Date.now().toString(36), course: d.course, name: (d.name || 'Imported').trim().slice(0, 40), t: Date.now(), qs: d.qs.map(function(q){ var o = {}; for(var k in q) if(k !== 'w') o[k] = q[k]; return o; }) };
      IMP.sets.push(s); impSaveLocal(); impPush(); X.sel[d.course] = true; X.chap = X.chap || {}; X.chap[s.course + ':imp-' + s.id] = true;
      var nq = s.qs.length; impClose(); impApply(); stToast('Saved ' + nq + ' questions to ' + (COURSES[s.course] ? COURSES[s.course].name : 'your course'));
    });
    b.appendChild(sv);
    var back = el('button','imp-go stp-chip','Start over'); back.type = 'button'; back.style.marginTop = '8px'; back.addEventListener('click', function(){ d.stage = 'pick'; d.qs = []; impPaint(); }); b.appendChild(back);
  }
  function impInitUi(){
    if(impEl()) return;
    var p = document.createElement('div'); p.className = 'stp lk imp'; p.id = 'imp'; p.hidden = true; p.setAttribute('role','dialog'); p.setAttribute('aria-modal','true'); p.setAttribute('aria-label','Add your own questions');
    p.innerHTML = '<div class="stp-box"><div class="stp-h"><h2>Add questions</h2><button class="stp-x" id="imp-x" type="button" aria-label="Close">✕</button></div><div id="imp-body"></div></div>';
    host().appendChild(p);
    p.addEventListener('click', function(e){ if(e.target === p && IMPD && IMPD.stage !== 'read') impClose(); });
    $('#imp-x').addEventListener('click', impClose);
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !p.hidden){ e.stopPropagation(); impClose(); } }, true);
  }

  /* ================================================================== v70: placed stickers, fonts, hide-buttons-while-scrolling */
  var STK = { items: [] };
  var STK_SET = ['⭐','💖','🌸','🍓','✨','🎀','🍀','☁️','🌈','🧋','🦋','🐱','📌','💡','⚠️','✅','❗','📎'];
  function stkLoad(){ try{ var o = JSON.parse(lsGet('s5v70-stk') || 'null'); if(o && o.items) STK = o; }catch(e){} }
  function stkSaveLocal(){ lsSet('s5v70-stk', JSON.stringify(STK)); }
  function stkMerge(r){
    if(!r || !r.items) return false; var ch = false;
    r.items.forEach(function(ri){
      var li = null; STK.items.forEach(function(s){ if(s.id === ri.id) li = s; });
      if(!li){ STK.items.push(ri); ch = true; } else if((ri.t||0) > (li.t||0)){ STK.items[STK.items.indexOf(li)] = ri; ch = true; }
    });
    return ch;
  }
  var stkTm = 0, stkBusy = false;
  function stkPush(){
    clearTimeout(stkTm);
    stkTm = setTimeout(function(){
      if(!dbState.ok || !dbState.stkRef) return;
      if(stkBusy){ stkPush(); return; }
      stkBusy = true;
      Promise.resolve(dbState.stkRef.get()).then(function(s){ try{ if(s && s.exists && stkMerge(s.data().data)){ stkSaveLocal(); stkRender(); } }catch(e){} }, function(){})
        .then(function(){ return dbState.stkRef.set({ data: JSON.parse(JSON.stringify(STK)), saved: Date.now() }); })
        .then(function(){ stkBusy = false; }, function(){ stkBusy = false; });
    }, 700);
  }
  function stkPull(){
    if(!dbState.ok || !dbState.stkRef) return;
    Promise.resolve(dbState.stkRef.get()).then(function(s){ try{ if(s && s.exists && stkMerge(s.data().data)){ stkSaveLocal(); stkRender(); } }catch(e){} stkPush(); }, function(){});
  }
  function stkChanged(it){ it.t = Date.now(); stkSaveLocal(); stkPush(); }
  function stkPanels(){ return $$('.week-panel'); }
  function stkKeyOf(p){ var cp = p.closest('.course-panel'); return (cp ? cp.dataset.course : '?') + ':' + p.dataset.week; }
  function stkRender(){
    stkPanels().forEach(function(p){
      var key = stkKeyOf(p), layer = p.querySelector(':scope > .stk-layer');
      var list = STK.items.filter(function(i){ return !i.del && i.key === key; });
      if(!list.length){ if(layer) layer.remove(); return; }
      if(!layer){ layer = document.createElement('div'); layer.className = 'stk-layer'; p.appendChild(layer); }
      var have = {}; $$('.stk', layer).forEach(function(n){ have[n.dataset.id] = n; });
      var ids = {};
      list.forEach(function(it){
        ids[it.id] = 1; var n = have[it.id];
        if(!n){ n = stkMake(it); layer.appendChild(n); }
        if(!n.classList.contains('drag')){ stkPlace(n, it, p); }
      });
      Object.keys(have).forEach(function(id){ if(!ids[id]) have[id].remove(); });
    });
  }
  function stkPlace(n, it, p){
    n.style.left = (it.x * 100) + '%'; n.style.top = Math.round(it.y * p.offsetHeight) + 'px'; n.style.fontSize = it.s + 'px';
  }
  function stkMake(it){
    var n = document.createElement('div'); n.className = 'stk'; n.dataset.id = it.id; n.setAttribute('role','img'); n.setAttribute('aria-label','Sticker');
    n.innerHTML = '<span class="stk-e"></span><div class="stk-ctl"><button type="button" data-a="-" aria-label="Smaller">−</button><button type="button" data-a="+" aria-label="Bigger">+</button><button type="button" data-a="x" aria-label="Remove sticker">🗑</button></div>';
    n.firstChild.textContent = it.e;
    var sx = 0, sy = 0, moved = false, p = null, down = false;
    n.addEventListener('pointerdown', function(e){
      if(e.target.closest('.stk-ctl')) return;
      e.preventDefault(); down = true; moved = false; p = n.closest('.week-panel'); sx = e.clientX; sy = e.clientY; try{ n.setPointerCapture(e.pointerId); }catch(er){}
    });
    n.addEventListener('pointermove', function(e){
      if(!down || !p) return;
      if(!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 14) return;
      moved = true; n.classList.add('drag');
      var r = p.getBoundingClientRect(); it.x = Math.max(0.02, Math.min(0.98, (e.clientX - r.left) / r.width)); it.y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      stkPlace(n, it, p);
    });
    function up(){ if(!down) return; down = false; n.classList.remove('drag'); if(moved){ stkChanged(it); } else { var was = n.classList.contains('sel'); $$('.stk.sel').forEach(function(z){ z.classList.remove('sel'); }); if(!was) n.classList.add('sel'); } }
    n.addEventListener('pointerup', up); n.addEventListener('pointercancel', up);
    n.querySelector('.stk-ctl').addEventListener('click', function(e){
      var b = e.target.closest('button'); if(!b) return; e.stopPropagation();
      if(b.dataset.a === 'x'){ it.del = true; stkChanged(it); n.remove(); return; }
      it.s = Math.max(18, Math.min(110, it.s + (b.dataset.a === '+' ? 8 : -8))); stkChanged(it); stkPlace(n, it, n.closest('.week-panel'));
    });
    return n;
  }
  function stkAdd(emoji){
    var p = $$('.week-panel').filter(function(x){ return !x.hidden && x.offsetParent !== null; })[0];
    if(!p){ stToast('Open a chapter first, then add a sticker'); return; }
    var r = p.getBoundingClientRect(), vy = window.innerHeight * 0.45;
    var it = { id: Date.now().toString(36) + Math.floor(Math.random() * 99), key: stkKeyOf(p), e: emoji, x: Math.max(0.1, Math.min(0.9, (window.innerWidth / 2 - r.left) / r.width)), y: Math.max(0.01, Math.min(0.99, (vy - r.top) / r.height)), s: 44, t: Date.now() };
    STK.items.push(it); stkSaveLocal(); stkPush(); stkRender();
    var lk = $('#lk'); if(lk) lk.hidden = true;
    var n = $('.stk[data-id="' + it.id + '"]'); if(n){ n.classList.add('sel'); }
    stToast('Drag it where you want. Tap it to resize or remove.');
  }
  document.addEventListener('pointerdown', function(e){ if(!e.target.closest || !e.target.closest('.stk')) $$('.stk.sel').forEach(function(z){ z.classList.remove('sel'); }); }, true);

  /* fonts */
  var FONTS = [['','Default','Aa','Source Serif 4 and Inter'],['soft','Soft','Aa','Round and friendly'],['easy','Easy read','Aa','Wide, clear letters'],['note','Notebook','Aa','Handwritten headings'],['book','Book','Aa','All serif']];
  var FONT_FAM = { soft:'Nunito', easy:'Lexend', note:'Patrick Hand', book:'Source Serif 4' };
  function fontLoad(){
    if(document.getElementById('gf-s5')) return;
    var l = document.createElement('link'); l.id = 'gf-s5'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;600&family=Nunito:wght@400;600;700&family=Patrick+Hand&family=Source+Serif+4:wght@400;600&display=swap';
    document.head.appendChild(l);
  }
  function fontSet(k, save){
    var r = host(); if(k) r.setAttribute('data-font', k); else r.removeAttribute('data-font');
    if(k) fontLoad(); if(save !== false) lsSet('s5v70-font', k || '');
    $$('.lk-font').forEach(function(b){ b.setAttribute('aria-pressed', (b.dataset.f || '') === (k || '') ? 'true' : 'false'); });
  }
  /* hide the floating buttons while scrolling */
  var FAB_AWAY = true, fabTm = 0, fabY = 0;
  function fabInit(){
    FAB_AWAY = lsGet('s5v70-fabhide') !== '0'; var gone = false;
    window.addEventListener('scroll', function(){
      if(!FAB_AWAY || document.body.classList.contains('pg-on')) return; var y = window.pageYOffset || 0;
      if(!gone){ if(Math.abs(y - fabY) < 6) return; gone = true; host().classList.add('fab-away'); }
      fabY = y; clearTimeout(fabTm); fabTm = setTimeout(function(){ gone = false; host().classList.remove('fab-away'); }, 180);
    }, { passive: true });
  }
  function stkInit(){ stkLoad(); stkRender(); window.addEventListener('resize', function(){ clearTimeout(window.__stkT); window.__stkT = setTimeout(stkRender, 150); }); }

  /* ================================================================== v71: add a lecture deck inside the app (slides -> notes + questions, saved as a personal chapter) */
  var SLD = null;
  function slLoadZip(){
    if(window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise(function(res, rej){
      var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = function(){ window.JSZip ? res(window.JSZip) : rej(new Error('zip')); }; s.onerror = function(){ rej(new Error('zip')); };
      document.head.appendChild(s);
    });
  }
  function slReadPptx(file){
    return slLoadZip().then(function(Z){ return file.arrayBuffer().then(function(b){ return Z.loadAsync(b); }); }).then(function(zip){
      var names = Object.keys(zip.files).filter(function(n){ return /^ppt\/slides\/slide\d+\.xml$/.test(n); }).sort(function(a, b){ return parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(b.match(/(\d+)\.xml/)[1], 10); });
      var out = [], i = 0;
      function next(){
        if(i >= names.length) return Promise.resolve(out);
        return zip.files[names[i++]].async('string').then(function(x){
          var t = x.split(/<\/a:p>/).map(function(p){ var m = p.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || []; return m.map(function(z){ return z.replace(/<[^>]+>/g, ''); }).join(''); }).filter(function(z){ return z.trim(); }).join('\n')
            .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
          out.push(t); return next();
        });
      }
      return next();
    });
  }
  // a PDF becomes one text per page, or page pictures when there is no text layer
  function slReadPdf(file, setMsg){
    return impLoadPdfJs().then(function(lib){ return file.arrayBuffer().then(function(buf){ return lib.getDocument({ data: buf }).promise; }); }).then(function(doc){
      var n = Math.min(doc.numPages, 160), pages = [], i = 1;
      function nextText(){
        if(i > n) return Promise.resolve();
        setMsg('Reading page ' + i + ' of ' + n);
        return doc.getPage(i).then(function(p){ return p.getTextContent(); }).then(function(tc){ pages.push(tc.items.map(function(it){ return it.str + (it.hasEOL ? '\n' : ' '); }).join('').replace(/[ \t]+\n/g, '\n').trim()); i++; return nextText(); });
      }
      return nextText().then(function(){
        var chars = pages.join('').replace(/\s/g, '').length;
        if(chars > 40 * Math.min(n, 5)) return { pages: pages, images: [] };
        var imgs = [], j = 1, cap = Math.min(n, 24);
        function nextImg(){
          if(j > cap) return Promise.resolve();
          setMsg('Turning page ' + j + ' of ' + cap + ' into a picture');
          return doc.getPage(j).then(function(p){
            var v0 = p.getViewport({ scale: 1 }), sc = Math.min(2, 1400 / Math.max(v0.width, v0.height) * 1.2), v = p.getViewport({ scale: sc });
            var cv = document.createElement('canvas'); cv.width = Math.round(v.width); cv.height = Math.round(v.height);
            return p.render({ canvasContext: cv.getContext('2d'), viewport: v }).promise.then(function(){ return new Promise(function(r){ cv.toBlob(function(b){ if(b) imgs.push(b); r(); }, 'image/jpeg', 0.8); }); });
          }).then(function(){ j++; return nextImg(); });
        }
        return nextImg().then(function(){ return { pages: [], images: imgs, cut: n > cap }; });
      });
    });
  }
  var SL_RULES = 'You are making study notes from lecture slides for a college student. Use ONLY what is on the slides. Do not add outside facts.\n' +
    'Return ONLY JSON (no other words, no code fences): {"sections":[{"h":"short heading","s":"slide range like 4-6","b":["bullet in plain words; keep numbers, lists and definitions exact"],"t":[{"k":"term","d":"its definition from the slides"}]}],"questions":[{"type":"mcq"|"multi"|"num"|"short","q":"","options":[],"correct":[0-based numbers],"answer":number,"unit":"","exp":"1 to 3 plain sentences","known":true,"tag":"2 to 4 word topic"}]}\n' +
    'Rules:\n- 3 to 7 sections for this part. Group slides by topic. Bullets are short. Put real definitions in "t".\n' +
    '- QRULE\n' +
    '- Skip title slides, agendas and thank-you slides.\n';
  var SL_Q = '4 to 6 practice questions for this part, mostly mcq, one or two short. Questions must be answerable from these slides. For short questions put the model answer in "exp".';
  var SL_NOQ = 'Leave "questions" as an empty array for now.';
  function slRules(better){ return SL_RULES.replace('QRULE', better ? SL_NOQ : SL_Q); }
  var SL_QONLY = 'You are writing practice questions for a college student from their study notes below. Use ONLY these notes. Return ONLY JSON: {"questions":[{"type":"mcq"|"multi"|"num"|"short","q":"","options":[],"correct":[0-based numbers],"answer":number,"unit":"","exp":"1 to 3 plain sentences","known":true,"tag":"2 to 4 word topic"}]}\nRules: write about COUNT questions spread across all the topics, mostly multiple choice with 4 options and one clearly correct answer, a few select-all and short answer. Check each answer against the notes. Do not trick the student with wording. For short questions put the model answer in "exp".\n';
  function slSlideChunks(pages){
    var out = [], cur = '', from = 1, n = 0;
    pages.forEach(function(t, i){
      if(!t || t.replace(/\s/g, '').length < 4) return;
      var piece = 'Slide ' + (i + 1) + ':\n' + t.slice(0, 2500) + '\n\n';
      if(cur.length + piece.length > 7000 && cur){ out.push(cur); cur = ''; }
      cur += piece;
    });
    if(cur) out.push(cur);
    return out.slice(0, 18);
  }
  function slClean(sec){
    if(!sec || typeof sec.h !== 'string') return null;
    var b = Array.isArray(sec.b) ? sec.b.map(function(x){ return String(x).trim(); }).filter(Boolean).slice(0, 14) : [];
    var t = Array.isArray(sec.t) ? sec.t.filter(function(z){ return z && z.k && z.d; }).map(function(z){ return { k: String(z.k).trim().slice(0, 80), d: String(z.d).trim().slice(0, 400) }; }).slice(0, 10) : [];
    if(!b.length && !t.length) return null;
    return { h: String(sec.h).trim().slice(0, 90), s: sec.s ? String(sec.s).slice(0, 14) : '', b: b, t: t };
  }
  function slObj(txt){
    var a = txt.indexOf('{'), z = txt.lastIndexOf('}'); if(a < 0 || z <= a) return null;
    try{ return JSON.parse(txt.slice(a, z + 1)); }catch(e){ return null; }
  }
  function slRun(d, setMsg){
    return impSample().then(function(s){
      if(!s) throw { code: 'nosample' };
      var lim = null; try{ lim = s.limits ? s.limits() : null; }catch(e){}
      return Promise.resolve(lim).then(function(L){
        var maxN = (L && L.images && L.images.maxCount) || 4, pagesAll = [], imgs = [], i = 0, cut = false;
        function nextFile(){
          if(i >= d.files.length) return Promise.resolve();
          var f = d.files[i++], nm = (f.name || '').toLowerCase();
          if(/^image\//.test(f.type)){ imgs.push(f); return nextFile(); }
          if(f.type === 'application/pdf' || /\.pdf$/.test(nm)) return slReadPdf(f, setMsg).then(function(r){ pagesAll = pagesAll.concat(r.pages); r.images.forEach(function(b){ imgs.push(b); }); if(r.cut) cut = true; return nextFile(); });
          if(/\.pptx$/.test(nm)){ setMsg('Opening the PowerPoint'); return slReadPptx(f).then(function(p){ pagesAll = pagesAll.concat(p); return nextFile(); }); }
          if(/\.(ppt|key|docx?)$/.test(nm)) throw { code: 'format' };
          return impReadText(f).then(function(t){ pagesAll.push(t); return nextFile(); });
        }
        return nextFile().then(function(){
          var jobs = slSlideChunks(pagesAll).map(function(t){ return { text: t }; });
          for(var b = 0; b < imgs.length; b += maxN) jobs.push({ images: imgs.slice(b, b + maxN), from: b + 1, to: Math.min(b + maxN, imgs.length) });
          if(!jobs.length) throw { code: 'empty' };
          var secs = [], qs = [], seen = {}, ji = 0;
          function nextJob(){
            if(ji >= jobs.length){
              if(d.mode !== 'better' || !secs.length) return Promise.resolve({ sections: secs, qs: qs, cut: cut });
              setMsg('Writing the practice questions');
              var notes = secs.map(function(z){ return z.h + ':\n' + z.b.join('\n') + (z.t.length ? '\n' + z.t.map(function(y){ return y.k + ' = ' + y.d; }).join('\n') : ''); }).join('\n\n').slice(0, 60000);
              var cnt = Math.max(6, Math.min(30, secs.length * 3));
              return sampleFn2(SL_QONLY.replace('COUNT', String(cnt)) + '\nThe notes:\n"""\n' + notes + '\n"""', { modelTier: 'default', cache: false, signal: d.ctl ? d.ctl.signal : undefined }).then(function(txt){
                var o = slObj(txt) || {}; (o.questions || []).forEach(function(r){ var c = impClean(r); if(c){ var k = c.x.toLowerCase().slice(0, 80); if(!seen[k]){ seen[k] = 1; qs.push(c); } } });
                return { sections: secs, qs: qs, cut: cut };
              });
            }
            var j = jobs[ji++]; setMsg('Claude is reading part ' + ji + ' of ' + jobs.length + (secs.length ? ' · ' + secs.length + ' sections so far' : ''));
            var p = slRules(d.mode === 'better') + (j.text ? '\nThe slides:\n"""\n' + j.text + '\n"""' : '\nThe slides are the attached pictures (slides ' + j.from + ' to ' + j.to + ' of the deck, in order).');
            var opt = { modelTier: 'quick', cache: false, signal: d.ctl ? d.ctl.signal : undefined }; if(j.images) opt.images = j.images;
            return sampleFn2(p, opt).then(function(txt){
              var o = slObj(txt) || {};
              (o.sections || []).forEach(function(x){ var c = slClean(x); if(c) secs.push(c); });
              (o.questions || []).forEach(function(r){ var c = impClean(r); if(c){ var k = c.x.toLowerCase().slice(0, 80); if(!seen[k]){ seen[k] = 1; qs.push(c); } } });
              return nextJob();
            });
          }
          return nextJob();
        });
      });
    });
  }
  function slEl(){ return document.getElementById('sld'); }
  function slOpen(course){
    var p = slEl(); if(!p) return;
    SLD = { files: [], course: course || (cur && COURSES[cur.course] ? cur.course : 'micro'), name: '', stage: 'pick', err: '', ctl: null, secs: [], qs: [], cut: false, mode: lsGet('s5v71-slmode') === 'better' ? 'better' : 'fast' };
    p.hidden = false; slPaint();
  }
  function slClose(){ var p = slEl(); if(!p) return; if(SLD && SLD.ctl){ try{ SLD.ctl.abort(); }catch(e){} } p.hidden = true; SLD = null; }
  function slPaint(){
    var b = $('#sld-body'), d = SLD; if(!b || !d) return; b.innerHTML = '';
    if(d.stage === 'read'){ b.appendChild(el('div','imp-spin','<i></i><div id="sld-msg">Starting…</div><button class="stp-chip" type="button" id="sld-cancel">Cancel</button>')); $('#sld-cancel', b).addEventListener('click', function(){ if(d.ctl) try{ d.ctl.abort(); }catch(e){} d.stage = 'pick'; slPaint(); }); return; }
    if(d.stage === 'review'){ slPaintReview(b); return; }
    var l1 = el('label','imp-lab','Course'); l1.setAttribute('for','sld-course'); b.appendChild(l1);
    var sel = el('select','imp-sel',''); sel.id = 'sld-course'; Object.keys(COURSES).forEach(function(c){ var o = new Option(COURSES[c].name, c); if(c === d.course) o.selected = true; sel.appendChild(o); }); sel.addEventListener('change', function(){ d.course = sel.value; }); b.appendChild(sel);
    var l2 = el('label','imp-lab','Chapter name'); l2.setAttribute('for','sld-name'); b.appendChild(l2);
    var nm = el('input','imp-in',''); nm.id = 'sld-name'; nm.type = 'text'; nm.maxLength = 40; nm.placeholder = 'e.g. Week 9 · Pricing'; nm.value = d.name; nm.addEventListener('input', function(){ d.name = nm.value; }); b.appendChild(nm);
    b.appendChild(el('span','imp-lab','The slides'));
    var dr = el('button','imp-drop','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l9.2-9.2a3.7 3.7 0 015.2 5.2l-9.2 9.2a1.8 1.8 0 01-2.6-2.6l8.4-8.4"/></svg><span>Attach the lecture slides<small>PDF or PowerPoint (.pptx). Screenshots work too.</small></span>'); dr.type = 'button';
    var fi = el('input',''); fi.type = 'file'; fi.multiple = true; fi.hidden = true; fi.accept = '.pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*,.txt';
    dr.addEventListener('click', function(){ fi.click(); });
    fi.addEventListener('change', function(){ Array.prototype.forEach.call(fi.files, function(f){ if(d.files.length < 10) d.files.push(f); }); if(!d.name && d.files.length) d.name = d.files[0].name.replace(/\.[^.]+$/, '').slice(0, 40); d.err = ''; slPaint(); });
    b.appendChild(dr); b.appendChild(fi);
    if(d.files.length){ var fl = el('div','imp-files',''); d.files.forEach(function(f, i){ var s = el('span','','<b>' + esc(f.name) + '</b>'); var x = el('button','','✕'); x.type = 'button'; x.setAttribute('aria-label','Remove ' + f.name); x.addEventListener('click', function(){ d.files.splice(i, 1); slPaint(); }); s.appendChild(x); fl.appendChild(s); }); b.appendChild(fl); }
    b.appendChild(el('span','imp-lab','Quality'));
    var qw = el('div','stp-chips',''); qw.style.display = 'grid'; qw.style.gridTemplateColumns = '1fr 1fr'; qw.style.gap = '8px';
    [['fast','Fast','Cheapest. Notes and questions on the quick model.'],['better','Better','Quick model for notes, a stronger one for the questions.']].forEach(function(m){
      var bt = el('button','lk-font','<b style="font-size:1rem">' + m[1] + '</b><span>' + m[2] + '</span>'); bt.type = 'button'; bt.setAttribute('aria-pressed', d.mode === m[0] ? 'true' : 'false');
      bt.addEventListener('click', function(){ d.mode = m[0]; lsSet('s5v71-slmode', m[0]); slPaint(); }); qw.appendChild(bt);
    }); b.appendChild(qw);
    if(d.err) b.appendChild(el('div','imp-msg err', esc(d.err)));
    var go2 = el('button','stp-btn imp-go','Make the chapter'); go2.type = 'button'; go2.disabled = !d.files.length; go2.addEventListener('click', slStart); b.appendChild(go2);
    b.appendChild(el('div','imp-msg','Claude reads the slides and writes short notes plus practice questions, using only what is on the slides. It takes about a minute and uses a little of your Claude usage. You check it before it is saved.'));
    var mine = IMP.sets.filter(function(s){ return !s.del && s.notes; });
    if(mine.length){ var w = el('div','imp-sets',''); w.appendChild(el('span','imp-lab','Your added chapters')); mine.forEach(function(s){ var r = el('div','imp-set','<div><b>' + esc(s.name) + '</b><small>' + esc(COURSES[s.course] ? COURSES[s.course].name : s.course) + ' · ' + s.notes.length + ' sections · ' + s.qs.length + ' questions</small></div>'); var ob = el('button','','Open'); ob.type = 'button'; ob.addEventListener('click', function(){ slClose(); rdOpen(s.id); }); r.appendChild(ob); w.appendChild(r); }); b.appendChild(w); }
  }
  function slStart(){
    var d = SLD; if(!d) return; d.stage = 'read'; d.err = ''; d.ctl = (typeof AbortController !== 'undefined') ? new AbortController() : { abort: function(){}, signal: undefined }; slPaint();
    function setMsg(t){ var m = $('#sld-msg'); if(m) m.textContent = t; }
    slRun(d, setMsg).then(function(r){
      if(SLD !== d || d.stage !== 'read') return;
      if(!r.sections.length){ d.stage = 'pick'; d.err = 'I could not find any text on those slides. Try the PDF version, or screenshots of the slides.'; slPaint(); return; }
      d.secs = r.sections; d.qs = r.qs; d.cut = r.cut; d.stage = 'review'; if(!d.name) d.name = 'Slides ' + dkey(); slPaint();
    }, function(err){
      if(SLD !== d || d.stage !== 'read') return;
      var c = err && err.code, m = 'Something went wrong while reading. Try again in a moment.';
      if(c === 'nosample' || c === 'not_granted') m = 'Reading slides needs Claude to be allowed on this page. Allow it when asked, then try again.';
      else if(c === 'format') m = 'That file type is not supported. Save the slides as a PDF or .pptx.';
      else if(c === 'empty') m = 'There was nothing to read in those files.';
      else if(c === 'images_unavailable') m = 'Sending pictures is not available here. Use a PDF or .pptx with text.';
      else if(c === 'rate_limited') m = 'Too many requests at once. Wait a moment and try again.';
      else if(err && (err.message === 'pdf' || err.message === 'zip')) m = 'Could not open that file here. Try the PDF version of the slides.';
      d.stage = 'pick'; d.err = m; slPaint();
    });
  }
  function slPaintReview(b){
    var d = SLD;
    b.appendChild(el('div','imp-msg','<b>' + d.secs.length + ' sections and ' + d.qs.length + ' questions.</b> Drop anything that looks wrong with ✕. Notes only use your slides, but read them once before you rely on them.' + (d.cut ? ' Only the first 24 pages were read because the slides are pictures.' : '')));
    var nl = el('label','imp-lab','Chapter name'); nl.setAttribute('for','sld-name2'); b.appendChild(nl);
    var nm = el('input','imp-in',''); nm.id = 'sld-name2'; nm.type = 'text'; nm.maxLength = 40; nm.value = d.name; nm.addEventListener('input', function(){ d.name = nm.value; }); b.appendChild(nm);
    b.appendChild(el('span','imp-lab','Notes'));
    d.secs.forEach(function(sc, si){
      var c = el('div','imp-q',''); var hd = el('div','imp-q-h','<p>' + esc(sc.h) + (sc.s ? ' <span class="imp-tag" style="margin:0 0 0 4px">slides ' + esc(sc.s) + '</span>' : '') + '</p>');
      var x = el('button','imp-q-x','✕'); x.type = 'button'; x.setAttribute('aria-label','Remove section ' + sc.h); x.addEventListener('click', function(){ d.secs.splice(si, 1); slPaint(); }); hd.appendChild(x); c.appendChild(hd);
      var ul = el('ul','imp-exp',''); ul.style.paddingLeft = '1.1em'; sc.b.slice(0, 3).forEach(function(z){ ul.appendChild(el('li','', esc(z))); }); if(sc.b.length > 3) ul.appendChild(el('li','', '… +' + (sc.b.length - 3) + ' more' + (sc.t.length ? ', ' + sc.t.length + ' terms' : ''))); c.appendChild(ul); b.appendChild(c);
    });
    b.appendChild(el('span','imp-lab','Questions (' + d.qs.length + ')'));
    d.qs.forEach(function(q, qi){
      var c = el('div','imp-q',''); var hd = el('div','imp-q-h','<p>' + (qi + 1) + '. ' + q.x + '</p>');
      var x = el('button','imp-q-x','✕'); x.type = 'button'; x.setAttribute('aria-label','Remove question ' + (qi + 1)); x.addEventListener('click', function(){ d.qs.splice(qi, 1); slPaint(); }); hd.appendChild(x); c.appendChild(hd);
      if(q.o) q.o.forEach(function(o){ c.appendChild(el('div','imp-o' + (o.ok ? ' ok' : ''),'<i>' + (o.ok ? '✓' : '') + '</i><span>' + o.h + '</span>')); });
      b.appendChild(c);
    });
    var sv = el('button','stp-btn imp-go','Save chapter'); sv.type = 'button'; sv.disabled = !d.secs.length;
    sv.addEventListener('click', function(){
      var s = { id: Date.now().toString(36), course: d.course, name: (d.name || 'Slides').trim().slice(0, 40), t: Date.now(), notes: d.secs, qs: d.qs.map(function(q){ var o = {}; for(var k in q) if(k !== 'w') o[k] = q[k]; return o; }) };
      IMP.sets.push(s); impSaveLocal(); impPush(); impApply(); slClose(); slTabs(); rdOpen(s.id);
    });
    b.appendChild(sv);
    var back = el('button','imp-go stp-chip','Start over'); back.type = 'button'; back.style.marginTop = '8px'; back.addEventListener('click', function(){ d.stage = 'pick'; d.secs = []; d.qs = []; slPaint(); }); b.appendChild(back);
  }
  /* the reader for a chapter you added */
  function rdEl(){ return document.getElementById('rd'); }
  function rdOpen(id){
    var set = null; IMP.sets.forEach(function(s){ if(s.id === id && !s.del) set = s; }); var p = rdEl(); if(!set || !p) return;
    var b = $('#rd-body'); b.innerHTML = ''; $('#rd-title').textContent = set.name;
    b.appendChild(el('div','imp-exp', esc(COURSES[set.course] ? COURSES[set.course].name : '') + ' · made from your slides by Claude. Check it against the slides before an exam.'));
    set.notes.forEach(function(sc){
      var c = el('div','info-card rd-card','<h3>' + esc(sc.h) + '</h3>'); if(sc.s) c.appendChild(el('small','imp-exp','slides ' + esc(sc.s)));
      if(sc.b.length){ var ul = el('ul',''); sc.b.forEach(function(z){ ul.appendChild(el('li','', esc(z))); }); c.appendChild(ul); }
      if(sc.t.length){ var dl = el('div','rd-terms',''); sc.t.forEach(function(z){ dl.appendChild(el('p','','<b>' + esc(z.k) + '</b> ' + esc(z.d))); }); c.appendChild(dl); }
      b.appendChild(c);
    });
    var bar = el('div','imp-sets','');
    var q = el('button','stp-btn imp-go','Quiz me on this (' + set.qs.length + ')'); q.type = 'button'; q.disabled = !set.qs.length;
    q.addEventListener('click', function(){ p.hidden = true; var ex = document.getElementById('exam'); X.sel = {}; X.chap = {}; X.sel[set.course] = true; X.chap[set.course + ':imp-' + set.id] = true; if(ex && ex.hidden){ openExam({ preset: [set.course + ':imp-' + set.id] }); } else renderSetup(); });
    bar.appendChild(q);
    var del = el('button','imp-go stp-chip','Delete this chapter'); del.type = 'button'; del.style.marginTop = '8px'; var armed = 0;
    del.addEventListener('click', function(){ if(!armed){ armed = 1; del.textContent = 'Tap again to delete'; setTimeout(function(){ armed = 0; del.textContent = 'Delete this chapter'; }, 3000); return; } set.del = true; set.t = Date.now(); set.qs = []; set.notes = []; impSaveLocal(); impPush(); impApply(); slTabs(); p.hidden = true; });
    bar.appendChild(del); b.appendChild(bar);
    p.hidden = false; $('#rd .stp-box').scrollTop = 0;
  }
  /* quiet entry points: the end of each course's tab row, plus the course menu */
  function slTabs(){
    $$('.weektabs').forEach(function(nav){
      $$('.sl-chip', nav).forEach(function(n){ n.remove(); });
      var c = nav.dataset.scope; if(!COURSES[c]) return;
      IMP.sets.filter(function(s){ return !s.del && s.notes && s.course === c; }).forEach(function(s){
        var k = el('button','sl-chip','📎 ' + esc(s.name)); k.type = 'button'; k.addEventListener('click', function(){ rdOpen(s.id); }); nav.appendChild(k);
      });
      var a = el('button','sl-chip sl-add','＋ Slides'); a.type = 'button'; a.setAttribute('aria-label','Add lecture slides to ' + COURSES[c].name); a.addEventListener('click', function(){ slOpen(c); }); nav.appendChild(a);
    });
  }
  function slInitUi(){
    if(slEl()) return;
    var p = document.createElement('div'); p.className = 'stp lk imp'; p.id = 'sld'; p.hidden = true; p.setAttribute('role','dialog'); p.setAttribute('aria-modal','true'); p.setAttribute('aria-label','Add lecture slides');
    p.innerHTML = '<div class="stp-box"><div class="stp-h"><h2>Add slides</h2><button class="stp-x" id="sld-x" type="button" aria-label="Close">✕</button></div><div id="sld-body"></div></div>'; host().appendChild(p);
    p.addEventListener('click', function(e){ if(e.target === p && SLD && SLD.stage !== 'read') slClose(); });
    $('#sld-x').addEventListener('click', slClose);
    var r = document.createElement('div'); r.className = 'stp lk imp'; r.id = 'rd'; r.hidden = true; r.setAttribute('role','dialog'); r.setAttribute('aria-modal','true'); r.setAttribute('aria-label','Your chapter');
    r.innerHTML = '<div class="stp-box"><div class="stp-h"><h2 id="rd-title">Chapter</h2><button class="stp-x" id="rd-x" type="button" aria-label="Close">✕</button></div><div id="rd-body"></div></div>'; host().appendChild(r);
    r.addEventListener('click', function(e){ if(e.target === r) r.hidden = true; }); $('#rd-x').addEventListener('click', function(){ r.hidden = true; });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ if(!p.hidden){ e.stopPropagation(); slClose(); } else if(!r.hidden){ e.stopPropagation(); r.hidden = true; } } }, true);
    var help = $('#open-help');
    if(help && help.parentNode && !$('#open-slides')){
      var m = el('button','hp-row','<b aria-hidden="true">＋</b>Add lecture slides'); m.type = 'button'; m.id = 'open-slides'; m.addEventListener('click', function(){ closePicker(); slOpen(cur && COURSES[cur.course] ? cur.course : null); });
      help.parentNode.insertBefore(m, help);
    }
    slTabs();
  }


  /* ---- chapter picker (one pill, list on tap) */
  function chapTabs(c){ return $$('.weektabs[data-scope="'+c+'"] .weektab'); }
  function chapSync(c){
    var bar = $('.chap[data-scope="'+c+'"]'); if(!bar) return;
    var tabs = chapTabs(c), i = -1; tabs.forEach(function(t,k){ if(t.classList.contains('active')) i = k; });
    $('.chap-cur', bar).textContent = i >= 0 ? tabs[i].textContent.trim() : 'Chapters';
    $('.chap-prev', bar).disabled = i <= 0;
    $('.chap-next', bar).disabled = i < 0 || i >= tabs.length - 1;
  }
  function chapKeep(c){ var bar = $('.chap[data-scope="'+c+'"]'); if(!bar) return; var r = bar.getBoundingClientRect(); if(r.top < 70 || r.bottom > window.innerHeight - 20) window.scrollTo({ top: Math.max(0, window.scrollY + r.top - 90) }); }
  function chapClose(){
    $$('.chap.open').forEach(function(b){ b.classList.remove('open'); var p = $('.chap-pill', b); if(p) p.setAttribute('aria-expanded','false'); var m = $('.chap-menu', b); if(m) m.remove(); });
  }
  function chapOpen(c){
    var bar = $('.chap[data-scope="'+c+'"]'); if(!bar) return;
    chapClose();
    var m = el('div','chap-menu',''); m.setAttribute('role','listbox');
    chapTabs(c).forEach(function(t){
      var b = el('button','chap-item'+(t.classList.contains('active') ? ' on' : ''), ''); b.type = 'button'; b.setAttribute('role','option'); b.textContent = t.textContent.trim();
      b.addEventListener('click', function(){ chapClose(); showWeek(c, t.dataset.week); chapKeep(c); });
      m.appendChild(b);
    });
    var chips = $$('.weektabs[data-scope="'+c+'"] .sl-chip');
    if(chips.length){
      m.appendChild(el('div','chap-sep',''));
      chips.forEach(function(k){
        var b = el('button','chap-item sm',''); b.type = 'button'; b.textContent = k.textContent.replace('＋ Slides','＋ Add slides').trim();
        b.addEventListener('click', function(){ chapClose(); k.click(); });
        m.appendChild(b);
      });
    }
    bar.appendChild(m); bar.classList.add('open'); $('.chap-pill', bar).setAttribute('aria-expanded','true');
    var on = $('.chap-item.on', m); if(on && on.scrollIntoView) { try{ on.scrollIntoView({block:'nearest'}); }catch(e){} }
  }
  function chapInit(){
    $$('.weektabs').forEach(function(nav){
      var c = nav.dataset.scope; if(!c || $('.chap[data-scope="'+c+'"]')) return;
      var bar = el('div','chap',''); bar.dataset.scope = c;
      bar.innerHTML = '<button class="chap-pill" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Pick a chapter"><span class="chap-cur"></span><span class="chap-caret" aria-hidden="true">▾</span></button><button class="chap-step chap-prev" type="button" aria-label="Previous chapter">‹</button><button class="chap-step chap-next" type="button" aria-label="Next chapter">›</button>';
      nav.parentNode.insertBefore(bar, nav);
      $('.chap-pill', bar).addEventListener('click', function(e){ e.stopPropagation(); if(bar.classList.contains('open')) chapClose(); else chapOpen(c); });
      function step(d){ var tabs = chapTabs(c), i = -1; tabs.forEach(function(t,k){ if(t.classList.contains('active')) i = k; }); var t = tabs[i + d]; if(t){ showWeek(c, t.dataset.week); chapKeep(c); } }
      $('.chap-prev', bar).addEventListener('click', function(){ step(-1); });
      $('.chap-next', bar).addEventListener('click', function(){ step(1); });
      chapSync(c);
    });
    document.addEventListener('click', function(e){ if(!e.target.closest('.chap')) chapClose(); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') chapClose(); });
  }

  /* ---- chapter navigation */
  function weekTabs(c){ return $$('.weektabs[data-scope="'+c+'"] .weektab'); }
  function weekNavInit(){
    // mouse wheel over the tab row scrolls it sideways
    $$('.weektabs').forEach(function(nav){
      nav.addEventListener('wheel', function(e){
        if(nav.scrollWidth <= nav.clientWidth + 2) return;
        if(Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        var max = nav.scrollWidth - nav.clientWidth, x = nav.scrollLeft, d = e.deltaY;
        if((d < 0 && x <= 0) || (d > 0 && x >= max - 1)) return;
        e.preventDefault(); nav.scrollLeft = Math.max(0, Math.min(max, x + d));
      }, { passive: false });
    });
  }
  function lookInit(){
    var bar = $('.brand-row'), old = $('#toggle-clean');
    if(bar && old && !$('#open-look')){
      var b = document.createElement('button'); b.className = 'tb-btn look-btn'; b.id = 'open-look'; b.type = 'button'; b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-label', 'Look and feel: page colour and clean view'); b.title = 'Look & feel';
      b.style.cssText = 'padding:0;width:32px;height:32px;justify-content:center;display:inline-flex;align-items:center';
      b.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5a7.5 7.5 0 100 15c1.2 0 1.7-.8 1.7-1.5 0-1.1-1-1.4-1-2.4 0-.9.7-1.4 1.6-1.4h1.7a3.2 3.2 0 003.2-3.2C17 5.4 13.9 2.5 10 2.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="6.3" cy="9" r="1.1" fill="currentColor"/><circle cx="8.6" cy="5.9" r="1.1" fill="currentColor"/><circle cx="12.4" cy="5.9" r="1.1" fill="currentColor"/></svg>';
      bar.insertBefore(b, old); b.addEventListener('click', lookOpen);
    }
    var p = document.createElement('div'); p.className = 'stp lk'; p.id = 'lk'; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-label', 'Look and feel');
    p.innerHTML = '<div class="stp-box"><div class="stp-h"><h2>Look & feel</h2><button class="stp-x" id="lk-x" type="button" aria-label="Close">\u2715</button></div><div id="lk-themes"></div><span class="lk-sec">Font</span><div class="lk-fonts" id="lk-fonts"></div><span class="lk-sec">Stickers</span><button class="lk-stk-btn" id="lk-stk" type="button">\uD83C\uDF80 Add a sticker to this page</button><div class="stk-tray" id="lk-tray" hidden></div><div class="lk-rm" id="lk-rm" hidden><button type="button" id="lk-rm1"></button><button type="button" id="lk-rmall"></button></div>' +
      '<div class="lk-sw"><div><b>Clean view</b><small>Fewer boxes and borders on the page</small></div><button class="lk-tg" id="lk-clean" type="button" role="switch" aria-checked="false" aria-label="Clean view"></button></div><div class="lk-sw"><div><b>Hide buttons while scrolling</b><small>Draw, Ask, Notes and page up fade out so they do not block the text</small></div><button class="lk-tg" id="lk-fab" type="button" role="switch" aria-checked="true" aria-label="Hide buttons while scrolling"></button></div></div>';
    host().appendChild(p);
    var row = $('.pg-row');
    if(row){
      var grid = document.createElement('div'); grid.className = 'lk-grid';
      $$('.pg-sw', row).forEach(function(sw){ var w = document.createElement('div'); w.className = 'lk-th'; var t = document.createElement('span'); t.textContent = (sw.title || sw.dataset.bg).replace(/\s*\(default\)/, ''); w.appendChild(sw); w.appendChild(t); grid.appendChild(w); });
      row.appendChild(grid); $('#lk-themes').appendChild(row);
    }
    var tg = $('#lk-clean');
    function syncClean(){ tg.setAttribute('aria-checked', old && old.getAttribute('aria-pressed') === 'true' ? 'true' : 'false'); }
    tg.addEventListener('click', function(){ if(old) old.click(); syncClean(); });
    p.addEventListener('click', function(e){ if(e.target === p) p.hidden = true; });
    $('#lk-x').addEventListener('click', function(){ p.hidden = true; });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !p.hidden) p.hidden = true; });
    p._sync = syncClean; syncClean();
    var fw = $('#lk-fonts'); FONTS.forEach(function(f){ var b = el('button','lk-font','<b style="font-family:' + (f[0] ? '\'' + FONT_FAM[f[0]] + '\', ' : '') + 'inherit">' + f[2] + '</b><span>' + f[1] + '</span>'); b.type = 'button'; b.dataset.f = f[0]; b.setAttribute('aria-pressed', (lsGet('s5v70-font') || '') === f[0] ? 'true' : 'false'); b.addEventListener('click', function(){ fontSet(f[0]); }); fw.appendChild(b); });
    var tray = $('#lk-tray'); STK_SET.forEach(function(e){ var b = el('button','',''); b.type = 'button'; b.textContent = e; b.setAttribute('aria-label','Add sticker ' + e); b.addEventListener('click', function(){ stkAdd(e); }); tray.appendChild(b); });
    $('#lk-stk').addEventListener('click', function(){ tray.hidden = !tray.hidden; });
    (function(){
      var armed = null, tm = 0;
      function here(){ var p = $$('.week-panel').filter(function(x){ return !x.hidden && x.offsetParent !== null; })[0]; return p ? stkKeyOf(p) : null; }
      function live(){ return STK.items.filter(function(i){ return !i.del; }); }
      function paint(){
        var all = live().length, k = here(), one = k ? live().filter(function(i){ return i.key === k; }).length : 0;
        $('#lk-rm').hidden = !all;
        $('#lk-rm1').textContent = armed === 'one' ? 'Tap again to remove' : 'Remove on this page (' + one + ')'; $('#lk-rm1').hidden = !one;
        $('#lk-rmall').textContent = armed === 'all' ? 'Tap again to remove all' : 'Remove all (' + all + ')';
      }
      function go(kind){
        if(armed !== kind){ armed = kind; paint(); clearTimeout(tm); tm = setTimeout(function(){ armed = null; paint(); }, 3000); return; }
        var k = here(); live().forEach(function(i){ if(kind === 'all' || i.key === k){ i.del = true; i.t = Date.now(); } });
        armed = null; stkSaveLocal(); stkPush(); stkRender(); paint(); stToast(kind === 'all' ? 'All stickers removed' : 'Stickers on this page removed');
      }
      $('#lk-rm1').addEventListener('click', function(){ go('one'); });
      $('#lk-rmall').addEventListener('click', function(){ go('all'); });
      window.__stkRmPaint = paint; paint();
    })();
    var ft = $('#lk-fab'); ft.setAttribute('aria-checked', FAB_AWAY ? 'true' : 'false'); ft.addEventListener('click', function(){ FAB_AWAY = !FAB_AWAY; lsSet('s5v70-fabhide', FAB_AWAY ? '1' : '0'); ft.setAttribute('aria-checked', FAB_AWAY ? 'true' : 'false'); if(!FAB_AWAY) host().classList.remove('fab-away'); });
  }
  function lookOpen(){ var p = $('#lk'); if(!p) return; p.hidden = false; if(p._sync) p._sync(); if(window.__stkRmPaint) window.__stkRmPaint(); closePicker(); }

  function studyInit(){
    statLoad(); fLoad();
    var bar = $('.brand-row'), sp = bar && bar.querySelector('.spacer');
    if(bar && sp && !$('#open-study')){
      var b = document.createElement('button'); b.className = 'tb-btn st-btn'; b.id = 'open-study'; b.type = 'button'; b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-label', 'Daily goal, streak and focus timer'); b.title = 'Goal, streak and focus timer';
      b.innerHTML = '<svg class="st-ring" viewBox="0 0 24 24" aria-hidden="true"><circle class="st-bg" cx="12" cy="12" r="9"/><circle class="st-fg" cx="12" cy="12" r="9" pathLength="100"/></svg><span class="st-n"></span>';
      bar.insertBefore(b, sp); b.addEventListener('click', function(){ panelOpen('goal'); });
    }
    var p = document.createElement('div'); p.className = 'stp'; p.id = 'stp'; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-label', 'Study panel');
    p.innerHTML = '<div class="stp-box"><div class="stp-h"><h2>Study</h2><button class="stp-x" id="stp-x" type="button" aria-label="Close">✕</button></div>' +
      '<div class="stp-tabs" role="tablist"><button type="button" data-t="goal" class="on">Goal & streak</button><button type="button" data-t="focus">Focus timer</button></div>' +
      '<div class="stp-pane" id="stp-goal"><div class="stp-ringbox"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="rb" cx="50" cy="50" r="44"/><circle class="rf" id="stp-gring" cx="50" cy="50" r="44" pathLength="100"/></svg><div class="stp-mid"><b id="stp-n">0/20</b><span>answered today</span></div></div>' +
      '<div class="stp-line" id="stp-line"></div><div class="stp-week" id="stp-week"></div>' +
      '<div class="stp-lab">Daily goal (questions)</div><div class="stp-chips" id="stp-goals"><button class="stp-chip" type="button" data-g="10">10</button><button class="stp-chip" type="button" data-g="20">20</button><button class="stp-chip" type="button" data-g="30">30</button><button class="stp-chip" type="button" data-g="50">50</button></div>' +
      '<div class="stp-row"><button class="stp-btn ghost" id="stp-shs" type="button">Share my streak</button></div></div>' +
      '<div class="stp-pane" id="stp-focus" hidden><div class="stp-ringbox"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="rb" cx="50" cy="50" r="44"/><circle class="rf" id="stp-fring" cx="50" cy="50" r="44" pathLength="100"/></svg><div class="stp-mid"><b class="stp-time" id="stp-time">25:00</b><span id="stp-fsub">Focus</span></div></div>' +
      '<div class="stp-row"><button class="stp-btn" id="stp-go" type="button">Start</button><button class="stp-btn ghost" id="stp-rs" type="button">Reset</button><button class="stp-btn ghost" id="stp-fs" type="button" aria-label="Full screen">Full screen</button></div>' +
      '<div class="stp-lab">Length</div><div class="stp-chips" id="stp-modes"><button class="stp-chip" type="button" data-k="focus" data-m="15">Focus 15</button><button class="stp-chip" type="button" data-k="focus" data-m="25">Focus 25</button><button class="stp-chip" type="button" data-k="focus" data-m="45">Focus 45</button><button class="stp-chip" type="button" data-k="break" data-m="5">Break 5</button><button class="stp-chip" type="button" data-k="break" data-m="15">Break 15</button></div>' +
      '<div class="stp-lab">Sound</div><div class="stp-chips" id="stp-snd"><button class="stp-chip" type="button" data-s="off">Off</button><button class="stp-chip" type="button" data-s="lofi">Lofi</button><button class="stp-chip" type="button" data-s="rain">Rain</button><button class="stp-chip" type="button" data-s="brown">Brown noise</button></div>' +
      '<div class="stp-vol"><span>Volume</span><input id="stp-vol" type="range" min="5" max="100" step="5" value="50" aria-label="Volume"></div><div class="stp-sess" id="stp-sess"></div></div>' +
      '<button class="stp-x stp-fsx" id="stp-fsx" type="button" aria-label="Exit full screen">✕</button></div>';
    host().appendChild(p);
    var ov = document.createElement('div'); ov.className = 'shr-ov'; ov.id = 'shr-ov'; ov.hidden = true; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Share card');
    ov.innerHTML = '<div class="shr-box"><img id="shr-img" alt="Your study card"><div class="stp-row"><button class="stp-btn" id="shr-share" type="button">Share</button><button class="stp-btn ghost" id="shr-copy" type="button">Copy</button><button class="stp-btn ghost" id="shr-save" type="button">Save</button></div><div class="shr-hint">On a phone or iPad, press and hold the picture to save it.</div><button class="stp-btn ghost" id="shr-x" type="button">Close</button></div>';
    host().appendChild(ov);
    p.addEventListener('click', function(e){ if(e.target === p) panelClose(); });
    $('#stp-x').addEventListener('click', panelClose); $('#stp-fsx').addEventListener('click', function(){ p.classList.remove('fs'); });
    $$('.stp-tabs button').forEach(function(b){ b.addEventListener('click', function(){ panelTab(b.dataset.t); }); });
    $$('#stp-goals .stp-chip').forEach(function(b){ b.addEventListener('click', function(){ STAT.goal = +b.dataset.g; STAT.t = Date.now(); var k = dkey(); if(STAT.d[k]) STAT.d[k][1] = STAT.goal; statSaveLocal(); statPush(); statUi(); if(todayN() >= STAT.goal) statTick(); }); });
    $$('#stp-modes .stp-chip').forEach(function(b){ b.addEventListener('click', function(){ fSet(b.dataset.k, +b.dataset.m); }); });
    $$('#stp-snd .stp-chip').forEach(function(b){ b.addEventListener('click', function(){ F.sound = b.dataset.s; fSave(); AU.always = (F.sound !== 'off' && !F.run); if(F.run){ auPlay(F.sound); } else if(F.sound !== 'off'){ auPlay(F.sound); setTimeout(function(){ if(!F.run) auStop(); }, 4000); } else auStop(); fUi(); }); });
    $('#stp-vol').addEventListener('input', function(e){ F.vol = (+e.target.value)/100; fSave(); if(AU.master) AU.master.gain.value = F.vol; });
    $('#stp-go').addEventListener('click', function(){ if(F.run) fPause(); else fStart(); });
    $('#stp-rs').addEventListener('click', fReset);
    $('#stp-fs').addEventListener('click', function(){ p.classList.add('fs'); });
    $('#stp-shs').addEventListener('click', streakShare);
    $('#shr-x').addEventListener('click', function(){ ov.hidden = true; });
    ov.addEventListener('click', function(e){ if(e.target === ov) ov.hidden = true; });
    $('#shr-share').addEventListener('click', function(){ shrDo('share'); }); $('#shr-copy').addEventListener('click', function(){ shrDo('copy'); }); $('#shr-save').addEventListener('click', function(){ shrDo('save'); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ if(!ov.hidden) ov.hidden = true; else if(!p.hidden){ if(p.classList.contains('fs')) p.classList.remove('fs'); else panelClose(); } } });
    addFlashShare(); statTick(true); statUi(); fUi();
    window.addEventListener('beforeunload', function(){ auStop(); });
  }

  function drawEng(){ return PG.on ? PG : SK; }
  function host(){ return $('.viz-root') || document.body; }      // the colour tokens live on .viz-root, so floating pieces go inside it
  var inkProbe = null;
  function skInk(){
    if(!inkProbe){ inkProbe = document.createElement('span'); inkProbe.setAttribute('aria-hidden','true'); inkProbe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;color:var(--ink)'; host().appendChild(inkProbe); }
    return getComputedStyle(inkProbe).color || '#111';
  }
  function skStroke(c, st, ink, wm){
    var p = st[3]; if(!p || !p.length) return;
    var col = st[1] === 0 ? ink : SK_COL[st[1]];
    c.save(); c.strokeStyle = col; c.fillStyle = col;
    c.lineWidth = SK_W[st[2]] * (st[0] ? 3 : 1) * (wm || 1); c.globalAlpha = st[0] ? 0.33 : 1; c.lineCap = 'round'; c.lineJoin = 'round';
    if(p.length < 4){ c.beginPath(); c.arc(p[0], p[1], c.lineWidth/2, 0, 6.2832); c.fill(); c.restore(); return; }
    if(st[4] && !st[0] && st[4].length === p.length/2){      // Apple Pencil pressure: the line gets thicker when pressed harder
      var pr = st[4], n = p.length/2, base = c.lineWidth, w = [], j;
      for(j=0; j<n; j++){ var a = +pr.charAt(Math.max(0,j-1)), b = +pr.charAt(j), d = +pr.charAt(Math.min(n-1,j+1)); w.push(base * (0.45 + 1.15 * ((a + 2*b + d) / 4) / 9)); }
      for(j=1; j<n-1; j++){
        c.lineWidth = w[j]; c.beginPath();
        c.moveTo((p[2*j-2]+p[2*j])/2, (p[2*j-1]+p[2*j+1])/2);
        c.quadraticCurveTo(p[2*j], p[2*j+1], (p[2*j]+p[2*j+2])/2, (p[2*j+1]+p[2*j+3])/2); c.stroke();
      }
      c.lineWidth = w[0]; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo((p[0]+p[2])/2, (p[1]+p[3])/2); c.stroke();
      c.lineWidth = w[n-1]; c.beginPath(); c.moveTo((p[2*n-4]+p[2*n-2])/2, (p[2*n-3]+p[2*n-1])/2); c.lineTo(p[2*n-2], p[2*n-1]); c.stroke();
      c.restore(); return;
    }
    c.beginPath(); c.moveTo(p[0], p[1]);
    for(var i=2; i<p.length-2; i+=2){ c.quadraticCurveTo(p[i], p[i+1], (p[i]+p[i+2])/2, (p[i+1]+p[i+3])/2); }
    c.lineTo(p[p.length-2], p[p.length-1]); c.stroke(); c.restore();
  }
  function drawStrokes(E, c){
    var ink = skInk();
    E.strokes.forEach(function(st){ skStroke(c, st, ink, E.wm); });
    if(E.cur){
      var cr = E.cur;
      if(!cr[0] && E.pr && E.pr.length === cr[3].length/2 && E.pr.length > 2 && E.pr.every(function(v){ return v >= 0; })) cr = cr.slice(0,4).concat([E.pr.join('')]);
      skStroke(c, cr, ink, E.wm);
    }
  }
  /* ---- notes sketch page */
  function skDraw(){
    if(!SK.ready) return;
    var c = SK.ctx, cv = SK.cv, k = SK.scale*SK.dpr;
    c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,cv.width,cv.height); c.setTransform(k,0,0,k,0,0);
    drawStrokes(SK, c);
  }
  document.addEventListener('visibilitychange', function(){ if(document.hidden){ try{ flushAll(); }catch(e){} } });
  window.addEventListener('pagehide', function(){ try{ flushAll(); }catch(e){} });
  function skFit(){
    if(!SK.ready || $('#sk').hidden) return;
    var box = $('#sk-box'), cs = getComputedStyle(box), padX = (parseFloat(cs.paddingLeft)||0) + (parseFloat(cs.paddingRight)||0), padY = (parseFloat(cs.paddingTop)||0) + (parseFloat(cs.paddingBottom)||0), bw = box.clientWidth - padX - 2, bh = box.clientHeight - padY - 2; if(bw < 60 || bh < 60) return;
    var s = Math.min(bw/SK.W, bh/SK.H), w = Math.floor(SK.W*s), h = Math.floor(SK.H*s);
    SK.scale = s; SK.dpr = window.devicePixelRatio || 1; SK.cv.style.setProperty('--u', (25*s).toFixed(2)+'px');
    if(SK.cv.style.width !== w+'px' || SK.cv.style.height !== h+'px'){
      SK.cv.style.width = w+'px'; SK.cv.style.height = h+'px';
      SK.cv.width = Math.round(w*SK.dpr); SK.cv.height = Math.round(h*SK.dpr);
    }
    skDraw();
  }
  function skLoad(k){
    SK.k = k; var n = S.notes[k];
    SK.strokes = (n && n.d && n.d.s) ? n.d.s.slice() : []; SK.hist = []; SK.redo = []; SK.cur = null; SK.erasing = false; SK.pid = null;
    SK.stamp = n ? n.u : 0; skDraw(); try{ eUi(); }catch(e){}
  }
  function skTabMark(k, n){ var tab = $('.weektabs[data-scope="'+k.split(':')[0]+'"] .weektab[data-week="'+k.split(':')[1]+'"]'); if(tab) tab.classList.toggle('has-note', noteHas(n)); }
  function skSave(){
    var k = SK.k; if(!k) return;
    var n = S.notes[k] || { t:'' };
    n.u = Date.now(); if(SK.strokes.length) n.d = { v:1, s:SK.strokes.slice() }; else delete n.d;
    S.notes[k] = n; SK.stamp = n.u;
    scheduleRemote('notes'); updateFab(); skTabMark(k, n);
  }
  function skPt(e){ var r = SK.cv.getBoundingClientRect(); SK.scale = r.width/SK.W || SK.scale; return [Math.round((e.clientX - r.left)/SK.scale), Math.round((e.clientY - r.top)/SK.scale)]; }
  /* ---- draw on page: a see-through layer over the open chapter, strokes are stored relative to the chapter */
  function pgPanel(){ return (cur.course==='plan' || !cur.week) ? null : $('.course-panel[data-course="'+cur.course+'"] .week-panel:not([hidden])'); }
  function pgDraw(){
    if(!PG.ready) return;
    var cv = PG.cv, w = document.documentElement.clientWidth, h = window.innerHeight, d = window.devicePixelRatio || 1;
    if(cv.hidden) return;
    if(cv.width !== Math.round(w*d) || cv.height !== Math.round(h*d)){ cv.width = Math.round(w*d); cv.height = Math.round(h*d); }
    PG.dpr = d;
    var c = PG.ctx; c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,cv.width,cv.height);
    if(!PG.panel) return;
    var r = PG.panel.getBoundingClientRect(), s = r.width/1000; if(s <= 0) return;
    PG.scale = s; PG.wm = Math.max(0.9, Math.min(1.4, s)) / s;
    c.setTransform(d*s, 0, 0, d*s, d*r.left, d*r.top);
    drawStrokes(PG, c);
  }
  function pgSoon(){ if(PG.raf) return; PG.raf = requestAnimationFrame(function(){ PG.raf = 0; pgDraw(); }); }
  function pgPt(e){ var r = PG.panel.getBoundingClientRect(); PG.scale = r.width/1000 || PG.scale; return [Math.round((e.clientX - r.left)/PG.scale), Math.round((e.clientY - r.top)/PG.scale)]; }
  function pgSave(){
    var k = PG.k; if(!k) return;
    var n = S.notes[k] || { t:'' };
    n.u = Date.now(); if(PG.strokes.length) n.p = { v:1, s:PG.strokes.slice() }; else delete n.p;
    S.notes[k] = n;
    scheduleRemote('notes'); updateFab(); skTabMark(k, n);
  }
  function pgSync(){            // show the drawings that belong to the chapter that is open (read only)
    if(!PG.ready || PG.on) return;
    var panel = pgPanel(), k = ctxKey(), n = S.notes[k];
    PG.k = k; PG.panel = panel;
    PG.strokes = (panel && n && n.p && n.p.s) ? n.p.s.slice() : [];
    PG.hist = []; PG.redo = []; PG.cur = null;
    PG.cv.hidden = !PG.strokes.length;
    if(!PG.cv.hidden) pgDraw();
  }
  function pgToast(msg){ var h = $('#pg-hint'); if(!h) return; h.textContent = msg; h.hidden = false; clearTimeout(PG.hintT); PG.hintT = setTimeout(function(){ h.hidden = true; }, 4200); }
  function pgEnter(){
    if(PG.on || !PG.ready) return;
    var panel = pgPanel(); if(!panel) return;
    closeDrawer();
    var ask = $('#ask-fab'); if(ask && ask.getAttribute('aria-expanded') === 'true') ask.click();
    PG.panel = panel; PG.k = ctxKey();
    var n = S.notes[PG.k]; PG.strokes = (n && n.p && n.p.s) ? n.p.s.slice() : []; PG.hist = []; PG.redo = []; PG.cur = null; PG.pid = null; PG.touches = {}; PG.scrolling = false;
    PG.on = true; document.body.classList.add('pg-on'); PG.cv.hidden = false;
    var mk = $('#mk'); mk.classList.add('mk-float'); host().appendChild(mk); $('#pg-done').hidden = false; popShow(false);
    pgDraw(); eUi();
    pgToast(TL.finger ? 'Draw with Pencil or finger. Use two fingers to scroll.' : 'Pencil draws, one finger scrolls. Turn Finger on to draw with a finger.');
  }
  function pgExit(){
    if(!PG.on) return;
    PG.on = false; PG.cur = null; PG.erasing = false; PG.pid = null; document.body.classList.remove('pg-on');
    var mk = $('#mk'); mk.classList.remove('mk-float'); $('#pg-done').hidden = true; popShow(false);
    var home = $('#sk'); if(home) home.appendChild(mk);
    ringHide(); var h = $('#pg-hint'); if(h) h.hidden = true;
    pgSync(); eUi(); try{ flushAll(); }catch(e){}
  }
  /* ---- shared pen / eraser logic */
  function skPr(e){ return e.pointerType === 'pen' ? Math.max(0, Math.min(9, Math.round((e.pressure || 0.5) * 9))) : -1; }
  function skHint(msg){ var h = $('#sk-hint'); if(h){ h.textContent = msg; h.classList.add('warn'); clearTimeout(skHint.t); skHint.t = setTimeout(function(){ h.classList.remove('warn'); skHintBase(); }, 4000); } }
  function skHintBase(){ var h = $('#sk-hint'); if(h && !h.classList.contains('warn')) h.textContent = TL.finger ? 'Draw with Apple Pencil or your finger.' : 'Draw with Apple Pencil. To draw with your finger, turn Finger on.'; }
  function pAllowed(e, E){      // 'draw', 'scroll' (page mode only) or null
    if(e.pointerType === 'pen'){ TL.penSeen = Date.now(); return 'draw'; }
    if(e.pointerType === 'touch'){
      if(Date.now() - TL.penSeen < 1500) return null;          // palm while the pencil is in use
      if(!TL.finger){ if(E === PG) return 'scroll'; skHint('Finger is off. Turn Finger on to draw with your finger.'); return null; }
    }
    return 'draw';
  }
  function segD2(px, py, ax, ay, bx, by){
    var dx = bx-ax, dy = by-ay, l = dx*dx+dy*dy, t = l ? ((px-ax)*dx + (py-ay)*dy)/l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    var qx = ax+t*dx-px, qy = ay+t*dy-py; return qx*qx+qy*qy;
  }
  function strokeHit(st, x, y, r){
    var p = st[3], r2 = r*r;
    if(p.length < 4) return segD2(x, y, p[0], p[1], p[0], p[1]) <= r2;
    for(var i=0; i+3<p.length; i+=2){ if(segD2(x, y, p[i], p[i+1], p[i+2], p[i+3]) <= r2) return true; }
    return false;
  }
  function erasePieces(st, x, y, r){      // cut the circle out of one stroke, return the pieces that are left
    var p = st[3], pr = (st[4] && st[4].length === p.length/2) ? st[4] : null, gap = Math.max(1.5, r*0.25), pts = [], prs = [], i;
    for(i=0; i<p.length; i+=2){
      if(i > 0){
        var ax = p[i-2], ay = p[i-1], dx = p[i]-ax, dy = p[i+1]-ay, n = Math.floor(Math.sqrt(dx*dx+dy*dy)/gap);
        for(var j=1; j<=n; j++){ pts.push([ax + dx*j/(n+1), ay + dy*j/(n+1)]); prs.push(pr ? pr.charAt(i/2-1) : ''); }
      }
      pts.push([p[i], p[i+1]]); prs.push(pr ? pr.charAt(i/2) : '');
    }
    var out = [], run = null, r2 = r*r;
    pts.forEach(function(q, idx){
      var dx = q[0]-x, dy = q[1]-y;
      if(dx*dx+dy*dy <= r2){ run = null; return; }
      if(!run){ run = { p:[], pr:'' }; out.push(run); }
      run.p.push(Math.round(q[0]), Math.round(q[1])); run.pr += prs[idx];
    });
    return out.map(function(o){ var s = [st[0], st[1], st[2], o.p]; if(pr && o.p.length > 4) s.push(o.pr); return s; });
  }
  function eraseAt(E, pt){
    var r = ER_PX[TL.size] / (E.scale || 1), next = [], changed = false;
    E.strokes.forEach(function(st){
      if(!strokeHit(st, pt[0], pt[1], r)){ next.push(st); return; }
      changed = true;
      if(TL.er === 'part') erasePieces(st, pt[0], pt[1], r).forEach(function(s){ next.push(s); });
    });
    if(changed){ E.strokes = next; E.erased = true; E.redraw(); }
  }
  function cancelStroke(E){
    if(E.cur){ E.cur = null; E.pr = null; }
    if(E.erasing){ if(E.eraseBefore) E.strokes = E.eraseBefore; E.erasing = false; E.eraseBefore = null; }
    E.pid = null; E.redraw();
  }
  function eUndo(E){
    var op = E.hist.pop(); if(!op) return;
    if(op.a === 1){ var ix = E.strokes.indexOf(op.s); if(ix >= 0) E.strokes.splice(ix,1); }
    else E.strokes = op.before.slice();
    E.redo.push(op); E.redraw(); E.save(); eUi();
  }
  function eRedo(E){
    var op = E.redo.pop(); if(!op) return;
    if(op.a === 1) E.strokes.push(op.s); else E.strokes = op.after.slice();
    E.hist.push(op); E.redraw(); E.save(); eUi();
  }
  function meanY(E){ var ks = Object.keys(E.touches), t = 0; ks.forEach(function(k){ t += E.touches[k].y; }); return ks.length ? t/ks.length : 0; }
  var ring = null;
  function ringMove(e){
    if(!ring) return;
    if(TL.tool !== 'erase' || (e.pointerType === 'touch' && !TL.finger && !PG.on)){ ring.style.display = 'none'; return; }
    var r = ER_PX[TL.size];
    ring.style.width = ring.style.height = (2*r)+'px'; ring.style.transform = 'translate('+(e.clientX-r)+'px,'+(e.clientY-r)+'px)'; ring.style.display = 'block';
  }
  function ringHide(){ if(ring) ring.style.display = 'none'; }
  function surfDown(E, cv, e){
    if(e.button > 0) return;
    var mode = pAllowed(e, E); if(!mode) return;
    e.preventDefault();
    if(E === PG && e.pointerType === 'touch'){
      E.touches[e.pointerId] = { y:e.clientY };
      if(Object.keys(E.touches).length > 1){ cancelStroke(E); E.scrolling = true; E.sy = meanY(E); return; }
      if(mode === 'scroll'){ E.scrolling = true; E.sy = e.clientY; return; }
    }
    if(E.pid !== null) return;
    E.pid = e.pointerId; try{ cv.setPointerCapture(e.pointerId); }catch(x){}
    var pt = E.pt(e); ringMove(e);
    if(TL.tool === 'erase'){ E.erasing = true; E.erased = false; E.eraseBefore = E.strokes.slice(); eraseAt(E, pt); return; }
    E.cur = [TL.tool === 'hl' ? 1 : 0, TL.color, TL.size, pt]; E.pr = [skPr(e)]; E.redraw();
  }
  function surfMove(E, e){
    if(E === PG && e.pointerType === 'touch' && E.touches[e.pointerId]){
      E.touches[e.pointerId].y = e.clientY;
      if(E.scrolling){ var y = meanY(E); window.scrollBy(0, E.sy - y); E.sy = y; return; }
    }
    ringMove(e);
    if(E.pid === null || e.pointerId !== E.pid) return;
    var evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
    evs.forEach(function(ev){
      var pt = E.pt(ev);
      if(E.erasing){ eraseAt(E, pt); return; }
      if(!E.cur) return;
      var p = E.cur[3], lx = p[p.length-2], ly = p[p.length-1];
      if(Math.abs(pt[0]-lx) + Math.abs(pt[1]-ly) >= 2){ p.push(pt[0], pt[1]); E.pr.push(skPr(ev)); }
    });
    if(!E.erasing) E.redraw();
  }
  function surfUp(E, cv, e){
    if(E === PG && E.touches[e.pointerId] && e.type !== 'lostpointercapture'){
      delete E.touches[e.pointerId];
      if(!Object.keys(E.touches).length) E.scrolling = false; else E.sy = meanY(E);
    }
    if(e.pointerType === 'touch') ringHide();
    if(E.pid === null || e.pointerId !== E.pid) return;
    try{ cv.releasePointerCapture(e.pointerId); }catch(x){}
    E.pid = null;
    if(E.erasing){
      E.erasing = false;
      if(E.erased){ E.hist.push({ a:3, before:E.eraseBefore, after:E.strokes.slice() }); E.redo = []; if(E.hist.length > 60) E.hist.shift(); E.save(); }
      E.eraseBefore = null; E.erased = false; eUi(); return;
    }
    var st = E.cur; E.cur = null; if(!st) return;
    var pr = E.pr || []; E.pr = null;
    if(!st[0] && pr.length === st[3].length/2 && pr.length > 2 && pr.every(function(v){ return v >= 0; }) && pr.some(function(v){ return v !== pr[0]; })) st[4] = pr.join('');
    if(JSON.stringify(E.strokes).length + st[3].length*6 + (st[4] ? st[4].length : 0) > E.max){ E.redraw(); skHint('This page is full. Erase or clear something first.'); pgToast('This page is full. Erase or clear something first.'); return; }
    E.strokes.push(st); E.hist.push({ a:1, s:st }); E.redo = []; if(E.hist.length > 60) E.hist.shift();
    E.redraw(); E.save(); eUi();
  }
  function bindSurface(cv, E){
    cv.addEventListener('pointerdown', function(e){ surfDown(E, cv, e); });
    cv.addEventListener('pointermove', function(e){ surfMove(E, e); });
    ['pointerup','pointercancel','lostpointercapture'].forEach(function(t){ cv.addEventListener(t, function(e){ surfUp(E, cv, e); }); });
    cv.addEventListener('pointerleave', ringHide);
    cv.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  }
  function popShow(on){ var pop = $('#sk-pop'), col = $('#sk-col'); if(!pop) return; pop.hidden = !on; if(col) col.setAttribute('aria-expanded', on ? 'true' : 'false'); }
  function eUi(){
    var E = drawEng(), mk = $('#mk'); if(!mk) return;
    $('#sk-undo').disabled = !E.hist.length; $('#sk-redo').disabled = !E.redo.length; $('#sk-clear').disabled = !E.strokes.length;
    mk.style.setProperty('--cur', TL.color===0 ? 'var(--ink)' : SK_COL[TL.color]);
    mk.dataset.tool = TL.tool; $('#mk-seg').hidden = TL.tool !== 'erase';
  }
  function wireSketch(){
    var cv = $('#sk-cv'), pg = document.createElement('canvas');
    if(!cv || !cv.getContext) return;
    SK.cv = cv; SK.ctx = cv.getContext('2d'); SK.ready = true;
    SK.redraw = skDraw; SK.pt = skPt; SK.save = skSave;
    pg.id = 'pg-cv'; pg.hidden = true; pg.setAttribute('aria-label', 'Drawing layer over the chapter'); host().appendChild(pg);
    PG.cv = pg; PG.ctx = pg.getContext('2d'); PG.ready = true; PG.redraw = pgDraw; PG.pt = pgPt; PG.save = pgSave;
    ring = document.createElement('div'); ring.id = 'mk-ring'; ring.setAttribute('aria-hidden', 'true'); host().appendChild(ring);
    var toast = document.createElement('div'); toast.id = 'pg-hint'; toast.hidden = true; toast.setAttribute('role', 'status'); host().appendChild(toast);
    bindSurface(cv, SK); bindSurface(pg, PG);
    window.addEventListener('scroll', function(){ if(!pg.hidden) pgSoon(); }, { passive:true });
    window.addEventListener('resize', function(){ if(!pg.hidden) pgSoon(); });
    $$('.mk-tool').forEach(function(b){ b.addEventListener('click', function(){
      TL.tool = b.dataset.tool; $$('.mk-tool').forEach(function(x){ var on = x===b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on?'true':'false'); });
      popShow(false); ringHide(); eUi();
    }); });
    $$('.mk-c').forEach(function(b){ b.addEventListener('click', function(){
      TL.color = +b.dataset.c; $$('.mk-c').forEach(function(x){ var on = x===b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on?'true':'false'); });
      eUi();
    }); });
    $$('.mk-z').forEach(function(b){ b.addEventListener('click', function(){
      TL.size = +b.dataset.s; $$('.mk-z').forEach(function(x){ var on = x===b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on?'true':'false'); });
    }); });
    $$('#mk-seg button').forEach(function(b){ b.addEventListener('click', function(){
      TL.er = b.dataset.er; $$('#mk-seg button').forEach(function(x){ var on = x===b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on?'true':'false'); });
      lsSet('s5v49-er', TL.er);
    }); });
    var er0 = lsGet('s5v49-er'); if(er0 === 'whole'){ var wb = $('#mk-seg button[data-er="whole"]'); if(wb) wb.click(); }
    var paper = lsGet('s5v48-paper'); if(['blank','lined','grid','dots'].indexOf(paper) < 0) paper = 'grid';
    function setPaper(v){ cv.dataset.paper = v; $$('.sk-p').forEach(function(x){ var on = x.dataset.p === v; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
    setPaper(paper);
    $$('.sk-p').forEach(function(b){ b.addEventListener('click', function(){ setPaper(b.dataset.p); lsSet('s5v48-paper', b.dataset.p); }); });
    $('#sk-undo').addEventListener('click', function(){ eUndo(drawEng()); });
    $('#sk-redo').addEventListener('click', function(){ eRedo(drawEng()); });
    var col = $('#sk-col'), pop = $('#sk-pop');
    col.addEventListener('click', function(e){ e.stopPropagation(); popShow(pop.hidden); });
    pop.addEventListener('click', function(e){ e.stopPropagation(); });
    document.addEventListener('click', function(e){ if(!pop.hidden && !e.target.closest('#mk')) popShow(false); });
    $('#sk-clear').addEventListener('click', function(){
      var b = this, E = drawEng();
      if(!E.strokes.length) return;
      if(!b.dataset.arm){ b.dataset.arm = '1'; b.classList.add('arm'); skHint('Tap the bin again to clear everything on this page.'); pgToast('Tap the bin again to clear everything on this page.'); clearTimeout(SK.clearT); SK.clearT = setTimeout(function(){ delete b.dataset.arm; b.classList.remove('arm'); }, 3000); return; }
      clearTimeout(SK.clearT); delete b.dataset.arm; b.classList.remove('arm');
      E.hist.push({ a:3, before:E.strokes.slice(), after:[] }); E.redo = []; E.strokes = []; E.redraw(); E.save(); eUi();
    });
    $('#sk-finger').addEventListener('click', function(){
      TL.finger = !TL.finger; this.setAttribute('aria-pressed', TL.finger ? 'true' : 'false'); this.classList.toggle('on', TL.finger); skHintBase();
      lsSet('s5v44-finger', TL.finger ? '1' : '0');
    });
    var fp = lsGet('s5v44-finger');
    if(fp === '1' || (fp === null && window.innerWidth < 700)){ $('#sk-finger').click(); }   // phones: finger draws by default
    $('#pg-done').addEventListener('click', pgExit);
    var df = $('#draw-fab'); if(df) df.addEventListener('click', function(){ if(PG.on) pgExit(); else pgEnter(); });
    if(window.ResizeObserver){ SK.ro = new ResizeObserver(function(){ skFit(); }); SK.ro.observe($('#sk-box')); }
    window.addEventListener('resize', skFit);
    document.addEventListener('keydown', function(e){
      var inPage = PG.on, inNotes = !$('#sk').hidden && !$('#notes-drawer').hidden;
      if(!inPage && !inNotes) return;
      if(e.key === 'Escape' && inPage){ pgExit(); return; }
      if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z'){ e.preventDefault(); if(e.shiftKey) eRedo(drawEng()); else eUndo(drawEng()); }
    });
    eUi(); pgSync(); studyInit(); lookInit(); impInitUi(); slInitUi(); swipeInit();
  }


  function swipeInit(){      // phone and iPad: drag a sheet's handle or header to close it
    function coarse(){ return !!(window.matchMedia && (matchMedia('(pointer: coarse)').matches || matchMedia('(max-width: 640px)').matches)); }
    function grab(parent){
      if(!parent) return null;
      var g = parent.querySelector(':scope > .sw-grab') || parent.querySelector('.ask-grab');
      if(!g){ g = document.createElement('div'); g.className = 'sw-grab'; g.setAttribute('aria-hidden', 'true'); parent.insertBefore(g, parent.firstChild); }
      return g;
    }
    function bind(box, zones, closeSel, up){
      if(!box) return;
      var y0 = 0, t0 = 0, dy = 0, pid = null;
      function down(e){
        if(!coarse() || pid !== null) return;
        if(e.target.closest && e.target.closest('button,input,textarea,select,a,label,canvas')) return;
        pid = e.pointerId; y0 = e.clientY; t0 = Date.now(); dy = 0; box.classList.remove('settle'); box.classList.add('dragging');
        try{ e.currentTarget.setPointerCapture(pid); }catch(x){}
      }
      function move(e){ if(pid === null || e.pointerId !== pid) return; dy = e.clientY - y0; if(up ? dy > 0 : dy < 0) dy = 0; box.style.transform = 'translateY('+dy+'px)'; }
      function end(e){
        if(pid === null || e.pointerId !== pid) return;
        pid = null; box.classList.remove('dragging'); box.classList.add('settle');
        var d = Math.abs(dy), fast = d / Math.max(1, Date.now() - t0) > 0.6;
        if(d > 90 || (fast && d > 24)){
          box.style.transform = 'translateY('+(up ? '-' : '')+'110%)';
          setTimeout(function(){ var b = document.querySelector(closeSel); if(b) b.click(); box.classList.remove('settle'); box.style.transform = ''; }, 190);
        } else { box.style.transform = ''; setTimeout(function(){ box.classList.remove('settle'); }, 240); }
      }
      zones.forEach(function(z){
        if(!z) return;
        z.addEventListener('pointerdown', down); z.addEventListener('pointermove', move); z.addEventListener('pointerup', end); z.addEventListener('pointercancel', end);
      });
    }
    var ask = $('#ask .ask-box'); if(ask) bind(ask, [grab(ask), ask.querySelector('.ask-h')], '#ask-x');
    var nd = $('#notes-drawer'); if(nd) bind(nd, [grab(nd), nd.querySelector('.nd-head')], '#nd-close');
    var ex = $('#exam'); if(ex) bind(ex, [grab(ex.querySelector('.ex-wrap')), ex.querySelector('.ex-top')], '#ex-close');
    var sh = $('#sheet'); if(sh) bind(sh, [grab(sh.querySelector('.ex-wrap')), sh.querySelector('.ex-top')], '#sh-close');
    var sx = $('.sx-box'); if(sx) bind(sx, [grab(sx), sx.querySelector('.sx-top')], '#sx-x', true);
    var stb = $('#stp .stp-box'); if(stb) bind(stb, [grab(stb), stb.querySelector('.stp-h')], '#stp-x');
    var sdb = $('#sld .stp-box'); if(sdb) bind(sdb, [grab(sdb), sdb.querySelector('.stp-h')], '#sld-x');
    var rdb = $('#rd .stp-box'); if(rdb) bind(rdb, [grab(rdb), rdb.querySelector('.stp-h')], '#rd-x');
    var ipb = $('#imp .stp-box'); if(ipb) bind(ipb, [grab(ipb), ipb.querySelector('.stp-h')], '#imp-x');
    var lkb = $('#lk .stp-box'); if(lkb) bind(lkb, [grab(lkb), lkb.querySelector('.stp-h')], '#lk-x');
  }

  function openDrawer(){ var d=$('#notes-drawer'); d.hidden=false; refreshNotesUI(); var ta=$('#nd-area'); if(!ta.hidden && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) setTimeout(function(){ ta.focus(); }, 30); }
  function closeDrawer(){ $('#notes-drawer').hidden=true; try{ flushAll(); }catch(e){} }
  function wireNotes(){
    wireSketch();
    $('#notes-fab').addEventListener('click', function(){ var d=$('#notes-drawer'); if(d.hidden) openDrawer(); else closeDrawer(); });
    $('#nd-close').addEventListener('click', closeDrawer);
    $$('.nd-tabs button').forEach(function(b){ b.addEventListener('click', function(){ drawerTab=b.dataset.t; refreshNotesUI(); if(drawerTab==='sketch') setTimeout(skFit, 30); }); });
    var ta = $('#nd-area');
    ta.addEventListener('input', function(){
      var k = ta.dataset.k || ctxKey();
      var no = S.notes[k] || {}; no.t = ta.value; no.u = Date.now(); S.notes[k] = no;
      scheduleRemote('notes'); updateFab();
      var tab = $('.weektabs[data-scope="'+k.split(':')[0]+'"] .weektab[data-week="'+k.split(':')[1]+'"]');
      if(tab) tab.classList.toggle('has-note', noteHas(S.notes[k]));
      $('#nd-count').textContent = ta.value.length ? ta.value.split(/\s+/).filter(Boolean).length+' words' : '';
    });
    $$('#nd-quick button').forEach(function(b){
      b.addEventListener('click', function(){
        var pre = b.dataset.ins, s = ta.selectionStart, v = ta.value;
        var atLine = s===0 || v.charAt(s-1)==='\n';
        var ins = (atLine ? '' : '\n') + pre;
        ta.value = v.slice(0,s) + ins + v.slice(ta.selectionEnd);
        ta.focus(); ta.selectionStart = ta.selectionEnd = s + ins.length;
        ta.dispatchEvent(new Event('input'));
      });
    });
    $('#nd-copy').addEventListener('click', function(){
      var txt = ta.value, st=$('#nd-status');
      function fb(){ ta.focus(); ta.select(); st.textContent='Selected, press copy'; }
      if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(function(){ st.textContent='Copied'; }, fb); } else fb();
    });
    document.addEventListener('keydown', function(e){
      if(e.key==='Escape'){ if(!$('#exam').hidden) return; if(!$('#notes-drawer').hidden) closeDrawer(); }
    });
  }

  /* ------------------------------------------------------------------ outline scroll-spy */
  var spy = null;
  function setupSpy(){
    if(spy){ spy.disconnect(); spy=null; }
    if(!('IntersectionObserver' in window)) return;
    var panel = $('.course-panel:not([hidden]) .week-panel:not([hidden])'); if(!panel) return;
    var links = $$('.wp-rail a', panel); if(!links.length) return;
    spy = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){
          links.forEach(function(a){ a.classList.toggle('on', a.dataset.target===en.target.id); });
        }
      });
    }, { rootMargin:'-20% 0px -70% 0px' });
    $$('section[id]', panel).forEach(function(s){ spy.observe(s); });
  }

  /* ------------------------------------------------------------------ plan tab */
  function daysUntil(iso){
    var p = iso.split('-'), d = new Date(+p[0], +p[1]-1, +p[2]), n = new Date(); n.setHours(0,0,0,0);
    return Math.round((d - n) / DAY);
  }
  function renderPlan(){
    var cd = $('#plan-cd'); if(!cd) return;
    cd.innerHTML='';
    TESTS.slice().sort(function(a,b){ return a.date<b.date?-1:1; }).forEach(function(t){
      var ds = daysUntil(t.date), ok=0, tot=0;
      t.weeks.forEach(function(k){ var s=panelStats(k); ok+=s.ok; tot+=s.total; });
      var rd = readiness(t.weeks), pct = Math.round(100*rd);
      var weakest = t.weeks.slice().sort(function(a,b){ return readiness([a])-readiness([b]); })[0];
      var c = el('div','cd'); c.style.setProperty('--cc', COURSES[t.course].cc);
      var label = ds>1 ? 'days left' : ds===1 ? 'day left' : ds===0 ? 'today' : 'days ago';
      var num = ds<0 ? Math.abs(ds) : ds;
      c.innerHTML = '<div class="cd-c">'+esc(COURSES[t.course].name)+'</div><div class="cd-t">'+esc(t.title)+'</div>'+
        '<div class="cd-d"><span class="cd-n">'+(ds===0?'0':num)+'</span><span class="cd-l">'+label+'</span></div>'+
        '<div class="cd-m"><i style="width:'+pct+'%"></i></div>'+
        '<div class="cd-s"><b>'+pct+'% ready</b> · '+band(rd)+' · '+ok+' of '+tot+' answered right'+(t.note?' · '+esc(t.note):'')+'</div>'+
        '<div class="cd-s">Weakest: '+esc(weekNames[weakest]||weakest)+' ('+Math.round(100*readiness([weakest]))+'%)</div>';
      var go1 = el('button','btn',''); go1.type='button'; go1.style.marginTop='12px'; go1.textContent='Practice this test';
      go1.addEventListener('click', function(){ openExam({ preset: t.weeks }); });
      c.appendChild(go1);
      cd.appendChild(c);
    });
    renderToday(); renderDeadlines(); renderWeak();
    var due = dueQs().length;
    $('#plan-due-n').textContent = due;
    $('#plan-due-t').textContent = due ? due+' question'+(due>1?'s are':' is')+' ready to review. Questions come back on a schedule after you answer them (1, 3, 7, 14, then 30 days; a miss starts the clock over).' : 'Nothing due right now. Answer some chapter self-test questions and they will start showing up here on a schedule (1, 3, 7, 14, then 30 days).';
    $('#plan-due-go').disabled = !due;
    renderChapterLoop();
  }




  /* ------------------------------------------------------------------ v51: study a chapter (ways to study, each a loop of 3 steps) */
  var LPSTORE = { sel:{course:null, week:null, style:null}, loops:{}, stats:{} };
  try{ var _lp = JSON.parse(lsGet('s5v51-loop')||'{}'); if(_lp){ LPSTORE.sel = _lp.sel||LPSTORE.sel; LPSTORE.loops = _lp.loops||{}; LPSTORE.stats = _lp.stats||{}; } }catch(e){}
  function lpSave(){ lsSet('s5v51-loop', JSON.stringify(LPSTORE)); }
  var LP_MIN = 8;   // answers a day or more after studying, per way, before we say anything about what works
  var LPSTYLES = [
    { id:'quiz', name:'Quiz first', blurb:'Try questions before you read',
      good:'Good when you have seen the chapter once, or your test is close. Trying to answer, even when you miss, helps you remember more than rereading.' },
    { id:'read', name:'Read, then check', blurb:'One section at a time',
      good:'Good for a brand new chapter. Reading a little and then testing yourself on it stops the "I read it, so I know it" feeling.' },
    { id:'examples', name:'Examples first', blurb:'Learn by working them',
      good:'Good for chapters with steps or numbers. Follow a solved example while the topic is new. Once that feels easy, skip the example and just do questions.' },
    { id:'write', name:'Write or sketch it', blurb:'Rebuild it from memory',
      good:'Good if you like to see an idea on paper. Writing what you remember is also a way of quizzing yourself, and the gaps show you what to fix.' }
  ];
  function lpKeyInfo(key){
    var parts = key.split(':'), days = null;
    TESTS.forEach(function(t){ if(t.weeks.indexOf(key)>-1){ var d = daysUntil(t.date); if(d>=0 && (days===null || d<days)) days = d; } });
    return { course:parts[0], week:parts[1], testDays:days, hasWorked: !!$('.week-panel[data-key="'+key+'"] .worked, .week-panel[data-key="'+key+'"] .worked-try') };
  }
  function lpChapters(c){
    return $$('.weektabs[data-scope="'+c+'"] .weektab:not([data-week="info"]):not([data-week="links"])').map(function(t){ return t.dataset.week; });
  }
  function lpDefault(){
    var up = TESTS.filter(function(t){ return daysUntil(t.date) >= 0; }).sort(function(a,b){ return a.date<b.date?-1:1; })[0];
    if(up && up.weeks.length){
      var wk = up.weeks.slice().sort(function(a,b){ return readiness([a])-readiness([b]); })[0], p = wk.split(':');
      return { course:p[0], week:p[1] };
    }
    var c0 = Object.keys(COURSES)[0]; return { course:c0, week:lpChapters(c0)[0] };
  }
  function lpSuggest(key, info){
    var st = panelStats(key), acc = st.done ? st.ok/st.done : null;
    if(!st.done) return { id:'read', why:'You have not tried this chapter yet, so start by reading a little.' };
    if(info.testDays!==null && info.testDays<=3) return { id:'quiz', why:'Your test is close, so quizzing yourself is the best use of the time.' };
    if(acc<0.6) return info.hasWorked ? { id:'examples', why:'Quite a few misses so far, so go back to the examples and work them.' } : { id:'read', why:'Quite a few misses so far, so read a bit and check it as you go.' };
    return { id:'quiz', why:'You have seen this chapter, so quizzing yourself now makes it stick.' };
  }
  function lpMark(style, key){
    var lp = LPSTORE.loops[key], now = Date.now();
    if(!lp || lp.style !== style || now - lp.t > 3*DAY){ LPSTORE.loops[key] = { style:style, t:now, seen:{} }; lpSave(); }
  }
  // called from record(): first answer to a question a day or more after a loop counts toward "what works"
  function lpTrack(q, grade){
    var lp = LPSTORE.loops[q.key]; if(!lp) return;
    var age = Date.now() - lp.t;
    if(age < 20*3600*1000 || age > 14*DAY || lp.seen[q.id]) return;
    lp.seen[q.id] = 1;
    var s = LPSTORE.stats[lp.style] || (LPSTORE.stats[lp.style] = { n:0, ok:0 });
    s.n++; if(grade==='ok') s.ok++;
    lpSave();
  }
  function lpScroll(c, w, sel){
    go(c, w);
    setTimeout(function(){ var p = $('.week-panel[data-key="'+c+':'+w+'"]'), n = p && $(sel, p); if(n) n.scrollIntoView({behavior:'smooth', block:'start'}); }, 140);
  }
  function lpQuiz(key, n, misses){ openExam({preset:[key], misses:!!misses}); X.count = n; startExam(); }
  function lpSteps(id, ctx){
    var c = ctx.course, w = ctx.week, key = ctx.key, miss = ctx.missed;
    if(id==='quiz') return [
      { t:'Answer 10 questions', sub:'About 8 minutes. Guessing is fine.', b:'Start', fn:function(){ lpQuiz(key, 10, false); } },
      { t:'Read only what you missed', sub: miss.length ? 'Opens the first question you missed.' : 'Do step 1 first.', b:'Open', off:!miss.length, fn:function(){ go(c, w, miss[0].id); } },
      { t:'Retry the ones you missed', sub: miss.length ? 'Same day, then again tomorrow.' : 'Nothing missed yet.', b:'Start', off:!miss.length, fn:function(){ lpQuiz(key, Math.min(5, miss.length), true); } } ];
    if(id==='read') return [
      { t:'Read the first section', sub:'Just one. Stop when it gets blurry.', b:'Open', fn:function(){ go(c, w); } },
      { t:'Answer its questions', sub:'Try before you look, then check.', b:'Open', fn:function(){ lpScroll(c, w, '.selftest'); } },
      { t:'Quiz yourself on the chapter', sub:'5 questions. Do it again tomorrow.', b:'Start', fn:function(){ lpQuiz(key, 5, false); } } ];
    if(id==='examples') return [
      { t:'Study one worked example', sub:'Follow every step, including the why.', b:'Open', fn:function(){ lpScroll(c, w, '.worked'); } },
      { t:'Cover it and try a similar one', sub:'Use the try-it box under the example.', b:'Open', fn:function(){ lpScroll(c, w, '.worked-try, .worked'); } },
      { t:'Check with questions', sub:'When these feel easy, skip the examples.', b:'Start', fn:function(){ lpQuiz(key, 5, false); } } ];
    return [
      { t:'Read the chapter once', sub:'Do not highlight. Just read.', b:'Open', fn:function(){ go(c, w); } },
      { t:'Close it and write or sketch what you remember', sub:'Everything you can. The gaps are the point.', b:'Notes', fn:function(){ go(c, w); setTimeout(openDrawer, 160); } },
      { t:'Compare, then quiz yourself', sub:'Fix the gaps, then 5 questions.', b:'Start', fn:function(){ lpQuiz(key, 5, false); } } ];
  }
  function renderChapterLoop(){
    var host = $('#plan-chapter-body'); if(!host) return;
    var sel = LPSTORE.sel, courses = Object.keys(COURSES);
    if(!sel.course || !COURSES[sel.course] || lpChapters(sel.course).indexOf(sel.week) < 0){ var d = lpDefault(); sel.course = d.course; sel.week = d.week; sel.style = null; }
    var key = panelKey(sel.course, sel.week), info = lpKeyInfo(key), st = panelStats(key), sug = lpSuggest(key, info);
    var styles = LPSTYLES.filter(function(x){ return x.id!=='examples' || info.hasWorked; });
    if(!sel.style || !styles.some(function(x){ return x.id===sel.style; })) sel.style = sug.id;
    var missed = Q.filter(function(q){ return q.key===key && S.prog[q.id] && S.prog[q.id].s!=='ok'; });
    host.innerHTML = '';
    // 1. course chips
    var chips = el('div','lp-chips'); chips.setAttribute('role','group'); chips.setAttribute('aria-label','Course');
    courses.forEach(function(c){
      var b = el('button', c===sel.course?'on':'', esc(COURSES[c].name)); b.type='button'; b.setAttribute('aria-pressed', c===sel.course?'true':'false'); b.style.setProperty('--cc', COURSES[c].cc);
      b.addEventListener('click', function(){ sel.course = c; sel.week = lpChapters(c)[0]; sel.style = null; var d = lpDefault(); if(d.course===c) sel.week = d.week; lpSave(); renderChapterLoop(); var nb = $$('.lp-chips button', host)[courses.indexOf(c)]; if(nb) nb.focus(); });
      chips.appendChild(b);
    });
    host.appendChild(chips);
    // 2. chapter picker + one status line
    var row = el('div','lp-chap'); var lab = el('label',null,'Chapter'); lab.setAttribute('for','lp-week');
    var selEl = document.createElement('select'); selEl.id = 'lp-week';
    lpChapters(sel.course).forEach(function(w){ var o = document.createElement('option'); o.value = w; o.textContent = weekNames[panelKey(sel.course,w)] || w; if(w===sel.week) o.selected = true; selEl.appendChild(o); });
    selEl.addEventListener('change', function(){ sel.week = selEl.value; sel.style = null; lpSave(); renderChapterLoop(); var s2 = $('#lp-week'); if(s2) s2.focus(); });
    var line = (info.testDays!==null ? 'Test in '+info.testDays+' day'+(info.testDays===1?'':'s')+' · ' : '') + st.ok+' of '+st.total+' right' + (st.due ? ' · '+st.due+' due for review' : '');
    row.appendChild(lab); row.appendChild(selEl); row.appendChild(el('span','lp-line',esc(line)));
    host.appendChild(row);
    // 3. ways to study
    var grid = el('div','lp-styles'); grid.setAttribute('role','group'); grid.setAttribute('aria-label','Way to study');
    styles.forEach(function(x){
      var b = el('button','lp-s'+(x.id===sel.style?' on':''), '<b>'+esc(x.name)+(x.id===sug.id?' <em>Suggested</em>':'')+'</b><span>'+esc(x.blurb)+'</span>'); b.type='button'; b.setAttribute('aria-pressed', x.id===sel.style?'true':'false'); b.dataset.s = x.id;
      b.addEventListener('click', function(){ sel.style = x.id; lpSave(); renderChapterLoop(); var nb = $('.lp-s[data-s="'+x.id+'"]', host); if(nb) nb.focus(); });
      grid.appendChild(b);
    });
    host.appendChild(grid);
    // 4. the loop
    var cur2 = LPSTYLES.filter(function(x){ return x.id===sel.style; })[0];
    var box = el('div','lp-detail');
    box.appendChild(el('p','lp-why','<b>'+esc(cur2.name)+'</b> · '+esc(cur2.good)+(sug.id===cur2.id ? ' <i>'+esc(sug.why)+'</i>' : '')));
    var ol = el('ol','lp-steps');
    lpSteps(cur2.id, { course:sel.course, week:sel.week, key:key, missed:missed }).forEach(function(s, i){
      var li = el('li', null, '<div><b>'+esc(s.t)+'</b><span>'+esc(s.sub)+'</span></div>'); li.style.setProperty('--i', i);
      var b = el('button',null,esc(s.b)); b.type='button'; b.disabled = !!s.off;
      b.addEventListener('click', function(){ lpMark(cur2.id, key); s.fn(); });
      li.appendChild(b); ol.appendChild(li);
    });
    box.appendChild(ol);
    box.appendChild(el('p','lp-again','Then do it again tomorrow, even for 5 minutes. Questions you miss come back in Due for review.'));
    host.appendChild(box);
    // 5. what works for you (answers a day or more after studying a chapter this way)
    var lrn = el('div','lp-learn'), rows = '', ready = 0, best = null;
    LPSTYLES.forEach(function(x){
      var s = LPSTORE.stats[x.id] || {n:0, ok:0}, ok = s.n >= LP_MIN, pct = s.n ? Math.round(100*s.ok/s.n) : 0;
      if(ok){ ready++; if(!best || pct > best.pct) best = { name:x.name, pct:pct }; }
      rows += '<div><span>'+esc(x.name)+'</span><i style="--w:'+(ok?pct:0)+'%"></i><em>'+(ok ? pct+'% right · '+s.n+' answers' : (s.n ? 'needs a few more answers' : 'not tried yet'))+'</em></div>';
    });
    var anyTried = LPSTYLES.some(function(x){ return (LPSTORE.stats[x.id]||{}).n; });
    if(!anyTried){ lrn.className = 'lp-learn lp-learn-empty'; lrn.innerHTML = '<b>What is working for you</b><small>Try a few ways. A day or more after you study, this shows which way gave you the best scores. It is a rough hint, not proof.</small>'; host.appendChild(lrn); return; }
    lrn.innerHTML = '<b>What is working for you</b><div class="lp-bars">'+rows+'</div><small>'+(ready>=2 && best ? 'Best so far: '+esc(best.name)+'. ' : '')+'This counts answers a day or more after you studied a chapter this way. It needs about '+LP_MIN+' answers per way, and it is a rough hint, not proof. Chapters differ in difficulty.</small>';
    host.appendChild(lrn);
  }

  /* ------------------------------------------------------------------ deadlines + exams (plan tab) */
  var DEADLINES = [
    {d:'2026-09-09', c:'sa',    t:'Prior learning assessment', w:10, est:1},
    {d:'2026-09-17', c:'mkt',   t:'Discussion board', w:5},
    {d:'2026-09-23', c:'sa',    t:'Clickstream analysis', w:15, est:1},
    {d:'2026-09-24', c:'hr',    t:'Case exercise (Ch. 3)', w:5},
    {d:'2026-09-27', c:'phl',   t:'Reading assignment 1', w:20},
    {d:'2026-10-01', c:'hr',    t:'Test exercise (Ch. 5)', w:5},
    {d:'2026-10-05', c:'phl',   t:'Group presentation (Plato)', w:10},
    {d:'2026-10-08', c:'mkt',   t:'New product proposal', w:5},
    {d:'2026-10-09', c:'sa',    t:'Multiple outcomes assignment', w:15},
    {d:'2026-10-15', c:'hr',    t:'Case exercise (Ch. 5 content)', w:5},
    {d:'2026-10-16', c:'micro', t:'Test 1 (Ch. 1–4)', w:25, ex:1},
    {d:'2026-10-16', e:'2026-10-19', c:'phl', t:'Test 1, online multiple choice', w:10, ex:1, lab:'Oct 16–19'},
    {d:'2026-10-21', c:'sa',    t:'A/B testing assignment', w:15, est:1},
    {d:'2026-10-22', c:'mkt',   t:'Midterm (Ch. 1–5, 7–9, 11)', w:26, ex:1},
    {d:'2026-10-27', c:'mkt',   t:'Pitch It GBP applications close, 4pm (optional)', w:0},
    {d:'2026-10-22', c:'hr',    t:'Midterm (Ch. 1–7)', w:25, ex:1},
    {d:'2026-11-01', c:'phl',   t:'Reading assignment 2', w:20},
    {d:'2026-11-11', c:'sa',    t:'Voice of customer assignment', w:15, est:1},
    {d:'2026-11-12', c:'hr',    t:'Individual test exercise (Ch. 9–10)', w:5},
    {d:'2026-11-19', c:'mkt',   t:'Group product pitch', w:15},
    {d:'2026-11-20', c:'micro', t:'Test 2', w:25, ex:1},
    {d:'2026-11-21', c:'phl',   t:'Essay / dialogue', w:20, est:1},
    {d:'2026-11-25', c:'sa',    t:'Competitive intelligence assignment', w:15, est:1},
    {d:'2026-12-03', c:'hr',    t:'Group research paper', w:20},
    {d:'2026-12-05', e:'2026-12-07', c:'phl', t:'Test 2, online multiple choice', w:10, ex:1, lab:'Dec 5–7'},
    {d:'2026-12-09', c:'sa',    t:'Reflection and portfolio update', w:15, est:1},
    {d:'2026-12-10', c:'hr',    t:'Group presentations', w:5},
    {d:'2026-12-17', c:'mkt',   t:'Full marketing plan presentation', w:25},
    {d:'2026-12-17', c:'hr',    t:'Final exam (Ch. 8–14)', w:30, ex:1},
    {d:'2026-12-18', c:'micro', t:'Final exam', w:30, ex:1}
  ];
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dlAll = false;
  function renderDeadlines(){
    var box = $('#plan-dl'); if(!box) return; box.innerHTML='';
    var list = DEADLINES.filter(function(x){ return daysUntil(x.e || x.d) >= 0; });
    var shown = dlAll ? list : list.slice(0, 7);
    var wrap = el('div','dl-list');
    shown.forEach(function(x){
      var p = x.d.split('-'), dt = new Date(+p[0], +p[1]-1, +p[2]), ds = daysUntil(x.d), c = COURSES[x.c];
      var row = el('div','dl-row'+(x.ex?' isx':'')+(ds<=3?' soon':''));
      row.style.setProperty('--cc', c.cc);
      var when = ds<0 ? 'open now' : ds===0 ? 'today' : ds===1 ? 'tomorrow' : 'in '+ds+' days';
      row.innerHTML = '<div class="dl-date"><b>'+dt.getDate()+'</b><span>'+MON[dt.getMonth()]+'</span></div>'+
        '<div class="dl-main"><b>'+esc(x.t)+(x.ex?' <em class="dl-ex">Exam</em>':'')+'</b><span><i></i>'+esc(c.name)+' · '+dt.toLocaleDateString('en-CA',{weekday:'short'})+(x.lab? ' ('+x.lab+')':'')+(x.est?' · date est.':'')+'</span></div>'+
        '<div class="dl-right"><span class="dl-when">'+when+'</span><span class="dl-w">'+x.w+'%</span></div>';
      wrap.appendChild(row);
    });
    box.appendChild(wrap);
    var bar = el('div','dl-foot');
    if(list.length>7){
      var b = el('button','btn',''); b.type='button'; b.textContent = dlAll ? 'Show fewer' : 'Show all '+list.length;
      b.addEventListener('click', function(){ dlAll = !dlAll; renderDeadlines(); });
      bar.appendChild(b);
    }
    bar.appendChild(el('span','hint','"est." means the date is estimated from the weekly schedule or not confirmed. Check D2L.'));
    box.appendChild(bar);
  }

  /* ------------------------------------------------------------------ per-course timeline (line + dots) and key-date chips */
  function shortDate(iso){ var p=iso.split('-'); return MON[+p[1]-1]+' '+(+p[2]); }
  function tlItems(c){
    var arr = DEADLINES.filter(function(x){ return x.c===c; }).slice().sort(function(a,b){ return a.d<b.d?-1:a.d>b.d?1:0; });
    return arr;
  }
  function tlLabel(x){
    var dt = shortDate(x.d) + (x.e ? '–'+(+x.e.split('-')[2]) : '');
    return '<b>'+esc(x.t)+'</b><span>'+dt+' · '+x.w+'%'+(x.ex?' · <em>exam</em>':'')+(x.est?' · est.':'')+'</span>';
  }
  function renderTimeline(c){
    var box = document.getElementById(c+'-tl'); if(!box) return;
    var items = tlItems(c); if(!items.length) return;
    var W = box.clientWidth; if(!W) return;                       // hidden tab: draw when it is opened
    var vertical = W < 700;
    box.innerHTML=''; box.classList.toggle('tl2-v', vertical);
    var ts = function(iso){ var p=iso.split('-'); return new Date(+p[0],+p[1]-1,+p[2]).getTime(); };
    var now = dayStart();
    var first = Math.min(ts(items[0].d), now), last = ts(items[items.length-1].e || items[items.length-1].d);
    var span = Math.max(last-first, DAY);
    if(vertical){
      var ol = el('ol','tl2-list'), todayDone = false;
      var todayLi = function(){ var li=el('li','tl2-li tl2-today','<i class="tl2-dot"></i><div class="tl2-t"><b>Today</b><span>'+shortDate(isoOf(now))+'</span></div>'); return li; };
      items.forEach(function(x){
        if(!todayDone && ts(x.d) >= now){ ol.appendChild(todayLi()); todayDone = true; }
        var past = ts(x.e||x.d) < now;
        var li = el('li','tl2-li'+(past?' past':'')+(x.ex?' isx':'')+(x.est?' est':''), '<i class="tl2-dot'+(x.ex?' isx':'')+(x.est?' est':'')+(past?' past':'')+'"></i><div class="tl2-t">'+tlLabel(x)+'</div>');
        ol.appendChild(li);
      });
      if(!todayDone) ol.appendChild(todayLi());
      box.appendChild(ol); return;
    }
    var padPct = 5, LW = 136, LH = 64, PAD = 14;
    var pos = function(t){ return padPct + (t-first)/span*(100-2*padPct); };
    var lanes = {a1:[],b1:[],a2:[],b2:[]}, order = ['a1','b1','a2','b2'];
    var placed = [];
    var place = function(xp, w, kind){
      var left = Math.max(0, Math.min(W-w, xp - w/2));
      var pick = null;
      for(var i=0;i<order.length && !pick;i++){
        var ln = lanes[order[i]];
        if(ln.every(function(o){ return Math.abs(o.left-(left+w/2)) >= (o.w+w)/2 + 8; })) pick = order[i];
      }
      if(!pick){ pick = order[placed.length % order.length]; }
      lanes[pick].push({left:left+w/2, w:w});
      return {lane:pick, left:left};
    };
    var todayT = Math.min(Math.max(now, first), last);  // today stays on the line even after the last date
    var tp = pos(todayT)*W/100;
    var tpl = place(tp, 52, 'today');           // keep "Today" out of the way first
    items.forEach(function(x, idx){
      var xp = pos(ts(x.d))*W/100;
      var pl = place(xp, LW, 'item'); pl.xp = xp; pl.x = x; placed.push(pl);
    });
    var nA = (lanes.a1.length?1:0)+(lanes.a2.length?1:0), nB = (lanes.b1.length?1:0)+(lanes.b2.length?1:0);
    var topH = nA*LH+PAD, botH = nB*LH+PAD, lineY = topH+8;
    box.style.height = (topH+botH+16)+'px';
    var line = el('div','tl2-line'); line.style.top = lineY+'px'; box.appendChild(line);
    var fill = el('div','tl2-fill'); fill.style.top = lineY+'px'; fill.style.width = Math.max(0,(todayT>=first? tp : 0))+'px'; box.appendChild(fill);
    var addLabel = function(lane, left, w, xp, html, cls){
      var above = lane.charAt(0)==='a', k = +lane.charAt(1);
      var lab = el('div','tl2-lab '+(above?'up':'dn')+(cls?' '+cls:''), html);
      lab.style.left = left+'px'; lab.style.width = w+'px';
      var lead = el('i','tl2-lead'); lead.style.left = xp+'px';
      if(above){
        lab.style.top = (lineY - 14 - (k-1)*LH - (LH-6))+'px'; lab.style.height = (LH-6)+'px';
        lead.style.top = (lineY - 14 - (k-1)*LH)+'px'; lead.style.height = (8 + (k-1)*LH)+'px';
      } else {
        lab.style.top = (lineY + 14 + (k-1)*LH)+'px';
        lead.style.top = (lineY + 6)+'px'; lead.style.height = (8 + (k-1)*LH)+'px';
      }
      box.appendChild(lead); box.appendChild(lab);
    };
    placed.forEach(function(pl){
      var x = pl.x, past = ts(x.e||x.d) < now;
      var dot = el('i','tl2-dot'+(x.ex?' isx':'')+(x.est?' est':'')+(past?' past':''));
      dot.style.left = pl.xp+'px'; dot.style.top = lineY+'px'; box.appendChild(dot);
      addLabel(pl.lane, pl.left, LW, pl.xp, tlLabel(x), (past?'past':'')+(x.ex?' isx':''));
    });
    var td = el('i','tl2-dot tl2-now'); td.style.left = tp+'px'; td.style.top = lineY+'px'; box.appendChild(td);
    addLabel(tpl.lane, tpl.left, 52, tp, '<b>Today</b><span>'+shortDate(isoOf(now))+'</span>', 'now');
  }
  function isoOf(t){ var d=new Date(t); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
  function renderTimelines(){ Object.keys(COURSES).forEach(function(c){ if(c!=='plan') renderTimeline(c); }); }
  /* the Done / Soon / Upcoming chips in each course's key-date list are worked out from the date written next to them */
  function markKeyDates(){
    var MI = {Sept:8, Sep:8, Oct:9, Nov:10, Dec:11};
    $$('.keydates .kd-row').forEach(function(r){
      var dEl = $('.kd-date', r), chip = $('.chip', r); if(!dEl || !chip) return;
      var m = (dEl.firstChild ? dEl.firstChild.textContent : dEl.textContent).match(/^\s*(Sept?|Oct|Nov|Dec)\s+(\d+)(?:\s*[–-]\s*(\d+))?/);
      if(!m) return;
      var ds = daysUntil('2026-'+pad2(MI[m[1]]+1)+'-'+pad2(+(m[3]||m[2])));
      var st = ds<0 ? ['done','Done'] : ds<=3 ? ['soon','Soon'] : ['upcoming','Upcoming'];
      chip.className = 'chip '+st[0]; chip.textContent = st[1];
    });
  }

  /* ------------------------------------------------------------------ today + weak spots */
  function dayStart(){ var d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
  function missQs(){ return Q.filter(function(q){ var r=S.prog[q.id]; return r && r.s!=='ok'; }); }
  function renderToday(){
    var box = $('#plan-today-body'); if(!box) return;
    box.innerHTML='';
    var nowD = new Date();
    var upcoming = TESTS.filter(function(t){ return daysUntil(t.date)>=0; }).sort(function(a,b){ return a.date<b.date?-1:1; });
    var near = upcoming.filter(function(t){ return daysUntil(t.date) <= 14; });
    if(!near.length && upcoming.length) near = [upcoming[0]];
    var items = [];
    near.forEach(function(t){
      var ds = daysUntil(t.date);
      t.weeks.forEach(function(k){
        var rd = readiness([k]);
        items.push({ t:t, k:k, rd:rd, ds:ds, score:(1-rd)/Math.max(ds,1) });
      });
    });
    items.sort(function(a,b){ return b.score-a.score; });
    var pick = [], per = {};
    items.forEach(function(it){ if(pick.length>=3) return; var c=it.t.course; if((per[c]||0)>=2) return; per[c]=(per[c]||0)+1; pick.push(it); });
    var due = dueQs().length, miss = missQs().length, today = 0, ds0 = dayStart();
    Object.keys(S.prog).forEach(function(id){ if((S.prog[id].t||0) >= ds0) today++; });
    var mins = Math.ceil(0.8*(Math.min(due,15) + (pick.length?10:0) + Math.min(miss,8)));
    var head = el('div','today-head');
    var nt = near[0];
    head.innerHTML = '<div><div class="today-big">'+(nt ? esc(COURSES[nt.course].name)+' · '+esc(nt.title.split(' · ')[0])+' in '+Math.max(daysUntil(nt.date),0)+' day'+(daysUntil(nt.date)===1?'':'s') : 'No tests ahead')+'</div>'+
      '<div class="section-sub" style="margin:4px 0 0">'+(mins? 'Plan for today: about '+mins+' minutes.' : 'Nothing queued. Pick a chapter and start with its self-test.')+'</div></div>'+
      '<button type="button" class="today-chip" aria-expanded="false" aria-controls="today-list"><b>'+today+'</b> answered today<i class="tc-caret" aria-hidden="true"></i></button>';
    box.appendChild(head);
    var chipB = $('.today-chip', head), tlist = el('div','today-list'); tlist.id = 'today-list'; tlist.hidden = true;
    box.appendChild(tlist);
    function fillToday(){
      tlist.innerHTML = '';
      var ids = Object.keys(S.prog).filter(function(id){ return (S.prog[id].t||0) >= ds0 && qById(id); }).sort(function(a,b){ return (S.prog[b].t||0) - (S.prog[a].t||0); });
      if(!ids.length){ tlist.appendChild(el('p','tl-none','Nothing answered yet today. Open a chapter and try its self-test.')); return; }
      ids.forEach(function(id){
        var q = qById(id), r = S.prog[id], g = r.s==='ok' ? 'Got it' : r.s==='miss' ? 'Review' : 'Partly';
        var txt = String(q.text).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); if(txt.length > 90) txt = txt.slice(0,88) + '…';
        var row = el('button','tl-row',''); row.type = 'button'; row.dataset.s = r.s || '';
        row.innerHTML = '<span class="tl-st">'+g+'</span><span class="tl-body"><b>'+esc(COURSES[q.course].name)+' · '+esc(weekNames[q.key]||q.key)+' · Q'+esc(String(id).split('#')[1])+'</b><span>'+esc(txt)+'</span></span><span class="tl-go" aria-hidden="true">›</span>';
        row.addEventListener('click', function(){ go(q.course, q.week, id); });
        tlist.appendChild(row);
      });
    }
    if(chipB) chipB.addEventListener('click', function(){
      var open = tlist.hidden; tlist.hidden = !open; chipB.setAttribute('aria-expanded', open ? 'true' : 'false');
      if(open) fillToday();
    });

    var steps = el('div','today-steps'); var n=0;
    function step(title, sub, btns){
      n++; var s=el('div','tstep'); s.innerHTML='<span class="tn">'+n+'</span><div class="tbody"><b>'+title+'</b><span>'+sub+'</span></div>';
      var bw = el('div','tbtns'); btns.forEach(function(b){ bw.appendChild(b); }); s.appendChild(bw); steps.appendChild(s);
    }
    function mk(label, cls, fn){ var b=el('button','btn '+cls,''); b.type='button'; b.textContent=label; b.addEventListener('click', fn); return b; }
    if(due){
      step('Review what is due', due+' question'+(due>1?'s':'')+' came back on the schedule. Do these first, they take the least time.', [mk('Review now','solid', function(){ openExam({due:true}); })]);
    }
    pick.forEach(function(it){
      var c = COURSES[it.t.course];
      var st = panelStats(it.k);
      step(esc(weekNames[it.k]||it.k)+' <span class="tcrs" style="--cc:'+c.cc+'"><i></i>'+esc(c.name)+'</span>',
        Math.round(100*it.rd)+'% ready · '+(st.done? st.done+' of '+st.total+' tried' : 'not started')+' · '+esc(it.t.title.split(' · ')[0])+' in '+it.ds+' day'+(it.ds===1?'':'s'),
        [mk('Read it','', function(){ go(it.t.course, it.k.split(':')[1]); }), mk('Quiz me','solid', function(){ openExam({preset:[it.k]}); })]);
    });
    if(miss){
      step('Fix your misses', miss+' question'+(miss>1?'s':'')+' where your last answer was wrong or partly right.', [mk('Retry misses','', function(){ openExam({misses:true}); })]);
    }
    if(!n){ step('Start a chapter', 'Open any chapter, read it once, then do its self-test. Your plan fills in after your first answers.', [mk('Open Micro Ch. 1','solid', function(){ go('micro','ch1'); })]); }
    box.appendChild(steps);
  }
  function renderWeak(){
    var box = $('#plan-weak-body'); if(!box) return;
    box.innerHTML='';
    var g = {}, sureWrong = 0, cs = {n:0,ok:0}, cg = {n:0,ok:0};
    Q.forEach(function(q){
      var r = S.prog[q.id]; if(!r) return;
      if(r.sw) sureWrong += r.sw;
      if(q.kind==='mcq' && r.c){ var o = r.c==='sure'?cs:cg; o.n++; if(r.s==='ok') o.ok++; }
      if(!(r.m>0 || r.s!=='ok')) return;
      var k = q.key+'|'+(q.tag||'general'), e = g[k] || (g[k] = { key:q.key, course:q.course, week:q.week, tag:q.tag, miss:0, sure:0, open:0, qid:q.id, tried:0 });
      e.miss += (r.m||0); e.sure += (r.sw||0); if(r.s!=='ok') e.open++;
      if(r.s!=='ok' && e.qid!==q.id && !e._pinned){ e.qid = q.id; e._pinned = true; }
    });
    Q.forEach(function(q){ var r=S.prog[q.id]; if(!r) return; var e=g[q.key+'|'+(q.tag||'general')]; if(e) e.tried++; });
    var rows = Object.keys(g).map(function(k){ var e=g[k]; e.score = e.miss + 2*e.sure + 2*e.open; return e; }).sort(function(a,b){ return b.score-a.score; }).slice(0,8);
    if(!rows.length){
      box.appendChild(el('div','card due-card','<p>Nothing yet. After you answer some questions, the topics you miss most will show up here, with a link back to the question.</p>'));
    } else {
      var list = el('div','weak-list');
      rows.forEach(function(e){
        var c = COURSES[e.course], r = el('div','weak-row');
        r.style.setProperty('--cc', c.cc);
        r.innerHTML = '<div class="wk-main"><b>'+esc(titleCase(e.tag))+'</b><span><i></i>'+esc(c.name)+' · '+esc(weekNames[e.key]||e.key)+'</span></div>'+
          '<div class="wk-stat">'+e.miss+' miss'+(e.miss===1?'':'es')+(e.sure? ' · <b class="sw">'+e.sure+' while sure</b>' : '')+(e.open? ' · '+e.open+' still open' : ' · fixed since')+'</div>';
        var b = el('button','btn',''); b.type='button'; b.textContent='Open';
        b.addEventListener('click', function(){ go(e.course, e.week, e.qid); });
        r.appendChild(b); list.appendChild(r);
      });
      box.appendChild(list);
      var bar = el('div','q-bar'); bar.style.marginTop='14px';
      var pb = el('button','btn solid',''); pb.type='button'; pb.textContent='Practice my misses'; pb.addEventListener('click', function(){ openExam({misses:true}); });
      bar.appendChild(pb); box.appendChild(bar);
    }
    if(cs.n+cg.n >= 4){
      var pc = function(o){ return o.n ? Math.round(100*o.ok/o.n)+'% right ('+o.n+')' : 'no data yet'; };
      var tip = (cs.n && cg.n && cs.ok/cs.n < 0.7) ? ' When you say Sure and are wrong this often, slow down on those: re-read the question and cross out two options before you commit.' : '';
      box.appendChild(el('div','co co-tip','<span class="co-tag">Your confidence check</span>When you tapped <b>Sure</b>: '+pc(cs)+'. When you tapped <b>Guessing</b>: '+pc(cg)+'. Sure-but-wrong so far: <b>'+sureWrong+'</b>.'+tip));
    }
  }

  /* ------------------------------------------------------------------ cheat sheet (built from the chapter pages) */
  var SH = { course:null, types:{}, chap:{}, all:false };
  function shTypes(){ var any = Object.keys(SH.types).some(function(k){ return SH.types[k]; }); return any ? SH.types : {math:true, trap:true, mem:true}; }
  var SH_TYPES = [['math','Formulas and rules'],['trap','Exam traps'],['mem','Memory tricks'],['def','Definitions'],['term','Key terms']];
  function openSheet(c, w){
    if(!c) return;
    if(c==='plan'){ c = opCourses()[0]; SH.view = 'op'; SH.sel = []; }
    SH.course = c; SH.chap = {}; SH.all = false;
    SH.types = {};
    if(w && w!=='info'){ SH.chap[panelKey(c,w)] = true; SH.sel = [panelKey(c,w)]; } else if(cur.course!=='plan') SH.sel = [];
    var e = $('#sheet'); e.hidden=false; document.body.style.overflow='hidden';
    renderSheet(); e.scrollTop = 0;
  }
  function closeSheet(){ $('#sheet').hidden=true; document.body.style.overflow=''; }
  function sheetData(c){
    var out = [];
    $$('.course-panel[data-course="'+c+'"] .week-panel:not([data-week="info"]):not([data-week="links"])').forEach(function(p){
      var k = panelKey(c, p.dataset.week), d = { key:k, math:[], trap:[], mem:[], def:[], term:[] };
      $$('.co-math, .co-trap, .co-mem, .co-def', p).forEach(function(n){
        ['math','trap','mem','def'].forEach(function(t){ if(n.classList.contains('co-'+t)) d[t].push(n); });
      });
      $$('details.flash', p).forEach(function(f){ var s=$('summary',f), a=$('p',f); if(s && a) d.term.push({t:s.textContent.trim(), d:a.innerHTML}); });
      out.push(d);
    });
    return out;
  }
  /* ================================================================== v74: one-pager (Cheat sheet, one page, a column per chapter) */
  var OP = { items: {} };
  var OP_COL = ['#1f5fbf', '#7a3fb5', '#d9622b', '#1e8f5a'];
  function opLoad(){ try{ var o = JSON.parse(lsGet('s5v74-op') || 'null'); if(o && o.items) OP = o; }catch(e){} }
  function opSaveLocal(){ lsSet('s5v74-op', JSON.stringify(OP)); }
  function opMerge(r){
    if(!r || !r.items) return false; var ch = false;
    Object.keys(r.items).forEach(function(k){ var ri = r.items[k], li = OP.items[k]; if(!li || (ri.t || 0) > (li.t || 0)){ OP.items[k] = ri; ch = true; } });
    return ch;
  }
  var opTm = 0, opBusy = false;
  function opPush(){
    clearTimeout(opTm);
    opTm = setTimeout(function(){
      if(!dbState.ok || !dbState.opRef) return;
      if(opBusy){ opPush(); return; }
      opBusy = true;
      Promise.resolve(dbState.opRef.get()).then(function(s){ try{ if(s && s.exists && opMerge(s.data().data)){ opSaveLocal(); } }catch(e){} }, function(){})
        .then(function(){ return dbState.opRef.set({ data: JSON.parse(JSON.stringify(OP)), saved: Date.now() }); })
        .then(function(){ opBusy = false; }, function(){ opBusy = false; });
    }, 700);
  }
  function opPull(){
    if(!dbState.ok || !dbState.opRef) return;
    Promise.resolve(dbState.opRef.get()).then(function(s){ try{ if(s && s.exists && opMerge(s.data().data)){ opSaveLocal(); } }catch(e){} opPush(); }, function(){});
  }
  function opClip(t, n){
    t = String(t || '').replace(/\s+/g, ' ').trim(); if(t.length <= n) return t;
    var cut = t.slice(0, n), k = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
    if(k > n * 0.55) return cut.slice(0, k + 1);
    k = cut.lastIndexOf(' '); return cut.slice(0, k > 0 ? k : n) + '…';
  }
  function opBoxText(n){ var c = n.cloneNode(true); $$('.co-tag, button, .sh-co-x', c).forEach(function(x){ x.remove(); }); return c.textContent.replace(/\s+/g, ' ').trim(); }
  /* what the chapter says, as plain text, for the model */
  function opSource(c, key){
    var wk = key.split(':')[1], p = $('.course-panel[data-course="' + c + '"] .week-panel[data-week="' + wk + '"]'); if(!p) return '';
    var parts = [];
    $$('.wp-main h2', p).forEach(function(h){ parts.push('# ' + h.textContent.trim()); });
    $$('.co', p).forEach(function(n){ if(n.classList.contains('co-ex') && parts.join('').length > 6500) return; parts.push('- ' + opBoxText(n)); });
    $$('details.flash', p).forEach(function(f){ var s = $('summary', f), a = $('p', f); if(s && a) parts.push('TERM ' + s.textContent.trim() + ': ' + a.textContent.trim()); });
    return parts.join('\n').slice(0, 9000);
  }
  function opFast(c, key, d){
    var core = d.def.slice(0, 3).map(function(n){ return opClip(opBoxText(n), 125); });
    var tricks = d.mem.slice(0, 2).map(function(n){ return opClip(opBoxText(n), 110); });
    var formulas = d.math.slice(0, 2).map(function(n){ return opClip(opBoxText(n), 120); });
    var terms = d.term.slice(0, 5).map(function(x){ var tmp = document.createElement('div'); tmp.innerHTML = x.d; return { k: x.t, d: opClip(tmp.textContent, 65) }; });
    var traps = d.trap.slice(0, 2).map(function(n){ return opClip(opBoxText(n), 115); });
    return { core: core, formulas: formulas, tricks: tricks, terms: terms, traps: traps };
  }
  var OP_RULES = 'You are making ONE column of a one-page exam cheat sheet for a college student, from their own study notes for one chapter. Use ONLY facts, numbers and formulas that appear in the notes. Never invent a number. Plain, short, student-level wording. No em dashes.\n' +
    'Return ONLY a JSON object, no other text, in exactly this shape:\n{"core":["..."],"formulas":["..."],"tricks":["..."],"terms":[{"k":"term","d":"short meaning"}],"traps":["..."]}\n' +
    'Limits: core 3 to 5 items (max 150 characters each, the ideas to remember), formulas 0 to 4 (keep the numbers from the notes), tricks 0 to 3 (memory tricks or mnemonics from the notes), terms 4 to 7 (max 90 characters each), traps 2 to 4 (mistakes that lose marks, max 150 characters each).';
  function opObj(t){
    var a = String(t || '').indexOf('{'), b = String(t || '').lastIndexOf('}'); if(a < 0 || b <= a) return null;
    try{ return JSON.parse(t.slice(a, b + 1)); }catch(e){ return null; }
  }
  function opCleanCol(o){
    if(!o || typeof o !== 'object') return null;
    function arr(x, n, m){ return Array.isArray(x) ? x.map(function(s){ return String(s).replace(/\s+/g, ' ').trim().slice(0, m); }).filter(Boolean).slice(0, n) : []; }
    var terms = Array.isArray(o.terms) ? o.terms.filter(function(z){ return z && z.k && z.d; }).map(function(z){ return { k: String(z.k).trim().slice(0, 60), d: String(z.d).trim().slice(0, 110) }; }).slice(0, 7) : [];
    var col = { core: arr(o.core, 5, 170), formulas: arr(o.formulas, 4, 170), tricks: arr(o.tricks, 3, 150), terms: terms, traps: arr(o.traps, 4, 170) };
    return (col.core.length || col.terms.length) ? col : null;
  }
  function opWrite(c, keys, setMsg){
    return impSample().then(function(s){
      if(!s) throw { code: 'nosample' };
      var done = 0, fail = 0;
      return Promise.all(keys.map(function(k){
        var src = opSource(c, k); if(!src){ fail++; return null; }
        return s(OP_RULES + '\nThe chapter notes:\n"""\n' + src + '\n"""', { modelTier: 'quick', cache: false }).then(function(txt){
          var col = opCleanCol(opObj(txt)); if(!col){ fail++; return; }
          OP.items[k] = { id: k, t: Date.now(), sig: src.length, col: col }; done++; if(setMsg) setMsg(done + ' of ' + keys.length + ' written…');
        }, function(){ fail++; });
      })).then(function(){ opSaveLocal(); opPush(); return { done: done, fail: fail }; });
    });
  }
  function opHas(c, k){ var it = OP.items[k]; return !!(it && it.col && !it.del); }
  var OPV = { busy: false, msg: '' };
  function opColHtml(i, key, col){
    if(col.sections) return opBakedHtml(i, key, col);
    var nm = esc(weekNames[key] || key), h = '<div class="op-col"><div class="op-ch" style="background:' + OP_COL[i % 4] + '">' + nm + '</div><div class="op-b">';
    function sec(t, list, cls){
      if(!list || !list.length) return '';
      var s = '<div class="op-h">' + t + '</div>';
      if(cls === 'trap') return s + list.map(function(x){ return '<div class="op-trap">' + esc(x) + '</div>'; }).join('');
      if(cls === 'mem') return s + list.map(function(x){ return '<div class="op-mem">' + esc(x) + '</div>'; }).join('');
      if(cls === 'box') return s + list.map(function(x){ return '<div class="op-box">' + esc(x) + '</div>'; }).join('');
      return s + '<ul>' + list.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    }
    h += sec('Core ideas', col.core, '') + sec('Formulas and rules', col.formulas, 'box') + sec('Memory tricks', col.tricks, 'mem');
    if(col.terms && col.terms.length) h += '<div class="op-h">Key terms</div><ul>' + col.terms.map(function(z){ return '<li><b>' + esc(z.k) + '</b>: ' + esc(z.d) + '</li>'; }).join('') + '</ul>';
    h += sec('Traps', col.traps, 'trap') + '</div></div>';
    return h;
  }
  function opPageEl(c, items, title, pageNo, pageTot){
    var pg = el('div', 'op-page', '<div class="op-top"><span class="op-t">' + esc(title) + '</span><span class="op-s">' + esc(COURSES[c].name) + (pageTot > 1 ? ' · page ' + pageNo + ' of ' + pageTot : '') + '</span></div><div class="op-cols">' +
      items.map(function(it, i){ return opColHtml(i, it.key, it.col); }).join('') + '</div><div class="op-foot"><span>Built from your Semester 5 Study Map notes.</span><span>Check the formulas against your slides.</span></div>');
    return pg;
  }
  function opFit(pg){
    var size = 13.6; pg.style.fontSize = size + 'px';
    var cols = $$('.op-col', pg), top = $('.op-cols', pg).offsetTop, limit = 850 - 34 - top;
    function tall(){ var mx = 0; cols.forEach(function(cl){ mx = Math.max(mx, cl.offsetHeight); }); return mx; }
    for(var i = 0; i < 40; i++){ if(tall() <= limit || size <= 7.4) break; size -= 0.3; pg.style.fontSize = size + 'px'; }
    /* still too tall: drop the least important block of a long column (tables, then terms, then the second figure) */
    var order = ['table', 'terms']; 
    for(var g = 0; g < 12 && tall() > limit; g++){
      var done = false;
      cols.forEach(function(cl){
        if(done || cl.offsetHeight <= limit) return;
        for(var o = 0; o < order.length && !done; o++){ var q = $$('.op-sec[data-k="' + order[o] + '"]', cl); if(q.length){ q[q.length - 1].remove(); done = true; } }
        if(!done){ var f = $$('.op-fig', cl); if(f.length > 1){ f[f.length - 1].remove(); done = true; } }
      });
      if(!done) break;
    }
  }
  function opKeys(c, data){
    var on = Object.keys(SH.chap).filter(function(k){ return SH.chap[k]; });
    var keys = data.map(function(d){ return d.key; });
    return (on.length && !SH.all) ? keys.filter(function(k){ return SH.chap[k]; }) : keys;
  }
  function opLibs(){
    function load(src, test){ if(test()) return Promise.resolve(); return new Promise(function(res, rej){ var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function(){ rej(new Error('lib')); }; document.head.appendChild(s); }); }
    return load('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', function(){ return !!window.html2canvas; }).then(function(){
      return load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', function(){ return !!(window.jspdf && window.jspdf.jsPDF); });
    });
  }
  function opShots(pages){
    return opLibs().then(function(){
      var hold = el('div', 'op-hold', ''); document.body.appendChild(hold);
      var out = [];
      function next(i){
        if(i >= pages.length){ hold.remove(); return Promise.resolve(out); }
        var cl = pages[i].cloneNode(true); cl.style.transform = 'none'; cl.style.width = '1100px'; cl.style.height = '850px'; hold.appendChild(cl);
        return window.html2canvas(cl, { scale: 2, backgroundColor: '#ffffff', logging: false }).then(function(cv){ out.push(cv); cl.remove(); return next(i + 1); });
      }
      return next(0).catch(function(e){ hold.remove(); throw e; });
    });
  }
  function opSave(kind, pages, base){
    stToast('Making your ' + (kind === 'pdf' ? 'PDF' : 'photo') + '…');
    opShots(pages).then(function(cvs){
      return Promise.resolve(window.claude && window.claude.use ? window.claude.use('downloads') : null).then(function(dl){
        if(!dl){ stToast('Saving is not available here'); return; }
        function one(blob, name){ return dl.save({ filename: name, data: blob }); }
        if(kind === 'pdf'){
          var P = window.jspdf.jsPDF, doc = new P({ orientation: 'landscape', unit: 'px', format: [1100, 850], hotfixes: ['px_scaling'] });
          cvs.forEach(function(cv, i){ if(i) doc.addPage([1100, 850], 'landscape'); doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 1100, 850); });
          return one(doc.output('blob'), base + '.pdf').then(function(){ stToast('Saved'); }, function(err){ if(!err || err.code !== 'declined') stToast('Could not save'); });
        }
        var chain = Promise.resolve();
        cvs.forEach(function(cv, i){ chain = chain.then(function(){ return new Promise(function(res){ cv.toBlob(function(b){ res(b); }, 'image/png'); }).then(function(b){ return one(b, base + (cvs.length > 1 ? '-' + (i + 1) : '') + '.png'); }); }); });
        return chain.then(function(){ stToast('Saved'); }, function(err){ if(!err || err.code !== 'declined') stToast('Could not save'); });
      });
    }).catch(function(){ stToast('Could not make the file here'); });
  }
  function opScale(){
    $$('.op-sc').forEach(function(w){ var pg = $('.op-page', w); if(!pg) return; var s = Math.min(1, w.clientWidth / 1100); pg.style.transform = 'scale(' + s + ')'; w.style.height = Math.round(850 * s) + 'px'; });
  }
  var OPB = {"hr:ch1":{"key":"hr:ch1","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><rect x='6' y='8' width='92' height='40' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='52.0' y='18.7' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 1<\/text><text x='52.0' y='29.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Mission, goals<\/text><text x='52.0' y='40.7' font-size='9' text-anchor='middle' fill='#1c1f24'>+ strategy<\/text><rect x='104' y='8' width='92' height='40' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='150.0' y='18.7' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 2<\/text><text x='150.0' y='29.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Environmental<\/text><text x='150.0' y='40.7' font-size='9' text-anchor='middle' fill='#1c1f24'>scan (outside)<\/text><rect x='202' y='8' width='92' height='40' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='248.0' y='18.7' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 3<\/text><text x='248.0' y='29.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Structure +<\/text><text x='248.0' y='40.7' font-size='9' text-anchor='middle' fill='#1c1f24'>culture (inside)<\/text><rect x='202' y='84' width='92' height='40' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='248.0' y='94.7' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 4<\/text><text x='248.0' y='105.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Choose and run<\/text><text x='248.0' y='116.7' font-size='9' text-anchor='middle' fill='#1c1f24'>HR strategies<\/text><rect x='104' y='84' width='92' height='40' rx='4' fill='none' stroke='#d9622b' stroke-width='1.3'/><text x='150.0' y='94.7' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 5<\/text><text x='150.0' y='105.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Review, evaluate,<\/text><text x='150.0' y='116.7' font-size='9' text-anchor='middle' fill='#1c1f24'>audit<\/text><line x1='98' y1='28' x2='99.0' y2='28.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='104,28 99.0,30.8 99.0,25.2' fill='#1c1f24'/><line x1='196' y1='28' x2='197.0' y2='28.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='202,28 197.0,30.8 197.0,25.2' fill='#1c1f24'/><line x1='248' y1='48' x2='248.0' y2='79.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='248,84 245.2,79.0 250.8,79.0' fill='#1c1f24'/><line x1='202' y1='104' x2='201.0' y2='104.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='196,104 201.0,101.2 201.0,106.8' fill='#1c1f24'/><path d='M104,104 L52,104 L52.0,53.0' fill='none' stroke='#8a8f98' stroke-width='1.2' stroke-dasharray='3 2'/><polygon points='52,48 54.8,53.0 49.2,53.0' fill='#8a8f98'/><text x='14' y='124' font-size='9' text-anchor='start' fill='#1c1f24'>feeds next round<\/text><text x='150' y='66' font-size='9' text-anchor='middle' fill='#1c1f24'>plan, look out, look in, do, check<\/text><\/svg>","cap":"Strategic HRM: 5-step cycle (Fig 1-2)"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><circle cx='50' cy='70' r='36' fill='none' stroke='#1c1f24' stroke-width='1.3'/><text x='50' y='67' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>The<\/text><text x='50' y='78' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>organization<\/text><line x1='86' y1='70' x2='110' y2='16' stroke='#8a8f98' stroke-width='1'/><rect x='110' y='4' width='186' height='24' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='115' y='13.2' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>Economic (4)<\/text><text x='115' y='23.2' font-size='9' text-anchor='start' fill='#1c1f24'>cycles, trade, productivity<\/text><line x1='86' y1='70' x2='110' y2='43' stroke='#8a8f98' stroke-width='1'/><rect x='110' y='31' width='186' height='24' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='115' y='40.2' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>Technological (3)<\/text><text x='115' y='50.2' font-size='9' text-anchor='start' fill='#1c1f24'>work design, automation, data<\/text><line x1='86' y1='70' x2='110' y2='70' stroke='#8a8f98' stroke-width='1'/><rect x='110' y='58' width='186' height='24' rx='4' fill='none' stroke='#d9622b' stroke-width='1.3'/><text x='115' y='67.2' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>Demographic (4)<\/text><text x='115' y='77.2' font-size='9' text-anchor='start' fill='#1c1f24'>gender, education, aging, generations<\/text><line x1='86' y1='70' x2='110' y2='97' stroke='#8a8f98' stroke-width='1'/><rect x='110' y='85' width='186' height='24' rx='4' fill='none' stroke='#c43b3b' stroke-width='1.3'/><text x='115' y='94.2' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>Cultural (2)<\/text><text x='115' y='104.2' font-size='9' text-anchor='start' fill='#1c1f24'>diversity + social justice, ethics<\/text><line x1='86' y1='70' x2='110' y2='124' stroke='#8a8f98' stroke-width='1'/><rect x='110' y='112' width='186' height='24' rx='4' fill='none' stroke='#8a8f98' stroke-width='1.3'/><text x='115' y='121.2' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>Legal<\/text><text x='115' y='131.2' font-size='9' text-anchor='start' fill='#1c1f24'>see Ch. 4 (laws change)<\/text><\/svg>","cap":"Environmental scan: 5 outside forces, 4-3-4-2"}],"sections":[{"h":"Core ideas","kind":"list","items":["**HRM** = leading and managing people with systems that **identify, select, motivate, enable** employees to reach org goals. Every manager does HRM, not just the HR dept.","Supports 3 goal types: **economic** (profit, cost), **social** (fair, safe treatment), **environmental** (the planet).","**Strategic HRM** = building the org's strategic needs into the choice of HR systems and practices.","HR activities are **interconnected** (Fig 1-1): one job analysis change hits recruiting, selection, training, appraisal, pay and compliance.","Mission = purpose, broad and long-term. Goals = specific targets in a time period. Strategy = how you get there.","**Line of sight**: every HR practice should trace up to HR strategy, org strategy, then mission and goals.","**HR audit** (Step 5) = holistic review of HR strategies to find and fix deficiencies."]},{"h":"Formula","kind":"box","items":["**Productivity = outputs ÷ inputs**. 1,200 loaves ÷ 40 h = 30/h. New mixer: 1,500 ÷ 40 = 37.5/h, 37.5 ÷ 30 = 1.25, so **+25%**. But 1,500 ÷ 50 h = 30/h: output up, productivity flat."]},{"h":"Three kinds of authority","kind":"table","rows":[["Type","Meaning"],["Staff","advise, not direct (HR's normal role)"],["Line","managers decide for their own dept"],["Functional","HR decides in its own area, e.g. type of benefits"]]},{"h":"Memory tricks","kind":"mem","items":["HRM = **I-S-M-E**. 5 steps: **Most Excellent Students Choose Right**.","Economic **C-T-P-K** \"Can Tim Pick Kale?\". Demographic **G-E-A-G**.","Why automate: speed, service, flexibility, predictability, quality (\"Some Servers Fear Pizza Quotas\").","Audit focus **P-S-C**: productivity, succession planning, cultural change."]},{"h":"Traps","kind":"trap","items":["Environmental scan is **Step 2**, not 1, and it is **continuous**.","Step 2 = outside (recession). Step 3 = inside (unionized, 300 staff).","\"Staff\" authority means advisory, not employees.","Ontario designation = **CHRP**; CPHR is everyone else.","No headcount number creates an HR dept: it forms when HR work becomes a burden."]}]},"hr:ch2":{"key":"hr:ch2","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><rect x='4' y='22' width='88' height='92' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='48.0' y='43.2' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Preparation<\/text><text x='48.0' y='59.2' font-size='9' text-anchor='middle' fill='#1c1f24'>1 Know the org<\/text><text x='48.0' y='75.2' font-size='9' text-anchor='middle' fill='#1c1f24'>2 Decide uses<\/text><text x='48.0' y='91.2' font-size='9' text-anchor='middle' fill='#1c1f24'>3 Pick jobs<\/text><rect x='106' y='22' width='88' height='92' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='150.0' y='43.2' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Collection<\/text><text x='150.0' y='59.2' font-size='9' text-anchor='middle' fill='#1c1f24'>4 Data sources<\/text><text x='150.0' y='75.2' font-size='9' text-anchor='middle' fill='#1c1f24'>5 Data needed<\/text><text x='150.0' y='91.2' font-size='9' text-anchor='middle' fill='#1c1f24'>6 Pick method<\/text><rect x='208' y='22' width='88' height='92' rx='4' fill='none' stroke='#d9622b' stroke-width='1.3'/><text x='252.0' y='43.2' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Use<\/text><text x='252.0' y='59.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Job description<\/text><text x='252.0' y='75.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Job specification<\/text><text x='252.0' y='91.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Perf. standards<\/text><line x1='92' y1='68' x2='101.0' y2='68.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='106,68 101.0,70.8 101.0,65.2' fill='#1c1f24'/><line x1='194' y1='68' x2='203.0' y2='68.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='208,68 203.0,70.8 203.0,65.2' fill='#1c1f24'/><text x='150' y='13' font-size='9' text-anchor='middle' fill='#1c1f24'>Why + what to study, then where, which data, how<\/text><text x='150' y='130' font-size='9' text-anchor='middle' fill='#1c1f24'>Nothing is collected until prep questions are answered<\/text><\/svg>","cap":"Job analysis: 3 phases, 6 steps (P-C-U)"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><rect x='4' y='8' width='86' height='20' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='47.0' y='19.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Variety<\/text><rect x='4' y='33' width='86' height='20' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='47.0' y='44.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Task identity<\/text><rect x='4' y='58' width='86' height='20' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='47.0' y='69.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Task significance<\/text><rect x='4' y='83' width='86' height='20' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='47.0' y='94.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Autonomy<\/text><rect x='4' y='108' width='86' height='20' rx='4' fill='none' stroke='#d9622b' stroke-width='1.3'/><text x='47.0' y='119.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Feedback<\/text><rect x='108' y='28' width='90' height='30' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='153.0' y='39.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Meaningfulness<\/text><text x='153.0' y='50.2' font-size='9' text-anchor='middle' fill='#1c1f24'>of work<\/text><rect x='108' y='80' width='90' height='24' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='153.0' y='89.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Responsibility<\/text><text x='153.0' y='99.2' font-size='9' text-anchor='middle' fill='#1c1f24'>for outcomes<\/text><rect x='108' y='108' width='90' height='24' rx='4' fill='none' stroke='#d9622b' stroke-width='1.3'/><text x='153.0' y='117.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Knowledge<\/text><text x='153.0' y='127.2' font-size='9' text-anchor='middle' fill='#1c1f24'>of results<\/text><line x1='90' y1='18' x2='105.1' y2='38.9' stroke='#1c1f24' stroke-width='1.2'/><polygon points='108,43 102.8,40.5 107.3,37.3' fill='#1c1f24'/><line x1='90' y1='43' x2='103.0' y2='43.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='108,43 103.0,45.8 103.0,40.2' fill='#1c1f24'/><line x1='90' y1='68' x2='105.1' y2='47.1' stroke='#1c1f24' stroke-width='1.2'/><polygon points='108,43 107.3,48.7 102.8,45.5' fill='#1c1f24'/><line x1='90' y1='93' x2='103.0' y2='92.3' stroke='#1c1f24' stroke-width='1.2'/><polygon points='108,92 103.2,95.0 102.9,89.5' fill='#1c1f24'/><line x1='90' y1='118' x2='103.0' y2='119.4' stroke='#1c1f24' stroke-width='1.2'/><polygon points='108,120 102.7,122.2 103.3,116.7' fill='#1c1f24'/><rect x='214' y='30' width='82' height='80' rx='4' fill='none' stroke='#1c1f24' stroke-width='1.3'/><text x='255.0' y='42.2' font-size='9' text-anchor='middle' fill='#1c1f24'>High motivation<\/text><text x='255.0' y='56.2' font-size='9' text-anchor='middle' fill='#1c1f24'>High performance<\/text><text x='255.0' y='70.2' font-size='9' text-anchor='middle' fill='#1c1f24'>High satisfaction<\/text><text x='255.0' y='84.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Low absenteeism<\/text><text x='255.0' y='98.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Low turnover<\/text><line x1='198' y1='43' x2='210.0' y2='52.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='214,55 208.3,54.2 211.7,49.8' fill='#1c1f24'/><line x1='198' y1='92' x2='210.0' y2='83.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='214,80 211.7,85.2 208.3,80.8' fill='#1c1f24'/><line x1='198' y1='120' x2='210.9' y2='103.9' stroke='#1c1f24' stroke-width='1.2'/><polygon points='214,100 213.0,105.6 208.7,102.2' fill='#1c1f24'/><\/svg>","cap":"Job Characteristics Model: 5 traits, 3 states, outcomes"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Job analysis** = systematic study of a job to find what it involves and what skills it needs. Feeds every HR activity, incl. dropping requirements that discriminate.","**Job vs position**: 1 supervisor, 3 animators, 12 programmers = **16 positions, 3 jobs**.","6 data kinds: identification, duties, responsibilities, human characteristics, working conditions, performance standards.","Methods: interviews, focus groups, questionnaires, employee logs, observation, combos. Observation = physical jobs; questionnaires = many people, one job.","**Performance standard** must be measurable: \"answer 80% of calls in 30 sec, resolve 85% first call\".","**Competency** = KSA or behaviour linked to success (broader than KSAOs). **Model** = one job; **matrix** = levels across many jobs.","**5 design considerations**: organizational (efficiency, work flow), ergonomic (fit task to worker), employee (JCM), job specialization, environmental (workforce availability, social expectations, work practices)."]},{"h":"Work flow math","kind":"box","items":["Line speed = slowest step. Grill 60, Assembly 45, Packing 50/hr: **min = 45/hr**, × 8 h = **360** burgers. Fix Assembly; a 2nd grill cook does nothing."]},{"h":"Description vs specification","kind":"table","rows":[["Job description","Job specification"],["the job: identity, summary, duties, conditions, approvals","the person: KSAOs, education, experience, physical/mental demands"]]},{"h":"Memory tricks","kind":"mem","items":["Positions = people, jobs = titles.","Description **I-S-D-W-A**: \"I Say Do Work, Approved\".","JCM 3-1-1: V-I-S give meaning, Autonomy gives responsibility, Feedback gives knowledge of results.","Enlargement = **wider** (more same-level tasks). Enrichment = **richer** (more control). Rotation = move between jobs."]},{"h":"Traps","kind":"trap","items":["Duties = tasks; responsibilities = what you answer for (cash, equipment).","Human characteristics = physical/sensory demands, not personality.","Task identity = whole piece of work, not your job title.","\"Environmental\" design = labour market and society, not climate."]}]},"hr:ch3":{"key":"hr:ch3","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><rect x='6' y='8' width='92' height='40' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='52.0' y='18.7' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 1<\/text><text x='52.0' y='29.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Forecast<\/text><text x='52.0' y='40.7' font-size='9' text-anchor='middle' fill='#1c1f24'>demand<\/text><rect x='104' y='8' width='92' height='40' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='150.0' y='18.7' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 2<\/text><text x='150.0' y='29.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Assess supply<\/text><text x='150.0' y='40.7' font-size='9' text-anchor='middle' fill='#1c1f24'>(inside + outside)<\/text><rect x='202' y='8' width='92' height='40' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='248.0' y='18.7' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 3<\/text><text x='248.0' y='29.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Set HR<\/text><text x='248.0' y='40.7' font-size='9' text-anchor='middle' fill='#1c1f24'>objectives<\/text><rect x='202' y='84' width='92' height='40' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='248.0' y='94.7' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 4<\/text><text x='248.0' y='105.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Run systems to<\/text><text x='248.0' y='116.7' font-size='9' text-anchor='middle' fill='#1c1f24'>balance the gap<\/text><rect x='104' y='84' width='92' height='40' rx='4' fill='none' stroke='#d9622b' stroke-width='1.3'/><text x='150.0' y='94.7' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 5<\/text><text x='150.0' y='105.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Evaluate<\/text><text x='150.0' y='116.7' font-size='9' text-anchor='middle' fill='#1c1f24'>year over year<\/text><line x1='98' y1='28' x2='99.0' y2='28.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='104,28 99.0,30.8 99.0,25.2' fill='#1c1f24'/><line x1='196' y1='28' x2='197.0' y2='28.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='202,28 197.0,30.8 197.0,25.2' fill='#1c1f24'/><line x1='248' y1='48' x2='248.0' y2='79.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='248,84 245.2,79.0 250.8,79.0' fill='#1c1f24'/><line x1='202' y1='104' x2='201.0' y2='104.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='196,104 201.0,101.2 201.0,106.8' fill='#1c1f24'/><path d='M104,104 L52,104 L52.0,53.0' fill='none' stroke='#8a8f98' stroke-width='1.2' stroke-dasharray='3 2'/><polygon points='52,48 54.8,53.0 49.2,53.0' fill='#8a8f98'/><text x='150' y='64' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Gap = demand − supply<\/text><text x='150' y='76' font-size='9' text-anchor='middle' fill='#1c1f24'>+ shortage, − surplus, 0 balanced<\/text><text x='10' y='124' font-size='9' text-anchor='start' fill='#1c1f24'>cycle: D-S-O-B-E<\/text><\/svg>","cap":"5-step workforce planning cycle"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><line x1='30' y1='108' x2='296' y2='108' stroke='#1c1f24' stroke-width='1'/><text x='26' y='111.0' font-size='9' text-anchor='end' fill='#1c1f24'>0<\/text><line x1='28' y1='108.0' x2='30' y2='108.0' stroke='#1c1f24' stroke-width='1'/><text x='26' y='66.0' font-size='9' text-anchor='end' fill='#1c1f24'>100<\/text><line x1='28' y1='63.0' x2='30' y2='63.0' stroke='#1c1f24' stroke-width='1'/><text x='26' y='21.0' font-size='9' text-anchor='end' fill='#1c1f24'>200<\/text><line x1='28' y1='18.0' x2='30' y2='18.0' stroke='#1c1f24' stroke-width='1'/><rect x='51' y='32.8' width='18' height='75.2' fill='#1f5fbf'/><rect x='71' y='27.0' width='18' height='81.0' fill='#d9622b'/><text x='60' y='29.8' font-size='9' text-anchor='middle' fill='#1c1f24'>167<\/text><text x='80' y='24.0' font-size='9' text-anchor='middle' fill='#1c1f24'>180<\/text><text x='70' y='120' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Job A<\/text><text x='70' y='132' font-size='9' text-anchor='middle' fill='#1c1f24'>short 13<\/text><rect x='116' y='77.0' width='18' height='31.1' fill='#1f5fbf'/><rect x='136' y='81.0' width='18' height='27.0' fill='#d9622b'/><text x='125' y='74.0' font-size='9' text-anchor='middle' fill='#1c1f24'>69<\/text><text x='145' y='78.0' font-size='9' text-anchor='middle' fill='#1c1f24'>60<\/text><text x='135' y='120' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Job B<\/text><text x='135' y='132' font-size='9' text-anchor='middle' fill='#1c1f24'>surplus 9<\/text><rect x='181' y='79.2' width='18' height='28.8' fill='#1f5fbf'/><rect x='201' y='79.2' width='18' height='28.8' fill='#d9622b'/><text x='190' y='76.2' font-size='9' text-anchor='middle' fill='#1c1f24'>64<\/text><text x='210' y='76.2' font-size='9' text-anchor='middle' fill='#1c1f24'>64<\/text><text x='200' y='120' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Job C<\/text><text x='200' y='132' font-size='9' text-anchor='middle' fill='#1c1f24'>balanced<\/text><rect x='246' y='63.0' width='18' height='45.0' fill='#1f5fbf'/><rect x='266' y='58.5' width='18' height='49.5' fill='#d9622b'/><text x='255' y='60.0' font-size='9' text-anchor='middle' fill='#1c1f24'>100<\/text><text x='275' y='55.5' font-size='9' text-anchor='middle' fill='#1c1f24'>110<\/text><text x='265' y='120' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Job D<\/text><text x='265' y='132' font-size='9' text-anchor='middle' fill='#1c1f24'>short 10<\/text><rect x='40' y='4' width='9' height='9' fill='#1f5fbf'/><text x='53' y='12' font-size='9' text-anchor='start' fill='#1c1f24'>Markov supply<\/text><rect x='130' y='4' width='9' height='9' fill='#d9622b'/><text x='143' y='12' font-size='9' text-anchor='start' fill='#1c1f24'>demand (practice)<\/text><\/svg>","cap":"Markov year-end supply vs demand: find the gaps"}],"sections":[{"h":"Core ideas","kind":"list","items":["**HR planning** = forecast demand, forecast supply, match them. First step is forecast, not a job ad.","Planning levels: none (reactive), basic 1-2 yrs, advanced 3-5 yrs (tied to strategy), sophisticated 5+ yrs.","HR operational plan has **2 inputs**: HR strategy + corporate operational plan; dashed feedback goes back up.","Demand causes, inside: strategic plan, turnover, budgets, new ventures, job design. Outside: demographics, legal, tech, competitors.","Forecasts: **Expert** (informal, survey, nominal group, Delphi), **Trend** (extrapolation, indexation, statistical), **Other** (budget, new-venture, simulation).","Internal supply: skills inventory, mgmt inventory, replacement **chart** (names) vs **summary** (+ strengths, weaknesses). External: labour market, community, demographics (ESDC, StatCan, COPS).","Shortage: hire, contract out (outsource, crowdsource, co-source), develop (promote, succession), stretch (overtime, float/transfer). Surplus: hiring freeze, early retirement, job sharing, leave, layoff, termination."]},{"h":"Worked numbers","kind":"box","items":["**Extrapolation**: 50, 54, 59, 63, 68, avg +4.5/yr, next ≈ 72.5 → 73.","**Indexation**: $24.0M ÷ 80 = $300k per associate; $27.0M ÷ $300k = **90**.","**Markov**: Job A 200 × 0.80 = 160 stay, ×0.10 = 20 to B, 10 to C, 10 exit. A at year end = 160 + 7 = **167**. Total 430 in = 430 out.","**HRA**: replace = $3,500 + $2,500 = $6,000; 40 leave = $240,000. $60k program saving 12 exits = $72,000."]},{"h":"Memory tricks","kind":"mem","items":["Markov: **rows multiply, columns add**; each row sums to 1.00.","Shortage = **Buy, Rent, Grow, Stretch**. Promotion goes UP, float/transfer SIDEWAYS."]},{"h":"Traps","kind":"trap","items":["Delphi = experts answer alone, see summary, repeat (avg stayed 46.7, spread 30 → 10). Nominal group = sit together and rank.","Extrapolation uses time only; indexation ties to another number (sales).","Markov year-end = internal supply, not the hiring plan.","Layoff (recall possible) ≠ termination; attrition ≠ firing."]}]},"hr:ch4":{"key":"hr:ch4","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><polygon points='6,42 150,4 294,42' fill='none' stroke='#d9622b' stroke-width='1.3'/><text x='150' y='24' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Workplace policies<\/text><text x='150' y='36' font-size='9' text-anchor='middle' fill='#1c1f24'>substance abuse testing, workplace violence<\/text><rect x='28' y='46' width='74' height='60' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='65.0' y='59.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Employment +<\/text><text x='65.0' y='71.2' font-size='9' text-anchor='middle' fill='#1c1f24'>labour stds<\/text><text x='65.0' y='83.2' font-size='9' text-anchor='middle' fill='#1c1f24'>(one HR activity<\/text><text x='65.0' y='95.2' font-size='9' text-anchor='middle' fill='#1c1f24'>at a time)<\/text><rect x='113' y='46' width='74' height='60' rx='4' fill='none' stroke='#c43b3b' stroke-width='1.3'/><text x='150.0' y='65.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Human rights<\/text><text x='150.0' y='77.2' font-size='9' text-anchor='middle' fill='#1c1f24'>(nearly every<\/text><text x='150.0' y='89.2' font-size='9' text-anchor='middle' fill='#1c1f24'>HR function)<\/text><rect x='198' y='46' width='74' height='60' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='235.0' y='65.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Privacy<\/text><text x='235.0' y='77.2' font-size='9' text-anchor='middle' fill='#1c1f24'>(collect, store,<\/text><text x='235.0' y='89.2' font-size='9' text-anchor='middle' fill='#1c1f24'>access info)<\/text><rect x='14' y='112' width='272' height='22' rx='4' fill='none' stroke='#1c1f24' stroke-width='1.3'/><text x='150.0' y='124.7' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Legislative foundations<\/text><\/svg>","cap":"Three pillars of employment law"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><rect x='4' y='10' width='66' height='36' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='37.0' y='24.2' font-size='9' text-anchor='middle' fill='#1c1f24'>1 Exhibit<\/text><text x='37.0' y='35.2' font-size='9' text-anchor='middle' fill='#1c1f24'>commitment<\/text><rect x='78' y='10' width='66' height='36' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='111.0' y='24.2' font-size='9' text-anchor='middle' fill='#1c1f24'>2 Appoint<\/text><text x='111.0' y='35.2' font-size='9' text-anchor='middle' fill='#1c1f24'>director<\/text><rect x='152' y='10' width='66' height='36' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='185.0' y='24.2' font-size='9' text-anchor='middle' fill='#1c1f24'>3 Publicize<\/text><text x='185.0' y='35.2' font-size='9' text-anchor='middle' fill='#1c1f24'>commitment<\/text><rect x='226' y='10' width='66' height='36' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='259.0' y='24.2' font-size='9' text-anchor='middle' fill='#1c1f24'>4 Survey<\/text><text x='259.0' y='35.2' font-size='9' text-anchor='middle' fill='#1c1f24'>workforce<\/text><line x1='70' y1='28' x2='73.0' y2='28.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='78,28 73.0,30.8 73.0,25.2' fill='#1c1f24'/><line x1='144' y1='28' x2='147.0' y2='28.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='152,28 147.0,30.8 147.0,25.2' fill='#1c1f24'/><line x1='218' y1='28' x2='221.0' y2='28.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='226,28 221.0,30.8 221.0,25.2' fill='#1c1f24'/><rect x='226' y='86' width='66' height='36' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='259.0' y='100.2' font-size='9' text-anchor='middle' fill='#1c1f24'>5 Goals +<\/text><text x='259.0' y='111.2' font-size='9' text-anchor='middle' fill='#1c1f24'>timetables<\/text><rect x='152' y='86' width='66' height='36' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='185.0' y='100.2' font-size='9' text-anchor='middle' fill='#1c1f24'>6 Design<\/text><text x='185.0' y='111.2' font-size='9' text-anchor='middle' fill='#1c1f24'>programs<\/text><rect x='78' y='86' width='66' height='36' rx='4' fill='none' stroke='#d9622b' stroke-width='1.3'/><text x='111.0' y='100.2' font-size='9' text-anchor='middle' fill='#1c1f24'>7 Establish<\/text><text x='111.0' y='111.2' font-size='9' text-anchor='middle' fill='#1c1f24'>controls<\/text><line x1='259' y1='46' x2='259.0' y2='81.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='259,86 256.2,81.0 261.8,81.0' fill='#1c1f24'/><line x1='226' y1='104' x2='223.0' y2='104.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='218,104 223.0,101.2 223.0,106.8' fill='#1c1f24'/><line x1='152' y1='104' x2='149.0' y2='104.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='144,104 149.0,101.2 149.0,106.8' fill='#1c1f24'/><text x='36' y='98' font-size='9' text-anchor='middle' fill='#1c1f24'>survey<\/text><text x='36' y='109' font-size='9' text-anchor='middle' fill='#1c1f24'>before<\/text><text x='36' y='120' font-size='9' text-anchor='middle' fill='#1c1f24'>goals<\/text><text x='150' y='68' font-size='9' text-anchor='middle' fill='#1c1f24'>Federal employers, 100+ staff, annual plans<\/text><\/svg>","cap":"Employment equity program: 7 steps in order"}],"sections":[{"h":"Which laws apply? 3 questions","kind":"list","items":["**Employee or contractor?** Test: control, ownership of tools, profit/loss risk. The real relationship decides, not the contract label.","**Federal (~10%)**: banks, postal, federal govt, airlines, telecoms (Canada Labour Code). **Provincial (~90%)**: most others.","**Unionized or not?** Collective agreement adds rules."]},{"h":"Human rights","kind":"list","items":["**CHRA** = federal anti-discrimination law, enforced by **CHRC**; provinces have own codes. Charter s.15 is the base.","9 grounds: race/colour, national/ethnic origin, religion, age, sex + orientation, gender identity, marital/family status, disability, pardoned convicts.","**Direct** = different treatment on a ground. **Systemic** = neutral rule, unequal effect (height, seniority).","**BFOR** = rule truly needed for the job (\"legal discrimination\"). Still must **accommodate to undue hardship** (Meiorin, 1999).","**Retaliation** for a complaint is its own serious violation."]},{"h":"Equity and privacy","kind":"table","rows":[["Term","Key rule"],["Employment Equity Act","federal, 100+ staff: women, Aboriginal people, disability, visible minorities"],["Pay equity","equal pay for work of equal **value**"],["Reverse discrim.","picking a group member over an equally or better qualified person"],["Privacy Act","info the federal government holds"],["PIPEDA","how organizations handle personal info"]]},{"h":"Memory tricks","kind":"mem","items":["Equity groups **W-A-D-V**. Split 90/10 provincial/federal.","DEI barriers **S-O-G-P**: stereotyping, old boys' network, glass ceiling, pet to threat."]},{"h":"Traps","kind":"trap","items":["\"Didn't mean to\" is no defence: effect counts. Customer preference is never a BFOR.","Equal value ≠ equal work (different jobs of similar worth).","Equity = access to the same opportunities, not equal outcomes.","Manager opinions about you count as personal info; business info does not."]}]},"hr:ch5":{"key":"hr:ch5","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><rect x='5.0' y='8' width='180' height='20' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='95' y='22' font-size='9' text-anchor='middle' fill='#1c1f24'>120 applied (pool)<\/text><rect x='22.0' y='32' width='146' height='20' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='95' y='46' font-size='9' text-anchor='middle' fill='#1c1f24'>30 shortlisted<\/text><rect x='39.0' y='56' width='112' height='20' rx='3' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='95' y='70' font-size='9' text-anchor='middle' fill='#1c1f24'>10 interviewed<\/text><rect x='56.0' y='80' width='78' height='20' rx='3' fill='none' stroke='#d9622b' stroke-width='1.3'/><text x='95' y='94' font-size='9' text-anchor='middle' fill='#1c1f24'>3 offers<\/text><rect x='70.0' y='104' width='50' height='20' rx='3' fill='none' stroke='#c43b3b' stroke-width='1.3'/><text x='95' y='118' font-size='9' text-anchor='middle' fill='#1c1f24'>2 hired<\/text><text x='194' y='84' font-size='9' text-anchor='start' fill='#1c1f24'>offers ÷ applicants<\/text><text x='194' y='95' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>3 ÷ 120 = 2.5%<\/text><text x='194' y='112' font-size='9' text-anchor='start' fill='#1c1f24'>cost per hire<\/text><text x='194' y='123' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>$6,000 ÷ 2 = $3,000<\/text><text x='194' y='30' font-size='9' text-anchor='start' fill='#1c1f24'>offers accepted<\/text><text x='194' y='41' font-size='9' text-anchor='start' fill='#1c1f24'>2 ÷ 3 = 66.7%<\/text><\/svg>","cap":"Hiring funnel with the evaluation ratios"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><text x='70' y='16' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>cost per hire (cost ÷ hired)<\/text><text x='250' y='16' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>days<\/text><text x='283' y='16' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>perf<\/text><text x='4' y='39' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>Job board<\/text><text x='4' y='50' font-size='9' text-anchor='start' fill='#1c1f24'>$3,000 ÷ 6<\/text><rect x='70' y='32' width='14.4' height='14' fill='#1f5fbf'/><text x='88.4' y='43' font-size='9' text-anchor='start' fill='#1c1f24'>$500<\/text><text x='250' y='43' font-size='9' text-anchor='middle' fill='#1c1f24'>30<\/text><text x='283' y='43' font-size='9' text-anchor='middle' fill='#1c1f24'>3.4<\/text><text x='4' y='69' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>Referrals<\/text><text x='4' y='80' font-size='9' text-anchor='start' fill='#1c1f24'>$2,500 ÷ 5<\/text><rect x='70' y='62' width='14.4' height='14' fill='#1e8f5a'/><text x='88.4' y='73' font-size='9' text-anchor='start' fill='#1c1f24'>$500<\/text><text x='250' y='73' font-size='9' text-anchor='middle' fill='#1c1f24'>21<\/text><text x='283' y='73' font-size='9' text-anchor='middle' fill='#1c1f24'>4.2<\/text><text x='4' y='99' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>Agency<\/text><text x='4' y='110' font-size='9' text-anchor='start' fill='#1c1f24'>$9,000 ÷ 2<\/text><rect x='70' y='92' width='130.0' height='14' fill='#d9622b'/><text x='204.0' y='103' font-size='9' text-anchor='start' fill='#1c1f24'>$4,500<\/text><text x='250' y='103' font-size='9' text-anchor='middle' fill='#1c1f24'>40<\/text><text x='283' y='103' font-size='9' text-anchor='middle' fill='#1c1f24'>4.0<\/text><line x1='68' y1='26' x2='68' y2='118' stroke='#1c1f24' stroke-width='1'/><text x='150' y='132' font-size='9' text-anchor='middle' fill='#1c1f24'>Referrals: tied lowest cost, fastest, best hires<\/text><\/svg>","cap":"Which source is working? Cost, speed, quality"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Recruitment** = finding and attracting capable people to **apply and to accept** an offer. Purposeful or unintentional, a two-way street. Selection (Ch 6) picks from the pool.","**7 steps**: identify openings, review job specs, examine desired characteristics, determine methods, obtain pool, keep interest during selection, persuade to accept.","**8 constraints**: org policies (promote-from-within, pay ranges, employment status, international), HR plans, D&I programs, recruiter habits, environmental conditions, job requirements, costs, inducements.","Résumé = applicant picks the order. **Application form** = same questions for all, so gaps stand out. ATS = software for e-applications.","**Blind ad** = does not name the employer.","Pick sources by: how many, skill level, sources available, past success, budget, labour agreements."]},{"h":"Internal vs external","kind":"table","rows":[["","Pros","Cons"],["Internal","known, cheap, morale up","no new blood, losers' morale drops"],["External","new skills and ideas","costly, may not fit, staff morale drops"]]},{"h":"4 evaluation measures","kind":"box","items":["**Cost per hire** = total cost ÷ number hired. **Offers-applicants ratio** = offers ÷ applicants (per method). **Quality of hires and cost** by source. **Time lapsed per hire**."]},{"h":"Memory tricks","kind":"mem","items":["Source questions: \"Hungry Students Seldom Pass Big Lunches\".","Internal = known and cheap but stale. External = fresh but costly and risky.","16 methods in 5 buckets: word of mouth (referrals, walk-ins), ads + online, government + agencies, schools + groups, events + special."]},{"h":"Traps","kind":"trap","items":["Cost per hire divides by **hired**, not offers or applicants. Cheapest is not best: pair cost with quality and time.","\"Predicted vs actual sales\" = environmental condition, not HR plans.","Agency = general matching; search firm = senior/specialist.","Ad words like \"young\" or \"recent grad only\" are human rights red flags."]}]},"hr:ch6":{"key":"hr:ch6","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><rect x='4' y='6' width='140' height='24' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='9' y='19.7' font-size='9' text-anchor='start' fill='#1c1f24'>1 Preliminary reception<\/text><line x1='74' y1='30' x2='74.0' y2='33.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='74,38 71.2,33.0 76.8,33.0' fill='#1c1f24'/><rect x='4' y='38' width='140' height='24' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='9' y='51.7' font-size='9' text-anchor='start' fill='#1c1f24'>2 Screening (WAB, BIB)<\/text><line x1='74' y1='62' x2='74.0' y2='65.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='74,70 71.2,65.0 76.8,65.0' fill='#1c1f24'/><rect x='4' y='70' width='140' height='24' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='9' y='83.7' font-size='9' text-anchor='start' fill='#1c1f24'>3 Employment tests<\/text><line x1='74' y1='94' x2='74.0' y2='97.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='74,102 71.2,97.0 76.8,97.0' fill='#1c1f24'/><rect x='4' y='102' width='140' height='24' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='9' y='115.7' font-size='9' text-anchor='start' fill='#1c1f24'>4 Interviews<\/text><rect x='156' y='6' width='140' height='24' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='161' y='19.7' font-size='9' text-anchor='start' fill='#1c1f24'>5 Realistic job preview<\/text><line x1='226' y1='30' x2='226.0' y2='33.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='226,38 223.2,33.0 228.8,33.0' fill='#1c1f24'/><rect x='156' y='38' width='140' height='24' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='161' y='51.7' font-size='9' text-anchor='start' fill='#1c1f24'>6 Verify references<\/text><line x1='226' y1='62' x2='226.0' y2='65.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='226,70 223.2,65.0 228.8,65.0' fill='#1c1f24'/><rect x='156' y='70' width='140' height='24' rx='4' fill='none' stroke='#d9622b' stroke-width='1.3'/><text x='161' y='83.7' font-size='9' text-anchor='start' fill='#1c1f24'>7 Contingent (medical)<\/text><line x1='226' y1='94' x2='226.0' y2='97.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='226,102 223.2,97.0 228.8,97.0' fill='#1c1f24'/><rect x='156' y='102' width='140' height='24' rx='4' fill='none' stroke='#c43b3b' stroke-width='1.3'/><text x='161' y='115.7' font-size='9' text-anchor='start' fill='#1c1f24'>8 Hiring decision<\/text><path d='M144,114 L150,114 L150,18 L151.0,18.0' fill='none' stroke='#8a8f98' stroke-width='1.2'/><polygon points='156,18 151.0,20.8 151.0,15.2' fill='#8a8f98'/><text x='150' y='136' font-size='9' text-anchor='middle' fill='#1c1f24'>cheap screens first, costly steps later<\/text><\/svg>","cap":"The 8 selection steps in order"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><rect x='4' y='6' width='80' height='20' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='44.0' y='17.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Job analysis<\/text><line x1='84' y1='16' x2='109.1' y2='51.9' stroke='#1c1f24' stroke-width='1.2'/><polygon points='112,56 106.9,53.5 111.4,50.3' fill='#1c1f24'/><rect x='4' y='32' width='80' height='20' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='44.0' y='43.7' font-size='9' text-anchor='middle' fill='#1c1f24'>HR plans<\/text><line x1='84' y1='42' x2='108.0' y2='60.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='112,63 106.3,62.2 109.7,57.8' fill='#1c1f24'/><rect x='4' y='58' width='80' height='20' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='44.0' y='69.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Policies<\/text><line x1='84' y1='68' x2='107.0' y2='69.6' stroke='#1c1f24' stroke-width='1.2'/><polygon points='112,70 106.8,72.4 107.2,66.9' fill='#1c1f24'/><rect x='4' y='84' width='80' height='20' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='44.0' y='95.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Recruits<\/text><line x1='84' y1='94' x2='107.7' y2='79.6' stroke='#1c1f24' stroke-width='1.2'/><polygon points='112,77 109.2,81.9 106.3,77.2' fill='#1c1f24'/><rect x='4' y='110' width='80' height='20' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='44.0' y='121.7' font-size='9' text-anchor='middle' fill='#1c1f24'>Ethics<\/text><line x1='84' y1='120' x2='108.9' y2='87.9' stroke='#1c1f24' stroke-width='1.2'/><polygon points='112,84 111.1,89.6 106.8,86.3' fill='#1c1f24'/><rect x='112' y='48' width='72' height='44' rx='4' fill='none' stroke='#1c1f24' stroke-width='1.3'/><text x='148.0' y='66.2' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Selection<\/text><text x='148.0' y='77.2' font-size='9' text-anchor='middle' fill='#1c1f24'>strategy<\/text><rect x='204' y='4' width='92' height='118' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='209' y='22' font-size='9' text-anchor='start' fill='#1c1f24'>Orientation<\/text><text x='209' y='40' font-size='9' text-anchor='start' fill='#1c1f24'>Training<\/text><text x='209' y='58' font-size='9' text-anchor='start' fill='#1c1f24'>Career planning<\/text><text x='209' y='76' font-size='9' text-anchor='start' fill='#1c1f24'>Perf. evaluation<\/text><text x='209' y='94' font-size='9' text-anchor='start' fill='#1c1f24'>Compensation<\/text><text x='209' y='112' font-size='9' text-anchor='start' fill='#1c1f24'>Bargaining<\/text><line x1='184' y1='70' x2='199.0' y2='70.0' stroke='#1c1f24' stroke-width='1.2'/><polygon points='204,70 199.0,72.8 199.0,67.2' fill='#1c1f24'/><path d='M250,122 L250,134 L148,134 L148.0,97.0' fill='none' stroke='#8a8f98' stroke-width='1.2' stroke-dasharray='3 2'/><polygon points='148,92 150.8,97.0 145.2,97.0' fill='#8a8f98'/><text x='176' y='108' font-size='9' text-anchor='middle' fill='#1c1f24'>long-term<\/text><text x='176' y='119' font-size='9' text-anchor='middle' fill='#1c1f24'>feedback<\/text><\/svg>","cap":"Fig 6-1: inputs (left) vs outputs (right) of selection strategy"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Selection** = steps to decide which recruits to hire; starts when they apply, ends with the hiring decision. Matches needs of **both** sides.","5 tests: personality, ability, knowledge, performance (incl. situational judgment, assessment centres, computer-interactive), integrity.","**Reliability** = consistent results. **Validity** = measures what it should and predicts performance.","**RJP** shows good and bad parts, cuts turnover. **Contingent** checks can come after the decision.","Decision: **subjective** (judgment), **multiple cutoff** (minimum on every predictor), **compensatory** (strength offsets weakness).","Interviews: unstructured vs structured (behavioural, situational, stress). **Panel** = many interviewers; **group** = many candidates.","Contract: probation, start date and terms, restrictive covenants (must be reasonable), termination. **Dispositioning** = tell rejected applicants early."]},{"h":"Numbers","kind":"box","items":["**Selection ratio = hired ÷ applicants**. 4 ÷ 200 = 0.02, picky. 4 ÷ 6 = 0.67, little choice.","Compensatory (test + interview + refs): Priya 9+5+8 = 22, Marcus 21, Lena 20, Dan 10+10+4 = **24**. A cutoff on refs could drop Dan."]},{"h":"Validity types","kind":"table","rows":[["Type","Plain meaning"],["Predictive","test applicants, wait, compare to later performance"],["Concurrent","test current staff now"],["Content","test matches job content"],["Construct","measures the trait it claims"],["Differential","predicts equally across groups"]]},{"h":"Memory tricks","kind":"mem","items":["Behavioural = **Back** (\"tell me about a time\"). Situational = **Soon** (\"what would you do\").","Interview stages **P-R-I-T-E**: prepare, rapport, information, terminate, evaluate.","Interviewer errors **H-L-S-D-C**: halo, leading questions, stereotypes, domination, contrast."]},{"h":"Traps","kind":"trap","items":["Reliable can be invalid; valid must be reliable.","Job analysis is an **input** to selection strategy, not an output.","Rapport is the interviewer's job. Halo = one trait colours all; contrast = judged vs previous candidate."]}]},"hr:ch7":{"key":"hr:ch7","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><rect x='3' y='92' width='54' height='44' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='30.0' y='106.2' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 1<\/text><text x='30.0' y='116.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Needs<\/text><text x='30.0' y='126.2' font-size='9' text-anchor='middle' fill='#1c1f24'>assessment<\/text><rect x='63' y='72' width='54' height='44' rx='4' fill='none' stroke='#1f5fbf' stroke-width='1.3'/><text x='90.0' y='86.2' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 2<\/text><text x='90.0' y='96.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Training<\/text><text x='90.0' y='106.2' font-size='9' text-anchor='middle' fill='#1c1f24'>objectives<\/text><rect x='123' y='52' width='54' height='44' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='150.0' y='61.2' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 3<\/text><text x='150.0' y='71.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Content +<\/text><text x='150.0' y='81.2' font-size='9' text-anchor='middle' fill='#1c1f24'>learning<\/text><text x='150.0' y='91.2' font-size='9' text-anchor='middle' fill='#1c1f24'>principles<\/text><rect x='183' y='32' width='54' height='44' rx='4' fill='none' stroke='#1e8f5a' stroke-width='1.3'/><text x='210.0' y='46.2' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 4<\/text><text x='210.0' y='56.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Program<\/text><text x='210.0' y='66.2' font-size='9' text-anchor='middle' fill='#1c1f24'>delivery<\/text><rect x='243' y='12' width='54' height='44' rx='4' fill='none' stroke='#d9622b' stroke-width='1.3'/><text x='270.0' y='31.2' font-size='9' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Step 5<\/text><text x='270.0' y='41.2' font-size='9' text-anchor='middle' fill='#1c1f24'>Evaluation<\/text><line x1='57' y1='114' x2='61.6' y2='98.8' stroke='#1c1f24' stroke-width='1.2'/><polygon points='63,94 64.2,99.6 58.9,98.0' fill='#1c1f24'/><line x1='117' y1='94' x2='121.6' y2='78.8' stroke='#1c1f24' stroke-width='1.2'/><polygon points='123,74 124.2,79.6 118.9,78.0' fill='#1c1f24'/><line x1='177' y1='74' x2='181.6' y2='58.8' stroke='#1c1f24' stroke-width='1.2'/><polygon points='183,54 184.2,59.6 178.9,58.0' fill='#1c1f24'/><line x1='237' y1='54' x2='241.6' y2='38.8' stroke='#1c1f24' stroke-width='1.2'/><polygon points='243,34 244.2,39.6 238.9,38.0' fill='#1c1f24'/><path d='M270,12 L270,5 L30,5 L30.0,87.0' fill='none' stroke='#8a8f98' stroke-width='1.2' stroke-dasharray='3 2'/><polygon points='30,92 27.2,87.0 32.8,87.0' fill='#8a8f98'/><text x='140' y='19' font-size='9' text-anchor='middle' fill='#1c1f24'>results feed the next needs assessment<\/text><\/svg>","cap":"Training system (Fig 7-4): N-O-C-D-E"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><line x1='158.7' y1='25.0' x2='184.6' y2='40.0' stroke='#8a8f98' stroke-width='1.2'/><line x1='193.3' y1='55.0' x2='193.3' y2='85.0' stroke='#8a8f98' stroke-width='1.2'/><line x1='184.6' y1='100.0' x2='158.7' y2='115.0' stroke='#8a8f98' stroke-width='1.2'/><line x1='141.3' y1='115.0' x2='115.4' y2='100.0' stroke='#8a8f98' stroke-width='1.2'/><line x1='106.7' y1='85.0' x2='106.7' y2='55.0' stroke='#8a8f98' stroke-width='1.2'/><line x1='115.4' y1='40.0' x2='141.3' y2='25.0' stroke='#8a8f98' stroke-width='1.2'/><circle cx='150.0' cy='20.0' r='9' fill='none' stroke='#d9622b' stroke-width='1.4'/><text x='150.0' y='23.5' font-size='10' text-anchor='middle' fill='#1c1f24' font-weight='bold'>R<\/text><circle cx='193.3' cy='45.0' r='9' fill='none' stroke='#1f5fbf' stroke-width='1.4'/><text x='193.3' y='48.5' font-size='10' text-anchor='middle' fill='#1c1f24' font-weight='bold'>I<\/text><circle cx='193.3' cy='95.0' r='9' fill='none' stroke='#c43b3b' stroke-width='1.4'/><text x='193.3' y='98.5' font-size='10' text-anchor='middle' fill='#1c1f24' font-weight='bold'>A<\/text><circle cx='150.0' cy='120.0' r='9' fill='none' stroke='#1e8f5a' stroke-width='1.4'/><text x='150.0' y='123.5' font-size='10' text-anchor='middle' fill='#1c1f24' font-weight='bold'>S<\/text><circle cx='106.7' cy='95.0' r='9' fill='none' stroke='#d9622b' stroke-width='1.4'/><text x='106.7' y='98.5' font-size='10' text-anchor='middle' fill='#1c1f24' font-weight='bold'>E<\/text><circle cx='106.7' cy='45.0' r='9' fill='none' stroke='#1f5fbf' stroke-width='1.4'/><text x='106.7' y='48.5' font-size='10' text-anchor='middle' fill='#1c1f24' font-weight='bold'>C<\/text><text x='164.0' y='23.0' font-size='9' text-anchor='start' fill='#1c1f24'>Realistic: doers, things<\/text><text x='207.3' y='43.0' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>Investigative<\/text><text x='207.3' y='54.0' font-size='9' text-anchor='start' fill='#1c1f24'>thinkers, data<\/text><text x='207.3' y='89.0' font-size='9' text-anchor='start' fill='#1c1f24' font-weight='bold'>Artistic<\/text><text x='207.3' y='100.0' font-size='9' text-anchor='start' fill='#1c1f24'>creators,<\/text><text x='207.3' y='111.0' font-size='9' text-anchor='start' fill='#1c1f24'>ideas+things<\/text><text x='164.0' y='129.0' font-size='9' text-anchor='start' fill='#1c1f24'>Social: helpers, people (HR)<\/text><text x='92.7' y='89.0' font-size='9' text-anchor='end' fill='#1c1f24' font-weight='bold'>Enterprising<\/text><text x='92.7' y='100.0' font-size='9' text-anchor='end' fill='#1c1f24'>persuaders,<\/text><text x='92.7' y='111.0' font-size='9' text-anchor='end' fill='#1c1f24'>people+data<\/text><text x='92.7' y='43.0' font-size='9' text-anchor='end' fill='#1c1f24' font-weight='bold'>Conventional<\/text><text x='92.7' y='54.0' font-size='9' text-anchor='end' fill='#1c1f24'>organizers, data<\/text><text x='150' y='73' font-size='9' text-anchor='middle' fill='#1c1f24'>Holland<\/text><\/svg>","cap":"RIASEC: Holland's six career types"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Training** = present job. **Development** = future responsibilities.","**Onboarding** = adjust to performance + social sides of the job. Outcomes: retention, faster productivity, less anxiety, more motivation, engagement.","Orientation groups: **organizational** (history, policies, handbook), **HR topics** (pay, vacation, benefits), **role expectations** (location, safety, tasks).","**Socialization** = learning and accepting values and norms; turns outsiders into insiders; can start before day one.","Training need signals: production records, grievances, safety reports, appraisals, absenteeism, turnover.","Objective = **behaviour + performance criteria + conditions**.","Learning principles: participation, repetition, relevance, transference, feedback. Kolb: experience, reflect, conceptualize, experiment.","On-the-job: rotation, apprenticeship, coaching. Off-the-job: lectures, simulations, role-play, cases, self-study.","Career success: advancement, learning, employability, positive psych factors."]},{"h":"Development strategies","kind":"table","rows":[["Strategy","Changes","Methods"],["Cognitive","thoughts, knowledge","lectures, seminars, education"],["Behavioural","behaviour","role-play, modelling"],["Environmental","setting","rotation, temp assignments, exchanges, D&I training"]]},{"h":"Evaluation (4 criteria)","kind":"box","items":["**Reaction → knowledge/skill → behaviour → organizational results** (easiest to hardest to measure)."]},{"h":"Memory tricks","kind":"mem","items":["Training = **Today**, Development = **Down the road**.","\"Really Interesting Artists Seldom Eat Cake\" = R-I-A-S-E-C.","Synchronous = same time; asynchronous = anytime."]},{"h":"Traps","kind":"trap","items":["\"Rated the workshop 4.8/5\" is only **reaction**; passing a test is knowledge, not behaviour.","Pay and benefits = HR topics; safety = role expectations.","D&I training is **environmental**, not cognitive.","Relevance = means something to you; transference = training is like the real job."]}]},"micro:ch1":{"key":"micro:ch1","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><line x1='40.0' y1='110.0' x2='285.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='10.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='40.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>0<\/text><line x1='113.5' y1='110.0' x2='113.5' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='113.5' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>30<\/text><line x1='174.8' y1='110.0' x2='174.8' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='174.8' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>55<\/text><line x1='223.8' y1='110.0' x2='223.8' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='223.8' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>75<\/text><line x1='260.5' y1='110.0' x2='260.5' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='260.5' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>90<\/text><line x1='37.5' y1='110.0' x2='40.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='113.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>0<\/text><line x1='37.5' y1='73.6' x2='40.0' y2='73.6' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='76.6' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>40<\/text><line x1='37.5' y1='46.4' x2='40.0' y2='46.4' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='49.4' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>70<\/text><line x1='37.5' y1='19.1' x2='40.0' y2='19.1' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='22.1' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>100<\/text><text x='162.5' y='137.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Canola<\/text><text x='9.0' y='60.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' transform='rotate(-90 9 60.0)'>Wheat<\/text><path d='M40.0 19.1 C52.2 20.6 91.0 23.6 113.5 28.2 C136.0 32.7 156.4 38.8 174.8 46.4 C193.1 53.9 209.5 63.0 223.8 73.6 C238.0 84.2 254.4 103.9 260.5 110.0' fill='none' stroke='#1f5fbf' stroke-width='1.8'/><circle cx='40.0' cy='19.1' r='2.6' fill='#1c1f24'/><text x='44.0' y='15.1' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>A (0,100)<\/text><circle cx='113.5' cy='28.2' r='2.6' fill='#1c1f24'/><text x='117.5' y='23.2' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>B (30,90)<\/text><circle cx='174.8' cy='46.4' r='2.6' fill='#1c1f24'/><text x='179.8' y='42.4' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>C (55,70)<\/text><circle cx='223.8' cy='73.6' r='2.6' fill='#1c1f24'/><text x='228.8' y='70.6' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>D (75,40)<\/text><circle cx='260.5' cy='110.0' r='2.6' fill='#1c1f24'/><text x='251.5' y='108.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end'>E (90,0)<\/text><text x='70.8' y='33.6' font-family='sans-serif' font-size='9' fill='#d9622b' text-anchor='end' font-weight='bold'>0.33<\/text><text x='138.1' y='47.3' font-family='sans-serif' font-size='9' fill='#d9622b' text-anchor='end' font-weight='bold'>0.8<\/text><text x='193.2' y='70.0' font-family='sans-serif' font-size='9' fill='#d9622b' text-anchor='end' font-weight='bold'>1.5<\/text><text x='249.1' y='93.8' font-family='sans-serif' font-size='9' fill='#d9622b' text-anchor='start' font-weight='bold'>2.67<\/text><circle cx='125.8' cy='69.1' r='2.6' fill='#1e8f5a'/><text x='121.8' y='81.1' font-family='sans-serif' font-size='9' fill='#1e8f5a' text-anchor='start'>inside: idle (inefficient)<\/text><circle cx='248.2' cy='37.3' r='2.6' fill='#c43b3b'/><text x='288.0' y='29.3' font-family='sans-serif' font-size='9' fill='#c43b3b' text-anchor='end'>outside: unattainable<\/text><\/svg>","cap":"PPB: wheat lost per extra canola rises (0.33 to 2.67)"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><line x1='40.0' y1='110.0' x2='280.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='12.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='40.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>0<\/text><line x1='100.0' y1='110.0' x2='100.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='100.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>6<\/text><line x1='160.0' y1='110.0' x2='160.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='160.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>12<\/text><line x1='190.0' y1='110.0' x2='190.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='190.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>15<\/text><line x1='220.0' y1='110.0' x2='220.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='220.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>18<\/text><line x1='280.0' y1='110.0' x2='280.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='280.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>24<\/text><line x1='37.5' y1='110.0' x2='40.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='113.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>0<\/text><line x1='37.5' y1='85.5' x2='40.0' y2='85.5' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='88.5' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>3<\/text><line x1='37.5' y1='61.0' x2='40.0' y2='61.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='64.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>6<\/text><line x1='37.5' y1='36.5' x2='40.0' y2='36.5' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='39.5' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>9<\/text><line x1='37.5' y1='12.0' x2='40.0' y2='12.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='15.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>12<\/text><text x='160.0' y='137.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Bike paths (km, $0.5m each)<\/text><text x='9.0' y='61.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' transform='rotate(-90 9 61.0)'>Roads (km, $1m)<\/text><line x1='40.0' y1='12.0' x2='280.0' y2='110.0' stroke='#1f5fbf' stroke-width='1.8'/><text x='210.0' y='68.3' font-family='sans-serif' font-size='9' fill='#1f5fbf' text-anchor='start'>$12m budget line<\/text><circle cx='100.0' cy='36.5' r='2.6' fill='#1c1f24'/><text x='105.0' y='33.5' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>c (6, 9) = $12m<\/text><circle cx='160.0' cy='61.0' r='2.6' fill='#1c1f24'/><text x='165.0' y='58.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>b (12, 6) = $12m<\/text><circle cx='190.0' cy='36.5' r='2.6' fill='#c43b3b'/><text x='195.0' y='33.5' font-family='sans-serif' font-size='9' fill='#c43b3b' text-anchor='start'>a (15, 9) = $16.5m ✗<\/text><text x='50.0' y='100.2' font-family='sans-serif' font-size='9' fill='#d9622b' text-anchor='start'>slope: 1 road = 2 paths<\/text><\/svg>","cap":"Susan's $12m budget line: roads vs bike paths"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Economics** = how scarce resources are used to satisfy unlimited wants. Scarcity → choice → opportunity cost.","**Factors of production (LLC):** land, labour, capital. Capital = tools and machines, **not money**.","**Opportunity cost** = the ONE next best alternative given up. Shift $120, study $90, movie $40: pick shift, cost = **$90** (not $130).","Cost of a degree includes earnings you give up, not just tuition and books."]},{"h":"Formulas","kind":"box","items":["Opp. cost of X = price of X ÷ price of Y. Roads $1m/km, paths $0.5m/km: 1 road = **2 paths**, 1 path = **0.5 road** (always flips).","Budget check: c: 9×$1m + 6×$0.5m = $12m ✓. a: 9 + 7.5 = $16.5m ✗ (over by $4.5m).","PPB opp. cost of A = B given up ÷ A gained. B to C: 20 wheat ÷ 25 canola = **0.8**."]},{"h":"PPB","kind":"list","items":["On = efficient. Inside = attainable but idle/misused resources. Outside = unattainable.","Bowed out = rising opp. cost (0.33 → 0.8 → 1.5 → 2.67). Straight line = constant.","Only growth (more or better resources, tech, capital) shifts the PPB out. Unemployment moves you **inside**."]},{"h":"Four economic problems","kind":"table","rows":[["Micro (1, 2)","Macro (3, 4)"],["1 What is produced, how?","3 Why are resources idle?"],["2 What is consumed, by whom?","4 Is capacity growing?"]]},{"h":"Key terms","kind":"terms","items":[{"k":"Circular flow","d":"factors go households → firms (factor market), goods go firms → households; money flows the opposite way. Wages go firms → households."},{"k":"Specialization vs division of labour","d":"focus on one good vs splitting one process into tasks (pin factory)."},{"k":"Money","d":"fixes the barter problem (double coincidence of wants), so it makes specialization possible."},{"k":"Mixed economy","d":"tradition + command + market. All real economies are mixed."},{"k":"Govt role","d":"private property, contracts; fixes market failures, public goods, externalities."}]},{"h":"Traps","kind":"trap","items":["Reversed options: micro/macro, specialization/division, inside/outside PPB.","Opp. cost is never the sum of everything skipped. Who should specialize? Lower opp. cost wins."]}]},"micro:ch2":{"key":"micro:ch2","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><line x1='46.0' y1='110.0' x2='285.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='46.0' y1='110.0' x2='46.0' y2='10.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='46.0' y1='110.0' x2='46.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='46.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>0<\/text><line x1='105.8' y1='110.0' x2='105.8' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='105.8' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>2,500<\/text><line x1='165.5' y1='110.0' x2='165.5' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='165.5' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>5,000<\/text><line x1='225.2' y1='110.0' x2='225.2' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='225.2' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>7,500<\/text><line x1='285.0' y1='110.0' x2='285.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='285.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>10,000<\/text><line x1='43.5' y1='102.0' x2='46.0' y2='102.0' stroke='#1c1f24' stroke-width='1.2'/><text x='42.0' y='105.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>800<\/text><line x1='43.5' y1='62.0' x2='46.0' y2='62.0' stroke='#1c1f24' stroke-width='1.2'/><text x='42.0' y='65.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>4,800<\/text><line x1='43.5' y1='22.0' x2='46.0' y2='22.0' stroke='#1c1f24' stroke-width='1.2'/><text x='42.0' y='25.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>8,800<\/text><text x='165.5' y='137.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Wage income, W ($)<\/text><text x='9.0' y='60.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' transform='rotate(-90 9 60.0)'>Consumption, C ($)<\/text><line x1='46.0' y1='102.0' x2='285.0' y2='22.0' stroke='#1f5fbf' stroke-width='1.8'/><circle cx='46.0' cy='102.0' r='2.6' fill='#1c1f24'/><text x='55.0' y='108.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>p<\/text><circle cx='105.8' cy='82.0' r='2.6' fill='#1c1f24'/><text x='101.8' y='77.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end'>q<\/text><circle cx='165.5' cy='62.0' r='2.6' fill='#1c1f24'/><text x='161.5' y='57.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end'>r<\/text><circle cx='225.2' cy='42.0' r='2.6' fill='#1c1f24'/><text x='221.2' y='37.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end'>s<\/text><circle cx='285.0' cy='22.0' r='2.6' fill='#1c1f24'/><text x='281.0' y='17.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end'>t<\/text><line x1='105.8' y1='82.0' x2='165.5' y2='82.0' stroke='#d9622b' stroke-width='1.2' stroke-dasharray='3 2'/><line x1='165.5' y1='82.0' x2='165.5' y2='62.0' stroke='#d9622b' stroke-width='1.2' stroke-dasharray='3 2'/><text x='135.6' y='93.0' font-family='sans-serif' font-size='9' fill='#d9622b' text-anchor='middle'>run +2,500<\/text><text x='169.5' y='75.0' font-family='sans-serif' font-size='9' fill='#d9622b' text-anchor='start'>rise +2,000<\/text><text x='56.0' y='22.0' font-family='sans-serif' font-size='9' fill='#1f5fbf' text-anchor='start' font-weight='bold'>C = 800 + 0.8W<\/text><text x='56.0' y='33.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>slope = 2,000 ÷ 2,500 = 0.8<\/text><\/svg>","cap":"C = 800 + 0.8W: straight line, slope 0.8 everywhere"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><line x1='40.0' y1='110.0' x2='285.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='12.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='40.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>0<\/text><line x1='80.8' y1='110.0' x2='80.8' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='80.8' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>10<\/text><line x1='121.7' y1='110.0' x2='121.7' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='121.7' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>20<\/text><line x1='162.5' y1='110.0' x2='162.5' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='162.5' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>30<\/text><line x1='203.3' y1='110.0' x2='203.3' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='203.3' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>40<\/text><line x1='244.2' y1='110.0' x2='244.2' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='244.2' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>50<\/text><line x1='285.0' y1='110.0' x2='285.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='285.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>60<\/text><line x1='37.5' y1='110.0' x2='40.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='113.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>100<\/text><line x1='37.5' y1='85.5' x2='40.0' y2='85.5' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='88.5' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>200<\/text><line x1='37.5' y1='61.0' x2='40.0' y2='61.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='64.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>300<\/text><line x1='37.5' y1='36.5' x2='40.0' y2='36.5' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='39.5' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>400<\/text><line x1='37.5' y1='12.0' x2='40.0' y2='12.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='15.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>500<\/text><text x='162.5' y='137.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Hockey sticks, Q (000s per year)<\/text><text x='9.0' y='61.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' transform='rotate(-90 9 61.0)'>Cost ($000s)<\/text><path d='M80.8 97.8 C87.6 96.5 101.2 98.6 121.7 90.4 C142.1 82.2 182.9 61.8 203.3 48.8 C223.8 35.7 237.4 18.1 244.2 12.0' fill='none' stroke='#1f5fbf' stroke-width='1.8'/><circle cx='80.8' cy='97.8' r='2.6' fill='#1c1f24'/><text x='75.8' y='94.8' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>A<\/text><circle cx='121.7' cy='90.4' r='2.6' fill='#1c1f24'/><text x='116.7' y='87.4' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>B<\/text><circle cx='203.3' cy='48.8' r='2.6' fill='#1c1f24'/><text x='198.3' y='45.8' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>C<\/text><circle cx='244.2' cy='12.0' r='2.6' fill='#1c1f24'/><text x='239.2' y='9.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>D<\/text><text x='146.2' y='99.8' font-family='sans-serif' font-size='9' fill='#1e8f5a' text-anchor='start'>A to B: +30 ÷ +10 = slope 3<\/text><text x='48.2' y='19.3' font-family='sans-serif' font-size='9' fill='#c43b3b' text-anchor='start'>C to D: +150 ÷ +10<\/text><text x='48.2' y='30.3' font-family='sans-serif' font-size='9' fill='#c43b3b' text-anchor='start'>= slope 15 (steeper)<\/text><\/svg>","cap":"Fig 2-9: increasing marginal cost, slope 3 then 15"}],"sections":[{"h":"Thinking like an economist","kind":"list","items":["**Positive** = what is, was or will be. Testable, can still be wrong. Predictions are positive. **Normative** = what ought to be, a value judgment (\"should\", \"unfair\", \"too much\").","**Theory** = variables + assumptions + predictions. **Endogenous** = explained inside the theory, **exogenous** = taken as given from outside.","**Testing loop:** predictions vs evidence. Passes = keep (still checked). Conflicts = amend or discard.","**Correlation ≠ causation:** X causes Y, Y causes X, a third factor causes both, or coincidence. **RCT** = random treatment vs control group, finds causality."]},{"h":"Formulas","kind":"box","items":["**Index** = (value ÷ base value) × 100, base = 100. Steel 2018: 250 ÷ 200 × 100 = **125.0** (25% above 2014). Newsprint 2016: 3,000 ÷ 3,200 × 100 = **93.8** (6.2% below).","**Slope** = ΔY ÷ ΔX (rise over run). Fig 2-7: A(4,4) to B(6,3): −1 ÷ +2 = **−0.5**, so P = 6 − 0.5E.","**Y = a + bX:** a = vertical intercept, b = slope. W = 5,000 → C = 800 + 4,000 = 4,800."]},{"h":"Memory tricks","kind":"mem","items":["Function shown 4 ways: **WTEG** = Words, Table, Equation, Graph.","Cross-sectional = many units, one time. Time series = one thing over time. Scatter = two variables, one dot per unit."]},{"h":"Curves","kind":"table","rows":[["Case","Slope"],["Diminishing marginal response (2-8)","flattens: A to B −1, C to D −1/6"],["Increasing marginal cost (2-9)","steepens: 3 then 15"],["Max (2-10) / min (2-11)","0 (flat tangent)"]]},{"h":"Key terms","kind":"terms","items":[{"k":"Marginal response","d":"change in Y for one more unit of X = the slope. On a curve it depends on where you are."},{"k":"Slope at a point","d":"slope of the tangent line."},{"k":"CPI","d":"index of the average price of a typical basket."}]},{"h":"Traps","kind":"trap","items":["A false claim is still positive. Unrealistic assumptions are not a flaw by themselves.","Index says nothing about size, only vs the base year.","Weighted average: rate × group size, add, ÷ total size."]}]},"micro:ch3":{"key":"micro:ch3","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><line x1='40.0' y1='110.0' x2='285.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='10.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='40.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>0<\/text><line x1='75.0' y1='110.0' x2='75.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='75.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>20<\/text><line x1='110.0' y1='110.0' x2='110.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='110.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>40<\/text><line x1='153.8' y1='110.0' x2='153.8' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='153.8' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>65<\/text><line x1='180.0' y1='110.0' x2='180.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='180.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>80<\/text><line x1='215.0' y1='110.0' x2='215.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='215.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>100<\/text><line x1='250.0' y1='110.0' x2='250.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='250.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>120<\/text><line x1='285.0' y1='110.0' x2='285.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='285.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>140<\/text><line x1='37.5' y1='91.8' x2='40.0' y2='91.8' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='94.8' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>20<\/text><line x1='37.5' y1='73.6' x2='40.0' y2='73.6' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='76.6' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>40<\/text><line x1='37.5' y1='55.5' x2='40.0' y2='55.5' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='58.5' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>60<\/text><line x1='37.5' y1='37.3' x2='40.0' y2='37.3' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='40.3' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>80<\/text><line x1='37.5' y1='19.1' x2='40.0' y2='19.1' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='22.1' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>100<\/text><text x='162.5' y='137.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Quantity (000 bushels/yr)<\/text><text x='9.0' y='60.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' transform='rotate(-90 9 60.0)'>Price ($/bushel)<\/text><path d='M232.5 91.8 C225.2 88.8 201.9 79.7 188.8 73.6 C175.6 67.6 164.0 61.5 153.8 55.5 C143.5 49.4 134.8 43.3 127.5 37.3 C120.2 31.2 112.9 22.1 110.0 19.1' fill='none' stroke='#1f5fbf' stroke-width='1.8'/><path d='M75.0 91.8 C82.3 88.8 105.6 79.7 118.8 73.6 C131.9 67.6 143.5 61.5 153.8 55.5 C164.0 49.4 171.2 43.3 180.0 37.3 C188.8 31.2 201.9 22.1 206.2 19.1' fill='none' stroke='#c43b3b' stroke-width='1.8'/><line x1='40.0' y1='55.5' x2='153.8' y2='55.5' stroke='#8a8f98' stroke-width='0.8' stroke-dasharray='3 2'/><line x1='153.8' y1='55.5' x2='153.8' y2='110.0' stroke='#8a8f98' stroke-width='0.8' stroke-dasharray='3 2'/><circle cx='153.8' cy='55.5' r='2.6' fill='#1c1f24'/><text x='159.8' y='59.5' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>E ($60, 65)<\/text><line x1='127.5' y1='37.3' x2='180.0' y2='37.3' stroke='#d9622b' stroke-width='2.2'/><text x='211.5' y='40.3' font-family='sans-serif' font-size='9' fill='#d9622b' text-anchor='start'>surplus 30, P ↓<\/text><line x1='118.8' y1='73.6' x2='188.8' y2='73.6' stroke='#1e8f5a' stroke-width='2.2'/><text x='215.0' y='76.6' font-family='sans-serif' font-size='9' fill='#1e8f5a' text-anchor='start'>shortage 40, P ↑<\/text><text x='106.0' y='22.1' font-family='sans-serif' font-size='9' fill='#1f5fbf' text-anchor='end' font-weight='bold'>D<\/text><text x='210.2' y='22.1' font-family='sans-serif' font-size='9' fill='#c43b3b' text-anchor='start' font-weight='bold'>S<\/text><\/svg>","cap":"Apple market: E at $60, 65; surplus at $80, shortage at $40"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><line x1='40.0' y1='110.0' x2='285.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='10.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='40.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>0<\/text><line x1='75.0' y1='110.0' x2='75.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='75.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>20<\/text><line x1='110.0' y1='110.0' x2='110.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='110.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>40<\/text><line x1='153.8' y1='110.0' x2='153.8' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='153.8' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>65<\/text><line x1='180.0' y1='110.0' x2='180.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='180.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>80<\/text><line x1='215.0' y1='110.0' x2='215.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='215.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>100<\/text><line x1='250.0' y1='110.0' x2='250.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='250.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>120<\/text><line x1='285.0' y1='110.0' x2='285.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='285.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>140<\/text><line x1='37.5' y1='91.8' x2='40.0' y2='91.8' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='94.8' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>20<\/text><line x1='37.5' y1='73.6' x2='40.0' y2='73.6' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='76.6' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>40<\/text><line x1='37.5' y1='55.5' x2='40.0' y2='55.5' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='58.5' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>60<\/text><line x1='37.5' y1='37.3' x2='40.0' y2='37.3' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='40.3' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>80<\/text><line x1='37.5' y1='19.1' x2='40.0' y2='19.1' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='22.1' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>100<\/text><text x='162.5' y='137.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Quantity (000 bushels/yr)<\/text><text x='9.0' y='60.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' transform='rotate(-90 9 60.0)'>Price ($/bushel)<\/text><path d='M232.5 91.8 C225.2 88.8 201.9 79.7 188.8 73.6 C175.6 67.6 164.0 61.5 153.8 55.5 C143.5 49.4 134.8 43.3 127.5 37.3 C120.2 31.2 112.9 22.1 110.0 19.1' fill='none' stroke='#1f5fbf' stroke-width='1.8'/><path d='M285.0 91.8 C277.7 88.8 254.4 79.7 241.2 73.6 C228.1 67.6 216.5 61.5 206.2 55.5 C196.0 49.4 187.3 43.3 180.0 37.3 C172.7 31.2 165.4 22.1 162.5 19.1' fill='none' stroke='#1f5fbf' stroke-width='2.2'/><path d='M75.0 91.8 C82.3 88.8 105.6 79.7 118.8 73.6 C131.9 67.6 143.5 61.5 153.8 55.5 C164.0 49.4 171.2 43.3 180.0 37.3 C188.8 31.2 201.9 22.1 206.2 19.1' fill='none' stroke='#c43b3b' stroke-width='1.8'/><line x1='40.0' y1='55.5' x2='153.8' y2='55.5' stroke='#8a8f98' stroke-width='0.8' stroke-dasharray='3 2'/><line x1='153.8' y1='55.5' x2='153.8' y2='110.0' stroke='#8a8f98' stroke-width='0.8' stroke-dasharray='3 2'/><circle cx='153.8' cy='55.5' r='2.6' fill='#1c1f24'/><text x='159.8' y='59.5' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>E0<\/text><line x1='40.0' y1='37.3' x2='180.0' y2='37.3' stroke='#8a8f98' stroke-width='0.8' stroke-dasharray='3 2'/><line x1='180.0' y1='37.3' x2='180.0' y2='110.0' stroke='#8a8f98' stroke-width='0.8' stroke-dasharray='3 2'/><circle cx='180.0' cy='37.3' r='2.6' fill='#1c1f24'/><text x='186.0' y='34.3' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>E1<\/text><text x='106.0' y='22.1' font-family='sans-serif' font-size='9' fill='#1f5fbf' text-anchor='end' font-weight='bold'>D0<\/text><text x='158.5' y='15.1' font-family='sans-serif' font-size='9' fill='#1f5fbf' text-anchor='end' font-weight='bold'>D1<\/text><text x='210.2' y='22.1' font-family='sans-serif' font-size='9' fill='#c43b3b' text-anchor='start' font-weight='bold'>S<\/text><line x1='125.8' y1='28.2' x2='167.8' y2='28.2' stroke='#d9622b' stroke-width='1.4'/><polygon points='167.8,28.2 163.2,30.4 163.2,26.0' fill='#d9622b'/><text x='222.0' y='28.0' font-family='sans-serif' font-size='9' fill='#d9622b' text-anchor='start'>income ↑<\/text><text x='222.0' y='38.0' font-family='sans-serif' font-size='9' fill='#d9622b' text-anchor='start'>$50k → $60k:<\/text><text x='222.0' y='48.0' font-family='sans-serif' font-size='9' fill='#d9622b' text-anchor='start'>D +30 every P<\/text><\/svg>","cap":"Income rises: D shifts right 30, new E at $80, 80"}],"sections":[{"h":"The one rule","kind":"list","items":["Own price changes → **movement along** the curve (change in quantity demanded/supplied). Anything else → **shift** (change in demand/supply). Right = increase, left = decrease.","Ceteris paribus: demand slopes down, supply slopes up. Quantity demanded = desired flow (per year), not quantity bought.","**Demand shifters I-T-O-W-N (5):** income, tastes, other goods' prices, weather, number of consumers.","**Supply shifters I-T-T-O-W-N (6):** input prices, technology, taxes/subsidies, other products' prices, weather, number of suppliers.","Income ↑: normal good demand ↑, inferior ↓. Substitute price ↑ → demand ↑. Complement price ↑ → demand ↓."]},{"h":"Apple market (000 bushels)","kind":"table","rows":[["P $","Qd","Qs","Qd − Qs"],["20","110","20","+90"],["40","85","45","+40"],["60","65","65","0 (E)"],["80","50","80","−30"],["100","40","95","−55"]]},{"h":"Rules","kind":"box","items":["Excess = Qd − Qs. Above E: excess supply (surplus), price pushed **down**. Below E: excess demand (shortage), pushed **up**.","Equations: set QD = QS, solve P, plug back in. Floor above E = surplus, ceiling below E = shortage.","Relative price = PA ÷ PB. Latte $5, sandwich $10 → 0.5 sandwiches. Curves use relative prices, so general inflation alone shifts nothing."]},{"h":"Four cases","kind":"table","rows":[["Shift","Price","Qty"],["D right","↑","↑"],["D left","↓","↓"],["S right","↓","↑"],["S left","↑","↓"]]},{"h":"Memory tricks","kind":"mem","items":["Qty follows the shift. Price: same way for D, opposite for S. P and Q same direction → demand caused it.","Both shift same way: Q sure, P ambiguous. Opposite ways: P sure, Q ambiguous. D and S both +30 → still $60, Q 95."]},{"h":"Traps","kind":"trap","items":["A price rise never \"decreases demand\", only quantity demanded. Supply ↑ means price ↓.","Model needs many buyers, many sellers, identical product. iPhones fail on the **producer** side."]}]},"micro:ch4":{"key":"micro:ch4","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><line x1='40.0' y1='110.0' x2='280.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='14.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='40.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>0<\/text><line x1='80.0' y1='110.0' x2='80.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='80.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>10<\/text><line x1='120.0' y1='110.0' x2='120.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='120.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>20<\/text><line x1='160.0' y1='110.0' x2='160.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='160.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>30<\/text><line x1='200.0' y1='110.0' x2='200.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='200.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>40<\/text><line x1='240.0' y1='110.0' x2='240.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='240.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>50<\/text><line x1='280.0' y1='110.0' x2='280.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='280.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>60<\/text><line x1='37.5' y1='110.0' x2='40.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='113.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>0<\/text><line x1='37.5' y1='94.0' x2='40.0' y2='94.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='97.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>2<\/text><line x1='37.5' y1='78.0' x2='40.0' y2='78.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='81.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>4<\/text><line x1='37.5' y1='62.0' x2='40.0' y2='62.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='65.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>6<\/text><line x1='37.5' y1='46.0' x2='40.0' y2='46.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='49.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>8<\/text><line x1='37.5' y1='30.0' x2='40.0' y2='30.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='33.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>10<\/text><line x1='37.5' y1='14.0' x2='40.0' y2='14.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='17.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>12<\/text><text x='160.0' y='137.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Quantity demanded<\/text><text x='9.0' y='62.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' transform='rotate(-90 9 62.0)'>Price ($)<\/text><rect x='40.0' y='62.0' width='120.0' height='48.0' fill='#1f5fbf' fill-opacity='0.13' stroke='none'/><text x='100.0' y='84.0' font-family='sans-serif' font-size='9' fill='#1f5fbf' text-anchor='middle'>6 × 30<\/text><text x='100.0' y='95.0' font-family='sans-serif' font-size='9' fill='#1f5fbf' text-anchor='middle' font-weight='bold'>= $180<\/text><line x1='40.0' y1='14.0' x2='280.0' y2='110.0' stroke='#1c1f24' stroke-width='1.4'/><line x1='60.0' y1='22.0' x2='100.0' y2='38.0' stroke='#1e8f5a' stroke-width='3.2'/><line x1='140.0' y1='54.0' x2='180.0' y2='70.0' stroke='#d9622b' stroke-width='3.2'/><line x1='220.0' y1='86.0' x2='260.0' y2='102.0' stroke='#c43b3b' stroke-width='3.2'/><text x='63.0' y='17.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='start'>A<\/text><text x='103.0' y='33.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='start'>B<\/text><text x='143.0' y='49.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='start'>C<\/text><text x='183.0' y='65.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='start'>D<\/text><text x='223.0' y='81.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='start'>E<\/text><text x='263.0' y='97.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='start'>F<\/text><text x='104.0' y='25.2' font-family='sans-serif' font-size='9' fill='#1e8f5a' text-anchor='start'>A to B: η = 5 (elastic)<\/text><text x='184.0' y='52.4' font-family='sans-serif' font-size='9' fill='#d9622b' text-anchor='start'>C to D: η = 1 (unit)<\/text><text x='244.0' y='66.8' font-family='sans-serif' font-size='9' fill='#c43b3b' text-anchor='start'>E to F:<\/text><text x='244.0' y='76.8' font-family='sans-serif' font-size='9' fill='#c43b3b' text-anchor='start'>η = 0.2<\/text><\/svg>","cap":"P = 12 − Q/5: elastic at top, unit in the middle, inelastic at bottom"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><line x1='40.0' y1='110.0' x2='280.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='14.0' stroke='#1c1f24' stroke-width='1.2'/><line x1='40.0' y1='110.0' x2='40.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='40.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>0<\/text><line x1='80.0' y1='110.0' x2='80.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='80.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>10<\/text><line x1='120.0' y1='110.0' x2='120.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='120.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>20<\/text><line x1='160.0' y1='110.0' x2='160.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='160.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>30<\/text><line x1='200.0' y1='110.0' x2='200.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='200.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>40<\/text><line x1='240.0' y1='110.0' x2='240.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='240.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>50<\/text><line x1='280.0' y1='110.0' x2='280.0' y2='112.5' stroke='#1c1f24' stroke-width='1.2'/><text x='280.0' y='121.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='middle'>60<\/text><line x1='37.5' y1='110.0' x2='40.0' y2='110.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='113.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>0<\/text><line x1='37.5' y1='62.0' x2='40.0' y2='62.0' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='65.0' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>100<\/text><line x1='37.5' y1='23.6' x2='40.0' y2='23.6' stroke='#1c1f24' stroke-width='1.2'/><text x='36.0' y='26.6' font-family='sans-serif' font-size='8' fill='#1c1f24' text-anchor='end'>180<\/text><text x='160.0' y='137.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Quantity demanded<\/text><text x='9.0' y='62.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' transform='rotate(-90 9 62.0)'>Total expenditure ($)<\/text><path d='M40.0 110.0 C46.7 102.0 66.7 74.8 80.0 62.0 C93.3 49.2 106.7 39.6 120.0 33.2 C133.3 26.8 146.7 23.6 160.0 23.6 C173.3 23.6 186.7 26.8 200.0 33.2 C213.3 39.6 226.7 49.2 240.0 62.0 C253.3 74.8 273.3 102.0 280.0 110.0' fill='none' stroke='#c43b3b' stroke-width='1.8'/><circle cx='80.0' cy='62.0' r='2.2' fill='#1c1f24'/><circle cx='120.0' cy='33.2' r='2.2' fill='#1c1f24'/><circle cx='160.0' cy='23.6' r='2.2' fill='#1c1f24'/><circle cx='200.0' cy='33.2' r='2.2' fill='#1c1f24'/><circle cx='240.0' cy='62.0' r='2.2' fill='#1c1f24'/><line x1='160.0' y1='23.6' x2='160.0' y2='110.0' stroke='#8a8f98' stroke-width='0.8' stroke-dasharray='3 2'/><text x='160.0' y='17.6' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>max $180 at P $6, Q 30 (η = 1)<\/text><text x='100.0' y='81.2' font-family='sans-serif' font-size='9' fill='#1e8f5a' text-anchor='middle'>elastic:<\/text><text x='100.0' y='91.2' font-family='sans-serif' font-size='9' fill='#1e8f5a' text-anchor='middle'>P ↓, TE ↑<\/text><text x='220.0' y='81.2' font-family='sans-serif' font-size='9' fill='#c43b3b' text-anchor='middle'>inelastic:<\/text><text x='220.0' y='91.2' font-family='sans-serif' font-size='9' fill='#c43b3b' text-anchor='middle'>P ↓, TE ↓<\/text><\/svg>","cap":"Total expenditure peaks at $180 where η = 1"}],"sections":[{"h":"Midpoint formula","kind":"box","items":["η = (ΔQ ÷ avg Q) ÷ (ΔP ÷ avg P). Drop the minus sign. Avg = (old + new) ÷ 2.","**Cheese** $5 → $3, Q 116,250 → 123,750: 7,500 ÷ 120,000 = 0.0625; 2 ÷ 4 = 0.5; η = **0.125** (inelastic).","**Supply** A(30, $3.50) B(50, $5): 20 ÷ 40 = 0.5; 1.50 ÷ 4.25 = 0.353; ηS = **1.42** (elastic). Already positive."]},{"h":"Reading η","kind":"table","rows":[["η","Name","Curve"],["> 1","Elastic","flatter"],["= 1","Unit","hyperbola"],["0 to 1","Inelastic","steeper"],["0","Perfectly inelastic","vertical"],["∞","Perfectly elastic","horizontal"]]},{"h":"Core ideas","kind":"list","items":["Straight line: same slope, different η. Top elastic (AB 5), middle unit (CD 1), bottom inelastic (EF 0.2).","Demand more elastic with: close substitutes, big budget share, long run. Supply: ease of switching production, long run. Long-run curves are **flatter**.","Flat demand + supply shift: P moves little, Q a lot. Steep: P swings, Q steady."]},{"h":"Total expenditure (P × Q = revenue)","kind":"table","rows":[["Demand","P ↓","P ↑"],["Elastic","TE ↑","TE ↓"],["Unit","same","same"],["Inelastic","TE ↓","TE ↑"]]},{"h":"Other elasticities (keep the sign)","kind":"box","items":["**Income ηI** = %ΔQ ÷ %ΔI: < 0 inferior, 0 to 1 necessity, > 1 luxury.","**Cross ηXY** = %ΔQX ÷ %ΔPY: > 0 substitutes, < 0 complements (X's demand shifts)."]},{"h":"Memory tricks","kind":"mem","items":["Elastic = Easy to leave, Inelastic = I'm stuck (vertical line looks like I). Elastic: TE opposite to P. Inelastic: same way.","Excise tax: Pc up, Ps down, gap = t. **The stuck side pays**: less elastic side bears more. Payroll tax: inelastic labour supply → workers bear more."]},{"h":"Traps","kind":"trap","items":["Slope ≠ elasticity. Legal payer of a tax changes nothing.","Tax with equations: supply price + t = demand, solve Q; Ps = Pc − t; revenue = t × new Q."]}]},"mkt:mr":{"key":"mkt:mr","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><path d='M68,72 L25.6,29.6 A60,60 0 0 1 110.4,29.6 Z' stroke='#1e8f5a' stroke-width='1.2' fill='#1e8f5a' fill-opacity='0.18'/><circle cx='68' cy='72' r='60' stroke='#1c1f24' stroke-width='1.2' fill='none'/><line x1='68' y1='72' x2='110.4' y2='114.4' stroke='#1c1f24' stroke-width='1'/><line x1='68' y1='72' x2='25.6' y2='114.4' stroke='#1c1f24' stroke-width='1'/><line x1='68' y1='72' x2='25.6' y2='29.6' stroke='#1c1f24' stroke-width='1'/><line x1='68' y1='72' x2='110.4' y2='29.6' stroke='#1c1f24' stroke-width='1'/><text x='68' y='33' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Commuting<\/text><text x='68' y='45' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>TARGET<\/text><text x='102' y='70' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Leisure /<\/text><text x='102' y='80' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>recreation<\/text><text x='68' y='103' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Courier /<\/text><text x='68' y='113' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>delivery<\/text><text x='34' y='70' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Training /<\/text><text x='34' y='80' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>fitness<\/text><text x='142' y='16.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Basis: behavioural<\/text><text x='142' y='28.5' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Variable: occasion for use<\/text><text x='142' y='53.5' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Target profile:<\/text><text x='142' y='66.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>18 to 40, M/F, city condo,<\/text><text x='142' y='78.5' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>little storage, uses transit,<\/text><text x='142' y='91.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>limited budget, green<\/text><text x='142' y='116.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>All models = differentiated<\/text><text x='142' y='128.5' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Foldable bike = niche<\/text><\/svg>","cap":"Bike market by occasion for use; commuters targeted"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><line x1='150' y1='14' x2='150' y2='122' stroke='#8a8f98' stroke-width='1.2'/><line x1='18' y1='68' x2='284' y2='68' stroke='#8a8f98' stroke-width='1.2'/><text x='155' y='12' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>High price<\/text><text x='155' y='133' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Low price<\/text><text x='4' y='62' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Low portability<\/text><text x='296' y='62' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>High portability<\/text><circle cx='250' cy='22' r='2.5' fill='#1f5fbf'/><text x='255' y='25' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Brompton<\/text><circle cx='215' cy='36' r='2.5' fill='#1f5fbf'/><text x='220' y='39' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Tern<\/text><circle cx='180' cy='48' r='2.5' fill='#1f5fbf'/><text x='185' y='51' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Dahon<\/text><circle cx='40' cy='18' r='2.5' fill='#1c1f24'/><text x='45' y='21' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Specialized<\/text><circle cx='78' cy='28' r='2.5' fill='#1c1f24'/><text x='83' y='31' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Cannondale<\/text><circle cx='40' cy='42' r='2.5' fill='#1c1f24'/><text x='45' y='45' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Trek<\/text><circle cx='95' cy='52' r='2.5' fill='#1c1f24'/><text x='100' y='55' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Giant<\/text><circle cx='60' cy='86' r='2.5' fill='#1c1f24'/><text x='65' y='89' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Raleigh<\/text><circle cx='40' cy='108' r='2.5' fill='#1c1f24'/><text x='45' y='111' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Supercycle<\/text><circle cx='240' cy='104' r='4' fill='#1e8f5a'/><text x='234' y='107' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>Shimano Foldable<\/text><text x='234' y='119' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end'>$299<\/text><text x='4' y='136' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>illustrative only<\/text><\/svg>","cap":"Practice perceptual map: price vs portability (positions are guesses)"}],"sections":[{"h":"Case facts (use them!)","kind":"box","items":["Foldable bike, folds in seconds, fits trunk, elevator, cubicle. 20 inch aluminum alloy frame, 21 lbs (10 kg), 3 gears, one colour, no e-bike. **$299**. Urban cycling and bike lanes rising."]},{"h":"Model answers","kind":"terms","items":[{"k":"Mission fit","d":"yes: cycling products, health, new lifestyles"},{"k":"SMART","d":"\"Sell 15,000 Shimano Foldable Bikes in Canada by Dec 31, 2027\" (number made up for practice)"},{"k":"SCA","d":"product excellence: folds, 21 lbs; protect with patents"},{"k":"Ansoff","d":"market penetration (lowest risk); product development next"},{"k":"BCG","d":"question mark: growing market, low share. Invest."},{"k":"Positioning","d":"product attribute: portability (or value, $299)"}]},{"h":"SWOT","kind":"table","rows":[["Internal","External"],["S: folds, light, $299","O: city cycling, bike lanes (Political), condos"],["W: 3 gears, one colour, no e-bike","T: competing bikes, e-bikes"]]},{"h":"Positioning statement","kind":"box","items":["FOR urban commuters WHO have limited storage, the Shimano Foldable Bike PROVIDES a light bike that folds in seconds. UNLIKE standard bikes, it folds for easy storage."]},{"h":"4 Ps (must fit commuter)","kind":"list","items":["Product: 2 to 3 colours, 6 or 7 gears, keep it light. Price: about $299 to $349 (limited budget, low price is part of the position).","D-R-A-C check: commuters can be identified, reached by transit ads and social media, open to a cheaper option, and there are many."]},{"h":"Memory tricks","kind":"mem","items":["Ask \"can Shimano change this?\" No = O or T."]},{"h":"Traps","kind":"trap","items":["Generic answer, no case fact = half marks.","No number or date = not SMART (\"increase sales\").","BCG: growth is vertical, share horizontal. No \"star\" without high share.","Segment ALL bike users, not just the foldable.","Map axes = buying criteria, high and low labelled."]}]},"mkt:w1":{"key":"mkt:w1","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><text x='150' y='12' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Five eras of marketing (order never changes)<\/text><rect x='2' y='22' width='56' height='72' rx='3' stroke='#1f5fbf' stroke-width='1.2' fill='none'/><text x='30' y='36' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Product<\/text><text x='30' y='50' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>pre-1850<\/text><text x='30' y='68' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Hand-made<\/text><text x='30' y='80' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>no ads<\/text><rect x='62' y='22' width='56' height='72' rx='3' stroke='#1f5fbf' stroke-width='1.2' fill='none'/><text x='90' y='36' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Production<\/text><text x='90' y='50' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>1850s-1900<\/text><text x='90' y='68' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Factories,<\/text><text x='90' y='80' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>cheap<\/text><rect x='122' y='22' width='56' height='72' rx='3' stroke='#d9622b' stroke-width='1.2' fill='none'/><text x='150' y='36' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Sales<\/text><text x='150' y='50' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>1900-1950s<\/text><text x='150' y='68' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Transport,<\/text><text x='150' y='80' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>big brands<\/text><rect x='182' y='22' width='56' height='72' rx='3' stroke='#1e8f5a' stroke-width='1.2' fill='none'/><text x='210' y='36' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Consumer<\/text><text x='210' y='50' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>1950s-2000<\/text><text x='210' y='68' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Research,<\/text><text x='210' y='80' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>radio + TV<\/text><rect x='242' y='22' width='56' height='72' rx='3' stroke='#c43b3b' stroke-width='1.2' fill='none'/><text x='270' y='36' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Societal<\/text><text x='270' y='50' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>2000s on<\/text><text x='270' y='68' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Social<\/text><text x='270' y='80' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>impact<\/text><line x1='10' y1='106' x2='290' y2='106' stroke='#8a8f98' stroke-width='1.2'/><polygon points='290,106 284.6,108.6 284.6,103.4' fill='#8a8f98'/><text x='150' y='124' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>focus moves: factory &gt; shelf &gt; customer &gt; society<\/text><\/svg>","cap":"Five eras: what each one focused on"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><circle cx='115' cy='55' r='36' stroke='#1f5fbf' stroke-width='1.2' fill='#1f5fbf' fill-opacity='0.1'/><circle cx='165' cy='55' r='36' stroke='#1e8f5a' stroke-width='1.2' fill='#1e8f5a' fill-opacity='0.1'/><circle cx='140' cy='96' r='36' stroke='#d9622b' stroke-width='1.2' fill='#d9622b' fill-opacity='0.1'/><text x='101' y='48' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>People<\/text><text x='179' y='48' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Planet<\/text><text x='140' y='116' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Profit<\/text><text x='4' y='50' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Value-based<\/text><text x='4' y='61' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>firm = all 3<\/text><text x='4' y='72' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>at once, not<\/text><text x='4' y='83' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>just profit<\/text><text x='208' y='92' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>People: social<\/text><text x='208' y='103' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Planet: green<\/text><text x='208' y='114' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Profit: profits,<\/text><text x='208' y='125' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>share price,<\/text><text x='208' y='136' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>dividends<\/text><\/svg>","cap":"Triple bottom line: People, Planet, Profit"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Marketing (AMA)**: practices that **create, communicate, deliver, exchange** offerings of value for **customers, organizations, society**.","**Exchange** = trade where each side ends up better off (2+ parties, each has value, willing to trade). **Value** = what you get for what you give up. Personal, subjective.","Purpose of marketing: value for **both firm and customer**.","Money is not the only thing traded: Google gets your attention and data.","Marketing is NOT just ads, packaging, selling or profit. Core: needs and wants, value, 4 Ps, exchange."]},{"h":"Value worked example","kind":"box","items":["Ana and Ben both pay $15 for a movie. Ana values it at $25: gain $10. Ben values it at $8: loss $7. Same price, different value."]},{"h":"4 ways firms create value","kind":"terms","items":[{"k":"Adapt","d":"or perish (BlackBerry did not)"},{"k":"Strong positioning","d":"what the brand stands for, different or better"},{"k":"Authenticity","d":"be real; greenwashing = green claim, no action"},{"k":"Integrated communication","d":"same message everywhere"}]},{"h":"Society","kind":"list","items":["3 roles: new products and choice; economic growth; shape culture and values.","**Growth chain**: innovation > production and sales > jobs > spending > business growth > government revenue.","5 criticisms: misleading, waste, overconsumption, social ills, cultural appropriation."]},{"h":"Memory tricks","kind":"mem","items":["CCDE verbs; A-P-A-I: changing? different? real? consistent?","\"My Wallet Often Suffers Constantly\" = the 5 criticisms.","Marketing management 6: \"Big Profits Invite Trends, Lawyers, Governments\"."]},{"h":"Traps","kind":"trap","items":["\"Marketing = selling and advertising\" is wrong (NOT just).","Exchange is the act, value is the judgement.","Sales era = ship and push goods. Surveying customers first = consumer era.","Packaging in landfill = waste. Buying what you do not need = overconsumption.","Profit is 1 of 3 in TBL, not the real one. Gov revenue is the last link."]},{"h":"Grading","kind":"table","rows":[["Item","Worth"],["In-class (9 x 3%)","24%"],["Discussion board","5%"],["Midterm Oct 22","26%"],["Group project (5+15+25)","45%"]]}]},"mkt:w2":{"key":"mkt:w2","figs":[{"svg":"<svg viewBox='0 0 300 148' xmlns='http://www.w3.org/2000/svg'><text x='125' y='14' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Current product<\/text><text x='235' y='14' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>New product<\/text><text x='36' y='46' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Current<\/text><text x='36' y='57' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>consumer<\/text><text x='36' y='101' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>New<\/text><text x='36' y='112' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>consumer<\/text><rect x='70' y='22' width='108' height='52' rx='3' stroke='#1e8f5a' stroke-width='1.2' fill='#1e8f5a' fill-opacity='0.08'/><text x='124' y='38' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Market penetration<\/text><text x='124' y='53' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>same to same<\/text><text x='124' y='65' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>fries with that?<\/text><rect x='180' y='22' width='108' height='52' rx='3' stroke='#1f5fbf' stroke-width='1.2' fill='#1f5fbf' fill-opacity='0.08'/><text x='234' y='38' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Product development<\/text><text x='234' y='53' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>new product,<\/text><text x='234' y='65' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Mini's new EV<\/text><rect x='70' y='78' width='108' height='52' rx='3' stroke='#1f5fbf' stroke-width='1.2' fill='#1f5fbf' fill-opacity='0.08'/><text x='124' y='94' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Market development<\/text><text x='124' y='109' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>same product,<\/text><text x='124' y='121' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>GoodLife for Women<\/text><rect x='180' y='78' width='108' height='52' rx='3' stroke='#c43b3b' stroke-width='1.2' fill='#c43b3b' fill-opacity='0.08'/><text x='234' y='94' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Diversification<\/text><text x='234' y='109' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>both new, riskiest<\/text><text x='234' y='121' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>TD Insurance<\/text><text x='150' y='145' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Change only the WHAT or the WHO, or both<\/text><\/svg>","cap":"Ansoff growth matrix (class examples)"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><text x='110' y='12' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>High share<\/text><text x='225' y='12' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Low share<\/text><text x='48' y='42' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>High<\/text><text x='48' y='53' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>growth<\/text><text x='48' y='94' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>Low<\/text><text x='48' y='105' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>growth<\/text><rect x='55' y='18' width='110' height='48' rx='3' stroke='#1e8f5a' stroke-width='1.2' fill='#1e8f5a' fill-opacity='0.08'/><text x='110' y='38' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Star<\/text><text x='110' y='53' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>keep investing<\/text><rect x='170' y='18' width='110' height='48' rx='3' stroke='#d9622b' stroke-width='1.2' fill='#d9622b' fill-opacity='0.08'/><text x='225' y='38' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Question mark<\/text><text x='225' y='53' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>invest or drop<\/text><rect x='55' y='70' width='110' height='48' rx='3' stroke='#1f5fbf' stroke-width='1.2' fill='#1f5fbf' fill-opacity='0.08'/><text x='110' y='90' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Cash cow<\/text><text x='110' y='105' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>milk it, funds stars<\/text><rect x='170' y='70' width='110' height='48' rx='3' stroke='#c43b3b' stroke-width='1.2' fill='#c43b3b' fill-opacity='0.08'/><text x='225' y='90' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Dog<\/text><text x='225' y='105' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>cut or sell<\/text><line x1='230' y1='128' x2='75' y2='128' stroke='#8a8f98' stroke-width='1.2'/><polygon points='75,128 80.4,125.4 80.4,130.6' fill='#8a8f98'/><text x='240' y='131' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>share<\/text><text x='4' y='131' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>winning<\/text><\/svg>","cap":"BCG matrix: winning share is on the left"}],"sections":[{"h":"6-step plan (iterative)","kind":"box","items":["1 Mission > 2 Situation (competitive analysis + SWOT) > 3 SMART objectives > 4 Strategies (advantage, growth, STP) > 5 Tactics (4 Ps, Ch 8 to 16) > 6 Evaluation. Results feed back."]},{"h":"Core ideas","kind":"list","items":["**Mission**: public, corporate, answers purpose, customer, main competency. Long-term, **no numbers**. Nike: \"inspiration and innovation to every athlete\".","**Competitive analysis**: identify, assess, select (attack or avoid). **Direct** = same product type (BK vs McDonald's). **Indirect** = other way to meet the need (BK vs pizza, Subway).","**SMART objective**: how much, by when. \"Increase sales by 6,000 units in 2026 over 2025.\"","**Sustainable competitive advantage**: different or better, and lasts. Customer (Four Seasons), Operational (Zara, IKEA), Product (Apple, Mercedes), Locational (Canadian Tire)."]},{"h":"Market share","kind":"box","items":["Share = your sales / market sales. 54,000 / 270,000 = 20%."]},{"h":"SWOT + actions","kind":"table","rows":[["","Positive","Negative"],["Micro (internal, controllable)","S: Build","W: Correct"],["Macro (external, uncontrollable)","O: Leverage","T: Avoid"]]},{"h":"Key terms","kind":"terms","items":[{"k":"Micro","d":"company (4 Ps), suppliers, customers, intermediaries"},{"k":"CDSTEP (macro)","d":"Competition, Demographic, Social/cultural, Technological, Economic, Political"}]},{"h":"Memory tricks","kind":"mem","items":["\"My Sister Orders Sushi Tonight, Every week\" = 6 steps.","Place a factor: inside or outside? good or bad? B-C-L-A in S-W-O-T order."]},{"h":"Traps","kind":"trap","items":["A number or date inside a \"mission\" makes it an objective.","O and T are NOT marketing ideas. \"Run a TikTok ad\" is an action; each O/T must name a CDSTEP factor.","Same menu in a new city = market development. New flavour, same buyers = product development.","A 2-week price cut is a tactic, not a sustainable advantage.","Cash cow is a good product in a slow market. Competition is macro."]}]},"mkt:w3":{"key":"mkt:w3","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><rect x='110' y='3' width='80' height='18' rx='3' stroke='#1c1f24' stroke-width='1.2' fill='none'/><text x='150' y='15' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Research data<\/text><rect x='30' y='36' width='90' height='26' rx='3' stroke='#1f5fbf' stroke-width='1.2' fill='#1f5fbf' fill-opacity='0.08'/><text x='75' y='47' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>PRIMARY<\/text><text x='75' y='58' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>new, for you<\/text><rect x='180' y='36' width='90' height='26' rx='3' stroke='#d9622b' stroke-width='1.2' fill='#d9622b' fill-opacity='0.08'/><text x='225' y='47' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>SECONDARY<\/text><text x='225' y='58' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>already exists<\/text><line x1='150' y1='21' x2='75' y2='36' stroke='#8a8f98' stroke-width='1.2'/><line x1='150' y1='21' x2='225' y2='36' stroke='#8a8f98' stroke-width='1.2'/><line x1='75' y1='62' x2='30' y2='80' stroke='#8a8f98' stroke-width='1.2'/><rect x='2' y='80' width='56' height='56' rx='3' stroke='#1f5fbf' stroke-width='1.2' fill='none'/><text x='30' y='92' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Exploratory<\/text><text x='30' y='104' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>qualitative<\/text><text x='30' y='118' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>focus<\/text><text x='30' y='129' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>groups<\/text><line x1='75' y1='62' x2='90' y2='80' stroke='#8a8f98' stroke-width='1.2'/><rect x='62' y='80' width='56' height='56' rx='3' stroke='#1f5fbf' stroke-width='1.2' fill='none'/><text x='90' y='92' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Conclusive<\/text><text x='90' y='104' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>quantitative<\/text><text x='90' y='118' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>surveys,<\/text><text x='90' y='129' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>experiments<\/text><line x1='225' y1='62' x2='150' y2='80' stroke='#8a8f98' stroke-width='1.2'/><rect x='122' y='80' width='56' height='56' rx='3' stroke='#d9622b' stroke-width='1.2' fill='none'/><text x='150' y='92' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Internal<\/text><text x='150' y='104' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>ours<\/text><text x='150' y='118' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>sales,<\/text><text x='150' y='129' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>loyalty data<\/text><line x1='225' y1='62' x2='210' y2='80' stroke='#8a8f98' stroke-width='1.2'/><rect x='182' y='80' width='56' height='56' rx='3' stroke='#d9622b' stroke-width='1.2' fill='none'/><text x='210' y='92' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>External<\/text><text x='210' y='104' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>free<\/text><text x='210' y='118' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Statistics<\/text><text x='210' y='129' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Canada<\/text><line x1='225' y1='62' x2='270' y2='80' stroke='#8a8f98' stroke-width='1.2'/><rect x='242' y='80' width='56' height='56' rx='3' stroke='#d9622b' stroke-width='1.2' fill='none'/><text x='270' y='92' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Syndicated<\/text><text x='270' y='104' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>sold<\/text><text x='270' y='118' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Ipsos,<\/text><text x='270' y='129' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Nielsen<\/text><\/svg>","cap":"Primary vs secondary data and their types"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><polygon points='75.0,8.0 75.0,8.0 89.0,33.2 61.0,33.2' fill='#1e8f5a' fill-opacity='0.18' stroke='#1e8f5a' stroke-width='1'/><text x='75' y='26.200000000000003' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>5<\/text><line x1='85.0' y1='20.6' x2='158' y2='20.6' stroke='#8a8f98' stroke-width='0.6' stroke-dasharray='3 2'/><text x='162' y='19.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Self-actualization<\/text><text x='162' y='30.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>self-improvement ads<\/text><polygon points='61.0,33.2 89.0,33.2 103.0,58.4 47.0,58.4' fill='#1f5fbf' fill-opacity='0.18' stroke='#1f5fbf' stroke-width='1'/><text x='75' y='51.4' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>4<\/text><line x1='99.0' y1='45.8' x2='158' y2='45.8' stroke='#8a8f98' stroke-width='0.6' stroke-dasharray='3 2'/><text x='162' y='44.2' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Esteem<\/text><text x='162' y='55.2' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>luxury car: status<\/text><polygon points='47.0,58.4 103.0,58.4 117.0,83.6 33.0,83.6' fill='#d9622b' fill-opacity='0.18' stroke='#d9622b' stroke-width='1'/><text x='75' y='76.6' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>3<\/text><line x1='113.0' y1='71.0' x2='158' y2='71.0' stroke='#8a8f98' stroke-width='0.6' stroke-dasharray='3 2'/><text x='162' y='69.4' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Love / belonging<\/text><text x='162' y='80.4' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Pepsi, beer ads<\/text><polygon points='33.0,83.6 117.0,83.6 131.0,108.8 19.0,108.8' fill='#c43b3b' fill-opacity='0.18' stroke='#c43b3b' stroke-width='1'/><text x='75' y='101.8' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>2<\/text><line x1='127.0' y1='96.19999999999999' x2='158' y2='96.19999999999999' stroke='#8a8f98' stroke-width='0.6' stroke-dasharray='3 2'/><text x='162' y='94.6' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Safety<\/text><text x='162' y='105.6' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Michelin tires, insurance<\/text><polygon points='19.0,108.8 131.0,108.8 145.0,134.0 5.0,134.0' fill='#8a8f98' fill-opacity='0.18' stroke='#8a8f98' stroke-width='1'/><text x='75' y='127.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>1<\/text><line x1='141.0' y1='121.4' x2='158' y2='121.4' stroke='#8a8f98' stroke-width='0.6' stroke-dasharray='3 2'/><text x='162' y='119.8' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Physiological<\/text><text x='162' y='130.8' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>basic body needs<\/text><\/svg>","cap":"Maslow: act on unmet needs, then move up"}],"sections":[{"h":"Research: 5 steps","kind":"box","items":["Define problem + objectives > Design > Collect > Analyze > Present. \"Dogs Don't Chase Angry Pigeons\".","Problem = question. Objective = information needed. Scope = limits ($1,000, 2 weeks)."]},{"h":"Core ideas","kind":"list","items":["Primary: tailored, proprietary, confirmable, but costly, slow, needs skill. Secondary: cheap, ready, but not tailored, not current, not confirmable.","Survey response: mail 1-2%, phone 10-15%, online 30-35%. Order: general > specific > demographic. Structured = fixed scale; unstructured = open.","Data = raw numbers. Information = interpreted, leads to action.","**Reliability** = same result again. **Validity** = measures the right thing."]},{"h":"Consumer decision process","kind":"box","items":["Need > Search (internal / external) > Evaluate (universal > evoked > decision set) > Decide > Post-purchase."]},{"h":"Key terms","kind":"terms","items":[{"k":"Need / want / motive","d":"lack of something / preferred way to fill it / what prompts action"},{"k":"Heuristics","d":"price, brand name, in-store promo, endorsement"},{"k":"Remorse vs dissonance","d":"\"I chose wrong\" vs \"less satisfying than expected\""},{"k":"Situational","d":"temporal (mind), antecedent (body), purchase state, shopping situation, social"},{"k":"External","d":"culture, reference groups, opinion leaders, family life stage"}]},{"h":"Search goes up with","kind":"table","rows":[["More search","Less search"],["Risk, importance, buying for others","Familiarity, regularity"]]},{"h":"Memory tricks","kind":"mem","items":["Exploratory = Why (quality). Conclusive = How many (quantity).","Scale 2 kg heavy every time: reliable, not valid."]},{"h":"Traps","kind":"trap","items":["Scanner data you collect = primary; a bought Nielsen report = syndicated.","\"I need a Starbucks\" = need caffeine, want Starbucks.","Involvement is about stakes, not price: diabetes meds = habitual but high.","Celebrity = opinion leader. Friends, classmates = reference group."]}]},"mkt:w4":{"key":"mkt:w4","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><text x='60' y='14' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>SEGMENTATION<\/text><text x='150' y='14' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>TARGETING<\/text><text x='298' y='14' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>POSITIONING<\/text><line x1='5' y1='19' x2='115' y2='19' stroke='#1f5fbf' stroke-width='1.2'/><line x1='126' y1='19' x2='237' y2='19' stroke='#d9622b' stroke-width='1.2'/><line x1='248' y1='19' x2='298' y2='19' stroke='#1e8f5a' stroke-width='1.2'/><rect x='3' y='28' width='52' height='66' rx='3' stroke='#1f5fbf' stroke-width='1.2' fill='#1f5fbf' fill-opacity='0.08'/><text x='29' y='42' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>1<\/text><text x='29' y='57' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Set<\/text><text x='29' y='68' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>objectives<\/text><text x='29' y='85' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>SMART<\/text><line x1='56' y1='61' x2='63' y2='61' stroke='#8a8f98' stroke-width='1.2'/><polygon points='63,61 57.6,63.6 57.6,58.4' fill='#8a8f98'/><rect x='64' y='28' width='52' height='66' rx='3' stroke='#1f5fbf' stroke-width='1.2' fill='#1f5fbf' fill-opacity='0.08'/><text x='90' y='42' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>2<\/text><text x='90' y='57' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Segment<\/text><text x='90' y='68' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>bases<\/text><text x='90' y='85' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>G D P B<\/text><line x1='117' y1='61' x2='124' y2='61' stroke='#8a8f98' stroke-width='1.2'/><polygon points='124,61 118.6,63.6 118.6,58.4' fill='#8a8f98'/><rect x='125' y='28' width='52' height='66' rx='3' stroke='#d9622b' stroke-width='1.2' fill='#d9622b' fill-opacity='0.08'/><text x='151' y='42' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>3<\/text><text x='151' y='57' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Evaluate<\/text><text x='151' y='68' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>segments<\/text><text x='151' y='85' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>D R A C<\/text><line x1='178' y1='61' x2='185' y2='61' stroke='#8a8f98' stroke-width='1.2'/><polygon points='185,61 179.6,63.6 179.6,58.4' fill='#8a8f98'/><rect x='186' y='28' width='52' height='66' rx='3' stroke='#d9622b' stroke-width='1.2' fill='#d9622b' fill-opacity='0.08'/><text x='212' y='42' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>4<\/text><text x='212' y='57' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Select<\/text><text x='212' y='68' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>target<\/text><text x='212' y='85' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>profile<\/text><line x1='239' y1='61' x2='246' y2='61' stroke='#8a8f98' stroke-width='1.2'/><polygon points='246,61 240.6,63.6 240.6,58.4' fill='#8a8f98'/><rect x='247' y='28' width='52' height='66' rx='3' stroke='#1e8f5a' stroke-width='1.2' fill='#1e8f5a' fill-opacity='0.08'/><text x='273' y='42' font-family='sans-serif' font-size='10' fill='#1c1f24' text-anchor='middle' font-weight='bold'>5<\/text><text x='273' y='57' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Develop<\/text><text x='273' y='68' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>position<\/text><text x='273' y='85' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>V A S H L<\/text><line x1='273' y1='95' x2='273' y2='112' stroke='#8a8f98' stroke-width='1.2'/><polygon points='273,112 270.4,106.6 275.6,106.6' fill='#8a8f98'/><text x='296' y='126' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end'>drives the 4 Ps (Step 5 tactics)<\/text><text x='4' y='126' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>STP = plan Step 4<\/text><\/svg>","cap":"The 5-step STP process"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><line x1='150' y1='16' x2='150' y2='124' stroke='#8a8f98' stroke-width='1.2'/><line x1='20' y1='70' x2='282' y2='70' stroke='#8a8f98' stroke-width='1.2'/><text x='155' y='14' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>High price<\/text><text x='155' y='134' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Low price<\/text><text x='4' y='64' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Low quality<\/text><text x='296' y='64' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>High quality<\/text><rect x='205' y='96' width='90' height='30' rx='3' stroke='#d9622b' stroke-width='1.2' fill='none' stroke-dasharray='3 2'/><text x='250' y='108' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>empty: low price<\/text><text x='250' y='120' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>+ high quality<\/text><circle cx='250' cy='24' r='2.5' fill='#1f5fbf'/><text x='255' y='27' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Porsche<\/text><circle cx='222' cy='35' r='2.5' fill='#1f5fbf'/><text x='227' y='38' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Mercedes-Benz<\/text><circle cx='180' cy='44' r='2.5' fill='#1f5fbf'/><text x='185' y='47' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Audi<\/text><circle cx='232' cy='52' r='2.5' fill='#1f5fbf'/><text x='237' y='55' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>BMW<\/text><circle cx='162' cy='80' r='2.5' fill='#1c1f24'/><text x='167' y='83' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Ford<\/text><circle cx='176' cy='92' r='2.5' fill='#1c1f24'/><text x='181' y='95' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Honda<\/text><circle cx='198' cy='80' r='2.5' fill='#1c1f24'/><text x='203' y='83' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Toyota<\/text><circle cx='50' cy='92' r='2.5' fill='#c43b3b'/><text x='55' y='95' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Kia<\/text><circle cx='82' cy='104' r='2.5' fill='#c43b3b'/><text x='87' y='107' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Renault<\/text><circle cx='40' cy='116' r='2.5' fill='#c43b3b'/><text x='45' y='119' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Dacia<\/text><\/svg>","cap":"Car perceptual map (slide 78, positions approximate)"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Segmentation** = split a market of USERS into groups with a common need or behaviour. Why: serve, grow, talk precisely.","**4 bases**: Geographic (where), Demographic (who, most common), Psychographic (why: lifestyle, values), Behavioural (how: benefits sought, usage rate, occasion, loyalty).","Answer format: \"Segment the [x] market on the [basis] basis, [variable] variable.\"","**Targeting**: mass (gasoline, flour), differentiated (Honda, Pantene, Gap), niche (Running Room, Sensodyne), micro (custom, bespoke).","**Positioning** = the mental picture in consumers' minds. 5 strategies: Value, Product attributes, Symbolism, Head-on, Market leadership."]},{"h":"Ski apparel segment (slide 41)","kind":"box","items":["4,000,000 kids x 10% = 400,000 buyers x $200 = $80M sales x 25% = $20M - $12M start-up = **$8M**","At 5%: $10M - $12M = -$2M. Break-even: $12M / ($200 x 25% = $50) = 240,000 buyers = 6%."]},{"h":"Positioning statement","kind":"box","items":["FOR [target] WHO [need], OUR PRODUCT [name] PROVIDES [benefit]. UNLIKE [competitor], OUR PRODUCT [differentiator]. Gatorade vs water; NyQuil vs Tylenol."]},{"h":"Memory tricks","kind":"mem","items":["D-R-A-C \"Don't Run After Crumbs\": Distinct, Reachable, Approachable, Considerable.","Count the offers: 1 for all = mass, several = differentiated, 1 segment = niche, 1 person = micro.","Map: pick 2 axes, place brands, find the gap. Luxury = exclusive place + niche promo."]},{"h":"Traps","kind":"trap","items":["Name basis AND variable. Same age, different buying = lifestage.","Reachable = can the message get there. Approachable = will they say yes.","Value is not just cheap: Mercedes, Saks = high quality value.","\"Better than X\" = head-on. \"The best\", no rival = leadership.","Repositioning re-launches all 4 Ps, not just the logo. Maps show perceptions, not facts."]}]},"mkt:w5":{"key":"mkt:w5","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><text x='150' y='12' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Adoption curve (share of buyers)<\/text><path d='M10,104.3 L14,103.9 L18,103.4 L22,102.8 L26,102.1 L30,101.3 L34,100.3 L38,99.2 L42,97.9 L46,96.3 L50,94.6 L54,92.7 L58,90.5 L62,88.1 L66,85.5 L70,82.6 L74,79.5 L78,76.2 L82,72.7 L86,69.0 L90,65.1 L94,61.1 L98,57.1 L102,53.0 L106,49.0 L110,45.0 L114,41.2 L118,37.6 L122,34.2 L126,31.1 L130,28.5 L134,26.2 L138,24.4 L142,23.1 L146,22.3 L150,22.0 L154,22.3 L158,23.1 L162,24.4 L166,26.2 L170,28.5 L174,31.1 L178,34.2 L182,37.6 L186,41.2 L190,45.0 L194,49.0 L198,53.0 L202,57.1 L206,61.1 L210,65.1 L214,69.0 L218,72.7 L222,76.2 L226,79.5 L230,82.6 L234,85.5 L238,88.1 L242,90.5 L246,92.7 L250,94.6 L254,96.3 L258,97.9 L262,99.2 L266,100.3 L270,101.3 L274,102.1 L278,102.8 L282,103.4 L286,103.9 L290,104.3' stroke='#1f5fbf' stroke-width='1.6' fill='none'/><line x1='10' y1='106' x2='290' y2='106' stroke='#8a8f98' stroke-width='1.2'/><line x1='50' y1='106' x2='50' y2='94.63183620812453' stroke='#8a8f98' stroke-width='1' stroke-dasharray='3 2'/><line x1='100' y1='106' x2='100' y2='55.05142458413879' stroke='#8a8f98' stroke-width='1' stroke-dasharray='3 2'/><line x1='150' y1='106' x2='150' y2='22.0' stroke='#8a8f98' stroke-width='1' stroke-dasharray='3 2'/><line x1='200' y1='106' x2='200' y2='55.05142458413879' stroke='#8a8f98' stroke-width='1' stroke-dasharray='3 2'/><text x='28' y='117' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Innovators<\/text><text x='28' y='137' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>2.5%<\/text><text x='75' y='117' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Early<\/text><text x='75' y='126' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>adopters<\/text><text x='75' y='137' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>13.5%<\/text><text x='125' y='117' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Early<\/text><text x='125' y='126' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>majority<\/text><text x='125' y='137' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>34%<\/text><text x='175' y='117' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Late<\/text><text x='175' y='126' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>majority<\/text><text x='175' y='137' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>34%<\/text><text x='245' y='117' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Laggards<\/text><text x='245' y='137' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>16%<\/text><\/svg>","cap":"Diffusion of innovation: 2.5 + 13.5 + 34 + 34 + 16 = 100%"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><line x1='20' y1='10' x2='20' y2='112' stroke='#8a8f98' stroke-width='1.2'/><line x1='20' y1='92' x2='292' y2='92' stroke='#8a8f98' stroke-width='1.2'/><text x='16' y='95' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end'>0<\/text><path d='M22,90 C70,88 95,70 120,50 S175,14 200,16 S260,40 290,62' stroke='#1f5fbf' stroke-width='1.8' fill='none'/><path d='M22,92 C35,106 60,108 85,92 S140,40 160,42 S230,70 290,88' stroke='#1e8f5a' stroke-width='1.8' fill='none' stroke-dasharray='3 2'/><text x='203' y='11' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start' font-weight='bold'>Sales<\/text><text x='252' y='88' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Profit<\/text><line x1='85' y1='10' x2='85' y2='112' stroke='#8a8f98' stroke-width='0.8' stroke-dasharray='3 2'/><line x1='165' y1='10' x2='165' y2='112' stroke='#8a8f98' stroke-width='0.8' stroke-dasharray='3 2'/><line x1='235' y1='10' x2='235' y2='112' stroke='#8a8f98' stroke-width='0.8' stroke-dasharray='3 2'/><text x='52' y='124' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Intro<\/text><text x='52' y='135' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Innovators<\/text><text x='125' y='124' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Growth<\/text><text x='125' y='135' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Early adopt.<\/text><text x='200' y='124' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Maturity<\/text><text x='200' y='135' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Late majority<\/text><text x='264' y='124' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Decline<\/text><text x='264' y='135' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Laggards<\/text><\/svg>","cap":"Product life cycle: profit peaks before sales"}],"sections":[{"h":"Core ideas","kind":"list","items":["Product = goods, services, places, organizations, experiences, ideas, causes.","3 levels: **core benefit** (need solved) > **actual** (brand, features) > **extended** (warranty, service, add-ons).","Consumer products: **convenience** (little effort), **shopping** (compare), **select** (strong preference, Tesla), **unsought** (insurance, funeral).","**Breadth** = number of lines. **Depth** = categories inside one line.","**Brand equity** = awareness, associations, perceived value, loyalty. Loyal buyers are less price sensitive.","Ownership: manufacturer (Cherry Coke), private label (retailer's, PC), generic (no brand).","Almost **3 out of 4** new products fail within a few years."]},{"h":"Breadth and depth example","kind":"box","items":["Oral Care 5, Hair 4, Skin 3, Pet 2. Breadth = 4 lines. Depth of Oral Care = 5. Total = 14 categories."]},{"h":"Key terms","kind":"terms","items":[{"k":"Extension / licensing / co-branding","d":"your brand on a new product / another firm rents your name / two brands together"},{"k":"Dilution","d":"poor-fit extension weakens the brand"},{"k":"New product types","d":"new to world, copycat, extension, new and improved, repositioned"},{"k":"NPD 6 steps","d":"idea, concept + prototype, business case, market test, launch, evaluation"},{"k":"Adoption steps","d":"awareness, interest, evaluate, trial, adopt"}]},{"h":"Memory tricks","kind":"mem","items":["Features TELL, benefits SELL (M&M's: melt in your mouth).","Adoption factors RCCTO: Relative advantage, Complexity, Compatibility, Trialability, Observability.","\"I Can Build More Product Eventually\" = NPD. Canada labels: bilingual."]},{"h":"Traps","kind":"trap","items":["Warranty and data plan = extended product, not core.","Private label is a brand (the retailer's); generic has none.","Complexity works backwards: more complex = slower adoption.","Alpha test = inside the firm, beta = real users. Business case before market test.","Profits peak before sales (more rivals in maturity)."]}]},"mkt:w6":{"key":"mkt:w6","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><line x1='46' y1='118' x2='280' y2='118' stroke='#8a8f98' stroke-width='1.2'/><line x1='46' y1='118' x2='46' y2='10' stroke='#8a8f98' stroke-width='1.2'/><line x1='43' y1='83.33333333333334' x2='46' y2='83.33333333333334' stroke='#8a8f98' stroke-width='1.2'/><text x='41' y='86.33333333333334' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end'>$50k<\/text><line x1='43' y1='48.66666666666667' x2='46' y2='48.66666666666667' stroke='#8a8f98' stroke-width='1.2'/><text x='41' y='51.66666666666667' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end'>$100k<\/text><line x1='43' y1='14.0' x2='46' y2='14.0' stroke='#8a8f98' stroke-width='1.2'/><text x='41' y='17.0' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end'>$150k<\/text><text x='46.0' y='129' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>0<\/text><text x='138.0' y='129' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>10k<\/text><text x='230.0' y='129' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>20k<\/text><text x='276' y='129' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end'>books<\/text><line x1='46.0' y1='83.33333333333334' x2='276.0' y2='83.33333333333334' stroke='#8a8f98' stroke-width='1.2' stroke-dasharray='3 2'/><line x1='46.0' y1='83.33333333333334' x2='276.0' y2='31.33333333333333' stroke='#c43b3b' stroke-width='1.6'/><line x1='46.0' y1='118.0' x2='276.0' y2='14.0' stroke='#1e8f5a' stroke-width='1.6'/><line x1='199.3364' y1='48.66666666666667' x2='199.3364' y2='118' stroke='#1c1f24' stroke-width='0.8' stroke-dasharray='3 2'/><circle cx='199.3364' cy='48.66666666666667' r='3' fill='#1c1f24'/><text x='193.3364' y='42.66666666666667' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='end' font-weight='bold'>BE 16,667<\/text><line x1='58' y1='12' x2='72' y2='12' stroke='#1e8f5a' stroke-width='1.6'/><text x='76' y='15' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Revenue ($6 x books)<\/text><line x1='58' y1='24' x2='72' y2='24' stroke='#c43b3b' stroke-width='1.6'/><text x='76' y='27' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Total cost (FC + $3 x books)<\/text><line x1='58' y1='36' x2='72' y2='36' stroke='#8a8f98' stroke-width='1.2' stroke-dasharray='3 2'/><text x='76' y='39' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='start'>Fixed $50,000<\/text><\/svg>","cap":"Break-even: children's book (FC $50,000, $6 price, $3 VC)"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg'><rect x='2' y='4' width='70' height='98' rx='3' stroke='#c43b3b' stroke-width='1.2' fill='#c43b3b' fill-opacity='0.08'/><text x='37' y='18' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Monopoly<\/text><text x='37' y='50' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>1 firm<\/text><text x='37' y='66' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>total control<\/text><text x='37' y='88' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>power, water<\/text><rect x='77' y='4' width='70' height='98' rx='3' stroke='#d9622b' stroke-width='1.2' fill='#d9622b' fill-opacity='0.08'/><text x='112' y='18' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Oligopoly<\/text><text x='112' y='50' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>a few firms<\/text><text x='112' y='66' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>copy each other<\/text><text x='112' y='88' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>Bell, Rogers<\/text><rect x='152' y='4' width='70' height='98' rx='3' stroke='#1f5fbf' stroke-width='1.2' fill='#1f5fbf' fill-opacity='0.08'/><text x='187' y='18' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Monopolistic<\/text><text x='187' y='29' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>competition<\/text><text x='187' y='50' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>many, differ<\/text><text x='187' y='66' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>some control<\/text><text x='187' y='88' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>luxury cars<\/text><rect x='227' y='4' width='70' height='98' rx='3' stroke='#1e8f5a' stroke-width='1.2' fill='#1e8f5a' fill-opacity='0.08'/><text x='262' y='18' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>Pure<\/text><text x='262' y='29' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle' font-weight='bold'>competition<\/text><text x='262' y='50' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>many, same<\/text><text x='262' y='66' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>no control<\/text><text x='262' y='88' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>wheat, pork<\/text><line x1='10' y1='116' x2='290' y2='116' stroke='#8a8f98' stroke-width='1.2'/><polygon points='290,116 284.6,118.6 284.6,113.4' fill='#8a8f98'/><text x='150' y='133' font-family='sans-serif' font-size='9' fill='#1c1f24' text-anchor='middle'>more firms, less price control<\/text><\/svg>","cap":"Market structures and price control"}],"sections":[{"h":"Core ideas","kind":"list","items":["Price is the only P that earns revenue, and a signal of quality (heuristic: expensive = good).","**5 C's**: Company, Competition, Customers, Channel members, Costs. Costs = floor, customers = ceiling.","Objectives: maximize sales = LOW price; maximize profit = HIGH price; beat competition; create value.","**Skimming** = high at launch for innovators, lowered later. **Penetration** = low from the start for share.","Tactics: tiered, bundling, loss leader, cost of ownership, EDLP vs high/low, odd ($3.99), reference price.","**Grey market** = unauthorized channel; legal, no warranty."]},{"h":"Formulas","kind":"box","items":["Contribution = price - variable cost. **BE units = FC / contribution**.","With ads + profit goal: (FC + ad + profit) / contribution. Acme: (550,000 + 200,000 + 80,000) / 1.25 = 664,000.","Book: 50,000 / 3 = 16,666.7, round UP to 16,667. Shoes: 50M / 30 = 1,666,667.","Margin % = profit / **price**. Mark-up % = profit / **cost**. $8 price, $5 cost: 37.5% vs 60%."]},{"h":"Key terms","kind":"terms","items":[{"k":"3/10, net/30","d":"3% off if paid in 10 days, full amount due in 30"},{"k":"Substitutes","d":"A price up, B demand up (coffee, tea)"},{"k":"Complements","d":"A price up, B demand down (printer, ink)"},{"k":"Elastic","d":"price sensitive; more substitutes = more elastic"}]},{"h":"Memory tricks","kind":"mem","items":["Margin on the Market price, mark-up on what you paid."]},{"h":"Traps","kind":"trap","items":["Coupon = retailer at the till. Rebate = manufacturer, after purchase.","Use VARIABLE cost in contribution; ad and profit go on top.","Mark-up is always bigger than margin.","Rivals follow a price cut within days = oligopoly.","Predatory/dumping = too low to hurt rivals. Excessive/captive = too high, buyer stuck (ATM fees)."]}]},"phl:w12":{"key":"phl:w12","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><line x1='20' y1='120' x2='280' y2='120' stroke='#1c1f24' stroke-width='1'/><line x1='20.0' y1='117' x2='20.0' y2='123' stroke='#1c1f24' stroke-width='1'/><line x1='85.0' y1='117' x2='85.0' y2='123' stroke='#1c1f24' stroke-width='1'/><line x1='150.0' y1='117' x2='150.0' y2='123' stroke='#1c1f24' stroke-width='1'/><line x1='215.0' y1='117' x2='215.0' y2='123' stroke='#1c1f24' stroke-width='1'/><line x1='280.0' y1='117' x2='280.0' y2='123' stroke='#1c1f24' stroke-width='1'/><text x='20.0' y='133' text-anchor='middle' fill='#1c1f24'>700<\/text><text x='85.0' y='133' text-anchor='middle' fill='#1c1f24'>600<\/text><text x='215.0' y='133' text-anchor='middle' fill='#1c1f24'>400<\/text><text x='280.0' y='133' text-anchor='middle' fill='#1c1f24'>300 BCE<\/text><text x='150.0' y='133' text-anchor='middle' font-weight='bold' fill='#1c1f24'>500 (Axial centre)<\/text><rect x='20.0' y='10' width='65.0' height='8' rx='2' fill='#1f5fbf'/><text x='89.0' y='17.5' fill='#1c1f24'>Thales: water<\/text><rect x='85.0' y='28' width='65.0' height='8' rx='2' fill='#1f5fbf'/><text x='154.0' y='35.5' fill='#1c1f24'>Pythagoras: number<\/text><rect x='127.2' y='46' width='39.0' height='8' rx='2' fill='#d9622b'/><text x='170.2' y='53.5' fill='#1c1f24'>Heraclitus: fire, Logos<\/text><rect x='140.2' y='64' width='42.2' height='8' rx='2' fill='#1e8f5a'/><text x='186.5' y='71.5' fill='#1c1f24'>Parmenides: Being<\/text><rect x='170.2' y='82' width='45.5' height='8' rx='2' fill='#8a8f98'/><text x='166.2' y='89.5' text-anchor='end' fill='#1c1f24'>Socrates: questions<\/text><rect x='176.0' y='100' width='58.5' height='8' rx='2' fill='#c43b3b'/><text x='172.0' y='107.5' text-anchor='end' fill='#1c1f24'>Democritus: atoms<\/text><\/svg>","cap":"Who lived when (BCE)"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><rect x='85' y='4' width='130' height='20' rx='3' fill='none' stroke='#1c1f24' stroke-width='1.2'/><text x='150' y='17' text-anchor='middle' font-weight='bold' fill='#1c1f24'>THE ONE behind the many?<\/text><line x1='30.5' y1='46' x2='150' y2='24' stroke='#8a8f98' stroke-width='1'/><rect x='2' y='46' width='57' height='44' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='30.5' y='59' text-anchor='middle' fill='#1c1f24'>Thales<\/text><text x='30.5' y='72' text-anchor='middle' fill='#1c1f24'>water<\/text><line x1='90.5' y1='46' x2='150' y2='24' stroke='#8a8f98' stroke-width='1'/><rect x='62' y='46' width='57' height='44' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='90.5' y='59' text-anchor='middle' fill='#1c1f24'>Pythagoras<\/text><text x='90.5' y='72' text-anchor='middle' fill='#1c1f24'>number<\/text><text x='90.5' y='83' text-anchor='middle' fill='#1c1f24'>and form<\/text><line x1='150.5' y1='46' x2='150' y2='24' stroke='#8a8f98' stroke-width='1'/><rect x='122' y='46' width='57' height='44' rx='3' fill='none' stroke='#1e8f5a' stroke-width='1.2'/><text x='150.5' y='59' text-anchor='middle' fill='#1c1f24'>Parmenides<\/text><text x='150.5' y='72' text-anchor='middle' fill='#1c1f24'>Being,<\/text><text x='150.5' y='83' text-anchor='middle' fill='#1c1f24'>unchanging<\/text><line x1='210.5' y1='46' x2='150' y2='24' stroke='#8a8f98' stroke-width='1'/><rect x='182' y='46' width='57' height='44' rx='3' fill='none' stroke='#d9622b' stroke-width='1.2'/><text x='210.5' y='59' text-anchor='middle' fill='#1c1f24'>Heraclitus<\/text><text x='210.5' y='72' text-anchor='middle' fill='#1c1f24'>fire +<\/text><text x='210.5' y='83' text-anchor='middle' fill='#1c1f24'>the Logos<\/text><line x1='270.5' y1='46' x2='150' y2='24' stroke='#8a8f98' stroke-width='1'/><rect x='242' y='46' width='57' height='44' rx='3' fill='none' stroke='#c43b3b' stroke-width='1.2' stroke-dasharray='3 2'/><text x='270.5' y='59' text-anchor='middle' fill='#1c1f24'>Democritus<\/text><text x='270.5' y='72' text-anchor='middle' fill='#1c1f24'>atoms<\/text><text x='270.5' y='83' text-anchor='middle' fill='#1c1f24'>+ void<\/text><text x='150' y='108' text-anchor='middle' fill='#1c1f24'>The MANY: wood, a rabbit, a river, the stars, you<\/text><text x='150' y='124' text-anchor='middle' fill='#1c1f24'>Dashed: Democritus is not strictly a pre-Socratic<\/text><\/svg>","cap":"One question, five answers"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Ontological turn**: from \"how did it begin?\" (cosmology, myth) to \"what IS it?\" (ontology). Birth of Western philosophy, started by Thales.","**Mythos** = stories about gods told by prophets and poets. **Logos** = reasoned, natural explanation anyone can study.","**Axial Period** (Karl Jaspers): ~800 to 200 BCE, centred ~500 BCE. Deep reflection appears **independently** in China (Confucius, Lao-tzu), India (Upanishads, Buddha), Persia (Zarathustra), Israel (prophets), Greece.","Big pre-Socratic question: is there **one** thing behind the **many**?","Early philosophers risked charges of **impiety** (undermining religion), sometimes execution."]},{"h":"Key table","kind":"table","rows":[["Thinker","Answer","Key point"],["Thales","water","first natural, not mythical, explanation"],["Pythagoras","number, form","reality is mathematical; golden ratio ~0.618"],["Parmenides","Being (the One)","A = A; nothing from nothing; change is illusion; reason over senses; creates ontology"],["Heraclitus","fire, Logos","constant change through conflict, held by a hidden rational order; same river twice"],["Democritus","atoms + void","move by necessity, no purpose"]]},{"h":"Key terms","kind":"terms","items":[{"k":"Telos","d":"purpose, end goal"},{"k":"Arete","d":"excellence that lets a thing fulfil its telos (sharp knife)"},{"k":"Socratic Method","d":"teach by questions so the student finds the truth"},{"k":"Anamnesis","d":"learning = recollection, the soul already knows"},{"k":"Sophists","d":"charged money; Socrates taught free"}]},{"h":"Memory tricks","kind":"mem","items":["**We Never Burn Fresh Apples** = Water, Number, Being, Fire, Atoms.","Cosmo = the start (\"began\"). Onto = is (\"what is\", \"nature of\")."]},{"h":"Traps","kind":"trap","items":["Thales matters for the **method** (natural causes), not for \"water\".","Pre-Socratics did not explain how the universe began: ontology, not cosmology.","Axial ideas did not spread from Greece; no contact.","Heraclitus is not chaos; leaving out the Logos is wrong.","Democritus denied telos and is not strictly pre-Socratic (Plato's time). \"All four\" = Thales, Pythagoras, Parmenides, Heraclitus."]}]},"phl:w3":{"key":"phl:w3","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><rect x='6' y='6' width='64' height='46' rx='3' fill='none' stroke='#c43b3b' stroke-width='1.2'/><text x='38' y='19' text-anchor='middle' font-weight='bold' fill='#1c1f24'>1 Suffering<\/text><text x='38' y='32' text-anchor='middle' fill='#1c1f24'>life is<\/text><text x='38' y='43' text-anchor='middle' fill='#1c1f24'>dislocated<\/text><line x1='70' y1='29' x2='76' y2='29' stroke='#1c1f24' stroke-width='1.2'/><polygon points='80,29 75,26 75,32' fill='#1c1f24'/><rect x='80' y='6' width='64' height='46' rx='3' fill='none' stroke='#d9622b' stroke-width='1.2'/><text x='112' y='19' text-anchor='middle' font-weight='bold' fill='#1c1f24'>2 Cause<\/text><text x='112' y='32' text-anchor='middle' fill='#1c1f24'>craving<\/text><text x='112' y='43' text-anchor='middle' fill='#1c1f24'>(own desire)<\/text><line x1='144' y1='29' x2='150' y2='29' stroke='#1c1f24' stroke-width='1.2'/><polygon points='154,29 149,26 149,32' fill='#1c1f24'/><rect x='154' y='6' width='64' height='46' rx='3' fill='none' stroke='#1e8f5a' stroke-width='1.2'/><text x='186' y='19' text-anchor='middle' font-weight='bold' fill='#1c1f24'>3 Can end<\/text><text x='186' y='32' text-anchor='middle' fill='#1c1f24'>overcome by<\/text><text x='186' y='43' text-anchor='middle' fill='#1c1f24'>enlightenment<\/text><line x1='218' y1='29' x2='224' y2='29' stroke='#1c1f24' stroke-width='1.2'/><polygon points='228,29 223,26 223,32' fill='#1c1f24'/><rect x='228' y='6' width='64' height='46' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='260' y='19' text-anchor='middle' font-weight='bold' fill='#1c1f24'>4 The way<\/text><text x='260' y='32' text-anchor='middle' fill='#1c1f24'>Eightfold<\/text><text x='260' y='43' text-anchor='middle' fill='#1c1f24'>Path<\/text><line x1='260' y1='52' x2='260' y2='60' stroke='#1f5fbf' stroke-width='1.2'/><polygon points='260,64 257,59 263,59' fill='#1f5fbf'/><rect x='4' y='64' width='292' height='72' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='150' y='78' text-anchor='middle' font-weight='bold' fill='#1c1f24'>Eightfold Path (in order)<\/text><text x='42.0' y='98' text-anchor='middle' fill='#1c1f24'>1 Views<\/text><text x='113.3' y='98' text-anchor='middle' fill='#1c1f24'>2 Intent<\/text><text x='184.6' y='98' text-anchor='middle' fill='#1c1f24'>3 Speech<\/text><text x='255.89999999999998' y='98' text-anchor='middle' fill='#1c1f24'>4 Conduct<\/text><text x='42.0' y='120' text-anchor='middle' fill='#1c1f24'>5 Livelihood<\/text><text x='113.3' y='120' text-anchor='middle' fill='#1c1f24'>6 Effort<\/text><text x='184.6' y='120' text-anchor='middle' fill='#1c1f24'>7 Mindfulness<\/text><text x='255.89999999999998' y='120' text-anchor='middle' fill='#1c1f24'>8 Concentration<\/text><\/svg>","cap":"Four Noble Truths and the path"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><rect x='4' y='8' width='70' height='92' rx='3' fill='none' stroke='#1e8f5a' stroke-width='1.2'/><text x='39' y='22' text-anchor='middle' font-weight='bold' fill='#1c1f24'>START BANK<\/text><text x='39' y='40' text-anchor='middle' fill='#1c1f24'>ordinary life:<\/text><text x='39' y='52' text-anchor='middle' fill='#1c1f24'>dislocated,<\/text><text x='39' y='64' text-anchor='middle' fill='#1c1f24'>craving,<\/text><text x='39' y='76' text-anchor='middle' fill='#1c1f24'>restless<\/text><rect x='226' y='8' width='70' height='92' rx='3' fill='none' stroke='#1e8f5a' stroke-width='1.2'/><text x='261' y='22' text-anchor='middle' font-weight='bold' fill='#1c1f24'>OTHER BANK<\/text><text x='261' y='40' text-anchor='middle' fill='#1c1f24'>perfection<\/text><text x='261' y='52' text-anchor='middle' fill='#1c1f24'>everywhere<\/text><path d='M80 26 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0' fill='none' stroke='#1f5fbf' stroke-width='1'/><path d='M80 94 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0' fill='none' stroke='#1f5fbf' stroke-width='1'/><text x='150' y='40' text-anchor='middle' fill='#1c1f24'>Sangha = fellow passengers<\/text><circle cx='138' cy='54' r='3.5' fill='#d9622b'/><circle cx='150' cy='54' r='3.5' fill='#d9622b'/><circle cx='162' cy='54' r='3.5' fill='#d9622b'/><polygon points='118,60 182,60 172,72 128,72' fill='none' stroke='#d9622b' stroke-width='1.4'/><text x='150' y='85' text-anchor='middle' font-weight='bold' fill='#1c1f24'>Dharma = the boat<\/text><line x1='186' y1='66' x2='216' y2='66' stroke='#1c1f24' stroke-width='1.2'/><polygon points='220,66 215,63 215,69' fill='#1c1f24'/><text x='150' y='116' text-anchor='middle' fill='#1c1f24'>Buddha = the example that gives confidence<\/text><text x='150' y='131' text-anchor='middle' fill='#1c1f24'>At the end the river and both shores \"disappear\"<\/text><\/svg>","cap":"Crossing to the other bank"}],"sections":[{"h":"Core ideas","kind":"list","items":["Greek: reject myth for reason. Indian: **keep myths, make them rationally coherent**.","Three themes: appearance vs reality, the One and the Many, the nature of the self.","**Vedas** (c. 1200 to 400 BCE): external ritual, householder. **Upanishads** (c. 700 to 400 BCE): internal self-realization, renouncer.","**Siddhartha Gautama** (c. 563 to 483 BCE), rich lord's son, shielded in a palace. Four Passing Sights: old man, sick man, corpse, monk.","**Middle Way**: balance of householder and renouncer (monastic plus community life).","Original Buddhism: Empirical, Scientific (cause and effect, no miracles), Pragmatic, Therapeutic, Psychological, Egalitarian, Individual and community."]},{"h":"Numbers","kind":"box","items":["6 years meditating, 49 days under the Bo tree, 45 years teaching (9 months teach + 3 months retreat). ~1000 years big in India, then absorbed into Hinduism. ~350 million today."]},{"h":"Four forms","kind":"table","rows":[["Form","Key"],["Theravada, Little Raft","Arhat; monastic, personal Nirvana"],["Mahayana, Big Raft","Bodhisattva: delays own Nirvana to help all"],["Zen","Japan, Samurai: alertness, simplicity, focus"],["Vajrayana","Tibet, Dalai Lama"]]},{"h":"Key terms","kind":"terms","items":[{"k":"Impermanence","d":"everything keeps changing"},{"k":"Meditation","d":"let thoughts pass, no attaching"},{"k":"Emptiness","d":"shared source under individual identity. West: become an individual; Buddhism: dissolve into the universal"},{"k":"Dhammapada","d":"verses; water takes the cup's shape, so form changes, message stays"},{"k":"Path 5 to 8","d":"Livelihood: job brings out your best. Effort: steady, like a climber. Mindfulness: constant self-awareness. Concentration: calm mind, see underneath"}]},{"h":"Memory tricks","kind":"mem","items":["Sights **O S D M**: 3 problems, monk = answer.","**Every Student Passes Tests, Plus Extra Ideas** = 7 traits. Vedas = Visible, Upanishads = Unseen."]},{"h":"Traps","kind":"trap","items":["Truth 2 = your own craving. Truth 3 = overcome it, not satisfy it.","Dharma is the boat, not the shore. Sangha = people, not the goal.","Buddhism is not speculative, miraculous or metaphysical. The Buddha only looks contradictory."]}]},"phl:w4":{"key":"phl:w4","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><line x1='12' y1='36' x2='148' y2='36' stroke='#d9622b' stroke-width='1.2'/><line x1='12' y1='32' x2='12' y2='40' stroke='#d9622b' stroke-width='1'/><line x1='148' y1='32' x2='148' y2='40' stroke='#d9622b' stroke-width='1'/><line x1='152' y1='36' x2='288' y2='36' stroke='#1f5fbf' stroke-width='1.2'/><line x1='152' y1='32' x2='152' y2='40' stroke='#1f5fbf' stroke-width='1'/><line x1='288' y1='32' x2='288' y2='40' stroke='#1f5fbf' stroke-width='1'/><text x='80' y='14' text-anchor='middle' font-weight='bold' fill='#1c1f24'>VISIBLE realm<\/text><text x='80' y='26' text-anchor='middle' fill='#1c1f24'>opinion (doxa)<\/text><text x='220' y='14' text-anchor='middle' font-weight='bold' fill='#1c1f24'>INTELLIGIBLE realm<\/text><text x='220' y='26' text-anchor='middle' fill='#1c1f24'>knowledge (episteme)<\/text><line x1='10' y1='50' x2='290' y2='50' stroke='#1c1f24' stroke-width='2'/><line x1='10' y1='45' x2='10' y2='55' stroke='#1c1f24' stroke-width='1.5'/><line x1='80' y1='45' x2='80' y2='55' stroke='#1c1f24' stroke-width='1.5'/><line x1='150' y1='45' x2='150' y2='55' stroke='#1c1f24' stroke-width='1.5'/><line x1='220' y1='45' x2='220' y2='55' stroke='#1c1f24' stroke-width='1.5'/><line x1='290' y1='45' x2='290' y2='55' stroke='#1c1f24' stroke-width='1.5'/><text x='45' y='68' text-anchor='middle' font-weight='bold' fill='#1c1f24'>Eikasia<\/text><text x='45' y='80' text-anchor='middle' fill='#1c1f24'>imagining<\/text><text x='45' y='94' text-anchor='middle' fill='#1c1f24'>shadows,<\/text><text x='45' y='105' text-anchor='middle' fill='#1c1f24'>images<\/text><text x='115' y='68' text-anchor='middle' font-weight='bold' fill='#1c1f24'>Pistis<\/text><text x='115' y='80' text-anchor='middle' fill='#1c1f24'>belief<\/text><text x='115' y='94' text-anchor='middle' fill='#1c1f24'>physical<\/text><text x='115' y='105' text-anchor='middle' fill='#1c1f24'>things<\/text><text x='185' y='68' text-anchor='middle' font-weight='bold' fill='#1c1f24'>Dianoia<\/text><text x='185' y='80' text-anchor='middle' fill='#1c1f24'>thinking<\/text><text x='185' y='94' text-anchor='middle' fill='#1c1f24'>maths, from<\/text><text x='185' y='105' text-anchor='middle' fill='#1c1f24'>assumptions<\/text><text x='255' y='68' text-anchor='middle' font-weight='bold' fill='#1c1f24'>Noesis<\/text><text x='255' y='80' text-anchor='middle' fill='#1c1f24'>understanding<\/text><text x='255' y='94' text-anchor='middle' fill='#1c1f24'>the Forms<\/text><text x='255' y='105' text-anchor='middle' fill='#1c1f24'>(dialectic)<\/text><line x1='20' y1='118' x2='276' y2='118' stroke='#1e8f5a' stroke-width='1.2'/><polygon points='280,118 275,115 275,121' fill='#1e8f5a'/><text x='150' y='132' text-anchor='middle' fill='#1c1f24'>more clarity, more reality (top: the Good)<\/text><\/svg>","cap":"Plato's Divided Line"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><rect x='95' y='6' width='110' height='38' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='150' y='20' text-anchor='middle' font-weight='bold' fill='#1c1f24'>REASON: charioteer<\/text><text x='150' y='34' text-anchor='middle' fill='#1c1f24'>guides: wisdom<\/text><line x1='125' y1='44' x2='75' y2='78' stroke='#1c1f24' stroke-width='1'/><line x1='175' y1='44' x2='225' y2='78' stroke='#1c1f24' stroke-width='1'/><text x='150' y='64' text-anchor='middle' fill='#1c1f24'>reins<\/text><rect x='15' y='78' width='120' height='38' rx='3' fill='none' stroke='#d9622b' stroke-width='1.2'/><text x='75' y='92' text-anchor='middle' font-weight='bold' fill='#1c1f24'>SPIRIT: white horse<\/text><text x='75' y='106' text-anchor='middle' fill='#1c1f24'>acts, will: courage<\/text><rect x='165' y='78' width='120' height='38' rx='3' fill='none' stroke='#c43b3b' stroke-width='1.2'/><text x='225' y='92' text-anchor='middle' font-weight='bold' fill='#1c1f24'>APPETITE: dark horse<\/text><text x='225' y='106' text-anchor='middle' fill='#1c1f24'>desire: moderation<\/text><text x='150' y='133' text-anchor='middle' fill='#1c1f24'>Only reason creates harmony = health of the soul<\/text><\/svg>","cap":"Charioteer: the three-part soul"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Axial Age causes (7)**: political upheaval (Zhou breakup), religious inadequacy, coinage, elite, urbanization, second-order thinking, transcendence.","China: Shang (c. 1500) > Zhou (1046) > Spring and Autumn > Warring States (to 221 BCE) = turmoil that makes the **Hundred Schools**. Myths praise good rulers: Fuxi, Yellow Emperor, Yao, Shun, Yu.","**Confucius** justifies old ideals. **Mohists** practical. **School of Names** logic. **Zhuangzi** doubts logic: mind = mirror, \"thought fast\". Two birds = relative happiness; tortoise = freedom over status; butterfly = what is real?","**Plato**: Socrates's student, Aristotle's teacher, founded the Academy.","**Cave**: shadows = appearances, chains = habit, fire = fake light, climb = education, sun = the Good. Freed one returns, gets mocked.","**Thrasymachus**: justice = advantage of the stronger. Socrates: **reductio** with the crafty doctor shows an invalid pattern.","**Forms**: one Form behind many particular things, known by thought.","**JTB**: knowledge = belief + true + justified by logos. Opinion = blind man on the right road."]},{"h":"Key terms","kind":"terms","items":[{"k":"Sophists","d":"rhetoric to win, relativism, self-interest natural, appearance is reality"},{"k":"Dikaiosyne","d":"justice: first acting by nature, later laws and role"},{"k":"Nomos","d":"law, custom; Sophists: only conventional, arbitrary"},{"k":"Justice (4)","d":"good in itself and in results, soul works well, happiness, others' wellbeing"},{"k":"4 truths","d":"felt, told, reason (rationalism), senses (empiricism)"}]},{"h":"Memory tricks","kind":"mem","items":["Divided Line: **Every Philosopher Doubts Nearly** everything. Justice = **I-S-H-O**."]},{"h":"Traps","kind":"trap","items":["Order: Socrates > Plato > Aristotle. Plato founded the Academy.","Sun is not the fire. Courage = spirit, not appetite. Reason guides, it does not kill desire.","Empiricism = senses, rationalism = reason."]}]},"phl:w5":{"key":"phl:w5","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><line x1='150' y1='6' x2='150' y2='112' stroke='#8a8f98' stroke-width='1' stroke-dasharray='3 2'/><text x='75' y='14' text-anchor='middle' font-weight='bold' fill='#1c1f24'>VISIBLE world<\/text><text x='225' y='14' text-anchor='middle' font-weight='bold' fill='#1c1f24'>INTELLIGIBLE world<\/text><circle cx='75' cy='40' r='18' fill='none' stroke='#d9622b' stroke-width='1.6'/><text x='75' y='43' text-anchor='middle' font-weight='bold' fill='#1c1f24'>SUN<\/text><circle cx='225' cy='40' r='18' fill='none' stroke='#1f5fbf' stroke-width='1.6'/><text x='225' y='43' text-anchor='middle' font-weight='bold' fill='#1c1f24'>GOOD<\/text><text x='75' y='74' text-anchor='middle' fill='#1c1f24'>Job 1: lets eyes see<\/text><text x='225' y='74' text-anchor='middle' fill='#1c1f24'>Job 1: Forms knowable<\/text><text x='75' y='96' text-anchor='middle' fill='#1c1f24'>Job 2: things grow, be<\/text><text x='225' y='96' text-anchor='middle' fill='#1c1f24'>Job 2: Forms exist<\/text><text x='150' y='130' text-anchor='middle' font-weight='bold' fill='#1c1f24'>Good : Forms  =  sun : visible things<\/text><\/svg>","cap":"Sun analogy: two jobs each"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><text x='150' y='14' text-anchor='middle' fill='#1c1f24'>each level is explained by the next one up<\/text><line x1='60' y1='22' x2='236' y2='22' stroke='#8a8f98' stroke-width='1.2'/><polygon points='240,22 235,19 235,25' fill='#8a8f98'/><rect x='4' y='32' width='64' height='38' rx='3' fill='none' stroke='#8a8f98' stroke-width='1.2'/><text x='36' y='48' text-anchor='middle' font-weight='bold' fill='#1c1f24'>Particular<\/text><text x='36' y='61' text-anchor='middle' font-weight='bold' fill='#1c1f24'>things<\/text><text x='36' y='86' text-anchor='middle' fill='#1c1f24'>this painting<\/text><line x1='68' y1='51' x2='76' y2='51' stroke='#1c1f24' stroke-width='1.2'/><polygon points='80,51 75,48 75,54' fill='#1c1f24'/><rect x='80' y='32' width='64' height='38' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='112' y='48' text-anchor='middle' font-weight='bold' fill='#1c1f24'>The<\/text><text x='112' y='61' text-anchor='middle' font-weight='bold' fill='#1c1f24'>Forms<\/text><text x='112' y='86' text-anchor='middle' fill='#1c1f24'>Beauty Itself<\/text><line x1='144' y1='51' x2='152' y2='51' stroke='#1c1f24' stroke-width='1.2'/><polygon points='156,51 151,48 151,54' fill='#1c1f24'/><rect x='156' y='32' width='64' height='38' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='188' y='48' text-anchor='middle' font-weight='bold' fill='#1c1f24'>Higher<\/text><text x='188' y='61' text-anchor='middle' font-weight='bold' fill='#1c1f24'>Forms<\/text><text x='188' y='86' text-anchor='middle' fill='#1c1f24'>broader Forms<\/text><line x1='220' y1='51' x2='228' y2='51' stroke='#1c1f24' stroke-width='1.2'/><polygon points='232,51 227,48 227,54' fill='#1c1f24'/><rect x='232' y='32' width='64' height='38' rx='3' fill='none' stroke='#d9622b' stroke-width='1.2'/><text x='264' y='48' text-anchor='middle' font-weight='bold' fill='#1c1f24'>Form of<\/text><text x='264' y='61' text-anchor='middle' font-weight='bold' fill='#1c1f24'>the Good<\/text><text x='264' y='86' text-anchor='middle' fill='#1c1f24'>starting point<\/text><text x='150' y='112' text-anchor='middle' fill='#1c1f24'>The Good needs no further explanation:<\/text><text x='150' y='126' text-anchor='middle' fill='#1c1f24'>the chain stops at the top of the Divided Line<\/text><\/svg>","cap":"The chain of explanation"}],"sections":[{"h":"Core chain","kind":"box","items":["Mechanical explanation falls short > explain in terms of the good > the **Form of the Good**."]},{"h":"Core ideas","kind":"list","items":["**Form of the Good**: the top Form. Makes the other Forms **knowable** and makes them **exist**.","Sits at the **top of the Divided Line**: the \"starting point\". Each level is explained by a higher one; the Good needs no further explanation (self-evident).","**Sun analogy**: the Good is to ideas what the sun is to things you see. Sun lets eyes see and makes things grow; the Good makes Forms knowable and real.","Goodness \"**surpasses being in majesty and power**\" = more basic than existence itself.","**The catch**: Plato never defines the Good. Too hard, so he gives the sun comparison.","Links: in the Cave, the sun outside = the Good; at the top of the Divided Line."]},{"h":"Phaedo: where it comes from","kind":"table","rows":[["","Mechanical","In terms of the good"],["Asks","How does it work?","Why is it best?"],["Socrates in prison","bones and tendons placed so","judged it better to stay and accept the sentence"],["Anaxagoras","fell back on air, water","what Socrates hoped for"],["Verdict","true, not ultimate","ultimate, leads to the Good"]]},{"h":"Key terms","kind":"terms","items":[{"k":"Anaxagoras","d":"said \"Mind directs and causes everything\", then explained with physical stuff"},{"k":"Phaedo","d":"young Socrates loves science, is let down by Anaxagoras"}]},{"h":"Memory tricks","kind":"mem","items":["Sun: **see it and grow it**. Good: **know it and be it**."]},{"h":"Traps","kind":"trap","items":["Not one Form among many, not a god or person. It is at the top.","Both jobs: knowable AND exist. The Good is not the sun; it is an analogy.","Roles: Anaxagoras let Socrates down; Plato builds the Good. Mechanics is not false, just incomplete.","Plato does not define it as pleasure or knowledge. He does not define it at all."]}]},"sa:w1":{"key":"sa:w1","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><rect x='5.0' y='2' width='290' height='19' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='150' y='15' text-anchor='middle' fill='#1c1f24'>1 Clickstream: the What<\/text><rect x='19.0' y='24' width='262' height='19' rx='3' fill='none' stroke='#1e8f5a' stroke-width='1.2'/><text x='150' y='37' text-anchor='middle' fill='#1c1f24'>2 Multiple Outcomes: the How Much<\/text><rect x='33.0' y='46' width='234' height='19' rx='3' fill='none' stroke='#d9622b' stroke-width='1.2'/><text x='150' y='59' text-anchor='middle' fill='#1c1f24'>3 Experimentation and Testing: the Why<\/text><rect x='47.0' y='68' width='206' height='19' rx='3' fill='none' stroke='#d9622b' stroke-width='1.2'/><text x='150' y='81' text-anchor='middle' fill='#1c1f24'>4 Voice of Customer: the Why<\/text><rect x='61.0' y='90' width='178' height='19' rx='3' fill='none' stroke='#8a8f98' stroke-width='1.2'/><text x='150' y='103' text-anchor='middle' fill='#1c1f24'>5 Competitive Intel: the What Else<\/text><rect x='75.0' y='112' width='150' height='19' rx='3' fill='none' stroke='#c43b3b' stroke-width='1.2'/><text x='150' y='125' text-anchor='middle' fill='#1c1f24'>6 Insights: the Gold<\/text><text x='4' y='135' text-anchor='start' fill='#8a8f98'>lots of raw data<\/text><text x='296' y='135' text-anchor='end' fill='#8a8f98'>few actions<\/text><\/svg>","cap":"Web Analytics 2.0: huge clickstream boils down to a few insights"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><rect x='5' y='22' width='140' height='96' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><rect x='155' y='22' width='140' height='96' rx='3' fill='none' stroke='#c43b3b' stroke-width='1.2'/><text x='75' y='15' text-anchor='middle' fill='#1f5fbf' font-weight='bold'>Transformation<\/text><text x='225' y='15' text-anchor='middle' fill='#c43b3b' font-weight='bold'>Reinvention<\/text><text x='75' y='38' text-anchor='middle' fill='#1c1f24'>improve what exists<\/text><text x='75' y='50' text-anchor='middle' fill='#1c1f24'>better, faster, cheaper<\/text><text x='225' y='38' text-anchor='middle' fill='#1c1f24'>rethink the business<\/text><text x='225' y='50' text-anchor='middle' fill='#1c1f24'>new model, market, revenue<\/text><line x1='15' y1='60' x2='135' y2='60' stroke='#8a8f98' stroke-width='1.2'/><line x1='165' y1='60' x2='285' y2='60' stroke='#8a8f98' stroke-width='1.2'/><text x='75' y='74' text-anchor='middle' fill='#1c1f24'>Netflix: online DVD orders<\/text><text x='75' y='88' text-anchor='middle' fill='#1c1f24'>Amazon: automated warehouses<\/text><text x='75' y='102' text-anchor='middle' fill='#1c1f24'>Starbucks: mobile pay, loyalty<\/text><text x='225' y='74' text-anchor='middle' fill='#1c1f24'>Netflix: streaming, originals<\/text><text x='225' y='88' text-anchor='middle' fill='#1c1f24'>Amazon: AWS<\/text><text x='225' y='102' text-anchor='middle' fill='#1c1f24'>Tesla: car as software platform<\/text><text x='150' y='134' text-anchor='middle' fill='#8a8f98'>Test: did the same business improve, or did a new one appear?<\/text><\/svg>","cap":"Transformation vs reinvention"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Digital transformation**: making existing processes better, faster or more efficient using digital tools, across the whole company, not just IT (McKinsey: rewiring to create value by deploying tech at scale).","**Digital reinvention**: rethinking and rebuilding the business model, products or services; new markets or revenue streams. Disruption, not just improvement.","**6 keys to success**: strategy, talent, operating model, distributed technology, data, adoption/change management.","**Web analytics**: qualitative + quantitative data from your site and the competition, to continually improve the online experience and reach outcomes online and offline.","**AI transformation** builds on digital foundations: better decisions (predictive, automation), new models, personalized CX, efficiency, continuous innovation."]},{"h":"Web Analytics 2.0","kind":"table","rows":[["Component","Answers"],["Clickstream","What (page views, paths, CTR, time, entry/exit, referrer, conversions)"],["Multiple Outcomes","How much (revenue, cost, loyalty)"],["Experimentation","Why: test live, fail fast fail cheap"],["Voice of Customer","Why: surveys, interviews, usability"],["Competitive Intel","What else: benchmarks, gaps"],["Insights","Gold: so what do we do?"]]},{"h":"Memory tricks","kind":"mem","items":["Six keys = plan (strategy), people (talent, adoption), plumbing (op model, tech, data).","What, How much, Why, Why, What else, Gold.","AI = B-E-C-I-D-S: Build on digital, Enhance decisions, Create models, Improve CX, Drive efficiency, Support innovation."]},{"h":"Traps","kind":"trap","items":["Both use tech. Tell them apart by what changed: same business better = transformation; new model = reinvention.","Two components answer Why: Experimentation AND Voice of Customer.","Clickstream can't see silent needs, motives or context. VOC fills that gap.","Insights is the smallest ring, not the least important.","AI does not replace digital transformation, it builds on it.","Gen AI use must be disclosed or it is misconduct."]}]},"sa:w2":{"key":"sa:w2","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><rect x='20' y='20' width='60' height='24' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='50' y='36' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Home<\/text><text x='50' y='58' text-anchor='middle' fill='#1f5fbf'>10:00<\/text><rect x='110' y='20' width='60' height='24' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='140' y='36' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Page 2<\/text><text x='140' y='58' text-anchor='middle' fill='#1f5fbf'>10:01<\/text><rect x='200' y='20' width='60' height='24' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='230' y='36' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Page 3<\/text><text x='230' y='58' text-anchor='middle' fill='#1f5fbf'>10:05<\/text><line x1='80' y1='32' x2='106' y2='32' stroke='#8a8f98' stroke-width='1.2'/><polygon points='110,32 105,29 105,35' fill='#8a8f98'/><line x1='170' y1='32' x2='196' y2='32' stroke='#8a8f98' stroke-width='1.2'/><polygon points='200,32 195,29 195,35' fill='#8a8f98'/><line x1='260' y1='32' x2='286' y2='32' stroke='#c43b3b' stroke-width='1.2'/><polygon points='290,32 285,29 285,35' fill='#c43b3b'/><text x='275' y='24' text-anchor='middle' fill='#c43b3b'>Exit<\/text><text x='5' y='82' text-anchor='start' fill='#1c1f24' font-weight='bold'>Time on page (hit-based):<\/text><text x='50' y='98' text-anchor='middle' fill='#1c1f24'>1 min<\/text><text x='140' y='98' text-anchor='middle' fill='#1c1f24'>4 min<\/text><text x='230' y='98' text-anchor='middle' fill='#c43b3b'>0 min (no next hit)<\/text><text x='5' y='118' text-anchor='start' fill='#1c1f24'>Time on site = 10:05 - 10:00 = 5 min<\/text><text x='5' y='132' text-anchor='start' fill='#8a8f98'>GA4: sums active time, so last page counts, idle does not.<\/text><\/svg>","cap":"Fig 3.16: time on page from timestamps"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><rect x='5' y='52' width='58' height='26' rx='3' fill='none' stroke='#1c1f24' stroke-width='1.2'/><text x='34' y='68' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Session<\/text><rect x='95' y='8' width='110' height='26' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='150' y='24' text-anchor='middle' fill='#1c1f24'>Over 10 seconds?<\/text><line x1='63' y1='65' x2='80' y2='65' stroke='#8a8f98' stroke-width='1.2'/><line x1='80' y1='65' x2='80' y2='21' stroke='#8a8f98' stroke-width='1.2'/><line x1='80' y1='21' x2='91' y2='21' stroke='#8a8f98' stroke-width='1.2'/><polygon points='95,21 90,18 90,24' fill='#8a8f98'/><line x1='205' y1='21' x2='221' y2='21' stroke='#1e8f5a' stroke-width='1.2'/><polygon points='225,21 220,18 220,24' fill='#1e8f5a'/><text x='214' y='15' text-anchor='middle' fill='#1e8f5a'>yes<\/text><rect x='95' y='50' width='110' height='26' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='150' y='66' text-anchor='middle' fill='#1c1f24'>Key event?<\/text><line x1='63' y1='65' x2='80' y2='65' stroke='#8a8f98' stroke-width='1.2'/><line x1='80' y1='65' x2='80' y2='63' stroke='#8a8f98' stroke-width='1.2'/><line x1='80' y1='63' x2='91' y2='63' stroke='#8a8f98' stroke-width='1.2'/><polygon points='95,63 90,60 90,66' fill='#8a8f98'/><line x1='205' y1='63' x2='221' y2='63' stroke='#1e8f5a' stroke-width='1.2'/><polygon points='225,63 220,60 220,66' fill='#1e8f5a'/><text x='214' y='57' text-anchor='middle' fill='#1e8f5a'>yes<\/text><rect x='95' y='92' width='110' height='26' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='150' y='108' text-anchor='middle' fill='#1c1f24'>2+ page/screen views?<\/text><line x1='63' y1='65' x2='80' y2='65' stroke='#8a8f98' stroke-width='1.2'/><line x1='80' y1='65' x2='80' y2='105' stroke='#8a8f98' stroke-width='1.2'/><line x1='80' y1='105' x2='91' y2='105' stroke='#8a8f98' stroke-width='1.2'/><polygon points='95,105 90,102 90,108' fill='#8a8f98'/><line x1='205' y1='105' x2='221' y2='105' stroke='#1e8f5a' stroke-width='1.2'/><polygon points='225,105 220,102 220,108' fill='#1e8f5a'/><text x='214' y='99' text-anchor='middle' fill='#1e8f5a'>yes<\/text><rect x='225' y='34' width='70' height='28' rx='3' fill='none' stroke='#1e8f5a' stroke-width='1.2'/><text x='260' y='52' text-anchor='middle' fill='#1e8f5a' font-weight='bold'>Engaged<\/text><line x1='225' y1='21' x2='235' y2='34' stroke='#1e8f5a' stroke-width='1.2'/><line x1='225' y1='105' x2='235' y2='62' stroke='#1e8f5a' stroke-width='1.2'/><text x='260' y='98' text-anchor='middle' fill='#c43b3b'>all 3 no =<\/text><text x='260' y='110' text-anchor='middle' fill='#c43b3b' font-weight='bold'>Bounce (GA4)<\/text><text x='150' y='134' text-anchor='middle' fill='#8a8f98'>Any one yes is enough. Bounce rate = 100% - engagement rate<\/text><\/svg>","cap":"GA4 engaged session test (T-K-P)"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Clickstream** = trail of clicks (server logs, tags, analytics tools). Shows WHAT, never WHY.","**Metric** = number describing site events/trends. **KPI** = metric that measures progress vs an objective. Every KPI is a metric, not every metric a KPI.","**Visit (session)**: ends after **30 min of inactivity** (GA). No max length. Counted by Session ID.","**Unique visitors** = persistent cookie IDs (Client ID, User ID at login, App-instance ID). No cookies, no unique visitors.","GA = aggregated, pre-processed metrics. BigQuery = raw event-level data.","**Exit rate**: leaving from a page after any number of pages. Every bounce is an exit, not every exit a bounce."]},{"h":"Formulas","kind":"box","items":["Classic bounce rate = single-page sessions / total sessions x 100","GA4: engagement rate = engaged sessions / total x 100; bounce = 100% - engagement rate","Conversion rate = outcomes / unique visitors (or visits) x 100. Gym: 150 / 5,000 sessions = **3%**"]},{"h":"GDPR cookies","kind":"mem","items":["C-T-R-O-E: Consent first, Transparency, Record consent, Optional access, Easy withdrawal.","8 metrics: people (visits, visitors), time (page, site), actions (bounce, exit, conversion, engagement)."]},{"h":"Traps","kind":"trap","items":["30 min is inactivity, not total length.","5 people making 9 trips = 9 visits, 5 visitors. Phone + laptop or cleared cookies = 2 visitors.","High exit rate on a thank-you page is good; on checkout it is a problem.","Always name the denominator. Visits >= visitors, so per-visit rate is lower.","High time is not always happy: 9 frustrated minutes looks like engagement. Ask (VOC)."]}]},"sa:w3":{"key":"sa:w3","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><text x='150' y='10' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Site Usage (slide 7)<\/text><rect x='5' y='18' width='92' height='42' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='51' y='37' text-anchor='middle' fill='#1f5fbf' font-weight='bold' font-size='11'>49,111<\/text><text x='51' y='51' text-anchor='middle' fill='#1c1f24'>Visits<\/text><rect x='103' y='18' width='92' height='42' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='149' y='37' text-anchor='middle' fill='#1f5fbf' font-weight='bold' font-size='11'>157,476<\/text><text x='149' y='51' text-anchor='middle' fill='#1c1f24'>Pageviews<\/text><rect x='201' y='18' width='92' height='42' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='247' y='37' text-anchor='middle' fill='#1f5fbf' font-weight='bold' font-size='11'>3.21<\/text><text x='247' y='51' text-anchor='middle' fill='#1c1f24'>Pages / Visit<\/text><rect x='5' y='68' width='92' height='42' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='51' y='87' text-anchor='middle' fill='#1f5fbf' font-weight='bold' font-size='11'>57.78%<\/text><text x='51' y='101' text-anchor='middle' fill='#1c1f24'>Bounce Rate<\/text><rect x='103' y='68' width='92' height='42' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='149' y='87' text-anchor='middle' fill='#1f5fbf' font-weight='bold' font-size='11'>00:03:35<\/text><text x='149' y='101' text-anchor='middle' fill='#1c1f24'>Avg. Time on Site<\/text><rect x='201' y='68' width='92' height='42' rx='3' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='247' y='87' text-anchor='middle' fill='#1f5fbf' font-weight='bold' font-size='11'>65.01%<\/text><text x='247' y='101' text-anchor='middle' fill='#1c1f24'>% New Visits<\/text><text x='150' y='134' text-anchor='middle' fill='#1c1f24'>Check: 157,476 / 49,111 = 3.21 pages per visit<\/text><\/svg>","cap":"Primitive indicators: Site Usage panel"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><text x='5' y='12' text-anchor='start' fill='#1c1f24' font-weight='bold'>All sources: 357,912 visits (slide 8)<\/text><rect x='5.0' y='18' width='174.2' height='20' fill='#1f5fbf'/><rect x='179.2' y='18' width='61.2' height='20' fill='#1e8f5a'/><rect x='240.5' y='18' width='43.7' height='20' fill='#d9622b'/><rect x='284.2' y='18' width='10.8' height='20' fill='#8a8f98'/><text x='92.1' y='50' text-anchor='middle' fill='#1c1f24'>Search 60.08%<\/text><text x='209.79999999999998' y='50' text-anchor='middle' fill='#1c1f24'>Direct 21.12%<\/text><text x='295' y='62' text-anchor='end' fill='#1c1f24'>Referring 15.07%<\/text><text x='295' y='12' text-anchor='end' fill='#8a8f98'>Other 3.73%<\/text><line x1='262.25' y1='40' x2='262.25' y2='54' stroke='#d9622b' stroke-width='0.8'/><text x='5' y='84' text-anchor='start' fill='#1c1f24' font-weight='bold'>Search only: 84,120 visits (slide 9, different report)<\/text><rect x='5' y='90' width='226.4' height='20' fill='#c43b3b'/><rect x='231.4' y='90' width='63.6' height='20' fill='#1e8f5a'/><text x='118.21100808368996' y='122' text-anchor='middle' fill='#1c1f24'>Paid 65,678 (78.1%), 114 keywords<\/text><text x='263.21100808369' y='122' text-anchor='middle' fill='#1c1f24'>Organic 18,442<\/text><text x='263.21100808369' y='133' text-anchor='middle' fill='#1c1f24'>(21.9%)<\/text><\/svg>","cap":"Visitor acquisition: traffic sources"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Report** = collection of metrics, values and visualizations summarizing user activity (like a dashboard). Parts: metric (visits), value (412,000), visual (line chart).","**Primitive indicators** = snapshot of foundational metrics: Visits, Pageviews, Pages/Visit, Bounce Rate, Avg. Time on Site, % New Visits. 2 counts + 4 ratios/averages built from them.","**Visitor acquisition**: where visitors come from; a quick check on marketing investment.","**Top Entry Pages + bounce rate**: pages that break the promise that brought people in.","**Top Keywords + bounce rate**: shows intent you are not meeting (\"running shoes sale\" landing on a fashion page)."]},{"h":"Traffic sources","kind":"terms","items":[{"k":"Direct","d":"typed the URL (tools often add bookmarks)"},{"k":"Referring","d":"another site links to you"},{"k":"Search","d":"organic + paid via Google, Bing; often 1/3 to 1/2 of traffic"},{"k":"Paid","d":"you pay for clicks or impressions"},{"k":"Non-paid (organic)","d":"users find you naturally"}]},{"h":"Formulas","kind":"box","items":["Pages/Visit = pageviews / visits = 157,476 / 49,111 = **3.21**","Paid + non-paid = total search: 65,678 + 18,442 = **84,120**"]},{"h":"Memory tricks","kind":"mem","items":["Entry page = WHERE it broke; keyword = WHAT they wanted.","Presentation: context, data source, metrics, meaning, recommendations + limits."]},{"h":"Traps","kind":"trap","items":["Never call a number good or bad without a benchmark, goal or trend. 55% bounce: fine on a blog, bad on checkout.","Slides 8 and 9 are different reports (215,037 vs 84,120 search visits). Don't mix them.","Top entry pages without bounce rate only show where people landed, not if it worked.","78% paid search = growth stops when ad spend stops."]}]},"sa:w4":{"key":"sa:w4","figs":[{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><rect x='5' y='6' width='200.0' height='22' rx='2' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='105.0' y='21' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Added to cart: 1,000<\/text><rect x='5' y='44' width='120.0' height='22' rx='2' fill='none' stroke='#1f5fbf' stroke-width='1.2'/><text x='65.0' y='59' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Started checkout: 600<\/text><rect x='5' y='82' width='84.0' height='22' rx='2' fill='none' stroke='#1e8f5a' stroke-width='1.2'/><text x='47.0' y='97' text-anchor='middle' fill='#1c1f24' font-weight='bold'>Completed: 420<\/text><text x='130' y='47' text-anchor='start' fill='#c43b3b'>400 left: cart abandonment<\/text><text x='130' y='57' text-anchor='start' fill='#c43b3b'>1 - 600/1000 = 40%<\/text><text x='95' y='85' text-anchor='start' fill='#c43b3b'>180 left: checkout abandonment<\/text><text x='95' y='95' text-anchor='start' fill='#c43b3b'>1 - 420/600 = 30%<\/text><text x='5' y='134' text-anchor='start' fill='#8a8f98'>Made-up numbers. 580 of 1,000 cart adders never buy (58%).<\/text><\/svg>","cap":"Cart vs checkout abandonment funnel"},{"svg":"<svg viewBox='0 0 300 140' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='9'><text x='150' y='12' text-anchor='middle' fill='#1c1f24' font-weight='bold'>100 visitors by why they came (slide 24)<\/text><rect x='5' y='20' width='58' height='26' rx='3' fill='none' stroke='#8a8f98' stroke-width='1.2'/><text x='34' y='37' text-anchor='middle' fill='#1c1f24'>Jobs 20<\/text><rect x='63' y='20' width='58' height='26' rx='3' fill='none' stroke='#8a8f98' stroke-width='1.2'/><text x='92' y='37' text-anchor='middle' fill='#1c1f24'>Press 20<\/text><rect x='121' y='20' width='174' height='26' rx='3' fill='none' stroke='#1e8f5a' stroke-width='1.2'/><text x='208' y='37' text-anchor='middle' fill='#1e8f5a' font-weight='bold'>Product pages 60<\/text><line x1='121' y1='52' x2='295' y2='52' stroke='#1e8f5a' stroke-width='1.2'/><line x1='121' y1='48' x2='121' y2='56' stroke='#1e8f5a' stroke-width='1.2'/><line x1='295' y1='48' x2='295' y2='56' stroke='#1e8f5a' stroke-width='1.2'/><text x='208' y='66' text-anchor='middle' fill='#1e8f5a'>real opportunity: 60 convertible<\/text><text x='150' y='90' text-anchor='middle' fill='#1c1f24' font-weight='bold'>2 converted<\/text><text x='75' y='110' text-anchor='middle' fill='#8a8f98'>Raw: 2 / 100 = 2%<\/text><text x='225' y='110' text-anchor='middle' fill='#1e8f5a' font-weight='bold'>Convertible: 2 / 60 = 3.3%<\/text><text x='150' y='130' text-anchor='middle' fill='#1c1f24'>Missed pool is 58, not 98<\/text><\/svg>","cap":"Identify the convertible"}],"sections":[{"h":"Core ideas","kind":"list","items":["**Outcome** = what the site does for the business (order, lead, sign-up, task done). Visits and time are activity, not outcomes.","Start with \"Why does your business exist?\" Pick the **critical few**: goal 2 to 3, max 4.","**Task Completion Rate** = % finishing THEIR primary purpose. Best via on-exit survey.","**Loyalty** = how many times they come back. **Recency** = gap between visits.","**RSS subscribers** pull your content (vs push email); mostly invisible as visits.","**Valuable exits**: leaving via an ad, listing or referral click. Bad exit = bounce.","**Days/Visits to Purchase**: pizza = 1 visit, same day; car or mattress = weeks, many visits."]},{"h":"Formulas","kind":"box","items":["Conversion = outcomes / visitors (or visits) x 100. 1,200/50,000 sessions = 2.4%; 1,000/40,000 visitors = 2.5%","Cart abandon = (1 - started checkout / added to cart) x 100","Checkout abandon = (1 - completed / started checkout) x 100","SoS = brand searches / (brand + competitor searches) x 100, or brand traffic / category traffic","AOV = revenue / orders. Task completion: 260/400 = 65%. Valuable exits: 1,800/10,000 = 18%"]},{"h":"Memory tricks","kind":"mem","items":["Abandonment = 1 minus share that reached the next step.","Loyalty = Looping back (count); Recency = Rest between (time).","SoS can fall while searches grow: 12,000/40,000 = 30% to 13,200/49,600 = 26.6%."]},{"h":"Traps","kind":"trap","items":["SoS denominator includes YOU. Rivals only can exceed 100%.","Google Trends is 0 to 100 relative; Keyword Planner gives real volumes.","High conversion is not more money: AOV can move the other way.","Convertible rate is by intent, shown next to the raw rate, not instead of it.","Task completion is not conversion (finding opening hours counts)."]}]}};
  function opB(t){ return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
  function opBakedHtml(i, key, col){
    var h = '<div class="op-col"><div class="op-ch" style="background:' + OP_COL[i % 4] + '">' + esc(weekNames[key] || key) + '</div><div class="op-b">';
    (col.figs || []).forEach(function(f){ h += '<div class="op-fig">' + f.svg + (f.cap ? '<div class="op-cap">' + esc(f.cap) + '</div>' : '') + '</div>'; });
    (col.sections || []).forEach(function(s){
      h += '<div class="op-sec" data-k="' + esc(s.kind) + '"><div class="op-h">' + esc(s.h) + '</div>';
      var it = s.items || [];
      if(s.kind === 'list') h += '<ul>' + it.map(function(x){ return '<li>' + opB(x) + '</li>'; }).join('') + '</ul>';
      else if(s.kind === 'terms') h += '<ul>' + it.map(function(z){ return '<li><b>' + opB(z.k) + '</b>: ' + opB(z.d) + '</li>'; }).join('') + '</ul>';
      else if(s.kind === 'table'){ var r = s.rows || []; h += '<table class="op-tb">' + r.map(function(row, ri){ return '<tr>' + row.map(function(x){ return (ri ? '<td>' : '<th>') + opB(x) + (ri ? '</td>' : '</th>'); }).join('') + '</tr>'; }).join('') + '</table>'; }
      else { var cl = s.kind === 'mem' ? 'op-mem' : (s.kind === 'trap' ? 'op-trap' : 'op-box'); h += it.map(function(x){ return '<div class="' + cl + '">' + opB(x) + '</div>'; }).join(''); }
      h += '</div>';
    });
    return h + '</div></div>';
  }
  function opCourses(){ return Object.keys(COURSES).filter(function(k){ return k !== 'plan'; }); }
  function renderOnePager(w, data, c){
    var all = data.map(function(d){ return d.key; }), byKey = {}; data.forEach(function(d){ byKey[d.key] = d; });
    SH.sel = (SH.sel || []).filter(function(k){ return byKey[k]; });
    var keys = SH.sel.length ? SH.sel : all;
    var cl = el('div'); cl.appendChild(el('div', 'ex-lab', 'Course'));
    var cw = el('div', 'ex-chap'); cw.style.marginTop = '0';
    opCourses().forEach(function(k){
      var chip = el('button', 'ex-chip' + (k === c ? ' on' : ''), esc(COURSES[k].name)); chip.type = 'button'; chip.style.setProperty('--cc', COURSES[k].cc); chip.setAttribute('aria-pressed', k === c ? 'true' : 'false');
      chip.addEventListener('click', function(){ SH.course = k; SH.sel = []; SH.chap = {}; renderSheet(); }); cw.appendChild(chip);
    });
    cl.appendChild(cw); w.appendChild(cl);
    var hd = el('div', 'op-hd'); hd.appendChild(el('div', 'ex-lab', 'Chapters <span class="ex-def">tap in the order you want, ' + (SH.sel.length ? SH.sel.length + ' picked' : 'none picked means all') + ', four to a page</span>'));
    var tools = el('div', 'op-tools');
    [['Select all', function(){ SH.sel = all.slice(); }], ['Shuffle', function(){ var a = (SH.sel.length ? SH.sel : all).slice(); for(var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } SH.sel = a; }], ['Clear', function(){ SH.sel = []; }]].forEach(function(t){
      var b = el('button', 'op-tool', t[0]); b.type = 'button'; b.addEventListener('click', function(){ t[1](); renderSheet(); }); tools.appendChild(b);
    });
    hd.appendChild(tools); w.appendChild(hd);
    var grid = el('div', 'op-grid');
    all.forEach(function(k){
      var at = SH.sel.indexOf(k), card = el('button', 'op-card' + (at > -1 ? ' on' : ''), '<span class="op-no">' + (at > -1 ? at + 1 : '') + '</span><span>' + esc(weekNames[k] || k) + (OPB[k] ? '' : ' <em>quick version</em>') + '</span>');
      card.type = 'button'; card.style.setProperty('--cc', COURSES[c].cc); card.setAttribute('aria-pressed', at > -1 ? 'true' : 'false');
      card.addEventListener('click', function(){ var i = SH.sel.indexOf(k); if(i > -1) SH.sel.splice(i, 1); else SH.sel.push(k); renderSheet(); });
      grid.appendChild(card);
    });
    w.appendChild(grid);
    if(!keys.length){ w.appendChild(el('div', 'card due-card', '<p>There are no chapters here yet.</p>')); return; }
    var items = keys.map(function(k){ return { key: k, col: OPB[k] || opFast(c, k, byKey[k]) }; });
    var pagesN = Math.ceil(items.length / 4), title = COURSES[c].name + ' one-pager', pages = [], holder = el('div', 'op-pages');
    for(var p = 0; p < pagesN; p++){
      var sc = el('div', 'op-sc'), pg = opPageEl(c, items.slice(p * 4, p * 4 + 4), title, p + 1, pagesN); sc.appendChild(pg); holder.appendChild(sc); pages.push(pg);
    }
    w.appendChild(holder); pages.forEach(opFit); opScale();
    var bar = el('div', 'q-bar'); bar.style.marginTop = '18px';
    var base = (COURSES[c].name + ' one-pager').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
    var b1 = el('button', 'btn primary', 'Save as PDF'); b1.type = 'button'; b1.addEventListener('click', function(){ opSave('pdf', pages, base); });
    var b2 = el('button', 'btn', 'Save as photo'); b2.type = 'button'; b2.addEventListener('click', function(){ opSave('png', pages, base); });
    bar.appendChild(b1); bar.appendChild(b2); w.appendChild(bar);
  }
  function opGo(c, keys){
    OPV.busy = true; OPV.msg = 'Writing ' + keys.length + (keys.length > 1 ? ' columns' : ' column') + '…'; if(!$('#sheet').hidden) renderSheet();
    opWrite(c, keys, function(m){ OPV.msg = m; if(!$('#sheet').hidden) renderSheet(); }).then(function(r){
      OPV.busy = false; renderSheet();
      stToast(r.fail ? (r.done + ' written, ' + r.fail + ' did not work. Tap Write again.') : 'Done');
    }, function(e){ OPV.busy = false; renderSheet(); stToast(e && e.code === 'nosample' ? 'AI is not available here. The fast version still works.' : 'Could not write. Try again.'); });
  }
  window.addEventListener('resize', function(){ clearTimeout(window.__opT); window.__opT = setTimeout(opScale, 120); });

  function renderSheet(){
    var c = SH.course, w = $('#sh-body'); w.innerHTML='';
    var onKeys = Object.keys(SH.chap).filter(function(k){ return SH.chap[k]; });
    $('#sh-title').textContent = 'Cheat sheet · ' + (onKeys.length===1 ? (weekNames[onKeys[0]]||COURSES[c].name) : COURSES[c].name);
    var data = sheetData(c);
    if(!SH.opMode) SH.opMode = lsGet('s5v74-opmode') || 'fast';
    var vseg = el('div', 'op-seg', ''); vseg.style.marginBottom = '14px'; [['list', 'List'], ['op', 'One-pager']].forEach(function(m){ var b = el('button', (SH.view || 'list') === m[0] ? 'on' : '', '<b>' + m[1] + '</b>'); b.type = 'button'; b.addEventListener('click', function(){ SH.view = m[0]; renderSheet(); }); vseg.appendChild(b); });
    w.appendChild(vseg);
    if(SH.view === 'op'){ renderOnePager(w, data, c); return; }
    var b1 = el('div'); b1.appendChild(el('div','ex-lab','Show <span class="ex-def">leave empty for formulas, traps and tricks</span>'));
    var ch = el('div','ex-chips');
    SH_TYPES.forEach(function(t){
      var n = data.reduce(function(a,d){ return a + ((!onKeys.length || SH.chap[d.key]) ? d[t[0]].length : 0); }, 0);
      var chip = el('button','ex-chip'+(SH.types[t[0]]?' on':''), esc(t[1])+' <span class="ct">'+n+'</span>'); chip.type='button'; chip.setAttribute('aria-pressed', SH.types[t[0]]?'true':'false');
      chip.style.setProperty('--cc', COURSES[c].cc);
      chip.addEventListener('click', function(){ SH.types[t[0]] = !SH.types[t[0]]; renderSheet(); });
      ch.appendChild(chip);
    });
    b1.appendChild(ch);
    var cw = el('div','ex-chap');
    var allChip = el('button','ex-chip'+(SH.all?' on':''),'All chapters'); allChip.type='button'; allChip.setAttribute('aria-pressed', SH.all?'true':'false'); allChip.style.setProperty('--cc', COURSES[c].cc);
    allChip.addEventListener('click', function(){ SH.all = !SH.all; if(SH.all) SH.chap = {}; renderSheet(); });
    cw.appendChild(allChip);
    data.forEach(function(d){
      var chip = el('button','ex-chip'+(SH.chap[d.key]?' on':''), esc(weekNames[d.key]||d.key)); chip.type='button';
      chip.style.setProperty('--cc', COURSES[c].cc);
      chip.setAttribute('aria-pressed', SH.chap[d.key]?'true':'false');
      chip.addEventListener('click', function(){ SH.chap[d.key] = !SH.chap[d.key]; if(SH.chap[d.key]) SH.all = false; renderSheet(); });
      cw.appendChild(chip);
    });
    b1.appendChild(cw);
    b1.appendChild(el('div','section-sub','Pick one or more chapters, or All chapters. It is pulled from the chapter pages.'));
    var cl = el('button','ex-clean',''); cl.type='button'; cl.textContent='Clean all'; cl.setAttribute('aria-label','Clear everything'); cl.addEventListener('click', function(){ SH.chap = {}; SH.all = false; SH.types = {}; renderSheet(); }); b1.insertBefore(cl, b1.firstChild);
    w.appendChild(b1);
    var anyC = Object.keys(SH.chap).some(function(k){ return SH.chap[k]; }), plain = [], shown = 0;
    data.forEach(function(d){
      if(!SH.all && !anyC) return;
      if(anyC && !SH.chap[d.key]) return;
      var sec = el('div','sh-chap'); var head = el('h3',null,esc(weekNames[d.key]||d.key)); sec.appendChild(head);
      var any = false;
      plain.push('== '+(weekNames[d.key]||d.key)+' ==');
      SH_TYPES.forEach(function(t){
        if(!shTypes()[t[0]] || !d[t[0]].length) return;
        any = true;
        if(t[0]==='term'){
          var tl = el('div','sh-terms');
          d.term.forEach(function(x){ tl.appendChild(el('div','sh-term','<b>'+esc(x.t)+'</b><span>'+x.d+'</span>')); var tmp=document.createElement('div'); tmp.innerHTML=x.d; plain.push('- '+x.t+': '+tmp.textContent.trim()); shown++; });
          sec.appendChild(tl);
        } else {
          d[t[0]].forEach(function(n){ var cl = n.cloneNode(true); cl.classList.add('sh-co'); sec.appendChild(cl); plain.push('['+t[1]+'] '+n.textContent.replace(/\s+/g,' ').trim()); shown++; });
        }
      });
      if(any) w.appendChild(sec);
    });
    if(!shown) w.appendChild(el('div','card due-card','<p>'+((!SH.all && !anyC) ? 'Pick a chapter above, or tap All chapters.' : 'Nothing to show with these filters.')+'</p>'));
    var bar = el('div','q-bar'); bar.style.marginTop='22px';
    var cp = el('button','btn',''); cp.type='button'; cp.textContent='Copy as text';
    cp.addEventListener('click', function(){
      var txt = plain.join('\n');
      function done(){ cp.textContent='Copied'; setTimeout(function(){ cp.textContent='Copy as text'; }, 1600); }
      try{ navigator.clipboard.writeText(txt).then(done, function(){ cp.textContent='Select and copy not available'; }); }catch(e){ cp.textContent='Copy not available here'; }
    });
    bar.appendChild(cp); w.appendChild(bar);
  }

  /* ------------------------------------------------------------------ exam mode */
  var X = { sel:{}, chap:{}, count:null, mode:null, kinds:{mcq:false, written:false}, timed:null, mins:null, total:0, paused:false, list:[], i:0, res:[], t0:0, timer:null, left:0 };
  function examEl(){ return $('#exam'); }
  function openExam(opts){
    opts = opts||{};
    var e = examEl(); e.hidden=false; document.body.style.overflow='hidden';
    X.sel = {}; X.chap = {};
    if(opts.preset){
      opts.preset.forEach(function(k){ X.sel[k.split(':')[0]] = true; X.chap[k]=true; });
    } else if(opts.due || opts.misses){
      Object.keys(COURSES).forEach(function(c){ X.sel[c]=true; });
    }
    if(opts.due) X.mode='due'; else if(opts.misses) X.mode='missed'; else if(!opts.keepMode) X.mode=null;
    if(!opts.keepMode){ X.kinds={mcq:false,written:false}; X.count=null; X.timed=null; X.mins=null; }
    renderSetup();
    e.scrollTop = 0;
  }
  function exMode(){ return X.mode||'mixed'; }
  function exCount(){ return X.count===null||X.count===undefined ? 20 : X.count; }
  function exKinds(){ return (X.kinds.mcq||X.kinds.written) ? X.kinds : {mcq:true,written:true}; }
  function closeExam(){ X.paused=false; examEl().classList.remove('ex-paused'); examEl().hidden=true; document.body.style.overflow=''; clearInterval(X.timer); }
  function chapKeys(c){ return $$('.weektabs[data-scope="'+c+'"] .weektab:not([data-week="links"])').map(function(t){ return panelKey(c,t.dataset.week); }).concat(impKeys(c)); }
  function pool(){
    var anyChap = Object.keys(X.chap).some(function(k){ return X.chap[k]; });
    var now = Date.now();
    return Q.filter(function(q){
      if(!X.sel[q.course]) return false;
      if(anyChap && !X.chap[q.key]) return false;
      var isMcq = q.kind==='mcq' || q.kind==='multi' || q.kind==='num';
      var K=exKinds();
      if(isMcq && !K.mcq) return false;
      if(!isMcq && !K.written) return false;
      var r = S.prog[q.id], M=exMode();
      if(M==='due') return !!r && (r.t + BOX[r.b||0]*DAY) <= now;
      if(M==='missed') return !!r && r.s!=='ok';
      if(M==='new') return !r;
      return true;
    });
  }
  function renderSetup(){
    var w = $('#ex-body'); w.innerHTML='';
    $('#ex-title').textContent = 'Exam mode';
    var g = el('div','ex-grid');
    // courses
    var b1 = el('div'); b1.appendChild(el('div','ex-lab','Courses'));
    var ch = el('div','ex-chips');
    Object.keys(COURSES).forEach(function(c){
      var n = Q.filter(function(q){ return q.course===c; }).length;
      var chip = el('button','ex-chip'+(X.sel[c]?' on':''), esc(COURSES[c].name)+' <span class="ct">'+n+'</span>'); chip.type='button';
      chip.style.setProperty('--cc', COURSES[c].cc);
      chip.setAttribute('aria-pressed', X.sel[c]?'true':'false');
      chip.addEventListener('click', function(){ X.sel[c] = !X.sel[c]; if(!X.sel[c]) chapKeys(c).forEach(function(k){ delete X.chap[k]; }); renderSetup(); });
      ch.appendChild(chip);
    });
    b1.appendChild(ch);
    // chapters of selected courses
    var cwrap = el('div','ex-chap');
    Object.keys(COURSES).filter(function(c){ return X.sel[c]; }).forEach(function(c){
      chapKeys(c).forEach(function(k){
        var n = Q.filter(function(q){ return q.key===k; }).length; if(!n) return;
        var chip = el('button','ex-chip'+(X.chap[k]?' on':''), esc(weekNames[k]||k)+' <span class="ct">'+n+'</span>'); chip.type='button';
        chip.style.setProperty('--cc', COURSES[c].cc);
        chip.setAttribute('aria-pressed', X.chap[k]?'true':'false');
        chip.addEventListener('click', function(){ X.chap[k] = !X.chap[k]; renderSetup(); });
        cwrap.appendChild(chip);
      });
    });
    b1.appendChild(cwrap);
    b1.appendChild(el('div','section-sub', Object.keys(X.sel).some(function(c){ return X.sel[c]; }) ? 'Tap chapters to narrow it down, or leave them empty to use the whole course.' : 'Pick a course to start.'));
    var cl = el('button','ex-clean',''); cl.type='button'; cl.textContent='Clean all'; cl.setAttribute('aria-label','Clear everything'); cl.addEventListener('click', function(){ X.sel = {}; X.chap = {}; X.mode = null; X.kinds = {mcq:false, written:false}; X.count = null; X.timed = null; renderSetup(); }); b1.insertBefore(cl, b1.firstChild);
    g.appendChild(b1);
    // mode
    var b2 = el('div'); b2.appendChild(el('div','ex-lab','Which questions <span class="ex-def">leave empty for everything</span>'));
    var c2 = el('div','ex-chips');
    [['mixed','Everything, shuffled'],['due','Due for review'],['missed','Ones I missed'],['new','Not tried yet']].forEach(function(m){
      var chip = el('button','ex-chip'+(X.mode===m[0]?' on':''), m[1]); chip.type='button';
      chip.setAttribute('aria-pressed', X.mode===m[0]?'true':'false'); chip.addEventListener('click', function(){ X.mode = X.mode===m[0] ? null : m[0]; renderSetup(); });
      c2.appendChild(chip);
    });
    b2.appendChild(c2); g.appendChild(b2);
    // types + count + timer
    var b3 = el('div'); b3.appendChild(el('div','ex-lab','Question types <span class="ex-def">leave empty for both</span>'));
    var c3 = el('div','ex-chips');
    [['mcq','Multiple choice and numbers'],['written','Written (you mark yourself)']].forEach(function(k){
      var chip = el('button','ex-chip'+(X.kinds[k[0]]?' on':''), k[1]); chip.type='button';
      chip.setAttribute('aria-pressed', X.kinds[k[0]]?'true':'false'); chip.addEventListener('click', function(){ X.kinds[k[0]] = !X.kinds[k[0]]; renderSetup(); });
      c3.appendChild(chip);
    });
    b3.appendChild(c3); g.appendChild(b3);
    var b4 = el('div'); b4.appendChild(el('div','ex-lab','How many <span class="ex-def">leave empty for 20</span>'));
    var c4 = el('div','ex-chips');
    [10,20,40,0].forEach(function(n){
      var chip = el('button','ex-chip'+(X.count===n?' on':''), n? String(n) : 'All'); chip.type='button';
      chip.setAttribute('aria-pressed', X.count===n?'true':'false'); chip.addEventListener('click', function(){ X.count = X.count===n ? null : n; renderSetup(); });
      c4.appendChild(chip);
    });
    b4.appendChild(c4); g.appendChild(b4);
    var b5 = el('div'); b5.appendChild(el('div','ex-lab','Timer <span class="ex-def">leave empty for no timer</span>'));
    var c5 = el('div','ex-chips');
    var PRESETS = [[false,null,'No timer'],[true,null,'1 min per question'],[true,30,'30 min'],[true,60,'60 min'],[true,90,'90 min'],[true,120,'120 min (midterm)']];
    PRESETS.forEach(function(m){
      var on = X.timed===m[0] && (m[0]===false || (X.mins||null)===m[1]);
      var chip = el('button','ex-chip'+(on?' on':''), m[2]); chip.type='button'; chip.setAttribute('aria-pressed', on?'true':'false');
      chip.addEventListener('click', function(){ if(on){ X.timed=null; X.mins=null; } else { X.timed=m[0]; X.mins=m[1]; } renderSetup(); });
      c5.appendChild(chip);
    });
    var isPre = PRESETS.some(function(m){ return m[0]===true && m[1] && X.mins===m[1]; });
    var customOn = !!(X.timed && X.mins && !isPre);
    var cust = el('button','ex-chip ex-cust'+(customOn?' on':''), customOn ? 'Custom · '+X.mins+' min' : 'Custom time'); cust.type='button'; cust.setAttribute('aria-pressed', customOn?'true':'false');
    cust.addEventListener('click', function(){
      var edit = el('span','ex-chip ex-cust ex-cust-edit on','<input type="number" class="ex-cust-in" min="1" max="300" inputmode="numeric" placeholder="45" aria-label="Minutes for the exam"><span>min</span>');
      var inp = $('input', edit), done = false; if(customOn) inp.value = X.mins;
      function commit(){ if(done) return; done = true; var v = parseInt(inp.value,10); if(v>0){ X.timed = true; X.mins = Math.min(v,300); } renderSetup(); }
      inp.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); commit(); } else if(e.key==='Escape'){ done = true; renderSetup(); } });
      inp.addEventListener('blur', commit);
      c5.replaceChild(edit, cust); inp.focus(); inp.select();
    });
    c5.appendChild(cust);
    b5.appendChild(c5); g.appendChild(b5);
    var addb = el('button','ex-add','<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>Add your own questions'); addb.type='button'; addb.addEventListener('click', impOpen);
    w.appendChild(addb);
    w.appendChild(g);
    var avail = pool().length;
    var go2 = el('div','q-bar ex-start');
    var start = el('button','btn solid',''); start.type='button';
    var anySel = Object.keys(X.sel).some(function(c){ return X.sel[c]; });
    start.textContent = !anySel ? 'Pick a course to start' : avail ? 'Start · '+(exCount()? Math.min(exCount(), avail): avail)+' question'+((exCount()? Math.min(exCount(),avail):avail)>1?'s':'') : 'No questions match';
    start.disabled = !avail;
    start.addEventListener('click', startExam);
    go2.appendChild(start);
    if(anySel) go2.appendChild(el('span','hint', avail+' available with these settings'));
    w.appendChild(go2);
  }
  function exTick(){
    var t = $('#ex-timer'); if(!t) return;
    var sec = X.timed ? Math.max(X.left,0) : Math.floor((Date.now()-X.t0)/1000);
    t.textContent = Math.floor(sec/60)+':'+pad2(sec%60);
    var warn = X.timed ? Math.min(600, X.total*0.2) : 0;
    t.classList.toggle('warn', !!X.timed && sec <= warn && sec > 60);
    t.classList.toggle('hot', !!X.timed && sec <= 60);
  }
  function startExam(){
    var p = shuffle(pool());
    if(exCount()) p = p.slice(0, exCount());
    X.list = p; X.i = 0; X.res = []; X.t0 = Date.now();
    clearInterval(X.timer); X.paused = false; examEl().classList.remove('ex-paused');
    if(X.timed){
      X.total = X.mins ? Math.round(X.mins*60) : Math.round(p.length*60); X.left = X.total;
      X.timer = setInterval(function(){
        if(X.paused) return;
        X.left--; exTick();
        if(X.left<=0){ clearInterval(X.timer); finishExam(); }
      }, 1000);
    } else {
      X.total = 0;
      X.timer = setInterval(function(){
        if(X.paused){ X.t0 += 1000; return; }
        exTick();
      }, 1000);
    }
    renderQuestion();
  }
  function renderQuestion(){
    var q = X.list[X.i], w=$('#ex-body'); w.innerHTML='';
    $('#ex-title').textContent = 'Question '+(X.i+1)+' of '+X.list.length;
    var pr = el('div','ex-prog','<i></i>'); $('i',pr).style.width = Math.round(100*X.i/X.list.length)+'%'; w.appendChild(pr);
    var meta = el('div','ex-meta');
    var src = el('span','ex-src','<i></i>'+esc(COURSES[q.course].name)+' · '+esc(weekNames[q.key]||q.key));
    src.style.setProperty('--cc', COURSES[q.course].cc);
    meta.appendChild(src);
    var tmr = el('span','ex-timer',''); tmr.id='ex-timer'; tmr.setAttribute('role','timer'); meta.appendChild(tmr);
    var pz = el('button','ex-pause',''); pz.type='button'; pz.textContent = X.paused ? 'Resume' : 'Pause'; pz.setAttribute('aria-label', X.paused ? 'Resume the timer' : 'Pause the timer');
    pz.addEventListener('click', function(){ X.paused = !X.paused; examEl().classList.toggle('ex-paused', X.paused); pz.textContent = X.paused ? 'Resume' : 'Pause'; pz.setAttribute('aria-label', X.paused ? 'Resume the timer' : 'Pause the timer'); });
    meta.appendChild(pz);
    w.appendChild(meta);
    var card = el('div','ex-card'); var qc = el('div','q'); card.appendChild(qc); w.appendChild(card);
    var nextBar = el('div','q-bar'); nextBar.style.marginTop='18px';
    var nxt = el('button','btn solid',''); nxt.type='button'; nxt.textContent = X.i+1<X.list.length ? 'Next question' : 'See results'; nxt.hidden = true;
    nxt.addEventListener('click', function(){ X.i++; if(X.i>=X.list.length) finishExam(); else renderQuestion(); });
    var quit = el('button','btn',''); quit.type='button'; quit.textContent='End exam now'; quit.addEventListener('click', finishExam);
    nextBar.appendChild(nxt); nextBar.appendChild(quit); w.appendChild(nextBar);
    renderQ(qc, q, 'exam', { num:X.i+1, of:X.list.length, onAnswer:function(g){ X.res[X.i] = g; nxt.hidden=false; setTimeout(function(){ nxt.scrollIntoView({block:'nearest', behavior:'smooth'}); }, 50); } });
    exTick();
  }
  /* ------------------------------------------------------------------ results: encouraging hero, 3 tabs, simple next steps */
  function reducedMotion(){ return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function resBand(pct){
    if(pct >= 90) return { k:'top',   h:'Excellent work.' };
    if(pct >= 70) return { k:'great', h:'Great job!' };
    if(pct >= 50) return { k:'good',  h:'Good progress.' };
    return { k:'start', h:'Good start. This is how it sticks.' };
  }
  function resSub(b, ok, missedN, total, answered){
    var t;
    if(b.k === 'top') t = missedN ? 'You really know this. Keep it fresh and look at the '+missedN+' you missed.' : 'Nothing missed. Keep it fresh and the questions will come back on a schedule.';
    else if(b.k === 'great') t = 'Most of this is sticking. The '+missedN+' you missed are your quick wins.';
    else if(b.k === 'good') t = 'You are past halfway. The ones you missed show exactly what to look at next, and that is what practice is for.';
    else t = ok ? 'You got '+ok+' right, and those are locked in. The rest show you exactly where to look next.' : 'This was a first look. Every question you missed shows you where to look next.';
    if(answered < total) t += ' ' + (total-answered) + ' not answered.';
    return t;
  }
  function resMins(n){ return Math.max(1, Math.round(n*40/60)); }
  // the hero card: score ring, message, optional confetti
  function resHero(ok, total, answered, missedN, celebrate){
    var pct = total ? Math.round(100*ok/total) : 0, b = resBand(pct), low = pct < 50;
    var hero = el('div','res-hero t-'+b.k);
    var ring = el('div','res-ring'); ring.style.setProperty('--p', 0);
    var num = el('b','ex-big res-num',''), cap = el('small',null, low ? 'right out of '+total : ok+' of '+total);
    num.textContent = low ? '0' : '0%'; num.appendChild(cap); ring.appendChild(num);
    hero.appendChild(ring);
    hero.appendChild(el('div','res-msg','<h2>'+b.h+'</h2><p>'+esc(resSub(b, ok, missedN, total, answered))+'</p>'));
    function paint(f){ ring.style.setProperty('--p', (pct*f).toFixed(1)); num.firstChild.nodeValue = low ? String(Math.round(ok*f)) : Math.round(pct*f)+'%'; }
    if(reducedMotion()){ paint(1); }
    else {
      var t0 = null; paint(0);
      (function step(ts){ if(t0===null) t0 = ts; var f = Math.min(1,(ts-t0)/900), e = 1-Math.pow(1-f,3); paint(e); if(f<1) requestAnimationFrame(step); })(performance.now ? performance.now() : 0);
      if(celebrate && pct >= 70){
        var cols = ['#e03e3e','#f08a00','#e8c900','#12a06e','#2f6fe0','#8a4fd8'], cf = el('div','res-conf'); cf.setAttribute('aria-hidden','true');
        for(var i=0;i<26;i++){ var c = document.createElement('i'); c.style.cssText = '--x:'+(4+Math.round(i*3.7))+'%;--c:'+cols[i%6]+';--d:'+((i%9)*0.07).toFixed(2)+'s;--dx:'+(((i*37)%90)-45)+'px;--r:'+(((i*53)%540)-270)+'deg'; cf.appendChild(c); }
        hero.appendChild(cf); setTimeout(function(){ if(cf.parentNode) cf.parentNode.removeChild(cf); }, 2600);
      }
    }
    return hero;
  }
  function resStep(i, title, sub, btnText, fn){
    var li = el('li','res-step'); li.style.setProperty('--i', i);
    li.appendChild(el('div',null,'<b>'+esc(title)+'</b><span>'+esc(sub)+'</span>'));
    var b = el('button',null,btnText); b.type='button'; b.addEventListener('click', fn); li.appendChild(b);
    return li;
  }
  function resWhy(){ return el('div','res-why','<b>Quick fact:</b> trying to answer, even when you miss, helps you remember more than just rereading. Seeing the right answer right after is what makes it stick.'); }
  // short calm moment under every result: three slow breaths and a one-line motto
  var RES_MOTTOS = ['Progress, not perfect.','One question at a time.','You showed up. That counts.','Slow and steady wins.','Rest is part of studying.','Every try teaches something.','Be kind to yourself today.'];
  var resMottoIx = Math.floor(Math.random()*RES_MOTTOS.length);
  function resCalm(){
    var m = RES_MOTTOS[resMottoIx % RES_MOTTOS.length]; resMottoIx++;
    return el('div','res-calm','<i class="res-dot" aria-hidden="true"></i><div><b>Take 3 slow breaths</b><span>In for 4, out for 6.</span></div><p>'+esc(m)+'</p>');
  }
  function startRetry(list){
    X.list = shuffle(list); X.i=0; X.res=[]; X.t0=Date.now(); X.timed=false;
    clearInterval(X.timer); X.timer = setInterval(function(){ var s=Math.floor((Date.now()-X.t0)/1000), t=$('#ex-timer'); if(t) t.textContent=Math.floor(s/60)+':'+pad2(s%60); },1000);
    renderQuestion();
  }
  function weakestKey(list){
    var c = {}, best = null;
    list.forEach(function(q){ c[q.key] = (c[q.key]||0) + 1; if(best===null || c[q.key] > c[best]) best = q.key; });
    return best;
  }
  function finishExam(){
    clearInterval(X.timer);
    var w=$('#ex-body'); w.innerHTML=''; $('#ex-title').textContent='Results';
    var answered = X.res.filter(function(x){ return x; }).length, total = X.list.length;
    var ok = X.res.filter(function(x){ return x==='ok'; }).length;
    var pct = total ? Math.round(100*ok/total) : 0, low = pct < 50;
    var missed = X.list.filter(function(q,i){ return X.res[i]!=='ok'; });
    var box = el('div','ex-res res-anim');
    box.appendChild(resHero(ok, total, answered, missed.length, true));
    if(low) box.appendChild(resWhy());
    // tabs
    var tabs = el('div','res-tabs'); tabs.setAttribute('role','tablist');
    var panels = {};
    [['sum','Summary',0],['rev','To review',missed.length],['next','What’s next',0]].forEach(function(t, ix){
      var b = el('button', ix===0?'on':'', esc(t[1]) + (t[2] ? ' <em>'+t[2]+'</em>' : '')); b.type='button'; b.setAttribute('role','tab'); b.setAttribute('aria-selected', ix===0?'true':'false'); b.dataset.t = t[0];
      b.addEventListener('click', function(){
        $$('button', tabs).forEach(function(x){ var on = x===b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on?'true':'false'); });
        Object.keys(panels).forEach(function(k){ panels[k].hidden = (k !== t[0]); });
      });
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    // summary: bars per course
    var sum = el('div','res-panel'); panels.sum = sum;
    var by = {};
    X.list.forEach(function(q,i){ var bb=by[q.course]||(by[q.course]={n:0,ok:0}); bb.n++; if(X.res[i]==='ok') bb.ok++; });
    var bars = el('div','ex-bars');
    Object.keys(by).forEach(function(c){
      var p = Math.round(100*by[c].ok/by[c].n);
      var r = el('div','ex-bar','<span>'+esc(COURSES[c].name)+'</span><span class="tr"><i style="width:'+p+'%"></i></span><span class="tabular">'+by[c].ok+'/'+by[c].n+'</span>');
      r.style.setProperty('--cc', COURSES[c].cc); bars.appendChild(r);
    });
    sum.appendChild(bars);
    var part = X.res.filter(function(x){ return x==='part'; }).length;
    if(part) sum.appendChild(el('div','section-sub','Plus '+part+' answer'+(part>1?'s':'')+' that were partly right.'));
    box.appendChild(sum);
    // to review
    var rev = el('div','res-panel'); rev.hidden = true; panels.rev = rev;
    if(missed.length){
      var ml = el('div','ex-miss');
      missed.forEach(function(q){
        var t = document.createElement('div'); t.innerHTML = String(q.text).replace(/<[^>]+>/g,' ');
        var tx = (t.textContent||'').replace(/\s+/g,' ').trim();
        var b = el('button',null,'<span>'+esc(tx.slice(0,140))+(tx.length>140?'…':'')+'</span><small>'+esc(COURSES[q.course].name)+' · '+esc(weekNames[q.key]||q.key)+' · open in chapter</small>');
        b.type='button'; b.addEventListener('click', function(){ closeExam(); go(q.course, q.week, q.id); });
        ml.appendChild(b);
      });
      rev.appendChild(ml);
    } else rev.appendChild(el('div','section-sub','Nothing to review. Every question was right.'));
    box.appendChild(rev);
    // what's next: three short steps
    var nx = el('div','res-panel'); nx.hidden = true; panels.next = nx;
    var steps = el('ol','res-steps'), i = 0;
    var wk = missed.length ? weakestKey(missed) : null, wq = wk ? missed.filter(function(q){ return q.key===wk; })[0] : null;
    if(missed.length){
      var n = low ? Math.min(5, missed.length) : missed.length;
      steps.appendChild(resStep(i++, low ? 'Try just '+n+' of the ones you missed' : 'Retry the '+n+' you missed', (low ? 'Small on purpose, about ' : 'About ')+resMins(n)+' minutes'+(low?'':', no timer'), 'Start', function(){ startRetry(shuffle(missed).slice(0, n)); }));
      steps.appendChild(resStep(i++, 'Read '+(weekNames[wk]||wk), low ? 'Start with the first section only' : 'Where most of the misses came from', 'Open', function(){ closeExam(); go(wq.course, wq.week); }));
    } else {
      steps.appendChild(resStep(i++, 'Take another exam', 'Pick another course or chapter', 'Start', function(){ renderSetup(); }));
      steps.appendChild(resStep(i++, 'Make your cheat sheet', 'Pull the formulas and traps into one page', 'Open', function(){ var c = X.list[0] ? X.list[0].course : null; closeExam(); if(c) openSheet(c); }));
    }
    steps.appendChild(resStep(i++, low ? 'Take a break, then come back' : 'See you tomorrow', 'Your misses stay in the Plan tab under Due for review', 'Plan', function(){ closeExam(); go('plan'); }));
    nx.appendChild(steps); box.appendChild(nx);
    box.appendChild(resCalm());
    w.appendChild(box);
    $('#exam').scrollTop = 0;
  }

  /* ------------------------------------------------------------------ info & grades tab: moves the long hero text + grading card into its own tab */
  function buildInfo(cp){
    var c = cp.dataset.course; if(c==='plan') return;
    var hero = $('.hero', cp), gp = $('.grading-panel', cp), tg = $('.grading-toggle', cp), nav = $('.weektabs', cp);
    if(!hero || !nav) return;
    weekNames[c+':info'] = 'Info & grades';
    var wp = el('div','week-panel info-panel'); wp.dataset.week='info'; wp.dataset.key=c+':info'; wp.hidden=true;
    wp.style.setProperty('--tc', COURSES[c].cc);
    var main = el('div','wp-main'); wp.appendChild(main);
    var intro = el('div','info-intro');
    ['.lede','.infoline','.hero-meta'].forEach(function(sel){ var n=$(sel, hero); if(n) intro.appendChild(n); });
    var hasIntro = intro.children.length;
    if(hasIntro){ var sec0 = el('section'); sec0.id=c+'-info-about'; sec0.innerHTML='<div class="section-head"><h2>About this course</h2></div>'; sec0.appendChild(intro); main.appendChild(sec0); }
    if(gp){
      var sec = el('section'); sec.id=c+'-info-grades';
      sec.innerHTML='<div class="section-head"><h2>Grading and key dates</h2></div>';
      gp.hidden = false; sec.appendChild(gp); main.appendChild(sec);
    }
    $$('.timeline-card', gp||cp).forEach(function(n){ n.remove(); });
    if(DEADLINES.some(function(x){ return x.c===c; })){
      var st = el('section'); st.id=c+'-info-timeline';
      st.innerHTML='<div class="section-head"><h2>Timeline</h2></div><p class="section-sub">Every graded item in this course, in date order. Big dot = test or exam, ring = date still an estimate, grey = done.</p><div class="card tl2" id="'+c+'-tl"></div>';
      main.appendChild(st);
    }
    if(tg) tg.remove();
    var firstPanel = $('.week-panel', cp); firstPanel.parentNode.insertBefore(wp, firstPanel);
    var btn = el('button','weektab info-tab',''); btn.type='button'; btn.dataset.week='info'; btn.textContent='Info & grades';
    nav.insertBefore(btn, nav.firstChild);
  }

  /* ------------------------------------------------------------------ hero dates: past ones dim, the next one says how far away it is */
  function markDates(){
    $$('.course-panel').forEach(function(cp){
      var spans = $$('.infoline span[data-d]', cp), nextDone = false;
      spans.forEach(function(sp){
        var ds = daysUntil(sp.dataset.d);
        if(ds<0){ sp.classList.add('past'); }
        else if(!nextDone){
          nextDone = true; sp.classList.add('next');
          if(!sp.querySelector('.in')) sp.insertAdjacentHTML('beforeend',' <em class="in">'+(ds===0?'today':ds===1?'tomorrow':'in '+ds+' days')+'</em>');
        }
      });
    });
  }

  /* ------------------------------------------------------------------ boot */
  function boot(){
    // week tabs: labels + meters
    $$('.weektabs').forEach(function(nav){
      var scope = nav.dataset.scope;
      $$('.weektab', nav).forEach(function(tab){
        weekNames[panelKey(scope, tab.dataset.week)] = tab.textContent.trim();
        tab.insertAdjacentHTML('beforeend','<span class="mt" aria-hidden="true"><i></i></span><span class="nd" aria-hidden="true"></span>');
      });
    });
    // enhance panels
    $$('.course-panel').forEach(function(cp){
      var c = cp.dataset.course; if(c==='plan') return;
      $$('.week-panel', cp).forEach(function(p){ enhancePanel(p, c); });
    });
    // prev/next
    $$('.weektabs').forEach(function(nav){
      var scope = nav.dataset.scope, course = nav.closest('.course-panel');
      var tabs = $$('.weektab', nav); if(tabs.length<2) return;
      tabs.forEach(function(tab,i){
        var panel = $('.week-panel[data-week="'+tab.dataset.week+'"] .wp-main', course); if(!panel) return;
        var prevTab = tabs[i-1], nextTab = tabs[i+1];
        function lab(t){ return t.firstChild ? t.firstChild.textContent : t.textContent; }
        var row = el('div','week-nav');
        var pb = el('button','week-nav-btn prev',''); pb.type='button';
        if(prevTab){ pb.innerHTML='<span class="wn-arrow">‹</span><span class="wn-text"><span class="wn-label">Previous</span>'+esc(lab(prevTab))+'</span>'; pb.addEventListener('click', function(){ showWeek(scope, prevTab.dataset.week, {scroll:true}); }); }
        else { pb.disabled=true; pb.innerHTML='<span class="wn-arrow">‹</span><span class="wn-text"><span class="wn-label">Previous</span>Start of course</span>'; }
        var nb = el('button','week-nav-btn next',''); nb.type='button';
        if(nextTab){ nb.innerHTML='<span class="wn-text"><span class="wn-label">Next</span>'+esc(lab(nextTab))+'</span><span class="wn-arrow">›</span>'; nb.addEventListener('click', function(){ showWeek(scope, nextTab.dataset.week, {scroll:true}); }); }
        else { nb.disabled=true; nb.innerHTML='<span class="wn-text"><span class="wn-label">Next</span>End of course</span><span class="wn-arrow">›</span>'; }
        row.appendChild(pb); row.appendChild(nb); panel.appendChild(row);
      });
    });
    $$('.course-panel').forEach(buildInfo);
    chapInit();
    // tab handlers
    $('#course-pick').addEventListener('click', function(e){ e.stopPropagation(); if($('#coursetabs').classList.contains('open')) closePicker(); else openPicker(); });
    document.addEventListener('click', function(e){ if(!e.target.closest('#coursetabs') && !e.target.closest('#course-pick')) closePicker(); });
    $$('.coursetab').forEach(function(b){ b.addEventListener('click', function(){ showCourse(b.dataset.course, {scroll:true}); }); });
    $$('.weektab').forEach(function(b){ b.addEventListener('click', function(){ showWeek(b.closest('.weektabs').dataset.scope, b.dataset.week); }); });
    // grading toggles
    $$('.grading-toggle').forEach(function(btn){
      var panel = document.getElementById(btn.dataset.target); if(!panel) return;
      btn.addEventListener('click', function(){
        var willOpen = panel.hidden; panel.hidden = !willOpen; btn.setAttribute('aria-expanded', String(willOpen));
        lsSet('s5-grading-open-'+btn.dataset.target, willOpen?'1':'0');
      });
      if(lsGet('s5-grading-open-'+btn.dataset.target)==='1'){ panel.hidden=false; btn.setAttribute('aria-expanded','true'); }
    });
    // exam + notes wiring
    $('#open-exam').addEventListener('click', function(){ openExam({}); });
    $('#ex-close').addEventListener('click', closeExam);
    $('#plan-due-go').addEventListener('click', function(){ openExam({due:true}); });
    $('#open-sheet').addEventListener('click', function(){ openSheet(cur.course); });
    $('#sh-close').addEventListener('click', closeSheet);
    wireNotes();
    document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ closePicker(); if(!$('#exam').hidden) closeExam(); else if(!$('#sheet').hidden) closeSheet(); } });
    // restore
    var sc = lsGet('s5-course');
    Object.keys(COURSES).forEach(function(c){
      var w = lsGet('s5-week-'+c);
      if(w && $('.course-panel[data-course="'+c+'"] .weektab[data-week="'+w+'"]')) showWeek(c, w);
    });
    var start = (sc && $('.coursetab[data-course="'+sc+'"]')) ? sc : 'plan';
    showCourse(start, {silent:true});
    markDates(); markKeyDates();
    window.addEventListener('resize', function(){ clearTimeout(window.__tlT); window.__tlT=setTimeout(renderTimelines,120); });
    refreshAll();
    try{ impInit(); }catch(e){}
    try{ weekNavInit(); }catch(e){}
    try{ opLoad(); stkInit(); fontSet(lsGet('s5v70-font') || '', false); fabInit(); }catch(e){}
    initDb();
    window.__s5 = { S:S, Q:Q, go:go, openExam:openExam, openSheet:openSheet, renderPlan:renderPlan, panelStats:panelStats, readiness:readiness, X:X, finishExam:finishExam };
  }

  // jump to top / bottom
  (function(){
    var up=$('#jump-up'); if(!up) return;
    function se(){ return document.scrollingElement||document.documentElement; }
    function upd(){ up.classList.toggle('off', se().scrollTop<300); }
    up.addEventListener('click', function(){ window.scrollTo({top:0, behavior:'smooth'}); });
    window.addEventListener('scroll', upd, {passive:true}); window.addEventListener('resize', upd);
    setInterval(upd, 800); upd();
  })();
  boot();
})();
