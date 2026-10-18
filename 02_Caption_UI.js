// Name: 字幕 · 字幕UI
// ID: captionsuiteui
// Description: 字幕框外观：位置尺寸、配色主题、字体字号、描边阴影、提示文案、分页规则、背景图。
// License: MIT

(function (Scratch) {
  'use strict';
  if (!Scratch) return;
  if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
    throw new Error('[字幕 · 字幕UI] 必须在「取消沙盒模式运行」下工作');
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

  const POSITIONS = ['底部', '顶部', '居中'];
  const ALIGNS = ['左对齐', '居中', '右对齐'];
  const ALIGN_MAP = { '左对齐': 'left', '居中': 'center', '右对齐': 'right' };
  const FONT_PRESETS = ['黑体', '宋体', '圆体', '楷体', '手写体', '像素体', '明朝体'];
  const FONT_FAMILIES = {
    '黑体': '"PingFang SC","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif',
    '宋体': '"Songti SC","SimSun","STSong",serif',
    '圆体': '"PingFang SC","Hiragino Maru Gothic ProN","Microsoft YaHei",sans-serif',
    '楷体': '"Kaiti SC","KaiTi","STKaiti",serif',
    '手写体': '"Comic Sans MS","Chalkboard SE","Marker Felt",cursive',
    '像素体': '"Silkscreen","Press Start 2P","VT323",monospace',
    '明朝体': '"Yu Mincho","MS Mincho","Songti SC",serif'
  };
  // 主题预设：背景 / 正文 / 说话人 / 光晕 / 透明度 / 圆角
  const THEMES = {
    '深海': ['#091c3c', '#e8f0ff', '#aad5ff', '#60a5fa', 0.82, 14],
    '夜樱': ['#24101f', '#ffedf6', '#ff9dcb', '#ff6fae', 0.82, 16],
    '竹青': ['#0d2119', '#e6fff2', '#8ce0b4', '#4ecf95', 0.82, 14],
    '琥珀': ['#241a0d', '#fff3e0', '#ffc477', '#ffa63d', 0.82, 12],
    '墨白': ['#f4f6fb', '#1b2333', '#3b5a8a', '#7c8ba1', 0.93, 10],
    '琉璃': ['#0d1a2b', '#dff3ff', '#7fd7ff', '#22d3ee', 0.68, 18]
  };
  const THEME_NAMES = Object.keys(THEMES);

  class StyleExtension {
    constructor() { this.core = null; }

    getInfo() {
      return {
        id: 'captionsuiteui',
        name: '字幕 · 字幕UI',
        color1: '#8a5cd6', color2: '#7448c4', color3: '#5f37a8',
        docsURI: 'https://extensions.turbowarp.org/',
        blocks: [
          '--- 🎨 框体 ---',
          {
            opcode: 'setBoxStyle', blockType: Scratch.BlockType.COMMAND,
            text: '字幕框 [POS] 宽度 [W]% 底距 [B]% 圆角 [R]px 透明度 [A]',
            arguments: {
              POS: { type: Scratch.ArgumentType.STRING, menu: 'POSITIONS', defaultValue: '底部' },
              W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 82 },
              B: { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 },
              R: { type: Scratch.ArgumentType.NUMBER, defaultValue: 14 },
              A: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.82 }
            }
          },
          {
            opcode: 'setColors', blockType: Scratch.BlockType.COMMAND,
            text: '字幕配色 背景 [BG] 文字 [TEXT] 说话人 [NAME]',
            arguments: {
              BG: { type: Scratch.ArgumentType.COLOR, defaultValue: '#091c3c' },
              TEXT: { type: Scratch.ArgumentType.COLOR, defaultValue: '#e8f0ff' },
              NAME: { type: Scratch.ArgumentType.COLOR, defaultValue: '#aad5ff' }
            }
          },
          {
            opcode: 'setTheme', blockType: Scratch.BlockType.COMMAND, text: '一键主题 [THEME]',
            arguments: { THEME: { type: Scratch.ArgumentType.STRING, menu: 'THEME', defaultValue: '深海' } }
          },
          {
            opcode: 'setBoxShadow', blockType: Scratch.BlockType.COMMAND, text: '字幕框光晕 模糊 [BLUR] 颜色 [COLOR]',
            arguments: {
              BLUR: { type: Scratch.ArgumentType.NUMBER, defaultValue: 18 },
              COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#60a5fa' }
            }
          },
          {
            opcode: 'setBoxBgImage', blockType: Scratch.BlockType.COMMAND, text: '字幕框背景图 [URL]（留空清除）',
            arguments: { URL: { type: Scratch.ArgumentType.STRING, defaultValue: '' } }
          },

          '--- 🔤 文字 ---',
          {
            opcode: 'setTextStyle', blockType: Scratch.BlockType.COMMAND, text: '正文对齐 [ALIGN] 字号 [SIZE] 行高 [LH]',
            arguments: {
              ALIGN: { type: Scratch.ArgumentType.STRING, menu: 'ALIGN', defaultValue: '左对齐' },
              SIZE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 17 },
              LH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1.82 }
            }
          },
          {
            opcode: 'setFont', blockType: Scratch.BlockType.COMMAND, text: '字体 [SOURCE]',
            arguments: { SOURCE: { type: Scratch.ArgumentType.STRING, menu: 'FONT_PRESET', defaultValue: '黑体' } }
          },
          {
            opcode: 'setTextOutline', blockType: Scratch.BlockType.COMMAND, text: '文字描边 颜色 [COLOR] 粗细 [WIDTH]',
            arguments: {
              COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#000000' },
              WIDTH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
            }
          },
          {
            opcode: 'setNextHint', blockType: Scratch.BlockType.COMMAND, text: '显示下一步提示 [STATE]',
            arguments: { STATE: { type: Scratch.ArgumentType.STRING, menu: 'ON_OFF', defaultValue: '开启' } }
          },

          '--- 📄 分页 ---',
          {
            opcode: 'setPaging', blockType: Scratch.BlockType.COMMAND, text: '分页 每页 [LINES] 行 每行 [CHARS] 字',
            arguments: {
              LINES: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
              CHARS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 33 }
            }
          },
          { opcode: 'getStyle', blockType: Scratch.BlockType.REPORTER, text: '当前外观配置（调试用）' }
        ],
        menus: {
          ON_OFF: { acceptReporters: true, items: ['开启', '关闭'] },
          POSITIONS: { acceptReporters: true, items: POSITIONS },
          ALIGN: { acceptReporters: true, items: ALIGNS },
          FONT_PRESET: { acceptReporters: true, items: FONT_PRESETS },
          THEME: { acceptReporters: true, items: THEME_NAMES }
        }
      };
    }

    _c() {
      const c = HUB.core;
      if (!c) { HUB.warn('字幕 · 字幕UI'); return null; }
      return c;
    }

    setBoxStyle(a) {
      const c = this._c(); if (!c) return;
      const s = c.style;
      s.position = U.pick(a.POS, POSITIONS, '底部');
      s.width = U.clamp(a.W, 10, 100);
      s.bottom = U.clamp(a.B, 0, 95);
      s.radius = U.clamp(a.R, 0, 200);
      s.alpha = U.clamp(a.A, 0, 1);
      c.applyStyle();
    }

    setColors(a) {
      const c = this._c(); if (!c) return;
      const s = c.style;
      s.bgColor = U.color(a.BG, s.bgColor);
      s.textColor = U.color(a.TEXT, s.textColor);
      s.nameColor = U.color(a.NAME, s.nameColor);
      c.applyStyle();
    }

    setTheme(a) {
      const c = this._c(); if (!c) return;
      const t = THEMES[U.pick(a.THEME, THEME_NAMES, '深海')];
      const s = c.style;
      s.bgColor = t[0]; s.textColor = t[1]; s.nameColor = t[2]; s.shadowColor = t[3];
      s.alpha = t[4]; s.radius = t[5];
      c.applyStyle();
    }

    setBoxShadow(a) {
      const c = this._c(); if (!c) return;
      c.style.shadow = U.clamp(a.BLUR, 0, 80);
      c.style.shadowColor = U.color(a.COLOR, c.style.shadowColor);
      c.applyStyle();
    }

    setBoxBgImage(a) {
      const c = this._c(); if (!c) return;
      const url = U.str(a.URL).trim();
      c.setBoxBgImage(/^(data:|blob:|https?:|\/|\.)/i.test(url) ? url : '');
    }

    setTextStyle(a) {
      const c = this._c(); if (!c) return;
      const s = c.style;
      const al = ALIGN_MAP[U.str(a.ALIGN)];
      if (al) s.align = al;
      s.fontSize = U.clamp(a.SIZE, 8, 120);
      s.lineHeight = U.clamp(a.LH, 1, 3);
      c.applyStyle();
    }

    setFont(a) {
      const c = this._c(); if (!c) return;
      const v = U.str(a.SOURCE);
      c.style.font = FONT_FAMILIES[v] || (v.trim() ? v : '');
      c.applyStyle();
    }

    setTextOutline(a) {
      const c = this._c(); if (!c) return;
      c.style.outline = U.clamp(a.WIDTH, 0, 8);
      c.style.outlineColor = U.color(a.COLOR, c.style.outlineColor);
      c.applyStyle();
    }

    setNextHint(a) {
      const c = this._c(); if (!c) return;
      c.style.showNextHint = U.on(a.STATE);
      c.applyStyle();
    }

    setPaging(a) {
      const c = this._c(); if (!c) return;
      c.paging.lines = U.clamp(Math.round(a.LINES), 1, 12);
      c.paging.chars = U.clamp(Math.round(a.CHARS), 6, 120);
    }

    getStyle() {
      const c = this._c(); if (!c) return '';
      const s = c.style;
      return '位置:' + s.position + ' 宽:' + s.width + '% 底距:' + s.bottom + '% 圆角:' + s.radius
        + ' 透明:' + s.alpha + ' 字号:' + s.fontSize + ' 对齐:' + s.align
        + ' 主题色:' + s.bgColor + '/' + s.textColor + '/' + s.nameColor
        + ' 分页:' + c.paging.lines + '行×' + c.paging.chars + '字';
    }
  }

  const ext = new StyleExtension();

  HUB.attach({
    name: 'ui',
    init(core) {
      ext.core = core;
      core.styleApi = {
        theme: name => ext.setTheme({ THEME: name }),
        colors: (bg, text, name) => ext.setColors({ BG: bg, TEXT: text, NAME: name }),
        apply: () => core.applyStyle()
      };
      core.registerSave('ui',
        () => ({ style: core.style, paging: { lines: core.paging.lines, chars: core.paging.chars } }),
        v => {
          if (!v) return;
          if (v.style) { Object.assign(core.style, v.style); core.applyStyle(); }
          if (v.paging) core.paging = { lines: v.paging.lines || 3, chars: v.paging.chars || 33 };
        });
    }
  });

  Scratch.extensions.register(ext);
})(typeof window !== 'undefined' ? window.Scratch : undefined);
