// Name: 字幕 · 音效
// ID: captionsuitesound
// Description: 内置合成音效：20 种预设、自定义波形音、打字音效与音色、音量与总开关。无需外部音频文件。
// License: MIT

(function (Scratch) {
  'use strict';
  if (!Scratch) return;
  if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
    throw new Error('[字幕 · 音效] 必须在「取消沙盒模式运行」下工作');
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

  const SOUND_NAMES = ['木鱼', '上升', '提示', '确认', '取消', '打字', '翻页', '邮件', '宝箱', '警告',
    '心跳', '风铃', '玻璃', '泡泡', '打字-轻', '打字-重', '打字-机械', '悬停', '错误', '通知'];
  const WAVES = ['sine', 'triangle', 'square', 'sawtooth'];
  const WAVE_CN = ['正弦', '三角', '方波', '锯齿'];

  class SoundExtension {
    constructor() { this.core = null; }

    _c() {
      const c = HUB.core;
      if (!c) { HUB.warn('字幕 · 音效'); return null; }
      return c;
    }

    getInfo() {
      return {
        id: 'captionsuitesound',
        name: '字幕 · 音效',
        color1: '#d65c5c', color2: '#c04a4a', color3: '#a03a3a',
        docsURI: 'https://extensions.turbowarp.org/',
        blocks: [
          '--- 🔊 音效 ---',
          {
            opcode: 'playBuiltInSound', blockType: Scratch.BlockType.COMMAND, text: '播放音效 [SOUND]',
            arguments: { SOUND: { type: Scratch.ArgumentType.STRING, menu: 'SOUND_MENU', defaultValue: '确认' } }
          },
          {
            opcode: 'playTone', blockType: Scratch.BlockType.COMMAND,
            text: '自定义音效 频率 [FREQ] 结束频率 [END] 时长 [DUR] 波形 [WAVE] 音量 [GAIN]',
            arguments: {
              FREQ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 660 },
              END: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              DUR: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.15 },
              WAVE: { type: Scratch.ArgumentType.STRING, menu: 'WAVE', defaultValue: '正弦' },
              GAIN: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.18 }
            }
          },
          {
            opcode: 'setTypingSound', blockType: Scratch.BlockType.COMMAND, text: '打字音效 [STATE] 音色 [PRESET]',
            arguments: {
              STATE: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '开启' },
              PRESET: { type: Scratch.ArgumentType.STRING, menu: 'SOUND_MENU', defaultValue: '打字-轻' }
            }
          },
          {
            opcode: 'setSfxVolume', blockType: Scratch.BlockType.COMMAND, text: '音效音量 [VOL]（0~1）',
            arguments: { VOL: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.5 } }
          },
          {
            opcode: 'setSfxEnabled', blockType: Scratch.BlockType.COMMAND, text: '音效总开关 [STATE]',
            arguments: { STATE: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '开启' } }
          },
          { opcode: 'sfxVolume', blockType: Scratch.BlockType.REPORTER, text: '当前音效音量' },
          { opcode: 'soundList', blockType: Scratch.BlockType.REPORTER, text: '音效名称列表（用 | 分隔）' }
        ],
        menus: {
          ON_OFF: { acceptReporters: true, items: ['开启', '关闭'] },
          SOUND_MENU: { acceptReporters: true, items: SOUND_NAMES },
          WAVE: { acceptReporters: true, items: WAVE_CN }
        }
      };
    }

    playBuiltInSound(a) {
      const c = this._c(); if (!c) return;
      c.sound.play(U.str(a.SOUND));
    }

    playTone(a) {
      const c = this._c(); if (!c) return;
      const wave = WAVES[Math.max(0, WAVE_CN.indexOf(U.str(a.WAVE)))];
      const end = U.num(a.END, 0);
      c.sound.play({
        freq: U.clamp(a.FREQ, 20, 12000),
        endFreq: end > 0 ? U.clamp(end, 20, 12000) : null,
        dur: U.clamp(a.DUR, 0.01, 3),
        wave: wave,
        gain: U.clamp(a.GAIN, 0.001, 1)
      });
    }

    setTypingSound(a) {
      const c = this._c(); if (!c) return;
      c.typingSoundEnabled = U.on(a.STATE);
      const p = U.str(a.PRESET);
      c.typingSoundPreset = SOUND_NAMES.indexOf(p) >= 0 ? p : '打字-轻';
    }

    setSfxVolume(a) {
      const c = this._c(); if (!c) return;
      c.sound.setVolume(U.clamp(a.VOL, 0, 1));
    }

    setSfxEnabled(a) {
      const c = this._c(); if (!c) return;
      c.sound.setEnabled(U.on(a.STATE));
      if (c.sound.enabled) c.sound.resume();
    }

    sfxVolume() {
      const c = this._c(); if (!c) return 0;
      return c.sound.volume;
    }

    soundList() { return SOUND_NAMES.join('|'); }
  }

  const ext = new SoundExtension();

  HUB.attach({
    name: 'sound',
    init(core) {
      ext.core = core;
      core.sfx = {
        play: name => core.sound.play(name),
        tone: opts => core.sound.play(opts)
      };
      core.registerSave('sound',
        () => ({ volume: core.sound.volume, enabled: core.sound.enabled, typing: core.typingSoundEnabled, typingPreset: core.typingSoundPreset }),
        v => {
          if (!v) return;
          if (v.volume != null) core.sound.setVolume(v.volume);
          if (v.enabled != null) core.sound.setEnabled(!!v.enabled);
          if (v.typing != null) core.typingSoundEnabled = !!v.typing;
          if (v.typingPreset) core.typingSoundPreset = v.typingPreset;
        });
    }
  });

  Scratch.extensions.register(ext);
})(typeof window !== 'undefined' ? window.Scratch : undefined);
