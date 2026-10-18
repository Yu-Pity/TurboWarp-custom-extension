// Name: 字幕 · 历史
// ID: captionsuitehistory
// Description: 对话履历：历史面板（分组/时间线）、屏幕历史按钮与快捷键、条数上限、按序号回看、导出为文本、表情入史。
// License: MIT

(function (Scratch) {
  'use strict';
  if (!Scratch) return;
  if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
    throw new Error('[字幕 · 历史] 必须在「取消沙盒模式运行」下工作');
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
  const MODES = ['按角色分组', '倒序时间线', '正序时间线'];

  const CSS = `
#caption-suite-root .cap-history{position:absolute;inset:0;display:none;flex-direction:column;
  padding:56px 8vw 44px;overflow-y:auto;pointer-events:auto;
  background:linear-gradient(160deg,rgba(12,10,26,.9),rgba(22,18,44,.92));
  backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);
  animation:capHistIn .24s ease}
#caption-suite-root .cap-history.is-open{display:flex}
@keyframes capHistIn{from{opacity:0}to{opacity:1}}
#caption-suite-root .cap-history::-webkit-scrollbar{width:7px}
#caption-suite-root .cap-history::-webkit-scrollbar-thumb{background:rgba(167,139,250,.4);border-radius:4px}
#caption-suite-root .cap-history h3{margin:0 0 18px;color:#fff;font-size:23px;letter-spacing:.16em;font-weight:700;
  text-shadow:0 2px 12px rgba(124,92,191,.6)}
#caption-suite-root .cap-history .close{position:absolute;top:22px;right:7vw;
  background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.26);color:#fff;
  padding:8px 20px;border-radius:999px;font-size:14px;cursor:pointer;font-family:inherit;
  transition:background .18s,transform .18s}
#caption-suite-root .cap-history .close:hover{background:rgba(255,255,255,.3);transform:translateY(-1px)}
#caption-suite-root .cap-history .group{margin:16px 0 8px;padding-left:11px;color:#cdbcf7;
  font-size:15px;font-weight:800;letter-spacing:.1em;border-left:4px solid rgba(167,139,250,.85)}
#caption-suite-root .cap-history .item{max-width:880px;margin-bottom:13px;padding:11px 15px;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:12px}
#caption-suite-root .cap-history .item .n{display:inline-block;font-weight:800;color:#d9c9ff;
  padding:2px 11px;border-radius:8px;background:rgba(167,139,250,.26);font-size:14px;margin-right:8px}
#caption-suite-root .cap-history .item .ts{font-size:11px;color:rgba(255,255,255,.4);margin-left:6px}
#caption-suite-root .cap-history .item .t{margin-top:5px;color:#f3efff;font-size:16.5px;line-height:1.7;white-space:pre-wrap}
#caption-suite-root .cap-history .empty{color:rgba(255,255,255,.5);font-size:16px}
`;

  class HistoryExtension {
    constructor() {
      this.core = null;
      this.btn = null;
      this.mode = '按角色分组';
      this.withEmoticon = true;
      this.pos = '右上角';
      this.shortcut = 'L';
      this.visible = false;
    }

    _c() {
      const c = HUB.core;
      if (!c) { HUB.warn('字幕 · 历史'); return null; }
      return c;
    }

    _ensureBtn() {
      const c = this._c(); if (!c) return null;
      if (this.btn) return this.btn;
      this.btn = c.createButton({
        kind: 'history', label: '历史', icon: '📖', pos: this.pos,
        onClick: () => this.toggle()
      });
      if (!this.btn) return null;
      this.btn.shortcut = this.shortcut;
      c.setButtonVisible(this.btn, this.visible);
      return this.btn;
    }

    _time(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      const p = n => (n < 10 ? '0' + n : '' + n);
      return p(d.getHours()) + ':' + p(d.getMinutes());
    }

    _render() {
      const c = this._c(); if (!c) return;
      const el = c.el.history;
      if (!el) return;
      el.textContent = '';
      const title = document.createElement('h3');
      title.textContent = '历史记录';
      const close = document.createElement('button');
      close.className = 'close';
      close.type = 'button';
      close.textContent = '关闭 ✕';
      close.addEventListener('click', () => this.closeHistory());
      const frag = document.createDocumentFragment();
      frag.append(title, close);
      const log = c.logAll();
      if (!log.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '还没有任何对话记录。';
        frag.appendChild(empty);
      } else if (this.mode === '按角色分组') {
        const groups = new Map();
        for (let i = 0; i < log.length; i++) {
          const e = log[i];
          if (!groups.has(e.name)) groups.set(e.name, []);
          groups.get(e.name).push(e);
        }
        groups.forEach((items, name) => {
          const g = document.createElement('div');
          g.className = 'group';
          g.textContent = name || '???';
          frag.appendChild(g);
          for (let i = 0; i < items.length; i++) frag.appendChild(this._item(items[i]));
        });
      } else {
        const list = this.mode === '正序时间线' ? log.slice() : log.slice().reverse();
        for (let i = 0; i < list.length; i++) frag.appendChild(this._item(list[i]));
      }
      el.appendChild(frag);
      el.classList.add('is-open');
      el.scrollTop = 0;
      c.sound.play('提示');
    }

    _item(e) {
      const item = document.createElement('div');
      item.className = 'item';
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = e.name || '???';
      const ts = document.createElement('span');
      ts.className = 'ts';
      ts.textContent = this._time(e.ts);
      const t = document.createElement('div');
      t.className = 't';
      t.textContent = e.text;
      const head = document.createElement('div');
      head.append(n, ts);
      item.append(head, t);
      return item;
    }

    toggle() {
      const c = this._c(); if (!c) return;
      if (c.el.history.classList.contains('is-open')) this.closeHistory();
      else this.openHistory();
    }

    // ---------- 积木 ----------
    getInfo() {
      return {
        id: 'captionsuitehistory',
        name: '字幕 · 历史',
        color1: '#a58a5c', color2: '#8f7549', color3: '#755f39',
        docsURI: 'https://extensions.turbowarp.org/',
        blocks: [
          '--- 📜 历史记录 ---',
          { opcode: 'openHistory', blockType: Scratch.BlockType.COMMAND, text: '打开历史记录' },
          { opcode: 'closeHistory', blockType: Scratch.BlockType.COMMAND, text: '关闭历史记录' },
          { opcode: 'clearHistory', blockType: Scratch.BlockType.COMMAND, text: '清空历史记录' },
          {
            opcode: 'setHistoryMode', blockType: Scratch.BlockType.COMMAND, text: '历史记录显示方式 [MODE]',
            arguments: { MODE: { type: Scratch.ArgumentType.STRING, menu: 'HISTORY_MODE', defaultValue: '按角色分组' } }
          },
          {
            opcode: 'setHistoryWithEmoticon', blockType: Scratch.BlockType.COMMAND, text: '历史记录附带表情 [STATE]',
            arguments: { STATE: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '开启' } }
          },
          {
            opcode: 'setHistoryLimit', blockType: Scratch.BlockType.COMMAND, text: '历史记录最多保留 [N] 条',
            arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 200 } }
          },
          { opcode: 'getHistoryLength', blockType: Scratch.BlockType.REPORTER, text: '历史记录条数' },
          {
            opcode: 'getHistoryNameAt', blockType: Scratch.BlockType.REPORTER, text: '倒数第 [INDEX] 条的说话人',
            arguments: { INDEX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } }
          },
          {
            opcode: 'getHistoryTextAt', blockType: Scratch.BlockType.REPORTER, text: '倒数第 [INDEX] 条的内容',
            arguments: { INDEX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } }
          },
          { opcode: 'exportHistory', blockType: Scratch.BlockType.REPORTER, text: '导出历史为文本' },

          '--- 🔘 历史按钮 ---',
          {
            opcode: 'showHistoryBtn', blockType: Scratch.BlockType.COMMAND, text: '显示历史按钮 位置 [POS]',
            arguments: { POS: { type: Scratch.ArgumentType.STRING, menu: 'BTN_POS', defaultValue: '右上角' } }
          },
          { opcode: 'hideHistoryBtn', blockType: Scratch.BlockType.COMMAND, text: '隐藏历史按钮' },
          {
            opcode: 'setHistoryShortcut', blockType: Scratch.BlockType.COMMAND, text: '历史快捷键 [KEY]',
            arguments: { KEY: { type: Scratch.ArgumentType.STRING, defaultValue: 'L' } }
          }
        ],
        menus: {
          ON_OFF: { acceptReporters: true, items: ['开启', '关闭'] },
          HISTORY_MODE: { acceptReporters: true, items: MODES },
          BTN_POS: { acceptReporters: true, items: BTN_POS }
        }
      };
    }

    openHistory() {
      const c = this._c(); if (!c) return;
      c.mount();
      this._render();
    }

    closeHistory() {
      const c = this._c(); if (!c) return;
      if (c.el.history) c.el.history.classList.remove('is-open');
      c.sound.play('取消');
    }

    clearHistory() {
      const c = this._c(); if (!c) return;
      c.logClear();
      this.closeHistory();
    }

    setHistoryMode(a) { this.mode = U.pick(a.MODE, MODES, '按角色分组'); }
    setHistoryWithEmoticon(a) { this.withEmoticon = U.on(a.STATE); }
    setHistoryLimit(a) {
      const c = this._c(); if (!c) return;
      c.logLimit(Math.round(U.clamp(a.N, 1, 2000)));
    }

    getHistoryLength() {
      const c = this._c(); if (!c) return 0;
      return c.logAll().length;
    }
    getHistoryNameAt(a) {
      const c = this._c(); if (!c) return '';
      const log = c.logAll();
      const i = Math.max(1, Math.floor(U.num(a.INDEX, 1)));
      const e = log[log.length - i];
      return e ? e.name : '';
    }
    getHistoryTextAt(a) {
      const c = this._c(); if (!c) return '';
      const log = c.logAll();
      const i = Math.max(1, Math.floor(U.num(a.INDEX, 1)));
      const e = log[log.length - i];
      return e ? e.text : '';
    }
    exportHistory() {
      const c = this._c(); if (!c) return '';
      return c.logAll().map(e => (e.name ? e.name + '：' : '') + e.text).join('\n');
    }

    showHistoryBtn(a) {
      const c = this._c(); if (!c) return;
      this.pos = U.pick(a.POS, BTN_POS, '右上角');
      if (this.btn) this.btn.pos = this.pos;
      this.visible = true;
      const b = this._ensureBtn();
      if (b) { c.setButtonVisible(b, true); c.layoutButtons(); }
    }
    hideHistoryBtn() {
      const c = this._c(); if (!c) return;
      this.visible = false;
      if (this.btn) { c.setButtonVisible(this.btn, false); c.layoutButtons(); }
    }
    setHistoryShortcut(a) {
      const c = this._c(); if (!c) return;
      this.shortcut = U.str(a.KEY).slice(0, 1);
      if (this.btn) this.btn.shortcut = this.shortcut;
    }
  }

  const ext = new HistoryExtension();

  HUB.attach({
    name: 'history',
    init(core) {
      ext.core = core;
      core.mount();
      core.addCSS('history', CSS);
      core.history = { open: () => ext.openHistory(), close: () => ext.closeHistory(), clear: () => ext.clearHistory() };
      // 表情入史
      window.addEventListener('captionsuite:表情弹出', ev => {
        if (!ext.withEmoticon) return;
        const log = core.logAll();
        const last = log[log.length - 1];
        if (last && ev && ev.detail) last.text = last.text + (ev.detail.key || '');
      });
      // ESC 关闭
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && core.el.history && core.el.history.classList.contains('is-open')) ext.closeHistory();
      });
      core.registerSave('history',
        () => ({ mode: ext.mode, withEmoticon: ext.withEmoticon, visible: ext.visible, pos: ext.pos }),
        v => {
          if (!v) return;
          if (v.mode) ext.mode = v.mode;
          if (v.withEmoticon != null) ext.withEmoticon = !!v.withEmoticon;
          if (v.pos) ext.pos = v.pos;
          ext.visible = !!v.visible;
          if (ext.visible) ext.showHistoryBtn({ POS: ext.pos });
        });
    }
  });

  Scratch.extensions.register(ext);
})(typeof window !== 'undefined' ? window.Scratch : undefined);
