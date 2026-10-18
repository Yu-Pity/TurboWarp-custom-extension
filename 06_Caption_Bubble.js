// Name: 字幕 · 气泡表情
// ID: captionsuitebubble
// Description: 头顶飘字：说话气泡（舞台坐标 / 立绘头顶 / 字幕框上方，五种样式、可关尾巴）与符号表情（！？♥ 等，支持自定义图标）。
// License: MIT

(function (Scratch) {
  'use strict';
  if (!Scratch) return;
  if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
    throw new Error('[字幕 · 气泡表情] 必须在「取消沙盒模式运行」下工作');
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

  const SPEECH_STYLES = ['清新', '圆润', '方形', '暗色', '像素'];
  const SPEECH_CLASS = { '清新': 'style-fresh', '圆润': 'style-round', '方形': 'style-square', '暗色': 'style-dark', '像素': 'style-pixel' };
  const EMOTICON_TARGETS = ['当前说话人', '所有角色', '不指定'];

  const CSS = `
#caption-suite-root .cap-speech{position:absolute;max-width:min(260px,60%);min-width:46px;padding:10px 15px;
  background:linear-gradient(150deg,rgba(255,253,247,.975),rgba(243,236,255,.975));
  border:1.5px solid rgba(150,130,190,.55);border-radius:14px;color:#443a58;font-size:14px;line-height:1.5;
  font-weight:600;text-align:center;word-break:break-word;
  box-shadow:0 10px 26px rgba(40,20,80,.28),0 1px 0 rgba(255,255,255,.7) inset;
  transform:translate(-50%,-100%) scale(.72);transform-origin:50% 100%;opacity:0;pointer-events:none;
  font-family:inherit;letter-spacing:.4px;
  transition:transform .26s cubic-bezier(.34,1.5,.64,1),opacity .22s ease}
#caption-suite-root .cap-speech.is-in{opacity:1;transform:translate(-50%,-100%) scale(1)}
#caption-suite-root .cap-speech.is-out{opacity:0;transform:translate(-50%,-118%) scale(.9)}
#caption-suite-root .cap-speech::after{content:'';position:absolute;left:50%;bottom:-9px;transform:translateX(-50%);
  width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:9px solid rgba(150,130,190,.55)}
#caption-suite-root .cap-speech.no-tail::after{display:none}
#caption-suite-root .cap-speech.style-round{border-radius:999px;padding:11px 22px}
#caption-suite-root .cap-speech.style-square{border-radius:5px}
#caption-suite-root .cap-speech.style-dark{color:#f3efff;
  background:linear-gradient(150deg,rgba(34,26,66,.96),rgba(62,48,116,.96));border-color:rgba(167,139,250,.8);
  box-shadow:0 10px 26px rgba(0,0,0,.45),0 1px 0 rgba(255,255,255,.12) inset}
#caption-suite-root .cap-speech.style-dark::after{border-top-color:rgba(62,48,116,.96)}
#caption-suite-root .cap-speech.style-pixel{border-radius:2px;font-family:'Silkscreen','VT323',monospace;letter-spacing:0}

#caption-suite-root .cap-emoticon{position:absolute;display:inline-flex;align-items:center;justify-content:center;
  min-width:38px;min-height:38px;padding:6px 11px;background:#fffdf7;border:2px solid #b8a9d4;border-radius:14px;
  font-size:21px;line-height:1;color:#4a3f5c;font-weight:700;
  box-shadow:0 6px 16px rgba(124,92,191,.28);white-space:nowrap;
  transform:translate(-50%,-50%) scale(.55);opacity:0;pointer-events:none;
  transition:transform .24s cubic-bezier(.34,1.6,.64,1),opacity .2s ease}
#caption-suite-root .cap-emoticon.is-in{opacity:1;transform:translate(-50%,-50%) scale(1)}
#caption-suite-root .cap-emoticon.is-out{opacity:0;transform:translate(-50%,-125%) scale(1)}
#caption-suite-root .cap-emoticon img{max-width:34px;max-height:34px;display:block}
#caption-suite-root .cap-emoticon[data-key="！"]{border-color:#e05050;color:#c03030}
#caption-suite-root .cap-emoticon[data-key="？"]{border-color:#9aa0a6;color:#5f6368}
#caption-suite-root .cap-emoticon[data-key="…"]{border-color:#9aa0a6;color:#6b7280}
#caption-suite-root .cap-emoticon[data-key="♥"]{border-color:#f06090;color:#e0306b}
#caption-suite-root .cap-emoticon[data-key="♪"]{border-color:#a78bfa;color:#7c5cbf}
#caption-suite-root .cap-emoticon[data-key="汗"]{border-color:#8fb8d8;color:#5b8db5}
`;

  class BubbleExtension {
    constructor() {
      this.core = null;
      this.bubbleLayer = null; this.emoteLayer = null;
      this.bubbles = new Map();
      this.emoticons = new Map();
      this.defaultStyle = '清新';
      this.tail = true;
      this.emoticonIcon = '';
      this.emoticonMs = 1400;
    }

    _ensure() {
      const c = HUB.core;
      if (!c) { HUB.warn('字幕 · 气泡表情'); return null; }
      if (!this.bubbleLayer) {
        c.mount();
        c.addCSS('bubble', CSS);
        this.bubbleLayer = c.layer('bubble');
        this.emoteLayer = c.layer('emote');
        c.onLayout(() => this._reposition());
      }
      return c;
    }

    // ---------- 气泡 ----------
    _spawn(name, text, dur, style, point, absolute) {
      const c = this._ensure(); if (!c) return;
      this._remove(name, false);
      const el = document.createElement('div');
      el.className = 'cap-speech ' + (SPEECH_CLASS[style] || 'style-fresh') + (this.tail ? '' : ' no-tail');
      el.textContent = text;
      el.style.left = point.x + 'px';
      el.style.top = point.y + 'px';
      this.bubbleLayer.appendChild(el);
      const rec = { el, x: point.x, y: point.y, timer: 0, absolute: !!absolute };
      this.bubbles.set(name, rec);
      requestAnimationFrame(() => el.classList.add('is-in'));
      if (dur > 0) rec.timer = setTimeout(() => this._remove(name, true), dur * 1000);
      c.sound.play('泡泡', 60);
      c.broadcast('气泡弹出', { name, text });
    }

    _reposition() {
      const c = this.core;
      if (!c) return;
      this.bubbles.forEach(rec => {
        if (rec.absolute || !rec.el.isConnected) return;
        const p = c.stageToPx(rec.x, rec.y);
        rec.el.style.left = p.x + 'px';
        rec.el.style.top = p.y + 'px';
      });
    }

    _remove(name, animate) {
      const rec = this.bubbles.get(name);
      if (!rec) return;
      this.bubbles.delete(name);
      clearTimeout(rec.timer);
      if (animate) {
        rec.el.classList.remove('is-in');
        rec.el.classList.add('is-out');
        setTimeout(() => rec.el.remove(), 280);
      } else {
        rec.el.remove();
      }
    }

    _removeAll(animate) {
      const keys = [];
      this.bubbles.forEach((v, k) => keys.push(k));
      keys.forEach(k => this._remove(k, animate));
    }

    // ---------- 符号表情 ----------
    _emoteAnchor() {
      const c = this.core;
      if (!c) return { x: 0, y: 0 };
      const p = HUB.part('portrait');
      const pExt = c.portrait;
      const wrap = c.root ? c.root.querySelector('.cap-portrait-wrap') : null;
      if (wrap && pExt && pExt.url && pExt.url() && !wrap.classList.contains('is-hidden')) {
        const r = wrap.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return c.anchorOf(wrap, 0.62, 0.2);
      }
      return c.boxAnchor(0.86, 0.15);
    }

    _spawnEmoticon(key) {
      const c = this._ensure(); if (!c) return;
      const el = document.createElement('div');
      el.className = 'cap-emoticon';
      el.dataset.key = key;
      if (this.emoticonIcon) {
        const im = document.createElement('img');
        im.src = this.emoticonIcon;
        im.alt = key;
        el.appendChild(im);
      } else {
        el.textContent = key;
      }
      const p = this._emoteAnchor();
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      this.emoteLayer.appendChild(el);
      requestAnimationFrame(() => el.classList.add('is-in'));
      this.emoticons.set(key, el);
      c.sound.play('提示', 80);
      c.broadcast('表情弹出', { name: c.currentSpeaker(), key });
      setTimeout(() => {
        if (!el.isConnected) return;
        el.classList.remove('is-in');
        el.classList.add('is-out');
        setTimeout(() => el.remove(), 280);
      }, this.emoticonMs);
    }

    // ---------- 积木 ----------
    getInfo() {
      return {
        id: 'captionsuitebubble',
        name: '字幕 · 气泡表情',
        color1: '#3cb0c9', color2: '#2f97ae', color3: '#247c90',
        docsURI: 'https://extensions.turbowarp.org/',
        blocks: [
          '--- 💬 说话气泡 ---',
          {
            opcode: 'showSpeechBubble', blockType: Scratch.BlockType.COMMAND,
            text: '气泡 [NAME] 舞台X [X] Y [Y] 说 [TEXT] 时长 [DUR] 秒 样式 [STYLE]',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: '角色' },
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 60 },
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: '你好！' },
              DUR: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
              STYLE: { type: Scratch.ArgumentType.STRING, menu: 'SPEECH_STYLE', defaultValue: '清新' }
            }
          },
          {
            opcode: 'showBubbleOnPortrait', blockType: Scratch.BlockType.COMMAND, text: '说话人头顶气泡 [TEXT] 时长 [DUR] 秒 样式 [STYLE]',
            arguments: {
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: '！' },
              DUR: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
              STYLE: { type: Scratch.ArgumentType.STRING, menu: 'SPEECH_STYLE', defaultValue: '清新' }
            }
          },
          {
            opcode: 'showBubbleOnBox', blockType: Scratch.BlockType.COMMAND, text: '字幕框上方气泡 [TEXT] 时长 [DUR] 秒 样式 [STYLE]',
            arguments: {
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: '……' },
              DUR: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
              STYLE: { type: Scratch.ArgumentType.STRING, menu: 'SPEECH_STYLE', defaultValue: '清新' }
            }
          },
          {
            opcode: 'clearSpeechBubble', blockType: Scratch.BlockType.COMMAND, text: '关闭 [NAME] 的气泡',
            arguments: { NAME: { type: Scratch.ArgumentType.STRING, defaultValue: '角色' } }
          },
          { opcode: 'clearAllSpeechBubbles', blockType: Scratch.BlockType.COMMAND, text: '关闭所有说话气泡' },
          {
            opcode: 'setSpeechStyle', blockType: Scratch.BlockType.COMMAND, text: '气泡默认样式 [STYLE] 尾巴 [TAIL]',
            arguments: {
              STYLE: { type: Scratch.ArgumentType.STRING, menu: 'SPEECH_STYLE', defaultValue: '清新' },
              TAIL: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '开启' }
            }
          },
          { opcode: 'bubbleCount', blockType: Scratch.BlockType.REPORTER, text: '当前气泡数量' },

          '--- ❗ 符号表情 ---',
          {
            opcode: 'showEmoticon', blockType: Scratch.BlockType.COMMAND, text: '显示符号表情 [KEY] 于 [TARGET]',
            arguments: {
              KEY: { type: Scratch.ArgumentType.STRING, defaultValue: '！' },
              TARGET: { type: Scratch.ArgumentType.STRING, menu: 'EMOTICON_TARGET', defaultValue: '当前说话人' }
            }
          },
          {
            opcode: 'hideEmoticon', blockType: Scratch.BlockType.COMMAND, text: '隐藏符号表情 [KEY]',
            arguments: { KEY: { type: Scratch.ArgumentType.STRING, defaultValue: '！' } }
          },
          { opcode: 'clearEmoticons', blockType: Scratch.BlockType.COMMAND, text: '清空所有符号表情' },
          {
            opcode: 'setEmoticonIcon', blockType: Scratch.BlockType.COMMAND, text: '符号表情图标 [URL]（留空用文字）',
            arguments: { URL: { type: Scratch.ArgumentType.STRING, defaultValue: '' } }
          },
          {
            opcode: 'setEmoticonDuration', blockType: Scratch.BlockType.COMMAND, text: '符号表情停留 [MS] 毫秒',
            arguments: { MS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1400 } }
          }
        ],
        menus: {
          ON_OFF: { acceptReporters: true, items: ['开启', '关闭'] },
          SPEECH_STYLE: { acceptReporters: true, items: SPEECH_STYLES },
          EMOTICON_TARGET: { acceptReporters: true, items: EMOTICON_TARGETS }
        }
      };
    }

    showSpeechBubble(a) {
      const c = this._ensure(); if (!c) return;
      const name = U.str(a.NAME).trim() || '角色';
      const point = c.stageToPx(U.num(a.X, 0), U.num(a.Y, 60));
      this._spawn(name, U.str(a.TEXT), U.clamp(a.DUR, 0, 86400),
        U.str(a.STYLE) || this.defaultStyle, point, false);
    }

    showBubbleOnPortrait(a) {
      const c = this._ensure(); if (!c) return;
      const name = c.currentSpeaker() || '角色';
      let point = c.boxAnchor(0.18, 0);
      point = { x: point.x, y: point.y - 8 };
      const wrap = c.root ? c.root.querySelector('.cap-portrait-wrap') : null;
      if (wrap && !wrap.classList.contains('is-hidden')) {
        const r = wrap.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) point = c.anchorOf(wrap, 0.62, 0.12);
      }
      this._spawn(name, U.str(a.TEXT), U.clamp(a.DUR, 0, 86400),
        U.str(a.STYLE) || this.defaultStyle, point, true);
    }

    showBubbleOnBox(a) {
      const c = this._ensure(); if (!c) return;
      const p = c.boxAnchor(0.5, 0);
      this._spawn('__box__', U.str(a.TEXT), U.clamp(a.DUR, 0, 86400),
        U.str(a.STYLE) || this.defaultStyle, { x: p.x, y: p.y - 10 }, true);
    }

    clearSpeechBubble(a) { this._remove(U.str(a.NAME).trim() || '角色', true); }
    clearAllSpeechBubbles() { this._removeAll(true); }

    setSpeechStyle(a) {
      this.defaultStyle = U.pick(a.STYLE, SPEECH_STYLES, '清新');
      this.tail = U.on(a.TAIL);
    }

    bubbleCount() { return this.bubbles.size; }

    showEmoticon(a) {
      const c = this._ensure(); if (!c) return;
      const key = U.str(a.KEY) || '！';
      const target = U.str(a.TARGET) || '当前说话人';
      let bound = '';
      if (target === '当前说话人') bound = c.currentSpeaker();
      else if (target === '所有角色') bound = '';
      else bound = target;
      if (bound && c.currentSpeaker() && c.currentSpeaker() !== bound) return;
      this._spawnEmoticon(key);
    }

    hideEmoticon(a) {
      const key = U.str(a.KEY);
      const el = this.emoticons.get(key);
      if (el) { el.remove(); this.emoticons.delete(key); }
    }

    clearEmoticons() {
      if (this.emoteLayer) this.emoteLayer.textContent = '';
      this.emoticons.clear();
    }

    setEmoticonIcon(a) { this.emoticonIcon = U.str(a.URL).trim(); }
    setEmoticonDuration(a) { this.emoticonMs = U.clamp(a.MS, 200, 60000); }
  }

  const ext = new BubbleExtension();

  HUB.attach({
    name: 'bubble',
    init(core) {
      ext.core = core;
      core.mount();
      core.addCSS('bubble', CSS);
      ext.bubbleLayer = core.layer('bubble');
      ext.emoteLayer = core.layer('emote');
      core.onLayout(() => ext._reposition());
      core.onReset(() => { ext.clearAllSpeechBubbles(); ext.clearEmoticons(); });
      core.bubble = {
        show: (name, text, dur, style) => ext.showSpeechBubble({ NAME: name, X: 0, Y: 60, TEXT: text, DUR: dur, STYLE: style }),
        onSpeaker: (text, dur) => ext.showBubbleOnPortrait({ TEXT: text, DUR: dur }),
        onBox: (text, dur) => ext.showBubbleOnBox({ TEXT: text, DUR: dur }),
        clear: name => ext.clearSpeechBubble({ NAME: name }),
        clearAll: () => ext.clearAllSpeechBubbles()
      };
      core.emote = {
        show: key => ext.showEmoticon({ KEY: key, TARGET: '当前说话人' }),
        clear: () => ext.clearEmoticons(),
        icon: url => ext.setEmoticonIcon({ URL: url })
      };
      core.registerSave('bubble',
        () => ({ style: ext.defaultStyle, tail: ext.tail, icon: ext.emoticonIcon, ms: ext.emoticonMs }),
        v => {
          if (!v) return;
          if (v.style) ext.defaultStyle = v.style;
          if (v.tail != null) ext.tail = !!v.tail;
          if (v.icon != null) ext.emoticonIcon = v.icon;
          if (v.ms) ext.emoticonMs = v.ms;
        });
    }
  });

  Scratch.extensions.register(ext);
})(typeof window !== 'undefined' ? window.Scratch : undefined);
