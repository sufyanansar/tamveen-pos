/* Guided camera for photographing delivery documents (phones and tablets).
   A frame shaped like the document guides the shot: a full A4 page, or a long narrow till receipt taken in parts
   from the top down. Each later part shows the bottom of the previous one faded at the top of the frame, so the
   parts overlap and the reader can join them. A few times a second the frame is checked for paper filling it,
   light and a steady hand; when all three hold, the frame turns green and the photo is taken by itself.
   The overlay lives in its own root so app re-renders never touch the running video. */
(function () {
  'use strict';

  const t = (s, v) => (window.TamveenT ? window.TamveenT(s, v) : s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const OVERLAP = 0.2; // share of the previous part shown again at the top of the frame
  const KINDS = { a4: 1.414, receipt: 0 }; // height / width; 0 means as tall as the screen allows

  let state = null; // { opts, kind, stream, video, parts: [{ blob, url, ghost }], auto, torch, timer, prev, okSince, armed, frame }

  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return v; };

  function root() {
    let el = document.getElementById('docscan-root');
    if (!el) { el = document.createElement('div'); el.id = 'docscan-root'; document.body.appendChild(el); }
    return el;
  }

  const ICON = {
    gallery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/></svg>',
    torch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 16l3.5-8 3.5 8M9.8 13h4.4"/></svg>',
    retake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/></svg>',
  };

  // Everything around the camera is kept small: one thin row on top, one row of icons below.
  function view() {
    return `<div class="cam-overlay ds" role="dialog" aria-modal="true" aria-label="${esc(t('Scan invoice'))}">
      <div class="ds-top"><button class="ds-x" data-ds="close" aria-label="${esc(t('Close'))}">✕</button><b id="ds-title"></b>
        <div class="ds-kinds" role="tablist">
          <button data-ds="kind" data-k="a4" role="tab">${esc(t('Full page'))}</button>
          <button data-ds="kind" data-k="receipt" role="tab">${esc(t('Long receipt'))}</button></div></div>
      <div class="cam-stage" id="ds-stage"><video playsinline muted autoplay></video>
        <div class="ds-frame" id="ds-frame"><img class="ds-ghost" id="ds-ghost" alt="" hidden><i></i><i></i><i></i><i></i></div>
        <div class="ds-hint" id="ds-hint" aria-live="polite"></div>
        <div class="ds-strip" id="ds-strip"></div>
        <div class="ds-flash" id="ds-flash"></div>
        <div class="cam-msg" id="ds-msg">${esc(t('Starting camera…'))}</div></div>
      <div class="ds-bar">
        <div class="ds-side">
          <label class="ds-ico" title="${esc(t('Gallery'))}" aria-label="${esc(t('Gallery'))}">${ICON.gallery}<input type="file" accept="image/*" multiple id="ds-file" hidden></label>
          <button class="ds-ico" data-ds="torch" id="ds-torch" title="${esc(t('Torch'))}" aria-label="${esc(t('Torch'))}" hidden>${ICON.torch}</button>
          <button class="ds-ico" data-ds="auto" id="ds-auto" title="${esc(t('Auto'))}" aria-label="${esc(t('Auto'))}">${ICON.auto}</button></div>
        <button class="ds-shutter" data-ds="shot" aria-label="${esc(t('Take photo'))}"></button>
        <div class="ds-side end">
          <button class="ds-ico" data-ds="retake" id="ds-retake" title="${esc(t('Retake last'))}" aria-label="${esc(t('Retake last'))}" hidden>${ICON.retake}</button>
          <button class="ds-done" data-ds="done" id="ds-done" disabled></button></div>
      </div></div>`;
  }

  const $ = (id) => document.getElementById(id);
  function setMsg(html, hide) { const m = $('ds-msg'); if (m) { m.innerHTML = html; m.style.display = hide ? 'none' : ''; } }
  function setHint(text, ok) { const h = $('ds-hint'); if (h) { h.textContent = text; h.classList.toggle('ok', !!ok); } }

  // Title, instructions, buttons and the frame for the current kind and part.
  function refresh() {
    const s = state, n = s.parts.length, rc = s.kind === 'receipt';
    $('ds-title').textContent = t(rc ? 'Part {n}' : 'Page {n}', { n: n + 1 });
    root().querySelectorAll('[data-ds="kind"]').forEach((b) => { b.classList.toggle('on', b.dataset.k === s.kind); b.disabled = n > 0 && b.dataset.k !== s.kind; });
    const done = $('ds-done'); done.disabled = !n; done.textContent = n ? t('Done ({n})', { n }) : t('Done');
    $('ds-auto').classList.toggle('on', s.auto);
    const ghost = $('ds-ghost'), last = s.parts[n - 1];
    if (rc && last && last.ghost) { ghost.src = last.ghost; ghost.hidden = false; } else ghost.hidden = true;
    $('ds-strip').innerHTML = s.parts.map((p, i) => `<span class="ds-thumb"><img src="${p.url}" alt=""><em>${i + 1}</em></span>`).join('');
    $('ds-retake').hidden = !n;
    layout();
  }

  // Places the frame in the middle of the camera view, shaped like the document.
  function layout() {
    const st = $('ds-stage'), fr = $('ds-frame'); if (!st || !fr) return;
    const W = st.clientWidth, H = st.clientHeight, ratio = KINDS[state.kind];
    let w, h;
    // Room above the frame for the hint, and below it for the photos taken so far.
    const top = 44, room = H - top - 60;
    if (ratio) { h = Math.min(room, W * 0.92 * ratio); w = h / ratio; } else { w = Math.min(W * 0.78, room / 1.5); h = room; }
    state.frame = { x: (W - w) / 2, y: top + (room - h) / 2, w, h, W, H };
    Object.assign(fr.style, { left: state.frame.x + 'px', top: state.frame.y + 'px', width: w + 'px', height: h + 'px' });
    $('ds-ghost').style.height = OVERLAP * 100 + '%';
  }

  // The frame's rectangle in video pixels (the video fills the stage like object-fit: cover), grown by pad.
  function videoRect(pad) {
    const v = state.video, f = state.frame, vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh || !f) return null;
    const k = Math.max(f.W / vw, f.H / vh), ox = (f.W - vw * k) / 2, oy = (f.H - vh * k) / 2;
    const px = f.w * pad, py = f.h * pad;
    const x = Math.max(0, (f.x - px - ox) / k), y = Math.max(0, (f.y - py - oy) / k);
    return { x, y, w: Math.min(vw - x, (f.w + 2 * px) / k), h: Math.min(vh - y, (f.h + 2 * py) / k) };
  }

  async function startStream() {
    stopStream();
    // Ask for the sharpest stream the camera gives: small print needs the pixels.
    const video = { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } };
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    if (!state) { stream.getTracks().forEach((tr) => tr.stop()); return; }
    state.stream = stream;
    state.video.srcObject = stream;
    await state.video.play().catch(() => {});
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    $('ds-torch').hidden = !caps.torch;
    if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
  }
  function stopStream() {
    if (state && state.stream) { state.stream.getTracks().forEach((tr) => tr.stop()); state.stream = null; }
  }

  // Checks a small copy of the frame: is it filled with paper, bright enough, and has the phone stopped moving?
  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  function check() {
    const r = videoRect(0); if (!r) return null;
    const w = 48, h = Math.max(24, Math.round(w * r.h / r.w));
    probe.width = w; probe.height = h;
    pctx.drawImage(state.video, r.x, r.y, r.w, r.h, 0, 0, w, h);
    const d = pctx.getImageData(0, 0, w, h).data, n = w * h, L = new Float32Array(n), S = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2], mx = Math.max(R, G, B);
      L[i] = 0.299 * R + 0.587 * G + 0.114 * B; S[i] = mx ? (mx - Math.min(R, G, B)) / mx : 0; sum += L[i];
    }
    const sorted = Array.from(L).sort((a, b) => a - b), p95 = sorted[Math.floor(n * 0.95)];
    // Paper: bright for this picture and nearly colourless; a wooden or coloured table is not.
    const thr = Math.max(80, p95 * 0.72), paper = (i) => L[i] > thr && S[i] < 0.3;
    let fill = 0, left = 0, right = 0;
    const band = Math.max(2, Math.round(w * 0.1));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!paper(i)) continue;
      fill++; if (x < band) left++; if (x >= w - band) right++;
    }
    fill /= n; left /= band * h; right /= band * h;
    const diff = (P, none) => { if (!P || P.length !== n) return none; let m = 0; for (let i = 0; i < n; i++) m += Math.abs(L[i] - P[i]); return m / n; };
    const move = diff(state.prev, 99), away = diff(state.shotL, state.shotL ? 0 : 99);
    state.prev = L;
    return { dark: sum / n < 55 || p95 < 90, empty: fill < 0.5 || (left < 0.2 && right < 0.2), move, away };
  }

  function loop() {
    if (!state) return;
    if (state.video.readyState >= 2 && !state.busy) {
      const c = check();
      if (c) {
        const fr = $('ds-frame'), now = Date.now();
        // After a photo, wait until the view has moved on to new paper before taking another by itself.
        if (c.away > 18) state.armed = true;
        const ok = !c.dark && !c.empty && c.move < 6;
        if (!ok) state.okSince = 0; else if (!state.okSince) state.okSince = now;
        fr.classList.toggle('ok', ok);
        if (state.parts.length && !state.armed && state.auto) setHint(takenHint(), true);
        else if (c.dark) setHint(t('Too dark. Turn on the torch or find more light.'));
        else if (c.empty) setHint(t(state.kind === 'receipt' ? 'Move closer: fill the frame side to side' : 'Move closer: fill the frame with the page'));
        else if (c.move >= 6) setHint(t('Hold still'));
        else if (state.auto && state.armed) setHint(t('Looks good. Hold still…'), true);
        else setHint(t('Looks good. Tap to take the photo'), true);
        // Give a moment after opening to pick the kind of document, and a steady second before the photo.
        if (ok && state.auto && state.armed && now - state.started > 2000 && now - state.okSince > 1100) shoot();
      }
    }
    state.timer = setTimeout(loop, 160);
  }

  const toBlob = (c, q) => new Promise((res) => c.toBlob(res, 'image/jpeg', q));

  // Takes the frame's area (plus a small margin) at full camera resolution.
  async function shoot() {
    const r = videoRect(0.03); if (!r || state.busy) return;
    state.busy = true; state.armed = false; state.okSince = 0; state.shotL = state.prev;
    const c = document.createElement('canvas');
    c.width = Math.round(r.w); c.height = Math.round(r.h);
    c.getContext('2d').drawImage(state.video, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    const fl = $('ds-flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
    if (navigator.vibrate) navigator.vibrate(40);
    await addPart(c);
    if (state) state.busy = false;
  }

  async function addPart(canvas) {
    const blob = await toBlob(canvas, 0.92); if (!state || !blob) return;
    // The bottom strip, shown faded at the top of the frame for the next part.
    const g = document.createElement('canvas'), gh = Math.round(canvas.height * OVERLAP), gw = Math.min(canvas.width, 600);
    g.width = gw; g.height = Math.round(gh * gw / canvas.width);
    g.getContext('2d').drawImage(canvas, 0, canvas.height - gh, canvas.width, gh, 0, 0, g.width, g.height);
    const gb = await toBlob(g, 0.7); if (!state) return;
    state.parts.push({ blob, url: URL.createObjectURL(blob), ghost: gb && URL.createObjectURL(gb) });
    refresh();
    setHint(takenHint(), true);
  }

  const takenHint = () => (state.kind === 'receipt' ? t('Part {n} taken. Move down and line up the faded strip', { n: state.parts.length }) : t('Page taken. Scan the next page or tap Done'));

  // Photos picked from the gallery are used whole, upright.
  async function addFiles(files) {
    for (const f of files) {
      try {
        const im = await createImageBitmap(f, { imageOrientation: 'from-image' });
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        c.getContext('2d').drawImage(im, 0, 0);
        await addPart(c);
      } catch (e) { setHint(t('Could not read the photo.')); }
    }
  }

  // One picture of all parts stacked top to bottom, for the review screen.
  async function stack(parts) {
    const ims = await Promise.all(parts.map((p) => createImageBitmap(p.blob)));
    const W = Math.min(1000, Math.min(...ims.map((im) => im.width))), gap = parts.length > 1 ? 6 : 0;
    const hs = ims.map((im) => Math.round(im.height * W / im.width));
    const c = document.createElement('canvas'); c.width = W; c.height = hs.reduce((a, b) => a + b, 0) + gap * (ims.length - 1);
    const g = c.getContext('2d'); g.fillStyle = '#AADD54'; g.fillRect(0, 0, c.width, c.height);
    let y = 0; ims.forEach((im, i) => { g.drawImage(im, 0, y, W, hs[i]); y += hs[i] + gap; });
    return toBlob(c, 0.85);
  }

  async function finish() {
    if (!state || !state.parts.length) return;
    const parts = state.parts, kind = state.kind, cb = state.opts.onDone;
    setHint(t('Preparing…'), true);
    const preview = await stack(parts).catch(() => parts[0].blob);
    close(true);
    cb({ kind, parts: parts.map((p) => p.blob), preview });
  }

  async function open(opts) {
    if (state) close(true);
    const kind = store('ds-kind') === 'receipt' ? 'receipt' : 'a4';
    state = { opts: opts || {}, kind, parts: [], auto: store('ds-auto') !== '0', armed: true, okSince: 0, busy: false };
    root().innerHTML = view();
    state.video = root().querySelector('video');
    document.body.classList.add('cam-open');
    refresh();
    window.addEventListener('resize', layout);
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMsg(esc(t('The camera needs a secure (https) page and a browser that allows camera access.')) + `<div style="margin-top:8px">${esc(t('Use Gallery to pick a photo instead.'))}</div>`);
      return;
    }
    try {
      await startStream();
      if (!state) return;
      setMsg('', true);
      layout();
      state.started = Date.now();
      loop();
    } catch (e) {
      if (!state) return;
      const name = e && e.name;
      setMsg(esc(t(name === 'NotAllowedError' ? 'Camera permission was blocked. Allow camera access for this site in the browser settings, then try again.'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'No camera was found on this device.'
          : 'The camera could not start. Close other apps using it and try again.')) + `<div style="margin-top:8px">${esc(t('Use Gallery to pick a photo instead.'))}</div>`);
    }
  }

  function close(keep) {
    if (!state) return;
    clearTimeout(state.timer);
    stopStream();
    state.parts.forEach((p) => { URL.revokeObjectURL(p.url); if (p.ghost) URL.revokeObjectURL(p.ghost); });
    const done = !keep && state.opts.onClose;
    state = null;
    window.removeEventListener('resize', layout);
    root().innerHTML = '';
    document.body.classList.remove('cam-open');
    if (done) done();
  }

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ds]'); if (!b || !state) return;
    ev.preventDefault();
    const a = b.dataset.ds;
    if (a === 'close' && (!state.parts.length || window.confirm(t('Discard the photos taken so far?')))) close();
    if (a === 'kind' && !state.parts.length) { state.kind = b.dataset.k; store('ds-kind', state.kind); state.prev = null; state.started = Date.now(); refresh(); }
    if (a === 'shot') shoot();
    if (a === 'done') finish();
    if (a === 'auto') { state.auto = !state.auto; store('ds-auto', state.auto ? '1' : '0'); refresh(); }
    if (a === 'retake') {
      const p = state.parts.pop(); URL.revokeObjectURL(p.url); if (p.ghost) URL.revokeObjectURL(p.ghost);
      state.armed = true; state.shotL = null; refresh(); setHint('');
    }
    if (a === 'torch' && state.stream) {
      const tr = state.stream.getVideoTracks()[0]; state.torch = !state.torch;
      tr.applyConstraints({ advanced: [{ torch: state.torch }] }).catch(() => {});
      b.classList.toggle('on', state.torch);
    }
  });
  document.addEventListener('change', (ev) => { if (ev.target.id === 'ds-file' && state && ev.target.files.length) addFiles(Array.from(ev.target.files)); });
  document.addEventListener('keydown', (ev) => { if (state && ev.key === 'Escape') { ev.stopImmediatePropagation(); close(); } }, true);

  window.DocScanner = { open, close, isOpen: () => !!state };
})();
