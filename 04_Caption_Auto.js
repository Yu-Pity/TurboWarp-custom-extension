// Name: 字幕 · 自动播放
// ID: captionsuiteauto
// Description: 自动推进：自动播放开关、页间等待（可按字数自适应）、屏幕按钮（位置/皮肤/大小）、快捷键。
// License: MIT

(function (Scratch) {
  'use strict';
  if (!Scratch) return;
  if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
    throw new Error('[字幕 · 自动播放] 必须在「取消沙盒模式运行」下工作');
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
  const BTN_POS = ['左上角', '右上角', '左下角', '右下角'];
  const BTN_SKIN = ['胶囊', '圆形', '半透明条'];

  class AutoExtension {
    constructor() {
      this.core = null;
      this.btn = null;
      this.skin = '胶囊';
      this.scale = 1;
      this.pos = '右上角';
      this.shortcut = 'A';
      this.visible = false;
    }

    getInfo() {
      return {
        id: 'captionsuiteauto',
        name: '字幕 · 自动播放',
        color1: '#35a06b', color2: '#2b8859', color3: '#217047',
        docsURI: 'https://extensions.turbowarp.org/',
        blocks: [
          '--- ▶️ 自动播放 ---',
          {
            opcode: 'setAutoMode', blockType: Scratch.BlockType.COMMAND, text: '自动播放 [STATE] 间隔 [DELAY] 毫秒',
            arguments: {
              STATE: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '开启' },
              DELAY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1000 }
            }
          },
          {
            opcode: 'setAutoDelay', blockType: Scratch.BlockType.COMMAND, text: '自动播放页间等待 [MS] 毫秒',
            arguments: { MS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1000 } }
          },
          {
            opcode: 'setAutoByChars', blockType: Scratch.BlockType.COMMAND, text: '等待时间按字数累加 [STATE]',
            arguments: { STATE: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '关闭' } }
          },
          { opcode: 'toggleAuto', blockType: Scratch.BlockType.COMMAND, text: '切换自动播放状态' },
          { opcode: 'isAutoMode', blockType: Scratch.BlockType.BOOLEAN, text: '自动播放开启中？' },

          '--- 🎛️ 自动按钮 ---',
          {
            opcode: 'showAutoBtn', blockType: Scratch.BlockType.COMMAND, text: '显示自动播放按钮 位置 [POS]',
            arguments: { POS: { type: Scratch.ArgumentType.STRING, menu: 'BTN_POS', defaultValue: '右上角' } }
          },
          { opcode: 'hideAutoBtn', blockType: Scratch.BlockType.COMMAND, text: '隐藏自动播放按钮' },
          {
            opcode: 'setAutoBtnSkin', blockType: Scratch.BlockType.COMMAND, text: '按钮样式 [SKIN] 大小 [SCALE]',
            arguments: {
              SKIN: { type: Scratch.ArgumentType.STRING, menu: 'BTN_SKIN', defaultValue: '胶囊' },
              SCALE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
            }
          },
          {
            opcode: 'setAutoShortcut', blockType: Scratch.BlockType.COMMAND, text: '自动播放快捷键 [KEY]',
            arguments: { KEY: { type: Scratch.ArgumentType.STRING, defaultValue: 'A' } }
          }
        ],
        menus: {
          ON_OFF: { acceptReporters: true, items: ['开启', '关闭'] },
          BTN_POS: { acceptReporters: true, items: BTN_POS },
          BTN_SKIN: { acceptReporters: true, items: BTN_SKIN }
        }
      };
    }

    _c() {
      const c = HUB.core;
      if (!c) { HUB.warn('字幕 · 自动播放'); return null; }
      return c;
    }

    _ensureBtn() {
      const c = this._c(); if (!c) return null;
      if (this.btn) return this.btn;
      this.btn = c.createButton({
        kind: 'auto', label: '自动', icon: '▶', pos: this.pos,
        onClick: () => this.toggleAuto()
      });
      if (!this.btn) return null;
      this.btn.shortcut = this.shortcut;
      c.setButtonVisible(this.btn, this.visible);
      c.setButtonSkin(this.skin, this.scale);
      this._syncBtn();
      return this.btn;
    }

    _syncBtn() {
      const c = this.core;
      if (!c || !this.btn) return;
      const on = !!c._autoPlay;
      this.btn.btn.classList.toggle('is-on', on);
      if (this.btn.ico) this.btn.ico.textContent = on ? '⏸' : '▶';
      if (this.btn.lbl) this.btn.lbl.textContent = on ? '自动中' : '自动';
      this.btn.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    setAutoMode(a) {
      const c = this._c(); if (!c) return;
      c._autoPlay = U.on(a.STATE);
      c._autoDelay = U.clamp(a.DELAY, 0, 600000);
      this._syncBtn();
      c.syncAutoTimer();
    }

    setAutoDelay(a) {
      const c = this._c(); if (!c) return;
      c._autoDelay = U.clamp(a.MS, 1000, 600000);
      c.syncAutoTimer();
    }

    setAutoByChars(a) {
      const c = this._c(); if (!c) return;
      c._autoByChars = U.on(a.STATE);
      c.syncAutoTimer();
    }

    toggleAuto() {
      const c = this._c(); if (!c) return;
      c._autoPlay = !c._autoPlay;
      this._syncBtn();
      c.syncAutoTimer();
      c.sound.play(c._autoPlay ? '上升' : '取消');
    }

    isAutoMode() {
      const c = this._c(); if (!c) return false;
      return !!c._autoPlay;
    }

    showAutoBtn(a) {
      const c = this._c(); if (!c) return;
      this.pos = U.pick(a.POS, BTN_POS, '右上角');
      if (this.btn) this.btn.pos = this.pos;
      this.visible = true;
      const b = this._ensureBtn();
      if (b) { c.setButtonVisible(b, true); c.layoutButtons(); }
    }

    hideAutoBtn() {
      const c = this._c(); if (!c) return;
      this.visible = false;
      if (this.btn) { c.setButtonVisible(this.btn, false); c.layoutButtons(); }
    }

    setAutoBtnSkin(a) {
      const c = this._c(); if (!c) return;
      this.skin = U.pick(a.SKIN, BTN_SKIN, '胶囊');
      this.scale = U.clamp(a.SCALE, 0.5, 2);
      c.setButtonSkin(this.skin, this.scale);
    }

    setAutoShortcut(a) {
      const c = this._c(); if (!c) return;
      this.shortcut = U.str(a.KEY).slice(0, 1);
      if (this.btn) this.btn.shortcut = this.shortcut;
    }
  }

  const ext = new AutoExtension();

  HUB.attach({
    name: 'auto',
    init(core) {
      ext.core = core;
      core.auto = {
        set: (on, delay) => ext.setAutoMode({ STATE: on ? '开启' : '关闭', DELAY: delay }),
        toggle: () => ext.toggleAuto(),
        on: () => !!core._autoPlay
      };
      core.registerSave('auto',
        () => ({ on: core._autoPlay, delay: core._autoDelay, byChars: core._autoByChars, visible: ext.visible, pos: ext.pos }),
        v => {
          if (!v) return;
          core._autoPlay = !!v.on;
          if (v.delay != null) core._autoDelay = v.delay;
          core._autoByChars = !!v.byChars;
          if (v.pos) ext.pos = v.pos;
          ext.visible = !!v.visible;
          if (ext.visible) ext.showAutoBtn({ POS: ext.pos });
          ext._syncBtn();
          core.syncAutoTimer();
        });
    }
  });

  Scratch.extensions.register(ext);
})(typeof window !== 'undefined' ? window.Scratch : undefined);
