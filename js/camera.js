/* Camera barcode scanner for Tamveen POS.
   Uses the browser's BarcodeDetector where it exists (Chrome on Android, macOS, ChromeOS) and falls
   back to ZXing (loaded on first use) everywhere else, e.g. iPhone Safari and Firefox.
   The overlay lives in its own root so app re-renders never touch the running video. */
(function () {
  'use strict';

  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
  const t = (s, v) => (window.TamveenT ? window.TamveenT(s, v) : s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let state = null; // { opts, stream, video, devices, deviceIdx, detector, zx, timer, last, lastAt, torch, busy }

  function root() {
    let el = document.getElementById('camera-root');
    if (!el) { el = document.createElement('div'); el.id = 'camera-root'; document.body.appendChild(el); }
    return el;
  }

  function loadZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/zxing.min.js?v=7';
      s.onload = () => resolve(window.ZXing);
      s.onerror = () => reject(new Error('zxing'));
      document.head.appendChild(s);
    });
  }

  async function makeDecoder() {
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = FORMATS.filter((f) => supported.includes(f));
        if (formats.includes('ean_13')) {
          const det = new window.BarcodeDetector({ formats });
          return { kind: 'native', detect: async (video) => { const r = await det.detect(video); return r.length ? r[0].rawValue : null; } };
        }
      } catch (e) { /* fall through to ZXing */ }
    }
    const Z = await loadZXing();
    const hints = new Map();
    const F = Z.BarcodeFormat;
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return {
      kind: 'zxing',
      detect: async (video) => {
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) return null;
        // Decode the centre band, where the viewfinder is, scaled to at most 800 px wide.
        const cw = Math.round(vw * 0.9), ch = Math.round(vh * 0.6);
        const scale = Math.min(1, 800 / cw);
        canvas.width = Math.round(cw * scale); canvas.height = Math.round(ch * scale);
        ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
        try {
          const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
          return reader.decodeWithState(bmp).getText();
        } catch (e) { return null; }
      },
    };
  }

  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = state.audio || (state.audio = new AC());
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 1760; o.type = 'square';
      g.gain.setValueAtTime(0.08, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.13);
    } catch (e) { /* no audio */ }
    if (navigator.vibrate) navigator.vibrate(60);
  }

  function view() {
    const o = state.opts;
    return `<div class="cam-overlay" role="dialog" aria-modal="true" aria-label="${esc(t('Scan with camera'))}">
      <div class="cam-top"><div><b>${esc(o.title || t('Scan with camera'))}</b><div class="small">${esc(t(o.continuous ? 'Point the camera at a barcode. Each scan adds to the bill.' : 'Point the camera at a barcode.'))}</div></div>
        <button class="cam-x" data-cam="close" aria-label="${esc(t('Close'))}">✕</button></div>
      <div class="cam-stage"><video playsinline muted autoplay></video>
        <div class="cam-frame"><span class="cam-line"></span></div>
        <div class="cam-msg" id="cam-msg">${esc(t('Starting camera…'))}</div></div>
      <div class="cam-result" id="cam-result" aria-live="polite"></div>
      <div class="cam-bar">
        <button class="btn sm ghost" data-cam="switch" id="cam-switch" hidden>${esc(t('Switch camera'))}</button>
        <button class="btn sm ghost" data-cam="torch" id="cam-torch" hidden>${esc(t('Torch'))}</button>
        <span class="spacer"></span>
        <button class="btn sm primary" data-cam="close">${esc(t(o.continuous ? 'Done' : 'Cancel'))}</button>
      </div></div>`;
  }

  function setMsg(html, hide) {
    const m = document.getElementById('cam-msg'); if (!m) return;
    m.innerHTML = html; m.style.display = hide ? 'none' : '';
  }
  function setResult(html, kind) {
    const r = document.getElementById('cam-result'); if (!r) return;
    r.className = 'cam-result ' + (kind || ''); r.innerHTML = html;
  }

  async function startStream() {
    stopStream();
    const dev = state.devices[state.deviceIdx];
    const video = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (dev) video.deviceId = { exact: dev.deviceId }; else video.facingMode = { ideal: 'environment' };
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    state.stream = stream;
    state.video.srcObject = stream;
    await state.video.play().catch(() => {});
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    document.getElementById('cam-torch').hidden = !caps.torch;
    // Device labels are only filled in after permission is granted.
    const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    if (!state.devices.length && list.length) {
      state.devices = list;
      const cur = track.getSettings && track.getSettings().deviceId;
      state.deviceIdx = Math.max(0, list.findIndex((d) => d.deviceId === cur));
    }
    document.getElementById('cam-switch').hidden = state.devices.length < 2;
  }
  function stopStream() {
    if (state && state.stream) { state.stream.getTracks().forEach((tr) => tr.stop()); state.stream = null; }
  }

  async function loop() {
    if (!state) return;
    if (!state.busy && state.decoder && state.video.readyState >= 2) {
      state.busy = true;
      try {
        const code = await state.decoder.detect(state.video);
        if (code && state) handle(code.trim());
      } catch (e) { /* frame not ready */ }
      if (state) state.busy = false;
    }
    if (state) state.timer = setTimeout(loop, 120);
  }

  function handle(code) {
    const now = Date.now();
    // A barcode stays in view across many frames: the same code only counts again once it has been out of
    // view for 1.5 s (scan the item twice by moving it away and back), and any two reads are 0.8 s apart.
    const seenRecently = code === state.last && now - state.lastSeen < 1500;
    if (code === state.last) state.lastSeen = now;
    if (seenRecently || now - state.lastAt < 800) return;
    state.last = code; state.lastAt = now; state.lastSeen = now;
    beep();
    const res = state.opts.onCode(code) || {};
    if (res.close || !state.opts.continuous) { close(); return; }
    setResult(res.html || esc(code), res.ok === false ? 'bad' : 'ok');
  }

  async function open(opts) {
    if (state) close();
    state = { opts, devices: [], deviceIdx: 0, last: null, lastAt: 0, lastSeen: 0, busy: false };
    root().innerHTML = view();
    state.video = root().querySelector('video');
    document.body.classList.add('cam-open');
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMsg(esc(t('The camera needs a secure (https) page and a browser that allows camera access.')));
      return;
    }
    try {
      const [decoder] = await Promise.all([makeDecoder(), startStream()]);
      if (!state) return;
      state.decoder = decoder;
      setMsg('', true);
      loop();
    } catch (e) {
      if (!state) return;
      const name = e && e.name;
      setMsg(esc(t(name === 'NotAllowedError' ? 'Camera permission was blocked. Allow camera access for this site in the browser settings, then try again.'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'No camera was found on this device.'
          : e && e.message === 'zxing' ? 'The barcode reader could not load. Check the connection and try again.'
            : 'The camera could not start. Close other apps using it and try again.')));
    }
  }

  function close() {
    if (!state) return;
    clearTimeout(state.timer);
    stopStream();
    if (state.audio) state.audio.close().catch(() => {});
    const done = state.opts.onClose;
    state = null;
    root().innerHTML = '';
    document.body.classList.remove('cam-open');
    if (done) done();
  }

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cam]'); if (!b || !state) return;
    ev.preventDefault();
    const a = b.dataset.cam;
    if (a === 'close') close();
    if (a === 'switch' && state.devices.length > 1) { state.deviceIdx = (state.deviceIdx + 1) % state.devices.length; startStream().catch(() => setMsg(esc(t('The camera could not start. Close other apps using it and try again.')))); }
    if (a === 'torch' && state.stream) {
      const tr = state.stream.getVideoTracks()[0]; state.torch = !state.torch;
      tr.applyConstraints({ advanced: [{ torch: state.torch }] }).catch(() => {});
      b.classList.toggle('on', state.torch);
    }
  });
  document.addEventListener('keydown', (ev) => { if (state && ev.key === 'Escape') { ev.stopImmediatePropagation(); close(); } }, true);

  window.CameraScanner = { open, close, isOpen: () => !!state, supported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) };
})();
