// 决战之巅 · 赛事引擎（前端预览与服务器共用）
(function (root, factory) { const E = factory(); if (typeof module === 'object' && module.exports) module.exports = E; else root.DuelEngine = E; })(typeof self !== 'undefined' ? self : this, function () {
  const T = { next: 2600, vs: 3400, cards: 3000, cheer: 5200, blink: 800, result: 9000 };
  const VOTE_MS = 300000;
  const SEQ = ['next', 'vs', 'cards', 'cheer', 'blink', 'vote', 'result'];
  const lens = vm => [T.next, T.vs, T.cards, T.cheer, T.blink, vm || VOTE_MS, T.result];
  const total = S => lens(S.voteMs).reduce((a, b) => a + b, 0);
  const voteEnd = S => lens(S.voteMs).slice(0, 6).reduce((a, b) => a + b, 0);
  const err = m => { const e = new Error(m); e.user = true; return e; };
  function phaseOf(voteMs, e) {
    const l = lens(voteMs); let acc = 0;
    for (let i = 0; i < l.length; i++) { if (e < acc + l[i]) return { ph: SEQ[i], pe: e - acc, pd: l[i], left: acc + l[i] - e }; acc += l[i]; }
    return { ph: 'over', pe: e - acc, pd: 0, left: 0 };
  }
  function create() { return { v: 1, title: ['', ''], status: 'reg', regs: {}, rounds: [], order: [], cur: 0, t0: 0, voteMs: VOTE_MS, champion: '', endAt: 0 }; }
  const curM = S => { const o = S.status === 'live' && S.order[S.cur]; return o ? S.rounds[o[0]][o[1]] : null; };
  const cropOk = c => { if (!c || typeof c !== 'object') return null; const n = k => Math.min(1, Math.max(0, +c[k] || 0)); const o = { x: n('x'), y: n('y'), w: n('w'), h: n('h') }; return o.w > 0.02 && o.h > 0.02 ? o : null; };
  function register(S, id, name, mode, card, cheer, speech, crop) {
    if (mode !== 'play' && mode !== 'vote') throw err('无效的登记方式');
    const old = S.regs[id];
    if (S.status !== 'reg' && (mode === 'play' || (old && old.mode === 'play'))) throw err('赛事已开始，参赛登记已关闭');
    if (mode === 'play') {
      cheer = String(cheer || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!card) throw err('请上传设卡图片');
      if (!cheer) throw err('请写一句应援词');
      speech = String(speech || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!speech) throw err('请写一段胜利感言');
    }
    S.regs[id] = { id, name: String(name || id), mode, card: mode === 'play' ? String(card) : '', cheer: mode === 'play' ? cheer : '', speech: mode === 'play' ? speech : '', crop: mode === 'play' ? cropOk(crop) : null, at: old ? old.at : Date.now() };
  }
  function unregister(S, id) { if (S.status !== 'reg') throw err('赛事进行中，无法退出登记'); delete S.regs[id]; }
  function setTitle(S, a, b) { S.title = [String(a || '').trim().slice(0, 4), String(b || '').trim().slice(0, 4)]; }
  function start(S, now, rnd) {
    rnd = rnd || Math.random;
    if (S.status !== 'reg') throw err('赛事已经开始');
    const ps = Object.values(S.regs).filter(r => r.mode === 'play').map(r => r.id);
    if (ps.length < 2) throw err('至少需要 2 名参赛者');
    for (let i = ps.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ps[i], ps[j]] = [ps[j], ps[i]]; }
    let P = 2; while (P < ps.length) P *= 2;
    const half = P / 2, byes = P - ps.length, byeAt = new Set();
    for (let k = 0; k < byes; k++) byeAt.add(Math.floor(k * half / byes));
    const r0 = [];
    for (let i = 0; i < half; i++) {
      if (byeAt.has(i)) { const a = ps.shift(); r0.push({ a, b: '', w: a, bye: 1, votes: {} }); }
      else r0.push({ a: ps.shift(), b: ps.shift(), w: '', votes: {} });
    }
    const rounds = [r0];
    for (let n = half / 2; n >= 1; n /= 2) rounds.push(Array.from({ length: n }, () => ({ a: '', b: '', w: '', votes: {} })));
    r0.forEach((M, i) => { if (M.bye && rounds[1]) rounds[1][i >> 1][i % 2 ? 'b' : 'a'] = M.w; });
    const order = [];
    rounds.forEach((rd, r) => rd.forEach((M, m) => { if (!M.bye) order.push([r, m]); }));
    Object.assign(S, { status: 'live', rounds, order, cur: 0, t0: now, champion: '', endAt: 0 });
  }
  function settle(M, rnd) {
    let va = 0, vb = 0; Object.values(M.votes).forEach(x => { if (x === 'a') va++; else if (x === 'b') vb++; });
    M.va = va; M.vb = vb;
    if (va !== vb) M.w = va > vb ? M.a : M.b; else { M.w = (rnd || Math.random)() < 0.5 ? M.a : M.b; M.tie = 1; }
  }
  function advance(S, now) {
    const [r, m] = S.order[S.cur], M = S.rounds[r][m];
    if (r + 1 < S.rounds.length) S.rounds[r + 1][m >> 1][m % 2 ? 'b' : 'a'] = M.w;
    S.cur++; S.t0 += total(S);
    if (S.cur >= S.order.length) { S.status = 'done'; S.champion = M.w; S.endAt = now; }
  }
  function tick(S, now, rnd) {
    let ch = false;
    while (S.status === 'live') {
      const M = curM(S); if (!M) break;
      const e = now - S.t0;
      if (e >= voteEnd(S) && !M.w) { settle(M, rnd); ch = true; }
      if (e >= total(S)) { advance(S, now); ch = true; } else break;
    }
    return ch;
  }
  function vote(S, uid, side, now, key) {
    const M = curM(S); if (!M) throw err('当前没有进行中的对决');
    if (key != null && +key !== S.cur) throw err('本场已结束');
    if (phaseOf(S.voteMs, now - S.t0).ph !== 'vote') throw err('投票未开放');
    if (!S.regs[uid]) throw err('请先登记');
    if (uid === M.a || uid === M.b) throw err('选手本场不可投票');
    if (side !== 'a' && side !== 'b') throw err('无效的选项');
    M.votes[uid] = side;
  }
  function skip(S, now) {
    const M = curM(S); if (!M) throw err('当前没有进行中的对决');
    const e = now - S.t0, ve = voteEnd(S);
    S.t0 = e < ve ? now - ve : now - total(S);
  }
  function reset(S, keepRegs) {
    Object.assign(S, { status: 'reg', rounds: [], order: [], cur: 0, t0: 0, champion: '', endAt: 0 });
    if (!keepRegs) S.regs = {};
  }
  function view(S, uid, isDisp, now, nameOf) {
    const nm = id => { const r = S.regs[id]; return nameOf ? nameOf(id, r && r.name) : (r && r.name) || id; };
    const M = curM(S), regs = Object.values(S.regs).sort((a, b) => a.at - b.at);
    const players = {};
    regs.filter(r => r.mode === 'play').forEach(r => { players[r.id] = { name: nm(r.id), card: r.card, cheer: r.cheer, speech: r.speech || '', crop: r.crop || null }; });
    const cnt = M2 => { let va = 0, vb = 0; Object.values(M2.votes || {}).forEach(x => { if (x === 'a') va++; else if (x === 'b') vb++; }); return [va, vb]; };
    const rounds = S.rounds.map(rd => rd.map(M2 => { const [va, vb] = cnt(M2); return { a: M2.a, b: M2.b, w: M2.w, bye: !!M2.bye, tie: !!M2.tie, va, vb }; }));
    const me = S.regs[uid];
    return {
      now, title: S.title, status: S.status, voteMs: S.voteMs, cur: S.cur, total: S.order.length, order: S.order, t0: S.t0,
      rounds, players, champion: S.champion,
      me: { id: uid, name: nm(uid), dispatch: !!isDisp, reg: me ? { mode: me.mode, card: me.card, cheer: me.cheer, speech: me.speech || '', crop: me.crop || null } : null, voted: M ? (M.votes[uid] || '') : '' },
      counts: { play: regs.filter(r => r.mode === 'play').length, vote: regs.filter(r => r.mode === 'vote').length },
      roster: isDisp ? regs.map(r => ({ id: r.id, name: nm(r.id), mode: r.mode, card: r.card })) : null
    };
  }
  return { T, VOTE_MS, phaseOf, create, curM, register, unregister, setTitle, start, tick, vote, skip, reset, view };
});
