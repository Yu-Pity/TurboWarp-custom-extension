// Name: 字幕 · 核心设置
// ID: captionsuite
// Description: 字幕引擎核心：挂载舞台、状态机、打字机、分页、推进、广播、日志、存档总线、状态查询。其它「字幕 · xxx」扩展都依赖本文件，请先加载它。
// License: MIT

(function (Scratch) {
  'use strict';
  if (!Scratch) return;
  if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
    throw new Error('[字幕 · 核心设置] 必须在「取消沙盒模式运行」下工作');
  }

  // ============================================================
  // 共享总线（每个文件都带一份，谁先加载谁创建）
  // ============================================================
  const HUB = (function (w) {
    const g = w || {};
    if (!g.__CAPTION_SUITE__) {
      const clamp = (v, lo, hi) => { const n = +v; if (!Number.isFinite(n)) return lo; return n < lo ? lo : n > hi ? hi : n; };
      const str = v => (v == null ? '' : String(v));
      const num = (v, fb) => { if (v == null || v === '') return fb; const n = +v; return Number.isFinite(n) ? n : fb; };
      const pick = (v, arr, fb) => (arr.indexOf(str(v)) >= 0 ? str(v) : fb);
      const on = v => { const s = str(v).trim().toLowerCase(); return s === '开启' || s === '开' || s === 'on' || s === 'true' || s === '1' || s === 'yes'; };
      const color = (v, fb) => {
        const c = str(v).trim();
        if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
        if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map(ch => ch + ch).join('').toLowerCase();
        return fb;
      };
      const rgba = (hex, a) => { const c = color(hex, '#000000'); const n = parseInt(c.slice(1), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
      const split = (v, max) => {
        const raw = str(v).trim();
        if (!raw) return [];
        const out = raw.split(/[|｜\n]/).map(s => s.trim()).filter(Boolean);
        return max ? out.slice(0, max) : out;
      };
      const wait = ms => new Promise(r => setTimeout(r, ms));
      g.__CAPTION_SUITE__ = {
        version: '3.0.0',
        core: null,
        parts: Object.create(null),
        waiters: [],
        warned: Object.create(null),
        u: { clamp, str, num, pick, on, color, rgba, split, wait },
        attach(part) { this.parts[part.name] = part; if (this.core && !part._on) this._boot(part); },
        _boot(part) { part._on = true; try { part.init(this.core, this); } catch (e) { console.warn('[字幕] 模块载入失败：' + part.name, e); } },
        flush() {
          const keys = Object.keys(this.parts);
          for (let i = 0; i < keys.length; i++) { const p = this.parts[keys[i]]; if (!p._on) this._boot(p); }
          const ws = this.waiters.splice(0);
          for (let i = 0; i < ws.length; i++) { try { ws[i](this.core); } catch (e) {} }
        },
        ready(fn) { if (this.core) fn(this.core); else this.waiters.push(fn); },
        part(name) { return this.parts[name] || null; },
        warn(tag) { if (this.warned[tag]) return; this.warned[tag] = true; console.warn('[字幕] 「' + tag + '」需要配合「字幕 · 核心设置」一起使用。'); }
      };
    }
    return g.__CAPTION_SUITE__;
  })(typeof window !== 'undefined' ? window : undefined);

  const U = HUB.u;
  const clamp = U.clamp, str = U.str, num = U.num;

  // ============================================================
  // 常量
  // ============================================================
  const VERSION = '3.0.0';
  const ROOT_ID = 'caption-suite-root';
  const CSS_PREFIX = 'caption-suite-css-';
  const MAX_CHOICES = 9;
  const MAX_LOG = 200;
  const PUNCT_RE = /[。！？!?；;…～~—,，、]/;

  const POS_CLASS = { '底部': 'pos-bottom', '顶部': 'pos-top', '居中': 'pos-center' };
  const ALIGN_MAP = { '左对齐': 'left', '居中': 'center', '右对齐': 'right' };
  const EVENT_NAMES = ['打字完成', '翻到下一页', '选项被选择', '玩家点击', '字幕框显示', '字幕框隐藏', '表情弹出', '气泡弹出', '存档读取完成', '全部播放完成'];

  // ============================================================
  // 基础样式（只放框架级 UI；立绘/气泡/历史等样式由各自模块注入）
  // ============================================================
  const BASE_CSS = `
#${ROOT_ID}{position:absolute;inset:0;z-index:1000;pointer-events:none;overflow:visible;
  font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  --cap-width:82%;--cap-left:9%;--cap-bottom:5%;--cap-radius:14px;--cap-font-size:17px;--cap-align:left;
  --cap-bg:rgba(9,21,44,.82);--cap-text:#e8f0ff;--cap-name:#aad5ff;
  --cap-name-bg:linear-gradient(135deg,rgba(38,88,170,.95),rgba(72,134,216,.95));
  --cap-border:rgba(150,200,255,.34);--cap-glow:rgba(96,165,250,.28);
  --cap-line:1.82;--cap-pad:18px 22px 21px;--cap-shadow:0 18px 44px -14px rgba(0,0,0,.72);
  --cap-text-max:30vh;}
#${ROOT_ID}.is-fixed{position:fixed}
#${ROOT_ID} *{box-sizing:border-box}
#${ROOT_ID} .cap-layer{position:absolute;inset:0;pointer-events:none;overflow:visible}
#${ROOT_ID} .cap-layer-portrait{z-index:0}
#${ROOT_ID} .cap-overlay{z-index:3}
#${ROOT_ID} .cap-layer-bubble{z-index:5}
#${ROOT_ID} .cap-layer-emote{z-index:6}
#${ROOT_ID} .cap-history{z-index:8}
#${ROOT_ID} .cap-layer-ctrl{z-index:9}

#${ROOT_ID} .cap-overlay{position:absolute;left:var(--cap-left);bottom:var(--cap-bottom);width:var(--cap-width);
  opacity:0;visibility:hidden;pointer-events:none;overflow:visible;
  transition:opacity .24s ease,visibility .24s}
#${ROOT_ID}.is-visible .cap-overlay{opacity:1;visibility:visible}
#${ROOT_ID} .cap-overlay.pos-top{top:var(--cap-bottom);bottom:auto}
#${ROOT_ID} .cap-overlay.pos-center{top:50%;bottom:auto;transform:translateY(-50%)}

#${ROOT_ID} .cap-box{position:relative;padding:var(--cap-pad);border-radius:var(--cap-radius);
  background:var(--cap-bg);border:1px solid var(--cap-border);color:var(--cap-text);
  box-shadow:var(--cap-shadow),0 0 0 1px rgba(255,255,255,.05) inset,0 0 34px -6px var(--cap-glow);
  backdrop-filter:blur(12px) saturate(1.25);-webkit-backdrop-filter:blur(12px) saturate(1.25);
  min-height:86px;cursor:pointer;pointer-events:auto;user-select:none;outline:none;overflow:visible;
  transform:translateY(10px) scale(.994);opacity:.4;
  transition:transform .26s cubic-bezier(.22,.9,.24,1),opacity .22s ease,border-color .2s,box-shadow .2s}
#${ROOT_ID}.is-visible .cap-box{transform:none;opacity:1}
#${ROOT_ID} .cap-box::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,0) 42%)}
#${ROOT_ID} .cap-box:hover,#${ROOT_ID} .cap-box:focus-visible{border-color:rgba(180,220,255,.72);
  box-shadow:var(--cap-shadow),0 0 0 1px rgba(160,210,255,.35) inset,0 0 44px -4px var(--cap-glow)}

#${ROOT_ID} .cap-speaker{position:absolute;top:-15px;left:20px;max-width:calc(100% - 40px);
  padding:4px 15px;border-radius:999px;font-size:13px;line-height:1.5;letter-spacing:1.2px;font-weight:600;
  color:var(--cap-name);background:var(--cap-name-bg);border:1px solid rgba(190,225,255,.45);
  box-shadow:0 4px 14px rgba(0,0,0,.42),0 1px 0 rgba(255,255,255,.22) inset;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;
  transition:opacity .2s,transform .26s cubic-bezier(.22,.9,.24,1)}
#${ROOT_ID} .cap-speaker:empty{opacity:0;transform:translateY(4px)}

#${ROOT_ID} .cap-text{font-size:var(--cap-font-size);line-height:var(--cap-line);letter-spacing:.6px;
  text-align:var(--cap-align);white-space:pre-wrap;word-break:break-word;padding-top:4px;min-height:1em;
  max-height:var(--cap-text-max);overflow-y:auto;overscroll-behavior:contain}
#${ROOT_ID} .cap-text::-webkit-scrollbar{width:5px}
#${ROOT_ID} .cap-text::-webkit-scrollbar-thumb{background:rgba(150,190,255,.28);border-radius:3px}
#${ROOT_ID}.is-typing .cap-text::after{content:'';display:inline-block;width:2px;height:1.05em;margin-left:3px;
  vertical-align:-2px;border-radius:1px;background:var(--cap-name);animation:capCaret .9s steps(2,end) infinite}
@keyframes capCaret{0%,49%{opacity:1}50%,100%{opacity:0}}

#${ROOT_ID} .cap-hint{position:absolute;right:18px;bottom:7px;font-size:11px;letter-spacing:1.4px;
  color:rgba(170,213,255,.6);opacity:0;pointer-events:none;transition:opacity .2s}
#${ROOT_ID}.is-waiting .cap-hint{opacity:1;animation:capHintFloat 1.8s ease-in-out infinite}
#${ROOT_ID} .cap-hint.is-hidden{display:none}
@keyframes capHintFloat{0%,100%{opacity:.4;transform:translateY(0)}50%{opacity:.95;transform:translateY(-2px)}}

#${ROOT_ID} .cap-choices{position:absolute;left:2px;bottom:calc(100% + 13px);display:none;flex-direction:column;
  align-items:stretch;gap:8px;max-height:46vh;max-width:min(420px,86%);overflow-y:auto;pointer-events:auto;
  padding:2px}
#${ROOT_ID} .cap-choices.is-open{display:flex;animation:capChoiceIn .26s cubic-bezier(.34,1.4,.64,1)}
#${ROOT_ID} .cap-choices.is-row{flex-direction:row;flex-wrap:wrap;align-items:flex-start}
@keyframes capChoiceIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
#${ROOT_ID} .cap-choice{display:flex;align-items:center;gap:10px;padding:11px 18px 11px 12px;min-width:168px;
  max-width:360px;background:linear-gradient(135deg,rgba(14,34,66,.94),rgba(20,48,88,.94));
  border:1px solid rgba(140,195,255,.45);border-radius:11px;color:#d6e7ff;font-size:15px;line-height:1.45;
  letter-spacing:.5px;text-align:left;cursor:pointer;font-family:inherit;
  box-shadow:0 4px 16px rgba(0,0,0,.42),0 1px 0 rgba(255,255,255,.08) inset;
  outline:none;transition:transform .16s cubic-bezier(.34,1.5,.64,1),background .16s,border-color .16s,box-shadow .16s}
#${ROOT_ID} .cap-choice:hover,#${ROOT_ID} .cap-choice:focus-visible{transform:translateY(-2px);
  background:linear-gradient(135deg,rgba(32,82,152,.96),rgba(44,104,182,.96));
  border-color:rgba(185,225,255,.95);box-shadow:0 10px 24px rgba(0,0,0,.5),0 0 22px -4px rgba(120,180,255,.7)}
#${ROOT_ID} .cap-choice:active{transform:translateY(0) scale(.985)}
#${ROOT_ID} .cap-choice-idx{flex:none;width:21px;height:21px;border-radius:6px;
  background:rgba(150,200,255,.18);color:#a8cdf5;font-size:11px;line-height:21px;text-align:center;font-weight:700}
#${ROOT_ID} .cap-choice-label{flex:1;word-break:break-word}

#${ROOT_ID} .cap-ctrl-wrap{position:absolute;pointer-events:auto;transition:opacity .2s,transform .2s}
#${ROOT_ID} .cap-ctrl{display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;
  user-select:none;color:#fff;font-weight:700;letter-spacing:.08em;font-family:inherit;white-space:nowrap;
  background:linear-gradient(135deg,#7c5cbf 0%,#a78bfa 48%,#c9b7fd 100%);
  border:1px solid rgba(255,255,255,.42);
  box-shadow:0 6px 18px rgba(124,92,191,.5),0 1px 0 rgba(255,255,255,.28) inset;
  text-shadow:0 1px 3px rgba(0,0,0,.28);position:relative;overflow:hidden;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  transition:transform .18s cubic-bezier(.34,1.5,.64,1),filter .18s,box-shadow .18s,background .25s}
#${ROOT_ID} .cap-ctrl::before{content:'';position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg,rgba(255,255,255,.36),rgba(255,255,255,0) 56%)}
#${ROOT_ID} .cap-ctrl:hover{transform:translateY(-2px) scale(1.04);filter:brightness(1.08) saturate(1.12);
  box-shadow:0 12px 26px rgba(124,92,191,.62),0 0 24px -4px rgba(167,139,250,.8)}
#${ROOT_ID} .cap-ctrl:active{transform:translateY(0) scale(.95);transition-duration:.08s}
#${ROOT_ID} .cap-ctrl .ico{font-size:1em;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.32))}
#${ROOT_ID} .cap-ctrl.is-on{background:linear-gradient(135deg,#f0abfc 0%,#c084fc 50%,#a78bfa 100%);
  border-color:rgba(255,255,255,.7);animation:capBtnPulse 1.7s ease-in-out infinite}
@keyframes capBtnPulse{0%,100%{box-shadow:0 0 20px rgba(240,171,252,.8),0 0 0 2px rgba(255,255,255,.55),0 4px 14px rgba(240,171,252,.5)}
  50%{box-shadow:0 0 34px rgba(240,171,252,1),0 0 0 2px rgba(255,255,255,.85),0 6px 20px rgba(240,171,252,.7)}}
#${ROOT_ID} .cap-ctrl.skin-capsule{padding:9px 18px;border-radius:999px;font-size:14px}
#${ROOT_ID} .cap-ctrl.skin-circle{width:46px;height:46px;padding:0;border-radius:50%;font-size:19px}
#${ROOT_ID} .cap-ctrl.skin-circle .lbl{display:none}
#${ROOT_ID} .cap-ctrl.skin-bar{padding:8px 15px;border-radius:9px;font-size:13px;
  background:linear-gradient(135deg,rgba(28,22,56,.74),rgba(58,44,108,.74));border-color:rgba(255,255,255,.24)}

@media (prefers-reduced-motion:reduce){#${ROOT_ID} *{animation:none !important;transition:none !important}}
`;

  // ============================================================
  // 音效引擎（核心持有；「字幕 · 音效」只是它的控制面板）
  // ============================================================
  const SOUND_PRESETS = {
    '木鱼': { freq: 180, dur: 0.1, wave: 'square', gain: 0.2, endFreq: 90 },
    '上升': { freq: 523, dur: 0.16, wave: 'triangle', gain: 0.18 },
    '提示': { freq: 880, dur: 0.12, wave: 'sine', gain: 0.18 },
    '确认': { freq: 660, dur: 0.14, wave: 'sine', gain: 0.2, endFreq: 990 },
    '取消': { freq: 440, dur: 0.16, wave: 'sine', gain: 0.16, endFreq: 220 },
    '打字': { freq: 2400, dur: 0.02, wave: 'square', gain: 0.04 },
    '翻页': { freq: 760, dur: 0.1, wave: 'triangle', gain: 0.16 },
    '邮件': { freq: 587, dur: 0.16, wave: 'sine', gain: 0.16, endFreq: 1174 },
    '宝箱': { freq: 523, dur: 0.28, wave: 'triangle', gain: 0.18, endFreq: 1318 },
    '警告': { freq: 300, dur: 0.16, wave: 'square', gain: 0.16, endFreq: 200 },
    '心跳': { freq: 80, dur: 0.15, wave: 'sine', gain: 0.28 },
    '风铃': { freq: 1568, dur: 0.5, wave: 'sine', gain: 0.14 },
    '玻璃': { freq: 3200, dur: 0.25, wave: 'square', gain: 0.06 },
    '泡泡': { freq: 800, dur: 0.1, wave: 'sine', gain: 0.14, endFreq: 1600 },
    '打字-轻': { freq: 880, dur: 0.04, wave: 'sine', gain: 0.08 },
    '打字-重': { freq: 440, dur: 0.05, wave: 'square', gain: 0.07 },
    '打字-机械': { freq: 1180, dur: 0.03, wave: 'square', gain: 0.06 },
    '悬停': { freq: 1200, dur: 0.04, wave: 'sine', gain: 0.06 },
    '错误': { freq: 220, dur: 0.16, wave: 'sawtooth', gain: 0.09 },
    '通知': { freq: 1047, dur: 0.14, wave: 'triangle', gain: 0.1 }
  };
  const SOUND_NAMES = Object.keys(SOUND_PRESETS);

  class SoundEngine {
    constructor() {
      this.ctx = null; this.master = null;
      this.volume = 0.5; this.enabled = true; this.failed = false;
      this._lastAt = 0; this._voices = 0;
    }
    _ensure() {
      if (this.ctx || this.failed) return this.ctx;
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) { this.failed = true; return null; }
      try {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.failed = true; this.ctx = null; }
      return this.ctx;
    }
    setVolume(v) { this.volume = clamp(v, 0, 1); if (this.master) this.master.gain.value = this.volume; }
    setEnabled(v) { this.enabled = !!v; }
    resume() { const c = this._ensure(); if (c && c.state === 'suspended') Promise.resolve(c.resume()).catch(() => {}); }
    /** 播放一个音；preset 可以是预设名，也可以是 {freq,dur,wave,gain,endFreq} */
    play(preset, throttleMs) {
      if (!this.enabled) return;
      const p = typeof preset === 'string' ? SOUND_PRESETS[preset] : preset;
      if (!p) return;
      const now = performance.now();
      if (throttleMs && now - this._lastAt < throttleMs) return;
      if (this._voices > 24) return;
      this._lastAt = now;
      const ctx = this._ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') this.resume();
      try {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = p.wave || 'sine';
        osc.frequency.setValueAtTime(clamp(p.freq, 20, 12000), t);
        const dur = clamp(p.dur == null ? 0.12 : p.dur, 0.01, 3);
        if (p.endFreq != null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, p.endFreq), t + dur);
        const peak = clamp(p.gain == null ? 0.15 : p.gain, 0.001, 1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.012, dur / 3));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g); g.connect(this.master);
        this._voices++;
        osc.onended = () => { this._voices--; try { osc.disconnect(); g.disconnect(); } catch (e) {} };
        osc.start(t); osc.stop(t + dur + 0.02);
      } catch (e) {}
    }
  }

  // ============================================================
  // 核心引擎
  // ============================================================
  class CaptionCore {
    constructor() {
      this.version = VERSION;
      this.sound = new SoundEngine();

      // 打字
      this.speed = 45;          // 毫秒/字
      this.punctPause = 0;      // 标点额外停顿
      this._minHoldMs = 350;    // 打完后的最小停留
      this._paused = false;
      this.typingSoundEnabled = false;
      this.typingSoundPreset = '打字-轻';
      this._typeSoundAt = 0;
      this._typeSoundIdx = 0;

      // 流程
      this.state = 'idle';
      this._gen = 0;
      this._typing = null;
      this._advance = null;
      this._autoTimer = null;
      this._autoPlay = false;
      this._autoDelay = 1000;
      this._autoByChars = false;
      this._choiceMode = '等待用户';
      this._choiceDelay = 500;
      this._options = [];
      this._lastChoice = { index: 0, text: '' };
      this._speaker = '';
      this._fullText = '';
      this._pages = [''];
      this._pageIndex = 0;
      this._typeFinishedAt = 0;

      // 分页
      this.paging = { lines: 3, chars: 33 };

      // 外观（由「字幕 · 字幕UI」读写，这里只存状态并负责应用）
      this.style = {
        width: 82, bottom: 5, radius: 14, alpha: 0.82,
        align: 'left', fontSize: 17, lineHeight: 1.82,
        bgColor: '#091c3c', textColor: '#e8f0ff', nameColor: '#aad5ff',
        position: '底部', showNextHint: true,
        shadow: 18, shadowColor: '#60a5fa', outline: 0, outlineColor: '#000000',
        font: '', boxBgImage: ''
      };

      // DOM
      this.root = null; this.host = null;
      this.el = Object.create(null);
      this._layers = Object.create(null);
      this._rectCache = null; this._rectAt = 0; this._rectDirty = true;
      this._relayoutRaf = 0; this._resizeObs = null; this._observed = null;
      this._layoutHooks = [];
      this._buttons = [];

      // 数据
      this._log = []; this._logLimit = MAX_LOG;
      this._events = Object.create(null);
      EVENT_NAMES.forEach(n => { this._events[n] = true; });
      this._broadcastPrefix = '字幕框-';
      this._saves = Object.create(null);
      this._saveProviders = new Map();
      this._debug = false;
      this._hooks = { speaker: [] };
      this._resetHooks = [];

      this._keyHandler = e => this._onKeyDown(e);
      this._installHooks();
    }

    // ---------- 生命周期与挂载 ----------
    _installHooks() {
      document.addEventListener('keydown', this._keyHandler, true);
      window.addEventListener('resize', () => this.invalidate());
      window.addEventListener('fullscreenchange', () => this.invalidate());
      window.addEventListener('scroll', () => this.invalidate(), true);
      try {
        const rt = Scratch.vm && Scratch.vm.runtime;
        if (rt && typeof rt.on === 'function') {
          rt.on('PROJECT_STOP_ALL', () => this.onProjectStop());
          rt.on('PROJECT_LOADED', () => this.onProjectStop());
        }
      } catch (e) {}
    }

    onProjectStop() {
      this.stopAll();
      this.setVisible(false);
    }

    stopAll() {
      this.interrupt();
      this._speaker = ''; this._fullText = '';
      this._pages = ['']; this._pageIndex = 0;
      if (this.el.text) this.el.text.textContent = '';
      if (this.el.speaker) this.el.speaker.textContent = '';
      this._emitLayout();
    }

    _canvas() {
      try {
        const rt = Scratch.vm && Scratch.vm.runtime;
        const stage = rt && rt.getTargetForStage ? rt.getTargetForStage() : null;
        if (stage && stage.canvas) return stage.canvas;
      } catch (e) {}
      const all = document.querySelectorAll('canvas');
      for (let i = 0; i < all.length; i++) if (all[i] && all[i].width >= 300 && all[i].height >= 200) return all[i];
      return all.length ? all[0] : null;
    }

    _host() {
      const c = this._canvas();
      if (c && c.parentElement) return c.parentElement;
      return document.querySelector('[class*="stage-wrapper"]')
        || document.querySelector('[class*="stage_wrapper"]')
        || document.querySelector('[class*="stage"]')
        || document.body;
    }

    _inject(key, css) {
      const id = CSS_PREFIX + key;
      let s = document.getElementById(id);
      if (!s) {
        s = document.createElement('style');
        s.id = id;
        document.head.appendChild(s);
      }
      s.textContent = css;
    }

    /** 供各功能模块注入自己的样式 */
    addCSS(key, css) { this._inject(key, css); }

    mount() {
      const host = this._host();
      if (!host) return false;
      if (!this.root) {
        this._inject('base', BASE_CSS);
        this.root = this._build();
      }
      if (this.root.parentElement !== host) {
        const fixed = host === document.body;
        this.root.classList.toggle('is-fixed', fixed);
        if (!fixed && window.getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.appendChild(this.root);
      }
      this.host = host;
      this._observe();
      this.invalidate();
      this.applyStyle();
      this.layoutButtons();
      return true;
    }

    _build() {
      const root = document.createElement('div');
      root.id = ROOT_ID;
      root.innerHTML = [
        '<div class="cap-layer cap-layer-portrait"></div>',
        '<div class="cap-layer cap-layer-bubble"></div>',
        '<div class="cap-overlay">',
        '  <div class="cap-choices" role="listbox"></div>',
        '  <div class="cap-box" role="button" tabindex="0" aria-label="字幕框">',
        '    <div class="cap-speaker"></div>',
        '    <div class="cap-text" aria-live="polite"></div>',
        '    <div class="cap-hint">点击 / 空格 继续</div>',
        '  </div>',
        '</div>',
        '<div class="cap-layer cap-layer-emote"></div>',
        '<div class="cap-history" role="dialog" aria-label="历史记录"></div>',
        '<div class="cap-layer cap-layer-ctrl"></div>'
      ].join('');

      const q = sel => root.querySelector(sel);
      this.el.choices = q('.cap-choices');
      this.el.box = q('.cap-box');
      this.el.text = q('.cap-text');
      this.el.speaker = q('.cap-speaker');
      this.el.hint = q('.cap-hint');
      this.el.overlay = q('.cap-overlay');
      this.el.history = q('.cap-history');
      this._layers.portrait = q('.cap-layer-portrait');
      this._layers.bubble = q('.cap-layer-bubble');
      this._layers.emote = q('.cap-layer-emote');
      this._layers.ctrl = q('.cap-layer-ctrl');

      this.el.box.addEventListener('click', () => this.onBoxClick(false));
      this.el.box.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onBoxClick(false); }
      });
      return root;
    }

    layer(name) { return this._layers[name] || null; }

    /** 舞台尺寸 */
    stageSize() {
      try {
        const rt = Scratch.vm && Scratch.vm.runtime;
        if (rt) {
          const w = num(rt.stageWidth, NaN), h = num(rt.stageHeight, NaN);
          if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { w, h };
        }
      } catch (e) {}
      return { w: 480, h: 360 };
    }

    invalidate() { this._rectDirty = true; this.scheduleLayout(); }

    scheduleLayout() {
      if (this._relayoutRaf) return;
      this._relayoutRaf = requestAnimationFrame(() => {
        this._relayoutRaf = 0;
        this._rectDirty = true;
        this.applyStyle();
        this.layoutButtons();
        this._emitLayout();
      });
    }

    _emitLayout() {
      const hs = this._layoutHooks;
      for (let i = 0; i < hs.length; i++) { try { hs[i](); } catch (e) {} }
    }

    /** 布局变化回调（如气泡需要重新定位） */
    onLayout(fn) { if (typeof fn === 'function' && this._layoutHooks.indexOf(fn) < 0) this._layoutHooks.push(fn); }

    rects() {
      const now = performance.now();
      if (!this._rectDirty && this._rectCache && now - this._rectAt < 800) return this._rectCache;
      const canvas = this._canvas();
      this._rectCache = {
        root: this.root ? this.root.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 360 },
        canvas: canvas ? canvas.getBoundingClientRect() : null,
        t: now
      };
      this._rectDirty = false; this._rectAt = now;
      return this._rectCache;
    }

    /** 舞台坐标 → root 内像素 */
    stageToPx(sx, sy) {
      const size = this.stageSize();
      const r = this.rects();
      if (!r.canvas) return { x: r.root.width * 0.5, y: r.root.height * 0.5 };
      const x = (r.canvas.left - r.root.left) + (sx / size.w + 0.5) * r.canvas.width;
      const y = (r.canvas.top - r.root.top) + (0.5 - sy / size.h) * r.canvas.height;
      return {
        x: clamp(x, 24, Math.max(24, r.root.width - 24)),
        y: clamp(y, 34, Math.max(34, r.root.height - 8))
      };
    }

    /** 取某个元素在 root 内的中心/指定比例点 */
    anchorOf(el, rx, ry) {
      if (!el || !this.root) return { x: 0, y: 0 };
      const b = el.getBoundingClientRect();
      const r = this.rects().root;
      if (!b.width || !b.height) return { x: r.width * 0.5, y: r.height * 0.4 };
      return { x: (b.left - r.left) + b.width * rx, y: (b.top - r.top) + b.height * ry };
    }

    boxAnchor(rx, ry) { return this.anchorOf(this.el.box, rx, ry == null ? 0 : ry); }

    _observe() {
      if (typeof window.ResizeObserver !== 'function' || !this.host) return;
      try {
        if (!this._resizeObs) this._resizeObs = new ResizeObserver(() => this.invalidate());
      } catch (e) { return; }
      const targets = [this.host];
      const c = this._canvas();
      if (c) targets.push(c);
      if (this._observed && this._observed.length === targets.length
        && this._observed.every((el, i) => el === targets[i])) return;
      if (this._observed) this._observed.forEach(el => { try { this._resizeObs.unobserve(el); } catch (e) {} });
      this._observed = targets;
      targets.forEach(el => { try { this._resizeObs.observe(el); } catch (e) {} });
    }

    // ---------- 外观应用 ----------
    applyStyle() {
      if (!this.root) return;
      const s = this.style;
      const st = this.root.style;
      st.setProperty('--cap-width', s.width + '%');
      st.setProperty('--cap-left', ((100 - s.width) / 2) + '%');
      st.setProperty('--cap-bottom', s.bottom + '%');
      st.setProperty('--cap-radius', s.radius + 'px');
      st.setProperty('--cap-font-size', s.fontSize + 'px');
      st.setProperty('--cap-align', s.align);
      st.setProperty('--cap-line', String(s.lineHeight));
      st.setProperty('--cap-bg', U.rgba(s.bgColor, s.alpha));
      st.setProperty('--cap-text', s.textColor);
      st.setProperty('--cap-name', s.nameColor);
      st.setProperty('--cap-name-bg', 'linear-gradient(135deg,' + U.rgba(s.nameColor, 0.28) + ',' + U.rgba(s.bgColor, 0.95) + ')');
      st.setProperty('--cap-glow', U.rgba(s.shadowColor, 0.45));
      const hostH = this.host ? (this.host.clientHeight || 360) : 360;
      this.root.style.setProperty('--cap-text-max', Math.max(64, Math.round(hostH * 0.55)) + 'px');
      if (s.font) st.fontFamily = s.font;
      if (this.el.text) {
        this.el.text.style.textShadow = s.outline > 0
          ? '0 0 ' + s.outline + 'px ' + s.outlineColor + ',0 0 ' + (s.outline * 2) + 'px ' + s.outlineColor : '';
      }
      if (this.el.box) {
        this.el.box.style.boxShadow = '0 18px ' + s.shadow + 'px -14px rgba(0,0,0,.72),'
          + '0 0 0 1px rgba(255,255,255,.05) inset,0 0 ' + (s.shadow + 16) + 'px -6px ' + U.rgba(s.shadowColor, 0.45);
        if (s.boxBgImage) {
          this.el.box.style.backgroundImage = 'url("' + s.boxBgImage + '")';
          this.el.box.style.backgroundSize = 'cover';
          this.el.box.style.backgroundPosition = 'center';
        } else {
          this.el.box.style.backgroundImage = '';
        }
      }
      if (this.el.overlay) {
        this.el.overlay.classList.remove('pos-bottom', 'pos-top', 'pos-center');
        this.el.overlay.classList.add(POS_CLASS[s.position] || 'pos-bottom');
      }
      if (this.el.hint) this.el.hint.classList.toggle('is-hidden', !s.showNextHint);
    }

    setBoxBgImage(url) { this.style.boxBgImage = str(url); this.applyStyle(); }

    // ---------- 状态机 ----------
    setState(state) {
      this.state = state;
      if (!this.root) return;
      const cl = this.root.classList;
      cl.toggle('is-typing', state === 'typing');
      cl.toggle('is-waiting', state === 'waiting');
      cl.toggle('is-choosing', state === 'choosing');
      if (this.el.text) this.el.text.setAttribute('aria-live', state === 'typing' ? 'off' : 'polite');
    }

    setVisible(v) {
      if (!this.root) return;
      const was = this.root.classList.contains('is-visible');
      this.root.classList.toggle('is-visible', !!v);
      if (v && !was) this.broadcast('字幕框显示');
      if (!v && was) this.broadcast('字幕框隐藏');
    }
    isVisible() { return !!this.root && this.root.classList.contains('is-visible'); }

    interrupt() {
      this._gen++;
      this._cancelTyping(true);
      this._clearAutoTimer();
      this.hideChoices();
      const r = this._advance;
      this._advance = null;
      this.setState('idle');
      if (r) r({ index: 0, text: '' });
    }

    _clearAutoTimer() { if (this._autoTimer) { clearTimeout(this._autoTimer); this._autoTimer = null; } }

    syncAutoTimer() {
      this._clearAutoTimer();
      const waiting = this.state === 'waiting';
      const choosing = this.state === 'choosing';
      if (waiting && this._autoPlay) {
        let d = this._autoDelay;
        if (this._autoByChars) d = Math.max(120, d + this._fullText.length * 55);
        this._autoTimer = setTimeout(() => {
          this._autoTimer = null;
          if (this.state === 'waiting') this.onBoxClick(true);
        }, clamp(d, 0, 600000));
        return;
      }
      if (choosing && this._choiceMode !== '等待用户' && this._options.length > 0) {
        const pickIndex = this._choiceMode === '自动选最后一个' ? this._options.length : 1;
        this._autoTimer = setTimeout(() => {
          this._autoTimer = null;
          if (this.state !== 'choosing') return;
          const i = this._choiceMode === '随机选择'
            ? 1 + Math.floor(Math.random() * this._options.length) : pickIndex;
          this.commit(i, this._options[i - 1]);
        }, clamp(this._choiceDelay, 0, 600000));
      }
    }

    // ---------- 打字机（rAF 驱动，逐字计时，支持标点停顿） ----------
    _type(text) {
      this._cancelTyping(true);
      const el = this.el.text;
      if (!el) return Promise.resolve();
      el.textContent = '';
      el.scrollTop = 0;
      if (!text || this.speed <= 0) { el.textContent = text; return Promise.resolve(); }
      return new Promise(resolve => {
        const s = { text, i: 0, next: performance.now() + this.speed, raf: 0, resolve, pauseAt: 0 };
        this._typing = s;
        this._typeSoundIdx = 0;
        const step = now => {
          if (this._typing !== s) return;
          if (this._paused) {
            if (!s.pauseAt) s.pauseAt = now;
            s.raf = requestAnimationFrame(step);
            return;
          }
          if (s.pauseAt) { s.next += now - s.pauseAt; s.pauseAt = 0; }
          let guard = 0;
          while (s.i < s.text.length && now >= s.next && guard++ < 400) {
            const ch = s.text.charAt(s.i);
            s.i++;
            s.next += this.speed + (PUNCT_RE.test(ch) ? this.punctPause : 0);
          }
          if (s.i !== s.shown) {
            s.shown = s.i;
            el.textContent = s.text.slice(0, s.i);
            if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
            this._tickTypeSound(s.i);
          }
          if (s.i >= s.text.length) { this._finishTyping(s); return; }
          s.raf = requestAnimationFrame(step);
        };
        s.shown = 0;
        s.raf = requestAnimationFrame(step);
      });
    }

    _finishTyping(s) {
      if (this._typing !== s) return;
      cancelAnimationFrame(s.raf);
      this._typing = null;
      if (this.el.text) {
        this.el.text.textContent = s.text;
        if (this.el.text.scrollHeight > this.el.text.clientHeight) this.el.text.scrollTop = this.el.text.scrollHeight;
      }
      s.resolve();
    }

    _cancelTyping(resolveIt) {
      const s = this._typing;
      if (!s) return;
      this._typing = null;
      cancelAnimationFrame(s.raf);
      if (resolveIt) s.resolve();
    }

    _tickTypeSound(i) {
      if (!this.typingSoundEnabled) return;
      if (i - this._typeSoundIdx < 2) return;
      const now = performance.now();
      if (now - this._typeSoundAt < 55) return;
      this._typeSoundAt = now; this._typeSoundIdx = i;
      this.sound.play(this.typingSoundPreset, 40);
    }

    finishTyping() { if (this._typing) this._finishTyping(this._typing); }

    // ---------- 分页 ----------
    buildPages(text) {
      const src = str(text);
      if (!src) return [''];
      const per = Math.max(6, this.paging.chars);
      const lines = [];
      let cur = '';
      const flush = () => { if (cur) { lines.push(cur); cur = ''; } };
      for (const ch of src) {
        if (ch === '\n') { flush(); continue; }
        cur += ch;
        if (cur.length >= per && PUNCT_RE.test(ch)) flush();
        else if (cur.length >= per + 5) { lines.push(cur); cur = ''; }
      }
      flush();
      const perPage = Math.max(1, this.paging.lines);
      const pages = [];
      for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage).join('\n'));
      return pages.length ? pages : [''];
    }

    _renderHint() {
      if (!this.el.hint) return;
      const more = this._pageIndex < this._pages.length - 1;
      this.el.hint.textContent = more ? '点击 / 空格 下一页' : '点击 / 空格 继续';
    }

    // ---------- 推进 ----------
    _waitAdvance() { return new Promise(resolve => { this._advance = resolve; }); }

    commit(index, text) {
      const r = this._advance;
      this._advance = null;
      this._clearAutoTimer();
      this.hideChoices();
      this.setState('idle');
      if (!r) return false;
      r({ index: index || 0, text: text || '' });
      return true;
    }

    onBoxClick(force) {
      if (this.state === 'typing') { this.finishTyping(); return; }
      if (this.state === 'choosing') return;
      if (this.state !== 'waiting') return;
      if (!force && performance.now() - this._typeFinishedAt < this._minHoldMs) return;
      this.broadcast('玩家点击');
      if (this._pageIndex < this._pages.length - 1) {
        this._pageIndex++;
        this.sound.play('翻页', 60);
        this.broadcast('翻到下一页');
        this._typeCurrentPage(this._gen);
      } else {
        this.commit(0, '');
      }
    }

    // ---------- 选项 ----------
    renderChoices(options) {
      const el = this.el.choices;
      if (!el) return;
      el.textContent = '';
      if (!options || !options.length) { el.classList.remove('is-open'); return; }
      const frag = document.createDocumentFragment();
      for (let i = 0; i < options.length; i++) {
        const btn = document.createElement('div');
        btn.className = 'cap-choice';
        btn.setAttribute('role', 'option');
        btn.setAttribute('tabindex', '0');
        const idx = document.createElement('span');
        idx.className = 'cap-choice-idx';
        idx.textContent = String(i + 1);
        const label = document.createElement('span');
        label.className = 'cap-choice-label';
        label.textContent = options[i];
        btn.append(idx, label);
        const pick = i + 1;
        btn.addEventListener('click', e => { e.stopPropagation(); this.sound.play('确认'); this.commit(pick, options[i]); });
        btn.addEventListener('mouseenter', () => this.sound.play('悬停', 80));
        btn.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); btn.click(); }
        });
        frag.appendChild(btn);
      }
      el.appendChild(frag);
      el.classList.add('is-open');
    }

    hideChoices() {
      if (this.el.choices) { this.el.choices.classList.remove('is-open'); this.el.choices.textContent = ''; }
      this._options = [];
    }

    /** 独立弹出选项（供「字幕 · 选项」调用） */
    async openChoices(options) {
      if (!this.mount() || !options.length) return { index: 0, text: '' };
      this.interrupt();
      const gen = this._gen;
      this.setVisible(true);
      this._options = options;
      this.setState('choosing');
      this.renderChoices(options);
      this.syncAutoTimer();
      const res = await this._waitAdvance();
      if (gen !== this._gen) return { index: 0, text: '' };
      this._lastChoice = res;
      if (res.index > 0) this.broadcast('选项被选择', { index: res.index, text: res.text });
      return res;
    }

    // ---------- 主流程 ----------
    async _typeCurrentPage(gen) {
      if (gen !== this._gen) return;
      this._fullText = this._pages[this._pageIndex] || '';
      this.setState('typing');
      this._renderHint();
      await this._type(this._fullText);
      if (gen !== this._gen) return;
      this._typeFinishedAt = performance.now();
      const last = this._pageIndex >= this._pages.length - 1;
      if (!last) {
        this.setState('waiting');
        this._renderHint();
        this.syncAutoTimer();
        return;
      }
      if (this._options.length > 0) {
        this.setState('choosing');
        this.renderChoices(this._options);
        this.syncAutoTimer();
        return;
      }
      this.setState('waiting');
      this._renderHint();
      this.logPush(this._speaker, this._pages.join('\n'));
      this.broadcast('打字完成', { name: this._speaker, text: this._pages.join('\n') });
      this.syncAutoTimer();
    }

    /** 说出一句（含分页 / 选项），返回 {index,text} */
    async say(speaker, text, options) {
      if (!this.mount()) return { index: 0, text: '' };
      this.interrupt();
      const gen = this._gen;
      this._speaker = str(speaker);
      this._pages = this.buildPages(text);
      this._pageIndex = 0;
      this.hideChoices();
      this._options = (options || []).slice(0, MAX_CHOICES);
      this._lastChoice = { index: 0, text: '' };
      if (this.el.speaker) this.el.speaker.textContent = this._speaker;
      if (this.el.text) this.el.text.textContent = '';
      this._emitSpeakerChange(this._speaker);
      this.setVisible(true);
      await this._typeCurrentPage(gen);
      if (gen !== this._gen) return { index: 0, text: '' };
      const res = await this._waitAdvance();
      if (gen !== this._gen) return { index: 0, text: '' };
      this._lastChoice = res;
      if (res.index > 0) this.broadcast('选项被选择', { index: res.index, text: res.text });
      return res;
    }

    showInstantLine(speaker, text) {
      if (!this.mount()) return;
      this.interrupt();
      this._speaker = str(speaker);
      this._pages = this.buildPages(text);
      this._pageIndex = this._pages.length - 1;
      this._fullText = this._pages[this._pageIndex] || '';
      this._options = [];
      if (this.el.speaker) this.el.speaker.textContent = this._speaker;
      if (this.el.text) this.el.text.textContent = this._fullText;
      this._emitSpeakerChange(this._speaker);
      this.setVisible(true);
      this.setState('waiting');
      this._typeFinishedAt = performance.now();
      this._renderHint();
      this.logPush(this._speaker, str(text));
      this.broadcast('打字完成', { name: this._speaker, text: str(text) });
      this.syncAutoTimer();
    }

    clearCaption() {
      this.interrupt();
      this._fullText = ''; this._speaker = '';
      this._pages = ['']; this._pageIndex = 0;
      if (this.el.text) this.el.text.textContent = '';
      if (this.el.speaker) this.el.speaker.textContent = '';
    }

    onSpeakerChange(fn) { this._hooks.speaker.push(fn); }
    _emitSpeakerChange(name) {
      const hs = this._hooks.speaker;
      for (let i = 0; i < hs.length; i++) { try { hs[i](name); } catch (e) {} }
    }

    // ---------- 日志 ----------
    logPush(name, text) {
      this._log.push({ name: str(name), text: str(text), ts: Date.now() });
      if (this._log.length > this._logLimit) this._log.splice(0, this._log.length - this._logLimit);
    }
    logAll() { return this._log; }
    logClear() { this._log.length = 0; }
    logLimit(v) { this._logLimit = clamp(num(v, MAX_LOG), 1, 2000); if (this._log.length > this._logLimit) this._log.splice(0, this._log.length - this._logLimit); }

    // ---------- 事件广播 ----------
    broadcast(name, detail) {
      if (this._events[name] === false) return;
      const full = (this._broadcastPrefix || '') + name;
      if (this._debug) console.log('[字幕] 广播：', full, detail || '');
      try {
        const rt = Scratch.vm && Scratch.vm.runtime;
        if (rt && typeof rt.startHats === 'function') {
          rt.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: full });
        }
      } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('captionsuite:' + name, { detail: detail || {} })); } catch (e) {}
    }
    setEvent(name, enabled) { this._events[str(name)] = !!enabled; }
    events() { return EVENT_NAMES; }

    // ---------- 存档总线 ----------
    /** 各模块注册自己的可存档状态 */
    registerSave(key, getter, setter) { this._saveProviders.set(key, { get: getter, set: setter }); }
    snapshot() {
      const data = { __v: VERSION, ts: Date.now(), parts: {} };
      data.speaker = this._speaker;
      data.text = this._pages.join('\n');
      data.pages = this._pages.slice();
      data.pageIndex = this._pageIndex;
      data.log = this._log.slice();
      data.autoPlay = this._autoPlay;
      this._saveProviders.forEach((p, k) => {
        try { data.parts[k] = p.get(); } catch (e) {}
      });
      return data;
    }
    restore(data) {
      if (!data || typeof data !== 'object') return false;
      this.interrupt();
      this._speaker = str(data.speaker);
      this._pages = Array.isArray(data.pages) && data.pages.length ? data.pages.slice() : this.buildPages(data.text);
      this._pageIndex = clamp(num(data.pageIndex, 0), 0, this._pages.length - 1);
      this._fullText = this._pages[this._pageIndex] || '';
      this._log = Array.isArray(data.log) ? data.log.slice() : [];
      this._autoPlay = !!data.autoPlay;
      if (this.el.speaker) this.el.speaker.textContent = this._speaker;
      if (this.el.text) this.el.text.textContent = this._fullText;
      this._emitSpeakerChange(this._speaker);
      this.setVisible(true);
      this.setState('waiting');
      this._typeFinishedAt = performance.now();
      this._renderHint();
      if (data.parts) {
        this._saveProviders.forEach((p, k) => {
          if (data.parts[k] === undefined) return;
          try { p.set(data.parts[k]); } catch (e) {}
        });
      }
      this.broadcast('存档读取完成');
      this._emitLayout();
      return true;
    }
    slot(name) { return this._saves[str(name) || 'default'] || null; }
    saveSlot(name) { const k = str(name) || 'default'; this._saves[k] = this.snapshot(); return this._saves[k]; }
    hasSlot(name) { return !!this._saves[str(name) || 'default']; }
    delSlot(name) { delete this._saves[str(name) || 'default']; }
    slotNames() { return Object.keys(this._saves); }
    clearSlots() { this._saves = Object.create(null); }

    // ---------- 控制按钮（自动 / 历史 共用） ----------
    createButton(opts) {
      if (!this.root && !this.mount()) return null;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cap-ctrl skin-capsule';
      btn.dataset.kind = str(opts.kind);
      const ico = document.createElement('span');
      ico.className = 'ico';
      ico.textContent = str(opts.icon);
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = str(opts.label);
      btn.append(ico, lbl);
      if (opts.onClick) btn.addEventListener('click', e => { e.stopPropagation(); opts.onClick(); });
      btn.addEventListener('mouseenter', () => this.sound.play('悬停', 90));
      const wrap = document.createElement('div');
      wrap.className = 'cap-ctrl-wrap';
      wrap.appendChild(btn);
      this._layers.ctrl.appendChild(wrap);
      wrap.style.display = 'none';
      const rec = { btn, wrap, ico, lbl, pos: str(opts.pos) || '右上角', onClick: opts.onClick };
      this._buttons.push(rec);
      this.layoutButtons();
      return rec;
    }

    setButtonVisible(rec, v) { if (rec) rec.wrap.style.display = v ? '' : 'none'; }

    layoutButtons() {
      if (!this._buttons.length) return;
      const counter = new Map();
      for (let i = 0; i < this._buttons.length; i++) {
        const rec = this._buttons[i];
        if (rec.wrap.style.display === 'none') continue;
        const n = counter.get(rec.pos) || 0;
        counter.set(rec.pos, n + 1);
        this._placeButton(rec.wrap, rec.pos, n * 54);
      }
    }

    _placeButton(wrap, pos, off) {
      const d = 14, o = off || 0;
      wrap.style.top = wrap.style.bottom = wrap.style.left = wrap.style.right = 'auto';
      switch (pos) {
        case '左上角': wrap.style.top = (d + o) + 'px'; wrap.style.left = d + 'px'; break;
        case '左下角': wrap.style.bottom = (d + o) + 'px'; wrap.style.left = d + 'px'; break;
        case '右下角': wrap.style.bottom = (d + o) + 'px'; wrap.style.right = d + 'px'; break;
        default: wrap.style.top = (d + o) + 'px'; wrap.style.right = d + 'px'; break;
      }
    }

    setButtonSkin(skin, scale) {
      const map = { '胶囊': 'skin-capsule', '圆形': 'skin-circle', '半透明条': 'skin-bar' };
      const cls = map[skin] || 'skin-capsule';
      const sc = clamp(num(scale, 1), 0.5, 2);
      for (let i = 0; i < this._buttons.length; i++) {
        const b = this._buttons[i].btn;
        b.classList.remove('skin-capsule', 'skin-circle', 'skin-bar');
        b.classList.add(cls);
        b.style.transform = 'scale(' + sc + ')';
      }
    }

    // ---------- 键盘 ----------
    _onKeyDown(e) {
      if (!this.root || !this.root.isConnected) return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      const key = str(e.key);
      for (let i = 0; i < this._buttons.length; i++) {
        const rec = this._buttons[i];
        if (rec.shortcut && rec.wrap.style.display !== 'none'
          && key.toLowerCase() === rec.shortcut.toLowerCase()) {
          e.preventDefault();
          if (rec.onClick) rec.onClick();
          return;
        }
      }
      if (!this.isVisible()) return;
      if (this.state === 'choosing') {
        const n = parseInt(key, 10);
        if (n >= 1 && n <= this._options.length) {
          e.preventDefault();
          this.sound.play('确认');
          this.commit(n, this._options[n - 1]);
        }
        return;
      }
      if (key === ' ' || key === 'Enter') { e.preventDefault(); this.onBoxClick(false); }
    }

    // ---------- 调试 ----------
    log(...a) { if (this._debug) console.log('[字幕]', ...a); }

    // ============================================================
    // 积木
    // ============================================================
    getInfo() {
      return {
        id: 'captionsuite',
        name: '字幕 · 核心设置',
        color1: '#4a7ec8', color2: '#3a6ab8', color3: '#2a5a9a',
        docsURI: 'https://extensions.turbowarp.org/',
        blocks: [
          '--- 📖 字幕显示 ---',
          { opcode: 'showBox', blockType: Scratch.BlockType.COMMAND, text: '显示字幕框' },
          { opcode: 'hideBox', blockType: Scratch.BlockType.COMMAND, text: '隐藏字幕框' },
          {
            opcode: 'sayAndWait', blockType: Scratch.BlockType.COMMAND, text: '说出并等待 [SPEAKER]：[TEXT]',
            arguments: {
              SPEAKER: { type: Scratch.ArgumentType.STRING, defaultValue: '荧' },
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: '前方就是蒙德城了。' }
            }
          },
          {
            opcode: 'sayInstant', blockType: Scratch.BlockType.COMMAND, text: '立即显示 [SPEAKER]：[TEXT]（不逐字）',
            arguments: {
              SPEAKER: { type: Scratch.ArgumentType.STRING, defaultValue: '派蒙' },
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: '让我来告诉你吧！' }
            }
          },
          {
            opcode: 'showCaption', blockType: Scratch.BlockType.COMMAND, text: '字幕 说话人 [SPEAKER] 内容 [TEXT] 选项 [OPTIONS]',
            arguments: {
              SPEAKER: { type: Scratch.ArgumentType.STRING, defaultValue: '旁白' },
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: '……' },
              OPTIONS: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
            }
          },
          { opcode: 'finishTyping', blockType: Scratch.BlockType.COMMAND, text: '立即显示完整字幕' },
          { opcode: 'nextPageOrAdvance', blockType: Scratch.BlockType.COMMAND, text: '推进到下一页或下一条台词' },
          { opcode: 'clearCaption', blockType: Scratch.BlockType.COMMAND, text: '清空当前台词' },
          { opcode: 'pauseTyping', blockType: Scratch.BlockType.COMMAND, text: '暂停打字' },
          { opcode: 'resumeTyping', blockType: Scratch.BlockType.COMMAND, text: '恢复打字' },

          '--- ⌨️ 打字 ---',
          {
            opcode: 'setSpeed', blockType: Scratch.BlockType.COMMAND, text: '打字速度 [SPEED] 毫秒/字',
            arguments: { SPEED: { type: Scratch.ArgumentType.NUMBER, defaultValue: 45 } }
          },
          {
            opcode: 'setPunctPause', blockType: Scratch.BlockType.COMMAND, text: '标点额外停顿 [MS] 毫秒',
            arguments: { MS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 } }
          },
          {
            opcode: 'setPostTypeDelay', blockType: Scratch.BlockType.COMMAND, text: '打字完成后停留 [MS] 毫秒才允许点击',
            arguments: { MS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 350 } }
          },

          '--- 📡 事件 ---',
          {
            opcode: 'setEventEnabled', blockType: Scratch.BlockType.COMMAND, text: '事件 [EVENT] 广播 [STATE]',
            arguments: {
              EVENT: { type: Scratch.ArgumentType.STRING, menu: 'EVENT_NAMES', defaultValue: '打字完成' },
              STATE: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '开启' }
            }
          },
          {
            opcode: 'fireEvent', blockType: Scratch.BlockType.COMMAND, text: '手动广播事件 [EVENT]',
            arguments: { EVENT: { type: Scratch.ArgumentType.STRING, menu: 'EVENT_NAMES', defaultValue: '玩家点击' } }
          },
          {
            opcode: 'setBroadcastPrefix', blockType: Scratch.BlockType.COMMAND, text: '广播名前缀 [PREFIX]',
            arguments: { PREFIX: { type: Scratch.ArgumentType.STRING, defaultValue: '字幕框-' } }
          },

          '--- ❓ 状态 ---',
          { opcode: 'isTyping', blockType: Scratch.BlockType.BOOLEAN, text: '正在打字？' },
          { opcode: 'isWaiting', blockType: Scratch.BlockType.BOOLEAN, text: '正在等待点击？' },
          { opcode: 'isVisible', blockType: Scratch.BlockType.BOOLEAN, text: '字幕框显示中？' },
          { opcode: 'isPaused', blockType: Scratch.BlockType.BOOLEAN, text: '打字已暂停？' },
          { opcode: 'hasNextPage', blockType: Scratch.BlockType.BOOLEAN, text: '当前台词还有下一页？' },
          { opcode: 'typedText', blockType: Scratch.BlockType.REPORTER, text: '已打出的文本（打字中）' },
          { opcode: 'currentText', blockType: Scratch.BlockType.REPORTER, text: '当前页完整文本' },
          { opcode: 'currentSpeaker', blockType: Scratch.BlockType.REPORTER, text: '当前说话人' },
          { opcode: 'currentPage', blockType: Scratch.BlockType.REPORTER, text: '当前页码' },
          { opcode: 'totalPages', blockType: Scratch.BlockType.REPORTER, text: '当前台词总页数' },
          { opcode: 'lastChoice', blockType: Scratch.BlockType.REPORTER, text: '上次选择序号' },
          { opcode: 'lastChoiceText', blockType: Scratch.BlockType.REPORTER, text: '上次选择内容' },

          '--- ⚙️ 系统 ---',
          { opcode: 'resetAll', blockType: Scratch.BlockType.COMMAND, text: '重置字幕全部设置' },
          {
            opcode: 'setDebugMode', blockType: Scratch.BlockType.COMMAND, text: '调试模式 [STATE]',
            arguments: { STATE: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '关闭' } }
          },
          { opcode: 'getVersion', blockType: Scratch.BlockType.REPORTER, text: '字幕扩展版本' }
        ],
        menus: {
          ON_OFF: { acceptReporters: true, items: ['开启', '关闭'] },
          EVENT_NAMES: { acceptReporters: true, items: EVENT_NAMES }
        }
      };
    }

    // 字幕显示
    showBox() { if (this.mount()) this.setVisible(true); }
    hideBox() { this.interrupt(); this.setVisible(false); }
    async sayAndWait(a) { await this.say(a.SPEAKER, a.TEXT, []); }
    sayInstant(a) { this.showInstantLine(a.SPEAKER, a.TEXT); }
    async showCaption(a) { await this.say(a.SPEAKER, a.TEXT, U.split(a.OPTIONS, MAX_CHOICES)); }
    finishTypingBlock() { this.finishTyping(); }
    nextPageOrAdvance() { this.onBoxClick(true); }
    clearCaptionBlock() { this.clearCaption(); }
    pauseTyping() { this._paused = true; }
    resumeTyping() { this._paused = false; }

    // 打字
    setSpeed(a) { this.speed = clamp(num(a.SPEED, 45), 0, 5000); }
    setPunctPause(a) { this.punctPause = clamp(num(a.MS, 0), 0, 2000); }
    setPostTypeDelay(a) { this._minHoldMs = clamp(num(a.MS, 350), 0, 5000); }

    // 事件
    setEventEnabled(a) { this.setEvent(a.EVENT, U.on(a.STATE)); }
    fireEvent(a) { this.broadcast(str(a.EVENT) || '玩家点击'); }
    setBroadcastPrefix(a) { this._broadcastPrefix = str(a.PREFIX); }

    // 状态
    isTyping() { return !!this._typing; }
    isWaiting() { return this.state === 'waiting'; }
    isVisibleBlock() { return this.isVisible(); }
    isPaused() { return this._paused; }
    hasNextPage() { return this._pageIndex < this._pages.length - 1; }
    typedText() { return this.el.text ? this.el.text.textContent : ''; }
    currentText() { return this._fullText; }
    currentSpeaker() { return this._speaker; }
    currentPage() { return this._pageIndex + 1; }
    totalPages() { return this._pages.length; }
    lastChoice() { return this._lastChoice.index; }
    lastChoiceText() { return this._lastChoice.text; }

    // 系统
    /** 注册「重置全部」时的清理回调（各模块自用） */
    onReset(fn) { if (typeof fn === 'function' && this._resetHooks.indexOf(fn) < 0) this._resetHooks.push(fn); }

    resetAll() {
      this.interrupt();
      for (let i = 0; i < this._resetHooks.length; i++) { try { this._resetHooks[i](); } catch (e) {} }
      this.speed = 45; this.punctPause = 0; this._minHoldMs = 350;
      this._paused = false;
      this._autoPlay = false; this._autoDelay = 1000; this._autoByChars = false;
      this._choiceMode = '等待用户'; this._choiceDelay = 500;
      this.typingSoundEnabled = false; this.typingSoundPreset = '打字-轻';
      this.paging = { lines: 3, chars: 33 };
      this.style = {
        width: 82, bottom: 5, radius: 14, alpha: 0.82,
        align: 'left', fontSize: 17, lineHeight: 1.82,
        bgColor: '#091c3c', textColor: '#e8f0ff', nameColor: '#aad5ff',
        position: '底部', showNextHint: true,
        shadow: 18, shadowColor: '#60a5fa', outline: 0, outlineColor: '#000000',
        font: '', boxBgImage: ''
      };
      this._lastChoice = { index: 0, text: '' };
      this._speaker = ''; this._fullText = '';
      this._pages = ['']; this._pageIndex = 0;
      this.logClear();
      EVENT_NAMES.forEach(n => { this._events[n] = true; });
      if (this.el.text) { this.el.text.textContent = ''; this.el.text.style.textShadow = ''; }
      if (this.el.speaker) this.el.speaker.textContent = '';
      if (this.el.box) this.el.box.style.backgroundImage = '';
      if (this.el.history) this.el.history.classList.remove('is-open');
      this.setVisible(false);
      this.applyStyle();
      this._emitLayout();
    }
    setDebugMode(a) { this._debug = U.on(a.STATE); }
    getVersion() { return VERSION; }
  }

  const core = new CaptionCore();
  HUB.core = core;
  HUB.flush();

  // 兼容旧积木名（原扩展的别名指向同一实现，避免旧工程报错）
  const alias = {
    isCaptionVisible: 'isVisible',
    getCurrentText: 'currentText',
    getCurrentName: 'currentSpeaker',
    getCurrentPage: 'currentPage',
    getTotalPages: 'totalPages',
    version: 'getVersion'
  };
  Object.keys(alias).forEach(k => { CaptionCore.prototype[k] = CaptionCore.prototype[alias[k]]; });

  Scratch.extensions.register(core);
})(typeof window !== 'undefined' ? window.Scratch : undefined);
