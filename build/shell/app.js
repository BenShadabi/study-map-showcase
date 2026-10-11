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
    {course:'mkt', title:'Midterm · 26%', date:'2026-10-22', note:'Ch. 1–5, 7–9, 11', weeks:['mkt:w1','mkt:w2','mkt:w3','mkt:w4']},
    {course:'hr', title:'Midterm · Ch. 1–7', date:'2026-10-22', note:'In class', weeks:['hr:ch1','hr:ch2','hr:ch3','hr:ch4','hr:ch5','hr:ch6']}
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
    if(!dbState.ok){ setSaveStatus('Saved on this device'); return; }
    setSaveStatus('Saving…');
    dbState.dirty[kind]=true;
    clearTimeout(dbState.timers[kind]);
    dbState.timers[kind]=setTimeout(function(){ flushRemote(kind); }, 1400);
  }
  function flushRemote(kind){
    if(!dbState.ok) return;
    if(dbState.busy[kind]){ dbState.timers[kind]=setTimeout(function(){ flushRemote(kind); }, 800); return; }
    if(!dbState.dirty[kind]) return;
    dbState.dirty[kind]=false; dbState.busy[kind]=true;
    var ref = kind==='notes' ? dbState.notesRef : dbState.progRef;
    ref.set({ data: JSON.parse(JSON.stringify(kind==='notes'?S.notes:S.prog)), saved: Date.now() }).then(function(){
      dbState.busy[kind]=false; setSaveStatus('Saved · synced');
    }, function(){
      dbState.busy[kind]=false; setSaveStatus('Saved on this device');
    });
  }
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
        return Promise.all([dbState.notesRef.get(), dbState.progRef.get()]).then(function(snaps){
          dbState.ok = true;
          var n = snaps[0].exists ? snaps[0].data().data : null, p = snaps[1].exists ? snaps[1].data().data : null;
          var c1 = mergeRemote('notes', n), c2 = mergeRemote('progress', p);
          if(c1) saveLocal('notes'); if(c2) saveLocal('progress');
          // push anything only we have
          dbState.dirty.notes = true; dbState.dirty.progress = true;
          flushRemote('notes'); flushRemote('progress');
          setSaveStatus('Saved · synced');
          refreshAll(); refreshNotesUI();
          dbState.notesRef.onSnapshot(function(s){
            if(s.exists && !dbState.busy.notes){ if(mergeRemote('notes', s.data().data)){ saveLocal('notes'); refreshNotesUI(); } }
          }, function(){});
          dbState.progRef.onSnapshot(function(s){
            if(s.exists && !dbState.busy.progress){ if(mergeRemote('progress', s.data().data)){ saveLocal('progress'); refreshAll(); } }
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
    $('.pn', pk).textContent = a.textContent.trim();
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
    if(opts.scroll){ var nav=$('.weektabs[data-scope="'+scope+'"]', course); if(nav) nav.scrollIntoView({behavior:'smooth', block:'start'}); }
    var a = $('.weektabs[data-scope="'+scope+'"] .weektab.active', course); if(a && a.scrollIntoView) { try{ a.scrollIntoView({block:'nearest', inline:'nearest'}); }catch(e){} }
    onNav();
  }
  function go(c, w, qid){
    showCourse(c, {silent:false});
    if(w) showWeek(c, w);
    window.scrollTo({top:0});
    if(qid){
      setTimeout(function(){
        var n = $('.q[data-qid="'+qid+'"]'); if(n){ n.scrollIntoView({behavior:'smooth', block:'center'}); n.style.outline='2px solid var(--gold)'; setTimeout(function(){ n.style.outline=''; }, 2200); }
      }, 80);
    }
  }
  function onNav(){ refreshNotesUI(); updateFab(); setupSpy(); var sb=$('#open-sheet'); if(sb) sb.hidden = cur.course==='plan'; }

  /* ------------------------------------------------------------------ panel enhancement */
  var Q = [];   // all questions
  function enhancePanel(panel, course){
    var week = panel.dataset.week, key = panelKey(course, week);
    panel.dataset.key = key;
    var tc = COURSES[course] ? COURSES[course].cc : 'var(--gold)';
    panel.style.setProperty('--tc', tc);

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
        var rb = el('button','btn',''); rb.type='button'; rb.textContent='Reset this test'; rb.addEventListener('click', function(){ resetPanelQs(key); });
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
    return { id: key+'#'+(i+1), key: key, course: key.split(':')[0], week: key.split(':')[1], kind: kind, lvl: lvl,
             text: text ? text.innerHTML : '', exp: exp ? exp.innerHTML : '', opts: opts, tag: qe.dataset.tag || '' };
  }
  function qById(id){ for(var i=0;i<Q.length;i++) if(Q[i].id===id) return Q[i]; return null; }
  var KIND = { mcq:'Multiple choice', short:'Short answer', apply:'Apply it', explain:'Explain it' };

  function record(q, grade, conf){
    var r = S.prog[q.id] || {b:0, n:0, e:0};
    r.n = (r.n||0)+1; r.t = Date.now(); r.s = grade; r.c = conf || null;
    if(grade==='miss'){ r.m = (r.m||0)+1; if(conf==='sure') r.sw = (r.sw||0)+1; }
    if(grade==='ok'){ r.b = Math.min((r.b||0)+1, BOX.length-1); r.e = 1; }
    else if(grade==='miss'){ r.b = 0; }
    S.prog[q.id] = r;
    scheduleRemote('progress');
    refreshAll();
  }
  function resetPanelQs(key){
    Q.filter(function(q){ return q.key===key; }).forEach(function(q){ delete S.prog[q.id]; });
    scheduleRemote('progress');
    $$('.week-panel[data-key="'+key+'"] .q').forEach(function(qe){ renderQ(qe, qById(qe.dataset.qid), 'chapter'); });
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
    top.appendChild(el('span','q-kind', KIND[q.kind] || 'Question'));
    top.appendChild(el('span','q-lvl', ['','recall','understand','apply'][q.lvl] || ''));
    var st = el('span','q-state',''); top.appendChild(st);
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
    } else {
      var ta = el('textarea','q-write'); ta.placeholder = 'Write or say your answer first (optional), then check it…'; ta.rows = 2;
      ta.setAttribute('aria-label','Your answer');
      cont.appendChild(ta);
      var bar = el('div','q-bar');
      var show = el('button','btn solid',''); show.type='button'; show.textContent='Show model answer';
      bar.appendChild(show); cont.appendChild(bar);
      show.addEventListener('click', function(){
        if(answered) return; answered=true; show.hidden=true;
        var ex = el('div','q-exp', q.exp); cont.insertBefore(ex, bar);
        var hint = el('span','hint','How did you do?'); bar.appendChild(hint);
        [['ok','Got it','good'],['part','Partly','mid'],['miss','Missed it','bad']].forEach(function(g){
          var b = el('button','btn '+g[2],''); b.type='button'; b.textContent=g[1];
          b.addEventListener('click', function(){
            $$('.btn', bar).forEach(function(x){ x.disabled = true; });
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
  function refreshAll(){
    // week tab meters + panel score chips
    $$('.weektab').forEach(function(tab){
      var scope = tab.closest('.weektabs').dataset.scope, key = panelKey(scope, tab.dataset.week), s = panelStats(key);
      var m = $('.mt i', tab); if(m) m.style.width = (s.total? Math.round(100*s.ok/s.total):0)+'%';
      tab.classList.toggle('has-note', !!(S.notes[key] && S.notes[key].t && S.notes[key].t.trim()));
    });
    $$('.week-panel').forEach(function(p){
      var s = panelStats(p.dataset.key), sc = $('.st-score', p);
      if(sc) sc.textContent = s.ok+' / '+s.total+' correct' + (s.done<s.total ? ' · '+(s.total-s.done)+' not tried' : '');
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
  function updateFab(){
    var f=$('#notes-fab'); if(!f) return;
    var any = Object.keys(S.notes).some(function(k){ return S.notes[k] && S.notes[k].t && S.notes[k].t.trim(); });
    f.classList.toggle('has', any);
  }
  function refreshNotesUI(){
    var d = $('#notes-drawer'); updateFab();
    $$('.weektab').forEach(function(tab){
      var scope = tab.closest('.weektabs').dataset.scope, key = panelKey(scope, tab.dataset.week);
      tab.classList.toggle('has-note', !!(S.notes[key] && S.notes[key].t && S.notes[key].t.trim()));
    });
    if(!d || d.hidden) return;
    var k = ctxKey();
    $('#nd-ctx').textContent = ctxLabel(k);
    var ta = $('#nd-area'), list=$('#nd-list'), quick=$('#nd-quick'), foot=$('#nd-foot');
    $$('.nd-tabs button').forEach(function(b){ b.classList.toggle('on', b.dataset.t===drawerTab); });
    if(drawerTab==='this'){
      ta.hidden=false; quick.hidden=false; foot.hidden=false; list.hidden=true;
      var cv = (S.notes[k] && S.notes[k].t) || '';
      if(document.activeElement!==ta || ta.dataset.k!==k){ ta.value = cv; }
      ta.dataset.k = k;
    } else {
      ta.hidden=true; quick.hidden=true; foot.hidden=true; list.hidden=false;
      list.innerHTML='';
      var keys = Object.keys(S.notes).filter(function(x){ return S.notes[x] && S.notes[x].t && S.notes[x].t.trim(); });
      keys.sort(function(a,b){ return (S.notes[b].u||0)-(S.notes[a].u||0); });
      if(!keys.length) list.appendChild(el('div','nd-ctx','No notes yet. Notes you write while the prof is talking will show up here.'));
      keys.forEach(function(x){
        var it = el('button','nd-item','<b>'+esc(ctxLabel(x))+'</b><span>'+esc(S.notes[x].t)+'</span>'); it.type='button';
        it.addEventListener('click', function(){
          if(x==='general'){ showCourse('plan'); } else { var p=x.split(':'); go(p[0], p[1]); }
          drawerTab='this'; refreshNotesUI();
        });
        list.appendChild(it);
      });
    }
  }
  function openDrawer(){ var d=$('#notes-drawer'); d.hidden=false; refreshNotesUI(); var ta=$('#nd-area'); if(!ta.hidden) setTimeout(function(){ ta.focus(); }, 30); }
  function closeDrawer(){ $('#notes-drawer').hidden=true; }
  function wireNotes(){
    $('#notes-fab').addEventListener('click', function(){ var d=$('#notes-drawer'); if(d.hidden) openDrawer(); else closeDrawer(); });
    $('#nd-close').addEventListener('click', closeDrawer);
    $$('.nd-tabs button').forEach(function(b){ b.addEventListener('click', function(){ drawerTab=b.dataset.t; refreshNotesUI(); }); });
    var ta = $('#nd-area');
    ta.addEventListener('input', function(){
      var k = ta.dataset.k || ctxKey();
      S.notes[k] = { t: ta.value, u: Date.now() };
      scheduleRemote('notes'); updateFab();
      var tab = $('.weektabs[data-scope="'+k.split(':')[0]+'"] .weektab[data-week="'+k.split(':')[1]+'"]');
      if(tab) tab.classList.toggle('has-note', !!ta.value.trim());
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
    var m = $('#plan-mast'); m.innerHTML='';
    Object.keys(COURSES).forEach(function(c){
      var box = el('div','mast'); box.style.setProperty('--cc', COURSES[c].cc);
      box.appendChild(el('h3',null,'<i></i>'+esc(COURSES[c].name)));
      $$('.weektabs[data-scope="'+c+'"] .weektab:not([data-week="info"])').forEach(function(tab){
        var k = panelKey(c, tab.dataset.week), s = panelStats(k), pct = s.total? Math.round(100*s.ok/s.total):0;
        var row = el('button','mast-row','<span>'+esc(weekNames[k]||k)+'</span><span class="tr"><i style="width:'+pct+'%"></i></span><span class="pc">'+(s.total? pct+'%':'—')+'</span>');
        row.type='button'; row.addEventListener('click', function(){ go(c, tab.dataset.week); });
        box.appendChild(row);
      });
      m.appendChild(box);
    });
  }



  /* ------------------------------------------------------------------ deadlines + exams (plan tab) */
  var DEADLINES = [
    {d:'2026-10-15', c:'hr',    t:'Case exercise (Ch. 5 content)', w:5},
    {d:'2026-10-16', c:'micro', t:'Test 1 (Ch. 1–4)', w:25, ex:1},
    {d:'2026-10-16', e:'2026-10-19', c:'phl', t:'Test 1, online multiple choice', w:10, ex:1, lab:'Oct 16–19'},
    {d:'2026-10-21', c:'sa',    t:'A/B testing assignment', w:15, est:1},
    {d:'2026-10-22', c:'mkt',   t:'Midterm (Ch. 1–5, 7–9, 11)', w:26, ex:1},
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
      '<div class="today-chip"><b>'+today+'</b> answered today</div>';
    box.appendChild(head);
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
  var SH = { course:null, types:{math:true, trap:true, mem:true, def:false, term:false}, chap:{} };
  var SH_TYPES = [['math','Formulas and rules'],['trap','Exam traps'],['mem','Memory tricks'],['def','Definitions'],['term','Key terms']];
  function openSheet(c, w){
    if(!c || c==='plan') return;
    SH.course = c; SH.chap = {};
    if(w && w!=='info'){ SH.chap[panelKey(c,w)] = true; SH.types = {math:true, trap:true, mem:true, def:true, term:true}; }
    else { SH.types = {math:true, trap:true, mem:true, def:false, term:false}; }
    var e = $('#sheet'); e.hidden=false; document.body.style.overflow='hidden';
    renderSheet(); e.scrollTop = 0;
  }
  function closeSheet(){ $('#sheet').hidden=true; document.body.style.overflow=''; }
  function sheetData(c){
    var out = [];
    $$('.course-panel[data-course="'+c+'"] .week-panel:not([data-week="info"])').forEach(function(p){
      var k = panelKey(c, p.dataset.week), d = { key:k, math:[], trap:[], mem:[], def:[], term:[] };
      $$('.co-math, .co-trap, .co-mem, .co-def', p).forEach(function(n){
        ['math','trap','mem','def'].forEach(function(t){ if(n.classList.contains('co-'+t)) d[t].push(n); });
      });
      $$('details.flash', p).forEach(function(f){ var s=$('summary',f), a=$('p',f); if(s && a) d.term.push({t:s.textContent.trim(), d:a.innerHTML}); });
      out.push(d);
    });
    return out;
  }
  function renderSheet(){
    var c = SH.course, w = $('#sh-body'); w.innerHTML='';
    var onKeys = Object.keys(SH.chap).filter(function(k){ return SH.chap[k]; });
    $('#sh-title').textContent = 'Cheat sheet · ' + (onKeys.length===1 ? (weekNames[onKeys[0]]||COURSES[c].name) : COURSES[c].name);
    var data = sheetData(c);
    var b1 = el('div'); b1.appendChild(el('div','ex-lab','Show'));
    var ch = el('div','ex-chips');
    SH_TYPES.forEach(function(t){
      var n = data.reduce(function(a,d){ return a + ((!onKeys.length || SH.chap[d.key]) ? d[t[0]].length : 0); }, 0);
      var chip = el('button','ex-chip'+(SH.types[t[0]]?' on':''), esc(t[1])+' <span class="ct">'+n+'</span>'); chip.type='button';
      chip.style.setProperty('--cc', COURSES[c].cc);
      chip.addEventListener('click', function(){ SH.types[t[0]] = !SH.types[t[0]]; renderSheet(); });
      ch.appendChild(chip);
    });
    b1.appendChild(ch);
    var cw = el('div','ex-chap');
    var anyOn = Object.keys(SH.chap).some(function(k){ return SH.chap[k]; });
    var allChip = el('button','ex-chip'+(anyOn?'':' on'),'All chapters'); allChip.type='button'; allChip.style.setProperty('--cc', COURSES[c].cc);
    allChip.addEventListener('click', function(){ SH.chap = {}; renderSheet(); });
    cw.appendChild(allChip);
    data.forEach(function(d){
      var chip = el('button','ex-chip'+(SH.chap[d.key]?' on':''), esc(weekNames[d.key]||d.key)); chip.type='button';
      chip.style.setProperty('--cc', COURSES[c].cc);
      chip.addEventListener('click', function(){ SH.chap[d.key] = !SH.chap[d.key]; renderSheet(); });
      cw.appendChild(chip);
    });
    b1.appendChild(cw);
    b1.appendChild(el('div','section-sub','Pulled from the chapter pages. Tap more than one chapter to combine them, or All chapters to see everything.'));
    w.appendChild(b1);
    var anyC = Object.keys(SH.chap).some(function(k){ return SH.chap[k]; }), plain = [], shown = 0;
    data.forEach(function(d){
      if(anyC && !SH.chap[d.key]) return;
      var sec = el('div','sh-chap'); var head = el('h3',null,esc(weekNames[d.key]||d.key)); sec.appendChild(head);
      var any = false;
      plain.push('== '+(weekNames[d.key]||d.key)+' ==');
      SH_TYPES.forEach(function(t){
        if(!SH.types[t[0]] || !d[t[0]].length) return;
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
    if(!shown) w.appendChild(el('div','card due-card','<p>Nothing to show with these filters.</p>'));
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
  var X = { sel:{}, chap:{}, count:20, mode:'mixed', kinds:{mcq:true, written:true}, timed:false, list:[], i:0, res:[], t0:0, timer:null, left:0 };
  function examEl(){ return $('#exam'); }
  function openExam(opts){
    opts = opts||{};
    var e = examEl(); e.hidden=false; document.body.style.overflow='hidden';
    X.sel = {}; X.chap = {};
    if(opts.preset){
      opts.preset.forEach(function(k){ X.sel[k.split(':')[0]] = true; X.chap[k]=true; });
    } else if(opts.due || opts.misses){
      Object.keys(COURSES).forEach(function(c){ X.sel[c]=true; });
    } else {
      Object.keys(COURSES).forEach(function(c){ X.sel[c]=true; });
    }
    if(opts.due) X.mode='due'; else if(opts.misses) X.mode='missed'; else if(!opts.keepMode) X.mode='mixed';
    renderSetup();
    e.scrollTop = 0;
  }
  function closeExam(){ examEl().hidden=true; document.body.style.overflow=''; clearInterval(X.timer); }
  function chapKeys(c){ return $$('.weektabs[data-scope="'+c+'"] .weektab').map(function(t){ return panelKey(c,t.dataset.week); }); }
  function pool(){
    var anyChap = Object.keys(X.chap).some(function(k){ return X.chap[k]; });
    var now = Date.now();
    return Q.filter(function(q){
      if(!X.sel[q.course]) return false;
      if(anyChap && !X.chap[q.key]) return false;
      var isMcq = q.kind==='mcq';
      if(isMcq && !X.kinds.mcq) return false;
      if(!isMcq && !X.kinds.written) return false;
      var r = S.prog[q.id];
      if(X.mode==='due') return !!r && (r.t + BOX[r.b||0]*DAY) <= now;
      if(X.mode==='missed') return !!r && r.s!=='ok';
      if(X.mode==='new') return !r;
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
        chip.addEventListener('click', function(){ X.chap[k] = !X.chap[k]; renderSetup(); });
        cwrap.appendChild(chip);
      });
    });
    b1.appendChild(cwrap);
    b1.appendChild(el('div','section-sub','Leave chapters unselected to include all of the selected courses.'));
    g.appendChild(b1);
    // mode
    var b2 = el('div'); b2.appendChild(el('div','ex-lab','Which questions'));
    var c2 = el('div','ex-chips');
    [['mixed','Everything, shuffled'],['due','Due for review'],['missed','Ones I missed'],['new','Not tried yet']].forEach(function(m){
      var chip = el('button','ex-chip'+(X.mode===m[0]?' on':''), m[1]); chip.type='button';
      chip.addEventListener('click', function(){ X.mode=m[0]; renderSetup(); });
      c2.appendChild(chip);
    });
    b2.appendChild(c2); g.appendChild(b2);
    // types + count + timer
    var b3 = el('div'); b3.appendChild(el('div','ex-lab','Question types'));
    var c3 = el('div','ex-chips');
    [['mcq','Multiple choice'],['written','Written (self-graded)']].forEach(function(k){
      var chip = el('button','ex-chip'+(X.kinds[k[0]]?' on':''), k[1]); chip.type='button';
      chip.addEventListener('click', function(){ X.kinds[k[0]] = !X.kinds[k[0]]; if(!X.kinds.mcq && !X.kinds.written) X.kinds[k[0]]=true; renderSetup(); });
      c3.appendChild(chip);
    });
    b3.appendChild(c3); g.appendChild(b3);
    var b4 = el('div'); b4.appendChild(el('div','ex-lab','How many'));
    var c4 = el('div','ex-chips');
    [10,20,40,0].forEach(function(n){
      var chip = el('button','ex-chip'+(X.count===n?' on':''), n? String(n) : 'All'); chip.type='button';
      chip.addEventListener('click', function(){ X.count=n; renderSetup(); });
      c4.appendChild(chip);
    });
    var tm = el('button','ex-chip'+(X.timed?' on':''), 'Timed (about 1 min each)'); tm.type='button';
    tm.addEventListener('click', function(){ X.timed=!X.timed; renderSetup(); });
    c4.appendChild(tm);
    b4.appendChild(c4); g.appendChild(b4);
    w.appendChild(g);
    var avail = pool().length;
    var go2 = el('div','q-bar'); go2.style.marginTop='26px';
    var start = el('button','btn solid',''); start.type='button';
    start.textContent = avail ? 'Start · '+(X.count? Math.min(X.count, avail): avail)+' question'+((X.count? Math.min(X.count,avail):avail)>1?'s':'') : 'No questions match';
    start.disabled = !avail;
    start.addEventListener('click', startExam);
    go2.appendChild(start);
    go2.appendChild(el('span','hint', avail+' available with these settings'));
    w.appendChild(go2);
  }
  function startExam(){
    var p = shuffle(pool());
    if(X.count) p = p.slice(0, X.count);
    X.list = p; X.i = 0; X.res = []; X.t0 = Date.now();
    clearInterval(X.timer);
    if(X.timed){
      X.left = Math.round(p.length*60);
      X.timer = setInterval(function(){
        X.left--; var t=$('#ex-timer'); if(t) t.textContent = Math.floor(X.left/60)+':'+pad2(X.left%60);
        if(X.left<=0){ clearInterval(X.timer); finishExam(); }
      }, 1000);
    } else {
      X.timer = setInterval(function(){
        var s=Math.floor((Date.now()-X.t0)/1000), t=$('#ex-timer'); if(t) t.textContent = Math.floor(s/60)+':'+pad2(s%60);
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
    var tmr = el('span','ex-timer',''); tmr.id='ex-timer'; meta.appendChild(tmr);
    w.appendChild(meta);
    var card = el('div','ex-card'); var qc = el('div','q'); card.appendChild(qc); w.appendChild(card);
    var nextBar = el('div','q-bar'); nextBar.style.marginTop='18px';
    var nxt = el('button','btn solid',''); nxt.type='button'; nxt.textContent = X.i+1<X.list.length ? 'Next question' : 'See results'; nxt.hidden = true;
    nxt.addEventListener('click', function(){ X.i++; if(X.i>=X.list.length) finishExam(); else renderQuestion(); });
    var quit = el('button','btn',''); quit.type='button'; quit.textContent='End exam now'; quit.addEventListener('click', finishExam);
    nextBar.appendChild(nxt); nextBar.appendChild(quit); w.appendChild(nextBar);
    renderQ(qc, q, 'exam', { onAnswer:function(g){ X.res[X.i] = g; nxt.hidden=false; setTimeout(function(){ nxt.scrollIntoView({block:'nearest', behavior:'smooth'}); }, 50); } });
    var t = $('#ex-timer'); if(t) t.textContent = X.timed ? Math.floor(X.left/60)+':'+pad2(X.left%60) : '';
  }
  function finishExam(){
    clearInterval(X.timer);
    var w=$('#ex-body'); w.innerHTML=''; $('#ex-title').textContent='Results';
    var answered = X.res.filter(function(x){ return x; }).length, total = X.list.length;
    var ok = X.res.filter(function(x){ return x==='ok'; }).length;
    var part = X.res.filter(function(x){ return x==='part'; }).length;
    var box = el('div','ex-res');
    var pct = total ? Math.round(100*ok/total) : 0;
    box.appendChild(el('div',null,'<div class="ex-big">'+ok+' / '+total+'</div><div class="section-sub" style="margin:8px 0 0">'+pct+'% fully correct'+(part?' · '+part+' partly':'')+(answered<total? ' · '+(total-answered)+' not answered':'')+'</div>'));
    var by = {};
    X.list.forEach(function(q,i){ var b=by[q.course]||(by[q.course]={n:0,ok:0}); b.n++; if(X.res[i]==='ok') b.ok++; });
    var bars = el('div','ex-bars');
    Object.keys(by).forEach(function(c){
      var p = Math.round(100*by[c].ok/by[c].n);
      var r = el('div','ex-bar','<span>'+esc(COURSES[c].name)+'</span><span class="tr"><i style="width:'+p+'%"></i></span><span class="tabular">'+by[c].ok+'/'+by[c].n+'</span>');
      r.style.setProperty('--cc', COURSES[c].cc); bars.appendChild(r);
    });
    box.appendChild(bars);
    var missed = X.list.filter(function(q,i){ return X.res[i]!=='ok'; });
    if(missed.length){
      box.appendChild(el('div','ex-lab','To review ('+missed.length+')'));
      var ml = el('div','ex-miss');
      missed.forEach(function(q){
        var t = document.createElement('div'); t.innerHTML = q.text;
        var b = el('button',null,'<span>'+esc((t.textContent||'').slice(0,140))+((t.textContent||'').length>140?'…':'')+'</span><small>'+esc(COURSES[q.course].name)+' · '+esc(weekNames[q.key]||q.key)+' · open in chapter</small>');
        b.type='button'; b.addEventListener('click', function(){ closeExam(); go(q.course, q.week, q.id); });
        ml.appendChild(b);
      });
      box.appendChild(ml);
    }
    var bar = el('div','q-bar');
    if(missed.length){
      var rt = el('button','btn solid',''); rt.type='button'; rt.textContent='Retry the ones I missed';
      rt.addEventListener('click', function(){
        X.list = shuffle(missed); X.i=0; X.res=[]; X.t0=Date.now(); X.timed=false;
        clearInterval(X.timer); X.timer = setInterval(function(){ var s=Math.floor((Date.now()-X.t0)/1000), t=$('#ex-timer'); if(t) t.textContent=Math.floor(s/60)+':'+pad2(s%60); },1000);
        renderQuestion();
      });
      bar.appendChild(rt);
    }
    var nw = el('button','btn',''); nw.type='button'; nw.textContent='New exam'; nw.addEventListener('click', function(){ renderSetup(); });
    var cl = el('button','btn',''); cl.type='button'; cl.textContent='Close'; cl.addEventListener('click', closeExam);
    bar.appendChild(nw); bar.appendChild(cl); box.appendChild(bar);
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
    $('#open-sheet').addEventListener('click', function(){ openSheet(cur.course, cur.week); });
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
    markDates();
    refreshAll();
    initDb();
    window.__s5 = { S:S, Q:Q, go:go, openExam:openExam, openSheet:openSheet, renderPlan:renderPlan, panelStats:panelStats, readiness:readiness };
  }

  // jump to top / bottom
  (function(){
    var up=$('#jump-up'), dn=$('#jump-down'); if(!up||!dn) return;
    function se(){ return document.scrollingElement||document.documentElement; }
    function upd(){ var e=se(), y=e.scrollTop, max=e.scrollHeight-e.clientHeight;
      up.classList.toggle('off', y<300); dn.classList.toggle('off', max-y<300); }
    up.addEventListener('click', function(){ window.scrollTo({top:0, behavior:'smooth'}); });
    dn.addEventListener('click', function(){ var e=se(); window.scrollTo({top:e.scrollHeight, behavior:'smooth'}); });
    window.addEventListener('scroll', upd, {passive:true}); window.addEventListener('resize', upd);
    setInterval(upd, 800); upd();
  })();
  boot();
})();
