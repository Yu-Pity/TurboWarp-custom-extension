// Name: 字幕 · Base64
// ID: captionsuitebase64
// Description: Base64 转码工具箱：文本↔Base64、自动嗅探真实类型并转成资源 URL、投放到立绘/表情图标/字幕框背景、解码播放音频、缓存统计与导出下载。
// License: MIT

(function (Scratch) {
  'use strict';
  if (!Scratch) return;
  if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
    throw new Error('[字幕 · Base64] 必须在「取消沙盒模式运行」下工作');
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

  const TYPES = ['自动识别', '图片', '音频'];
  const TARGETS = ['立绘', '表情图标', '字幕框背景'];
  const MAX_CACHE_BYTES = 3 * 1024 * 1024;
  const DEMO_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  class Base64Extension {
    constructor() {
      this.core = null;
      this.cache = Object.create(null);
      this.audio = Object.create(null);
    }

    _c() {
      const c = HUB.core;
      if (!c) { HUB.warn('字幕 · Base64'); return null; }
      return c;
    }

    // ---------- 工具 ----------
    _clean(raw) {
      return U.str(raw).replace(/\s+/g, '').replace(/^data:[\w/\-+.]+;base64,/i, '');
    }
    _mimeOf(raw) {
      const m = /^data:([\w/\-+.]+);base64,/i.exec(U.str(raw));
      return m ? m[1] : '';
    }
    _head(b64, n) {
      try {
        const slice = b64.slice(0, Math.ceil(n / 3) * 4);
        const bin = atob(slice);
        const len = Math.min(n, bin.length);
        const out = new Uint8Array(len);
        for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
        return out;
      } catch (e) { return null; }
    }
    _guess(b64) {
      const h = this._head(b64, 16);
      if (!h || h.length < 4) return '';
      if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e) return 'image/png';
      if (h[0] === 0xff && h[1] === 0xd8) return 'image/jpeg';
      if (h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46) return 'image/gif';
      if (h[0] === 0x42 && h[1] === 0x4d) return 'image/bmp';
      if (h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46) {
        const sub = String.fromCharCode(h[8] || 0, h[9] || 0, h[10] || 0, h[11] || 0);
        if (sub === 'WEBP') return 'image/webp';
        if (sub === 'WAVE') return 'audio/wav';
      }
      if (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) return 'audio/mpeg';
      if (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) return 'audio/mpeg';
      if (h[0] === 0x4f && h[1] === 0x67 && h[2] === 0x67) return 'audio/ogg';
      if (h[0] === 0x66 && h[1] === 0x4c && h[2] === 0x61) return 'audio/flac';
      return '';
    }
    _decodeText(b64) {
      try {
        const bin = atob(this._clean(b64));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        try { return new TextDecoder('utf-8').decode(bytes); } catch (e) {
          let out = '';
          for (let i = 0; i < bin.length; i++) out += String.fromCharCode(bytes[i]);
          return out;
        }
      } catch (e) { return ''; }
    }
    _toUrl(raw, force) {
      const clean = this._clean(raw);
      if (!clean) return '';
      if (this.cache[clean]) return this.cache[clean];
      let mime = this._mimeOf(raw);
      if (!mime) {
        if (force === '图片') mime = 'image/png';
        else if (force === '音频') mime = 'audio/mpeg';
        else mime = this._guess(clean);
      }
      const url = 'data:' + (mime || 'application/octet-stream') + ';base64,' + clean;
      if (clean.length < MAX_CACHE_BYTES) this.cache[clean] = url;
      return url;
    }
    _bytes(clean) {
      const n = clean.length;
      const tail = clean.slice(-2);
      const pad = (tail.charAt(0) === '=' ? 1 : 0) + (tail.charAt(1) === '=' ? 1 : 0);
      return Math.max(0, Math.floor(n * 3 / 4) - pad);
    }

    // ---------- 积木 ----------
    getInfo() {
      return {
        id: 'captionsuitebase64',
        name: '字幕 · Base64',
        color1: '#5c9e7a', color2: '#4b8767', color3: '#3c6e53',
        docsURI: 'https://extensions.turbowarp.org/',
        blocks: [
          '--- 🔐 转码 ---',
          {
            opcode: 'b64Encode', blockType: Scratch.BlockType.REPORTER, text: '【转码】文本 → Base64 [TEXT]',
            arguments: { TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: '你好' } }
          },
          {
            opcode: 'b64Decode', blockType: Scratch.BlockType.REPORTER, text: '【转码】Base64 → 文本 [B64]',
            arguments: { B64: { type: Scratch.ArgumentType.STRING, defaultValue: '5L2g5aW9' } }
          },
          {
            opcode: 'b64ToResource', blockType: Scratch.BlockType.REPORTER, text: '【转码】Base64 → 资源URL [B64] 类型 [TYPE]',
            arguments: {
              B64: { type: Scratch.ArgumentType.STRING, defaultValue: DEMO_PNG },
              TYPE: { type: Scratch.ArgumentType.STRING, menu: 'B64_TYPE', defaultValue: '自动识别' }
            }
          },
          {
            opcode: 'b64Type', blockType: Scratch.BlockType.REPORTER, text: '【转码】Base64 [B64] 的真实类型',
            arguments: { B64: { type: Scratch.ArgumentType.STRING, defaultValue: DEMO_PNG } }
          },
          {
            opcode: 'b64Size', blockType: Scratch.BlockType.REPORTER, text: '【转码】Base64 [B64] 的字节数',
            arguments: { B64: { type: Scratch.ArgumentType.STRING, defaultValue: DEMO_PNG } }
          },

          '--- 📦 投放 ---',
          {
            opcode: 'b64PutInto', blockType: Scratch.BlockType.COMMAND, text: '【转码】把 Base64 放入 [TARGET] [B64]',
            arguments: {
              TARGET: { type: Scratch.ArgumentType.STRING, menu: 'B64_TARGET', defaultValue: '立绘' },
              B64: { type: Scratch.ArgumentType.STRING, defaultValue: DEMO_PNG }
            }
          },
          {
            opcode: 'b64PlayAudio', blockType: Scratch.BlockType.COMMAND, text: '【转码】播放 Base64 音频 [B64]',
            arguments: { B64: { type: Scratch.ArgumentType.STRING, defaultValue: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQxAAAAA' } }
          },
          {
            opcode: 'b64Download', blockType: Scratch.BlockType.COMMAND, text: '【转码】下载 Base64 为文件 [B64] 文件名 [NAME]',
            arguments: {
              B64: { type: Scratch.ArgumentType.STRING, defaultValue: DEMO_PNG },
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'image.png' }
            }
          },
          { opcode: 'b64CacheSize', blockType: Scratch.BlockType.REPORTER, text: '【转码】缓存资源数量' },
          { opcode: 'b64ClearCache', blockType: Scratch.BlockType.COMMAND, text: '【转码】清空资源缓存' }
        ],
        menus: {
          B64_TYPE: { acceptReporters: true, items: TYPES },
          B64_TARGET: { acceptReporters: true, items: TARGETS }
        }
      };
    }

    b64Encode(a) {
      const s = U.str(a.TEXT);
      try {
        const bytes = new TextEncoder().encode(s);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      } catch (e) {
        try { return btoa(unescape(encodeURIComponent(s))); } catch (e2) { return ''; }
      }
    }

    b64Decode(a) { return this._decodeText(a.B64); }
    b64ToResource(a) { return this._toUrl(a.B64, U.str(a.TYPE)); }
    b64Type(a) {
      const raw = U.str(a.B64);
      return this._mimeOf(raw) || this._guess(this._clean(raw)) || '未知';
    }
    b64Size(a) { return this._bytes(this._clean(a.B64)); }

    b64PutInto(a) {
      const c = this._c(); if (!c) return;
      const url = this._toUrl(a.B64, '图片');
      if (!url) return;
      const t = U.pick(a.TARGET, TARGETS, '立绘');
      if (t === '立绘') { if (c.portrait) c.portrait.set(url, '淡入'); }
      else if (t === '表情图标') { if (c.emote) c.emote.icon(url); }
      else if (t === '字幕框背景') c.setBoxBgImage(url);
    }

    b64PlayAudio(a) {
      const c = this._c(); if (!c) return;
      const url = this._toUrl(a.B64, '音频');
      if (!url) return;
      c.sound.resume();
      const mime = this._mimeOf(a.B64) || this._guess(this._clean(a.B64));
      if (mime && mime.indexOf('audio') === 0) {
        const el = new Audio();
        el.src = url; el.volume = c.sound.volume;
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
        return;
      }
      if (this.audio[url]) { this._playBuffer(c, this.audio[url]); return; }
      fetch(url).then(r => r.arrayBuffer())
        .then(buf => c.sound.ctx.decodeAudioData(buf))
        .then(buf => { this.audio[url] = buf; this._playBuffer(c, buf); })
        .catch(() => {});
    }

    _playBuffer(c, buf) {
      if (!c.sound.ctx || !c.sound.master) return;
      try {
        const src = c.sound.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(c.sound.master);
        src.start();
      } catch (e) {}
    }

    b64Download(a) {
      const url = this._toUrl(a.B64, '自动识别');
      if (!url) return;
      const link = document.createElement('a');
      link.href = url;
      link.download = U.str(a.NAME) || 'download';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    b64CacheSize() { return Object.keys(this.cache).length + Object.keys(this.audio).length; }
    b64ClearCache() { this.cache = Object.create(null); this.audio = Object.create(null); }
  }

  const ext = new Base64Extension();

  HUB.attach({
    name: 'base64',
    init(core) {
      ext.core = core;
      core.b64 = {
        encode: t => ext.b64Encode({ TEXT: t }),
        decode: b => ext.b64Decode({ B64: b }),
        url: (b, type) => ext.b64ToResource({ B64: b, TYPE: type || '自动识别' }),
        put: (target, b) => ext.b64PutInto({ TARGET: target, B64: b }),
        play: b => ext.b64PlayAudio({ B64: b })
      };
    }
  });

  Scratch.extensions.register(ext);
})(typeof window !== 'undefined' ? window.Scratch : undefined);
