// Name: 字幕 · 剧本
// ID: captionsuitescript
// Description: 连续剧本：整段文本按分隔符切句（支持「角色: 台词」与行尾 >>>选项A|选项B）、逐句播放/等待、句间停顿、完成广播、队列控制。
// License: MIT

(function (Scratch) {
  'use strict';
  if (!Scratch) return;
  if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
    throw new Error('[字幕 · 剧本] 必须在「取消沙盒模式运行」下工作');
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
  const SEPS = ['换行', '分号', '竖线', '句号切分'];
  const MAX_CHOICES = 9;
  const INLINE_RE = />>>([^\n]*)$/;
  const NAME_RE = /^([^：:]{1,20})[：:]([\s\S]*)$/;

  class ScriptExtension {
    constructor() {
      this.core = null;
      this.queue = [];
      this.running = false;
      this.sep = '换行';
      this.autoAdvance = true;
      this.gapMs = 1800;
      this.doneMsg = '';
      this.inlineOptions = true;
      this._gen = 0;
    }

    _c() {
      const c = HUB.core;
      if (!c) { HUB.warn('字幕 · 剧本'); return null; }
      return c;
    }

    /** 把一段文本切成 {name,text,options} 队列 */
    parse(script) {
      const raw = U.str(script);
      let parts;
      if (this.sep === '分号') parts = raw.split(';');
      else if (this.sep === '竖线') parts = raw.split('|');
      else if (this.sep === '句号切分') parts = raw.split(/[。！？!?]/);
      else parts = raw.split(/\r?\n/);
      const out = [];
      for (let i = 0; i < parts.length; i++) {
        let t = U.str(parts[i]).trim();
        if (!t) continue;
        let options = [];
        if (this.inlineOptions) {
          const m = INLINE_RE.exec(t);
          if (m) {
            options = U.split(m[1], MAX_CHOICES);
            t = t.slice(0, m.index).trim();
          }
        }
        if (this.sep === '句号切分') t = t.replace(/[。！？!?；;]+$/, '');
        let name = '', text = t;
        const nm = NAME_RE.exec(t);
        if (nm) { name = nm[1].trim(); text = nm[2].trim(); }
        if (!text && !name) continue;
        out.push({ name, text, options });
      }
      return out;
    }

    enqueue(script) {
      const lines = this.parse(script);
      for (let i = 0; i < lines.length; i++) this.queue.push(lines[i]);
      return lines.length;
    }

    async drain() {
      const c = this._c(); if (!c) return;
      if (this.running) return;
      this.running = true;
      const gen = ++this._gen;
      try {
        while (this.queue.length > 0 && gen === this._gen) {
          const line = this.queue.shift();
          await c.say(line.name, line.text, line.options);
          if (!this.queue.length) break;
          if (this.autoAdvance) await U.wait(this.gapMs);
        }
      } finally {
        this.running = false;
      }
      if (gen !== this._gen) return;
      c.broadcast('全部播放完成');
      if (this.doneMsg) c.broadcast(this.doneMsg);
    }

    // ---------- 积木 ----------
    getInfo() {
      return {
        id: 'captionsuitescript',
        name: '字幕 · 剧本',
        color1: '#7a5cd6', color2: '#6749bf', color3: '#5439a0',
        docsURI: 'https://extensions.turbowarp.org/',
        blocks: [
          '--- 🎬 剧本 ---',
          {
            opcode: 'playScript', blockType: Scratch.BlockType.COMMAND, text: '播放剧本 [SCRIPT]',
            arguments: {
              SCRIPT: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: '荧: 旅行者，准备好出发了吗？\n派蒙: 让我来告诉你吧！\n荧: 前方就是蒙德城了。'
              }
            }
          },
          {
            opcode: 'playScriptAndWait', blockType: Scratch.BlockType.COMMAND, text: '播放剧本并等待 [SCRIPT]',
            arguments: { SCRIPT: { type: Scratch.ArgumentType.STRING, defaultValue: '荧: 你好\n派蒙: 你好呀！' } }
          },
          {
            opcode: 'setScriptMode', blockType: Scratch.BlockType.COMMAND, text: '剧本切分方式 [MODE]',
            arguments: { MODE: { type: Scratch.ArgumentType.STRING, menu: 'SCRIPT_SEP', defaultValue: '换行' } }
          },
          {
            opcode: 'setScriptAutoAdvance', blockType: Scratch.BlockType.COMMAND, text: '剧本逐句自动推进 [STATE]',
            arguments: { STATE: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '开启' } }
          },
          {
            opcode: 'setScriptLineGap', blockType: Scratch.BlockType.COMMAND, text: '剧本句间等待 [MS] 毫秒',
            arguments: { MS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1800 } }
          },
          {
            opcode: 'setScriptInlineOptions', blockType: Scratch.BlockType.COMMAND, text: '支持行尾 >>> 选项 [STATE]',
            arguments: { STATE: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '开启' } }
          },
          {
            opcode: 'setOnAllDoneEvent', blockType: Scratch.BlockType.COMMAND, text: '剧本全部完成时广播 [MSG]',
            arguments: { MSG: { type: Scratch.ArgumentType.STRING, defaultValue: '剧情结束' } }
          },
          { opcode: 'scriptQueueLength', blockType: Scratch.BlockType.REPORTER, text: '剧本剩余句数' },
          { opcode: 'isScriptRunning', blockType: Scratch.BlockType.BOOLEAN, text: '剧本正在播放？' },
          { opcode: 'stopScript', blockType: Scratch.BlockType.COMMAND, text: '停止剧本播放' },
          { opcode: 'clearScript', blockType: Scratch.BlockType.COMMAND, text: '清空剧本队列' }
        ],
        menus: {
          ON_OFF: { acceptReporters: true, items: ['开启', '关闭'] },
          SCRIPT_SEP: { acceptReporters: true, items: SEPS }
        }
      };
    }

    playScript(a) {
      const c = this._c(); if (!c) return;
      if (this.enqueue(a.SCRIPT) === 0) return;
      if (!this.running) this.drain();
    }

    async playScriptAndWait(a) {
      const c = this._c(); if (!c) return;
      if (this.enqueue(a.SCRIPT) === 0) return;
      if (!this.running) await this.drain();
    }

    setScriptMode(a) { this.sep = U.pick(a.MODE, SEPS, '换行'); }
    setScriptAutoAdvance(a) { this.autoAdvance = U.on(a.STATE); }
    setScriptLineGap(a) { this.gapMs = U.clamp(a.MS, 0, 20000); }
    setScriptInlineOptions(a) { this.inlineOptions = U.on(a.STATE); }
    setOnAllDoneEvent(a) { this.doneMsg = U.str(a.MSG); }
    scriptQueueLength() { return this.queue.length; }
    isScriptRunning() { return this.running; }

    stopScript() {
      const c = this._c(); if (!c) return;
      this._gen++;
      this.queue.length = 0;
      this.running = false;
      c.interrupt();
      c.clearCaption();
    }

    clearScript() { this.queue.length = 0; }
  }

  const ext = new ScriptExtension();

  HUB.attach({
    name: 'script',
    init(core) {
      ext.core = core;
      core.script = {
        play: text => ext.playScript({ SCRIPT: text }),
        playWait: text => ext.playScriptAndWait({ SCRIPT: text }),
        stop: () => ext.stopScript(),
        parse: text => ext.parse(text),
        remaining: () => ext.queue.length
      };
    }
  });

  Scratch.extensions.register(ext);
})(typeof window !== 'undefined' ? window.Scratch : undefined);
