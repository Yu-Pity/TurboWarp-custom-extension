// Name: 字幕 · 存档
// ID: captionsuitesave
// Description: 进度存档：多槽位保存/读取/删除，快照包含台词、分页、历史、自动播放、外观、立绘等全部模块状态，支持导出/导入文本。
// License: MIT

(function (Scratch) {
  'use strict';
  if (!Scratch) return;
  if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
    throw new Error('[字幕 · 存档] 必须在「取消沙盒模式运行」下工作');
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

  class SaveExtension {
    constructor() { this.core = null; }

    _c() {
      const c = HUB.core;
      if (!c) { HUB.warn('字幕 · 存档'); return null; }
      return c;
    }

    _time(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      const p = n => (n < 10 ? '0' + n : '' + n);
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
        + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    getInfo() {
      return {
        id: 'captionsuitesave',
        name: '字幕 · 存档',
        color1: '#c98a3c', color2: '#b0752c', color3: '#93601f',
        docsURI: 'https://extensions.turbowarp.org/',
        blocks: [
          '--- 💾 存档 ---',
          {
            opcode: 'saveState', blockType: Scratch.BlockType.COMMAND, text: '存档到槽位 [SLOT]',
            arguments: { SLOT: { type: Scratch.ArgumentType.STRING, defaultValue: 'default' } }
          },
          {
            opcode: 'loadState', blockType: Scratch.BlockType.COMMAND, text: '读取存档 [SLOT]',
            arguments: { SLOT: { type: Scratch.ArgumentType.STRING, defaultValue: 'default' } }
          },
          {
            opcode: 'hasSave', blockType: Scratch.BlockType.BOOLEAN, text: '存档 [SLOT] 存在？',
            arguments: { SLOT: { type: Scratch.ArgumentType.STRING, defaultValue: 'default' } }
          },
          {
            opcode: 'clearSave', blockType: Scratch.BlockType.COMMAND, text: '删除存档 [SLOT]',
            arguments: { SLOT: { type: Scratch.ArgumentType.STRING, defaultValue: 'default' } }
          },
          { opcode: 'clearAllSaves', blockType: Scratch.BlockType.COMMAND, text: '清空所有存档' },
          { opcode: 'saveSlots', blockType: Scratch.BlockType.REPORTER, text: '存档槽位列表（用 | 分隔）' },
          {
            opcode: 'saveTime', blockType: Scratch.BlockType.REPORTER, text: '存档 [SLOT] 的保存时间',
            arguments: { SLOT: { type: Scratch.ArgumentType.STRING, defaultValue: 'default' } }
          },
          {
            opcode: 'exportSave', blockType: Scratch.BlockType.REPORTER, text: '导出存档 [SLOT] 为文本',
            arguments: { SLOT: { type: Scratch.ArgumentType.STRING, defaultValue: 'default' } }
          },
          {
            opcode: 'importSave', blockType: Scratch.BlockType.COMMAND, text: '导入存档 槽位 [SLOT] 数据 [JSON]',
            arguments: {
              SLOT: { type: Scratch.ArgumentType.STRING, defaultValue: 'default' },
              JSON: { type: Scratch.ArgumentType.STRING, defaultValue: '{}' }
            }
          }
        ],
        menus: {}
      };
    }

    saveState(a) {
      const c = this._c(); if (!c) return;
      c.saveSlot(a.SLOT);
      c.sound.play('确认');
    }

    loadState(a) {
      const c = this._c(); if (!c) return;
      const data = c.slot(a.SLOT);
      if (!data) return;
      c.mount();
      c.restore(data);
      c.sound.play('宝箱');
    }

    hasSave(a) {
      const c = this._c(); if (!c) return false;
      return c.hasSlot(a.SLOT);
    }

    clearSave(a) {
      const c = this._c(); if (!c) return;
      c.delSlot(a.SLOT);
    }

    clearAllSaves() {
      const c = this._c(); if (!c) return;
      c.clearSlots();
    }

    saveSlots() {
      const c = this._c(); if (!c) return '';
      return c.slotNames().join('|');
    }

    saveTime(a) {
      const c = this._c(); if (!c) return '';
      const s = c.slot(a.SLOT);
      return s ? this._time(s.ts) : '';
    }

    exportSave(a) {
      const c = this._c(); if (!c) return '';
      const s = c.slot(a.SLOT);
      if (!s) return '';
      try { return JSON.stringify(s); } catch (e) { return ''; }
    }

    importSave(a) {
      const c = this._c(); if (!c) return;
      const txt = U.str(a.JSON).trim();
      if (!txt) return;
      let data;
      try { data = JSON.parse(txt); } catch (e) { return; }
      const slot = U.str(a.SLOT) || 'default';
      c._saves[slot] = data;
    }
  }

  const ext = new SaveExtension();

  HUB.attach({
    name: 'save',
    init(core) {
      ext.core = core;
      core.savesApi = {
        save: slot => core.saveSlot(slot),
        load: slot => { const d = core.slot(slot); if (d) { core.mount(); core.restore(d); } },
        list: () => core.slotNames()
      };
    }
  });

  Scratch.extensions.register(ext);
})(typeof window !== 'undefined' ? window.Scratch : undefined);
