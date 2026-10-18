// Name: 字幕 · 立绘
// ID: captionsuiteportrait
// Description: 角色立绘：显示/切换/淡入、锚点与尺寸、出场动画、一次性特效与持续特效、合并式变换（位移/缩放/旋转/透明）、镜像、角色绑定与自动切换、预加载。
// License: MIT

(function (Scratch) {
  'use strict';
  if (!Scratch) return;
  if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
    throw new Error('[字幕 · 立绘] 必须在「取消沙盒模式运行」下工作');
  }

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
        version: '3.0.0', core: null, parts: Object.create(null), waiters: [], warned: Object.create(null),
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

  const ANCHORS = ['左侧', '中央', '右侧', '自定义'];
  const ENTER_ANIMS = ['淡入', '从左滑入', '从右滑入', '从下升起', '缩放进入', '旋转进入', '弹出进入'];
  const FX = ['抖动', '弹跳', '脉冲', '旋转', '闪光', '爆震'];
  const FX2 = ['无', '摇晃', '浮动', '呼吸', '微光'];
  const FX_CLASS = { '抖动': 'fx-shake', '弹跳': 'fx-bounce', '脉冲': 'fx-pulse', '旋转': 'fx-spin', '闪光': 'fx-flash', '爆震': 'fx-blast' };
  const FX2_CLASS = { '摇晃': 'fx2-sway', '浮动': 'fx2-float', '呼吸': 'fx2-breathe', '微光': 'fx2-glow' };

  const CSS = `
#caption-suite-root .cap-portrait-wrap{position:absolute;bottom:var(--p-bottom,0px);left:50%;
  height:var(--p-h,calc(100% + 90px));max-height:78vh;pointer-events:none;z-index:0;
  transform-origin:bottom center;--p-x:0px;--p-y:0px;--p-scale:1;--p-rotate:0deg;--p-base-x:0px;--p-flip:1;
  transform:translate3d(calc(var(--p-base-x) + var(--p-x)),var(--p-y),0) rotate(var(--p-rotate)) scale(var(--p-scale)) scaleX(var(--p-flip));
  transition:opacity .35s ease,transform .38s cubic-bezier(.22,.9,.24,1);opacity:0;will-change:transform,opacity}
#caption-suite-root .cap-portrait-wrap.is-visible{opacity:1}
#caption-suite-root .cap-portrait-wrap.is-hidden{display:none}
#caption-suite-root .cap-portrait{display:block;width:auto;height:100%;max-height:inherit;
  object-fit:contain;object-position:bottom center;transform-origin:bottom center;
  filter:drop-shadow(0 14px 26px rgba(0,0,0,.5)) drop-shadow(0 0 14px rgba(150,190,255,.2));
  will-change:transform,filter}
#caption-suite-root .cap-portrait.fx-shake{animation:pShake .6s cubic-bezier(.36,.07,.19,.97)}
#caption-suite-root .cap-portrait.fx-bounce{animation:pBounce .7s cubic-bezier(.28,.84,.42,1)}
#caption-suite-root .cap-portrait.fx-pulse{animation:pPulse .55s ease-in-out}
#caption-suite-root .cap-portrait.fx-spin{animation:pSpin .9s cubic-bezier(.6,.04,.3,.99)}
#caption-suite-root .cap-portrait.fx-flash{animation:pFlash .5s ease-in-out}
#caption-suite-root .cap-portrait.fx-blast{animation:pBlast .55s cubic-bezier(.2,.9,.3,1)}
@keyframes pShake{0%,100%{transform:translate3d(0,0,0)}10%{transform:translate3d(-9px,0,0) rotate(-1.2deg)}20%{transform:translate3d(8px,1px,0) rotate(1.2deg)}30%{transform:translate3d(-7px,-1px,0) rotate(-.9deg)}40%{transform:translate3d(6px,0,0) rotate(.7deg)}50%{transform:translate3d(-4px,0,0)}60%{transform:translate3d(3px,0,0)}70%{transform:translate3d(-2px,0,0)}80%{transform:translate3d(1px,0,0)}}
@keyframes pBounce{0%{transform:translateY(0) scaleY(1)}25%{transform:translateY(-22px) scaleY(1.04)}45%{transform:translateY(0) scaleY(.94)}60%{transform:translateY(-10px) scaleY(1.02)}80%{transform:translateY(0) scaleY(.98)}100%{transform:translateY(0) scaleY(1)}}
@keyframes pPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes pSpin{0%{transform:rotate(0) scale(.96)}100%{transform:rotate(360deg) scale(.96)}}
@keyframes pFlash{0%,100%{filter:drop-shadow(0 14px 26px rgba(0,0,0,.5)) brightness(1)}40%{filter:drop-shadow(0 0 42px rgba(255,240,180,1)) brightness(1.85) saturate(1.25)}}
@keyframes pBlast{0%{transform:scale(1)}40%{transform:scale(1.12);filter:drop-shadow(0 0 30px rgba(167,139,250,.95)) brightness(1.35)}100%{transform:scale(1)}}
#caption-suite-root .cap-portrait.fx2-sway{animation:pSway 3s ease-in-out infinite}
#caption-suite-root .cap-portrait.fx2-float{animation:pFloat 3.2s ease-in-out infinite}
#caption-suite-root .cap-portrait.fx2-breathe{animation:pBreathe 3.6s ease-in-out infinite}
#caption-suite-root .cap-portrait.fx2-glow{animation:pGlow 2.4s ease-in-out infinite}
@keyframes pSway{0%,100%{transform:rotate(-2.2deg) translateX(-3px)}50%{transform:rotate(2.2deg) translateX(3px)}}
@keyframes pFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
@keyframes pBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
@keyframes pGlow{0%,100%{filter:drop-shadow(0 14px 26px rgba(0,0,0,.5)) drop-shadow(0 0 8px rgba(167,139,250,.28))}50%{filter:drop-shadow(0 14px 26px rgba(0,0,0,.5)) drop-shadow(0 0 28px rgba(167,139,250,.9))}}
`;

  class PortraitExtension {
    constructor() {
      this.core = null;
      this.wrap = null; this.img = null;
      this.url = '';
      this.anchor = '左侧';
      this.customX = 22;
      this.height = 100;
      this.offsetY = 0;
      this.fadeMs = 350;
      this.enterAnim = '淡入';
      this.fx2 = '无';
      this.flip = false;
      this.t = { x: 0, y: 0, scale: 1, rotate: 0, alpha: 1, duration: 400 };
      this.bindings = Object.create(null);
      this.autoSwap = true;
      this.swapMs = 280;
      this._swapTimer = 0;
      this._preload = new Set();
    }

    // ---------- 内部 ----------
    _build(core) {
      const layer = core.layer('portrait');
      if (!layer || this.wrap) return;
      core.addCSS('portrait', CSS);
      const wrap = document.createElement('div');
      wrap.className = 'cap-portrait-wrap is-hidden';
      const img = document.createElement('img');
      img.className = 'cap-portrait';
      img.alt = '';
      img.decoding = 'async';
      wrap.appendChild(img);
      layer.appendChild(wrap);
      this.wrap = wrap; this.img = img;
      this._applyAll();
    }

    _applyAll() { this._applyAnchor(); this._applyTransform(); this._applySize(); }

    _applySize() {
      if (!this.wrap) return;
      this.wrap.style.setProperty('--p-h', this.height + '%');
      this.wrap.style.setProperty('--p-bottom', this.offsetY + 'px');
      this.wrap.style.setProperty('--p-flip', this.flip ? '-1' : '1');
    }

    _applyAnchor() {
      if (!this.wrap) return;
      const map = { '左侧': 'calc(-1 * min(26vw,320px))', '中央': '0px', '右侧': 'min(26vw,320px)' };
      const base = this.anchor === '自定义'
        ? 'calc(' + (this.customX - 50) + 'vw)' : (map[this.anchor] || '0px');
      this.wrap.style.setProperty('--p-base-x', base);
    }

    _applyTransform() {
      if (!this.wrap) return;
      const t = this.t;
      this.wrap.style.transitionDuration = t.duration + 'ms';
      this.wrap.style.setProperty('--p-x', t.x + 'px');
      this.wrap.style.setProperty('--p-y', t.y + 'px');
      this.wrap.style.setProperty('--p-scale', String(t.scale));
      this.wrap.style.setProperty('--p-rotate', t.rotate + 'deg');
      this.wrap.style.opacity = String(t.alpha);
    }

    _setClassGroup(img, map, effect, prefix) {
      const all = Object.keys(map).map(k => map[k]);
      all.forEach(c => img.classList.remove(c));
      if (effect && map[effect]) img.classList.add(map[effect]);
    }

    _swap(url, anim, fadeMs) {
      const c = this.core;
      if (!c) return;
      if (!this.wrap) this._build(c);
      if (!this.wrap) return;
      if (this._swapTimer) { clearTimeout(this._swapTimer); this._swapTimer = 0; }
      const w = this.wrap, img = this.img;
      const doSet = () => {
        img.onload = () => {
          w.classList.remove('is-hidden');
          w.classList.add('is-visible');
          this.enterAnim = anim || this.enterAnim;
          this._playEnter();
        };
        img.onerror = () => { w.classList.add('is-hidden'); w.classList.remove('is-visible'); };
        img.src = url;
      };
      if (this.url && url !== this.url && fadeMs > 0) {
        this.wrap.style.transitionDuration = fadeMs + 'ms';
        this.wrap.style.opacity = '0';
        this._swapTimer = setTimeout(doSet, fadeMs);
      } else {
        doSet();
      }
      this.url = url;
    }

    _playEnter() {
      const w = this.wrap;
      if (!w) return;
      const t = this.t;
      let sx = t.x, sy = t.y, sc = t.scale, rot = t.rotate;
      switch (this.enterAnim) {
        case '从左滑入': sx = t.x - 380; break;
        case '从右滑入': sx = t.x + 380; break;
        case '从下升起': sy = t.y + 200; break;
        case '缩放进入': sc = t.scale * 0.7; break;
        case '旋转进入': sc = t.scale * 0.85; rot = t.rotate - 18; break;
        case '弹出进入': sc = t.scale * 0.5; break;
      }
      w.style.transitionDuration = '0ms';
      w.style.setProperty('--p-x', sx + 'px');
      w.style.setProperty('--p-y', sy + 'px');
      w.style.setProperty('--p-scale', String(sc));
      w.style.setProperty('--p-rotate', rot + 'deg');
      w.style.opacity = '0';
      requestAnimationFrame(() => {
        w.style.transitionDuration = this.fadeMs + 'ms';
        this._applyTransform();
      });
    }

    _maybeSwap(name) {
      if (!this.autoSwap || !name) return;
      const url = this.bindings[name];
      if (!url || url === this.url) return;
      this._swap(url, this.enterAnim, this.swapMs);
    }

    _ensure() {
      const c = HUB.core;
      if (!c) { HUB.warn('字幕 · 立绘'); return null; }
      if (!this.wrap) { c.mount(); this._build(c); }
      return this.wrap ? c : null;
    }

    // ---------- 积木 ----------
    getInfo() {
      return {
        id: 'captionsuiteportrait',
        name: '字幕 · 立绘',
        color1: '#d65c8a', color2: '#c04a76', color3: '#a03a5f',
        docsURI: 'https://extensions.turbowarp.org/',
        blocks: [
          '--- 🖼️ 立绘 ---',
          {
            opcode: 'setPortrait', blockType: Scratch.BlockType.COMMAND, text: '设置立绘 [URL] 出场动画 [ANIM]',
            arguments: {
              URL: { type: Scratch.ArgumentType.STRING, defaultValue: 'https://example.com/character.png' },
              ANIM: { type: Scratch.ArgumentType.STRING, menu: 'ENTER_ANIM', defaultValue: '淡入' }
            }
          },
          { opcode: 'hidePortrait', blockType: Scratch.BlockType.COMMAND, text: '隐藏立绘' },
          { opcode: 'getPortraitUrl', blockType: Scratch.BlockType.REPORTER, text: '当前立绘地址' },
          {
            opcode: 'setPortraitFade', blockType: Scratch.BlockType.COMMAND, text: '立绘淡入淡出时长 [MS] 毫秒',
            arguments: { MS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 350 } }
          },
          {
            opcode: 'preloadPortrait', blockType: Scratch.BlockType.COMMAND, text: '预加载立绘 [URL]（减少切换卡顿）',
            arguments: { URL: { type: Scratch.ArgumentType.STRING, defaultValue: 'https://example.com/character.png' } }
          },

          '--- 📐 位置与尺寸 ---',
          {
            opcode: 'setPortraitAnchor', blockType: Scratch.BlockType.COMMAND, text: '立绘锚点 [ANCHOR]',
            arguments: { ANCHOR: { type: Scratch.ArgumentType.STRING, menu: 'PORTRAIT_ANCHOR', defaultValue: '左侧' } }
          },
          {
            opcode: 'setPortraitCustomX', blockType: Scratch.BlockType.COMMAND, text: '立绘自定义水平位置 [PERCENT]%',
            arguments: { PERCENT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 22 } }
          },
          {
            opcode: 'setPortraitSize', blockType: Scratch.BlockType.COMMAND, text: '立绘高度 [H]% 底部偏移 [Y]px',
            arguments: {
              H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
            }
          },
          {
            opcode: 'setPortraitFlip', blockType: Scratch.BlockType.COMMAND, text: '立绘水平镜像 [STATE]',
            arguments: { STATE: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '关闭' } }
          },

          '--- ✨ 动画 ---',
          {
            opcode: 'setPortraitEnterAnim', blockType: Scratch.BlockType.COMMAND, text: '立绘出场动画 [ANIM]',
            arguments: { ANIM: { type: Scratch.ArgumentType.STRING, menu: 'ENTER_ANIM', defaultValue: '淡入' } }
          },
          {
            opcode: 'portraitEffect', blockType: Scratch.BlockType.COMMAND, text: '立绘特效 [EFFECT]',
            arguments: { EFFECT: { type: Scratch.ArgumentType.STRING, menu: 'PORTRAIT_FX', defaultValue: '抖动' } }
          },
          {
            opcode: 'setPortraitPersistent', blockType: Scratch.BlockType.COMMAND, text: '立绘持续特效 [EFFECT]',
            arguments: { EFFECT: { type: Scratch.ArgumentType.STRING, menu: 'PERSISTENT_FX', defaultValue: '无' } }
          },

          '--- 🎚️ 变换 ---',
          {
            opcode: 'portraitTransform', blockType: Scratch.BlockType.COMMAND,
            text: '立绘变换 x[X] y[Y] 缩放[S] 旋转[DEG] 不透明[A] 时长[MS]（留空保持不变）',
            arguments: {
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: '' },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: '' },
              S: { type: Scratch.ArgumentType.NUMBER, defaultValue: '' },
              DEG: { type: Scratch.ArgumentType.NUMBER, defaultValue: '' },
              A: { type: Scratch.ArgumentType.NUMBER, defaultValue: '' },
              MS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 400 }
            }
          },
          { opcode: 'resetPortraitTransform', blockType: Scratch.BlockType.COMMAND, text: '重置立绘变换' },

          '--- 🔗 角色绑定 ---',
          {
            opcode: 'bindPortrait', blockType: Scratch.BlockType.COMMAND, text: '绑定角色 [NAME] 到立绘 [URL]',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: '荧' },
              URL: { type: Scratch.ArgumentType.STRING, defaultValue: 'https://example.com/character.png' }
            }
          },
          {
            opcode: 'unbindPortrait', blockType: Scratch.BlockType.COMMAND, text: '解除角色 [NAME] 的立绘绑定',
            arguments: { NAME: { type: Scratch.ArgumentType.STRING, defaultValue: '荧' } }
          },
          { opcode: 'clearPortraitBindings', blockType: Scratch.BlockType.COMMAND, text: '清空所有立绘绑定' },
          {
            opcode: 'setAutoSwapPortrait', blockType: Scratch.BlockType.COMMAND, text: '说话时自动切换立绘 [STATE]',
            arguments: { STATE: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '开启' } }
          },
          {
            opcode: 'getBoundPortrait', blockType: Scratch.BlockType.REPORTER, text: '角色 [NAME] 绑定的立绘',
            arguments: { NAME: { type: Scratch.ArgumentType.STRING, defaultValue: '荧' } }
          },
          { opcode: 'portraitBindingCount', blockType: Scratch.BlockType.REPORTER, text: '已绑定的角色数' }
        ],
        menus: {
          ON_OFF: { acceptReporters: true, items: ['开启', '关闭'] },
          PORTRAIT_ANCHOR: { acceptReporters: true, items: ANCHORS },
          ENTER_ANIM: { acceptReporters: true, items: ENTER_ANIMS },
          PORTRAIT_FX: { acceptReporters: true, items: FX },
          PERSISTENT_FX: { acceptReporters: true, items: FX2 }
        }
      };
    }

    setPortrait(a) {
      const c = this._ensure(); if (!c) return;
      const url = U.str(a.URL).trim();
      if (!url) return;
      this._swap(url, U.str(a.ANIM) || this.enterAnim, this.fadeMs);
    }

    hidePortrait() {
      if (!this.wrap) return;
      this.wrap.classList.add('is-hidden');
      this.wrap.classList.remove('is-visible');
      this.url = '';
    }

    getPortraitUrl() { return this.url; }

    setPortraitFade(a) {
      this.fadeMs = U.clamp(a.MS, 0, 3000);
      if (this.wrap) this.wrap.style.transitionDuration = this.fadeMs + 'ms';
    }

    preloadPortrait(a) {
      const url = U.str(a.URL).trim();
      if (!url || this._preload.has(url)) return;
      this._preload.add(url);
      const im = new Image();
      im.decoding = 'async';
      im.src = url;
    }

    setPortraitAnchor(a) {
      this.anchor = U.pick(a.ANCHOR, ANCHORS, '左侧');
      this._applyAnchor();
    }

    setPortraitCustomX(a) {
      this.customX = U.clamp(a.PERCENT, 0, 100);
      this.anchor = '自定义';
      this._applyAnchor();
    }

    setPortraitSize(a) {
      this.height = U.clamp(a.H, 20, 220);
      this.offsetY = U.clamp(a.Y, -400, 400);
      this._applySize();
    }

    setPortraitFlip(a) {
      this.flip = U.on(a.STATE);
      this._applySize();
    }

    setPortraitEnterAnim(a) { this.enterAnim = U.pick(a.ANIM, ENTER_ANIMS, '淡入'); }

    portraitEffect(a) {
      const c = this._ensure(); if (!c) return;
      const cls = FX_CLASS[U.str(a.EFFECT)];
      if (!cls) return;
      const img = this.img;
      img.classList.remove(cls);
      void img.offsetWidth;
      img.classList.add(cls);
      const off = () => { img.classList.remove(cls); img.removeEventListener('animationend', off); };
      img.addEventListener('animationend', off);
    }

    setPortraitPersistent(a) {
      const c = this._ensure(); if (!c) return;
      const fx = U.pick(a.EFFECT, FX2, '无');
      this._setClassGroup(this.img, FX2_CLASS, fx === '无' ? '' : fx, 'fx2');
      this.fx2 = fx;
    }

    portraitTransform(a) {
      const c = this._ensure(); if (!c) return;
      const t = this.t;
      t.x = U.num(a.X, t.x);
      t.y = U.num(a.Y, t.y);
      t.scale = U.clamp(U.num(a.S, t.scale), 0.1, 5);
      t.rotate = U.clamp(U.num(a.DEG, t.rotate), -3600, 3600);
      t.alpha = U.clamp(U.num(a.A, t.alpha), 0, 1);
      t.duration = U.clamp(U.num(a.MS, t.duration), 0, 6000);
      this._applyTransform();
    }

    resetPortraitTransform() {
      this.t = { x: 0, y: 0, scale: 1, rotate: 0, alpha: 1, duration: 400 };
      this._applyTransform();
    }

    bindPortrait(a) {
      const n = U.str(a.NAME).trim(), u = U.str(a.URL).trim();
      if (!n || !u) return;
      this.bindings[n] = u;
    }
    unbindPortrait(a) { delete this.bindings[U.str(a.NAME).trim()]; }
    clearPortraitBindings() { this.bindings = Object.create(null); }
    setAutoSwapPortrait(a) { this.autoSwap = U.on(a.STATE); }
    getBoundPortrait(a) { return this.bindings[U.str(a.NAME).trim()] || ''; }
    portraitBindingCount() { return Object.keys(this.bindings).length; }
  }

  const ext = new PortraitExtension();

  HUB.attach({
    name: 'portrait',
    init(core) {
      ext.core = core;
      core.mount();
      ext._build(core);
      core.onSpeakerChange(name => ext._maybeSwap(name));
      core.onReset(() => { ext.hidePortrait(); ext.resetPortraitTransform(); });
      core.portrait = {
        set: (url, anim) => ext.setPortrait({ URL: url, ANIM: anim || '淡入' }),
        hide: () => ext.hidePortrait(),
        url: () => ext.url,
        bind: (n, u) => ext.bindPortrait({ NAME: n, URL: u }),
        effect: e => ext.portraitEffect({ EFFECT: e })
      };
      core.registerSave('portrait',
        () => ({
          url: ext.url, anchor: ext.anchor, customX: ext.customX, height: ext.height,
          offsetY: ext.offsetY, flip: ext.flip, t: ext.t, bindings: Object.assign({}, ext.bindings),
          autoSwap: ext.autoSwap, fx2: ext.fx2, enterAnim: ext.enterAnim
        }),
        v => {
          if (!v) return;
          if (v.anchor) ext.anchor = v.anchor;
          if (v.customX != null) ext.customX = v.customX;
          if (v.height != null) ext.height = v.height;
          if (v.offsetY != null) ext.offsetY = v.offsetY;
          ext.flip = !!v.flip;
          if (v.t) ext.t = Object.assign(ext.t, v.t);
          if (v.bindings) ext.bindings = Object.assign(Object.create(null), v.bindings);
          if (v.autoSwap != null) ext.autoSwap = !!v.autoSwap;
          if (v.fx2) { ext.fx2 = v.fx2; ext.setPortraitPersistent({ EFFECT: v.fx2 }); }
          if (v.enterAnim) ext.enterAnim = v.enterAnim;
          ext._applyAll();
          if (v.url) ext._swap(v.url, '淡入', 0); else ext.hidePortrait();
        });
    }
  });

  Scratch.extensions.register(ext);
})(typeof window !== 'undefined' ? window.Scratch : undefined);
