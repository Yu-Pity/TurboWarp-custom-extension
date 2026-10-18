// Name: 字幕 · 选项
// ID: captionsuitechoice
// Description: 分支选项：弹出选项（最多 9 个）、自动/随机选择策略、排列方式与自动选择延迟。
// License: MIT

(function (Scratch) {
  'use strict';
  if (!Scratch) return;
  if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
    throw new Error('[字幕 · 选项] 必须在「取消沙盒模式运行」下工作');
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
  const MAX_CHOICES = 9;
  const CHOICE_MODES = ['等待用户', '自动选第一个', '自动选最后一个', '随机选择'];
  const LAYOUTS = ['竖排', '横排'];

  class ChoiceExtension {
    constructor() { this.core = null; this.layout = '竖排'; }

    getInfo() {
      return {
        id: 'captionsuitechoice',
        name: '字幕 · 选项',
        color1: '#e0893c', color2: '#c9742c', color3: '#a85f1f',
        docsURI: 'https://extensions.turbowarp.org/',
        blocks: [
          '--- 🔘 选项 ---',
          {
            opcode: 'showChoices', blockType: Scratch.BlockType.REPORTER, text: '显示选项 [A]|[B]|[C]',
            arguments: {
              A: { type: Scratch.ArgumentType.STRING, defaultValue: '接受委托' },
              B: { type: Scratch.ArgumentType.STRING, defaultValue: '再考虑一下' },
              C: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
            }
          },
          {
            opcode: 'showChoiceList', blockType: Scratch.BlockType.REPORTER, text: '显示多个选项 [LIST]（用 | 分隔）',
            arguments: { LIST: { type: Scratch.ArgumentType.STRING, defaultValue: '去蒙德城|去璃月港|再等等' } }
          },
          {
            opcode: 'setChoiceMode', blockType: Scratch.BlockType.COMMAND, text: '遇到选项时 [MODE]',
            arguments: { MODE: { type: Scratch.ArgumentType.STRING, menu: 'CHOICE_MODE', defaultValue: '等待用户' } }
          },
          {
            opcode: 'setChoiceDelay', blockType: Scratch.BlockType.COMMAND, text: '自动选择延迟 [DELAY] 毫秒',
            arguments: { DELAY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 500 } }
          },
          {
            opcode: 'setChoiceLayout', blockType: Scratch.BlockType.COMMAND, text: '选项排列 [LAYOUT]',
            arguments: { LAYOUT: { type: Scratch.ArgumentType.STRING, menu: 'CHOICE_LAYOUT', defaultValue: '竖排' } }
          },
          { opcode: 'clearLastChoice', blockType: Scratch.BlockType.COMMAND, text: '清空上次选择记录' },
          { opcode: 'choiceCount', blockType: Scratch.BlockType.REPORTER, text: '当前选项个数' }
        ],
        menus: {
          CHOICE_MODE: { acceptReporters: true, items: CHOICE_MODES },
          CHOICE_LAYOUT: { acceptReporters: true, items: LAYOUTS }
        }
      };
    }

    _c() {
      const c = HUB.core;
      if (!c) { HUB.warn('字幕 · 选项'); return null; }
      return c;
    }

    _applyLayout() {
      const c = this.core;
      if (!c || !c.el.choices) return;
      c.el.choices.classList.toggle('is-row', this.layout === '横排');
    }

    async showChoices(a) {
      const c = this._c(); if (!c) return '';
      const opts = [a.A, a.B, a.C].map(U.str).map(s => s.trim()).filter(Boolean).slice(0, MAX_CHOICES);
      if (!opts.length) return '';
      this._applyLayout();
      const res = await c.openChoices(opts);
      return res.text || '';
    }

    async showChoiceList(a) {
      const c = this._c(); if (!c) return '';
      const opts = U.split(a.LIST, MAX_CHOICES);
      if (!opts.length) return '';
      this._applyLayout();
      const res = await c.openChoices(opts);
      return res.text || '';
    }

    setChoiceMode(a) {
      const c = this._c(); if (!c) return;
      c._choiceMode = U.pick(a.MODE, CHOICE_MODES, '等待用户');
      if (c.state === 'choosing') c.syncAutoTimer();
    }

    setChoiceDelay(a) {
      const c = this._c(); if (!c) return;
      c._choiceDelay = U.clamp(a.DELAY, 0, 600000);
    }

    setChoiceLayout(a) {
      this.layout = U.pick(a.LAYOUT, LAYOUTS, '竖排');
      this._applyLayout();
    }

    clearLastChoice() {
      const c = this._c(); if (!c) return;
      c._lastChoice = { index: 0, text: '' };
    }

    choiceCount() {
      const c = this._c(); if (!c) return 0;
      return c._options.length;
    }
  }

  const ext = new ChoiceExtension();

  HUB.attach({
    name: 'choice',
    init(core) {
      ext.core = core;
      core.choice = {
        open: opts => { ext._applyLayout(); return core.openChoices(opts); },
        mode: m => ext.setChoiceMode({ MODE: m }),
        layout: l => ext.setChoiceLayout({ LAYOUT: l })
      };
      core.onReset(() => { core._choiceMode = '等待用户'; core._choiceDelay = 500; });
      core.registerSave('choice',
        () => ({ mode: core._choiceMode, delay: core._choiceDelay, layout: ext.layout }),
        v => {
          if (!v) return;
          if (v.mode) core._choiceMode = v.mode;
          if (v.delay != null) core._choiceDelay = v.delay;
          if (v.layout) { ext.layout = v.layout; ext._applyLayout(); }
        });
    }
  });

  Scratch.extensions.register(ext);
})(typeof window !== 'undefined' ? window.Scratch : undefined);
