# 字幕扩展套件 v3.0.0（拆分版）

原 `OtomeSubtitleBox.js`（2633 行，单文件 120+ 积木）重构为 11 个独立扩展文件，共享一个运行时总线（`window.__CAPTION_SUITE__`），互不重复、互不冲突。

## 加载方式

在 TurboWarp「扩展 → 自定义扩展」中 **全部加载**（顺序任意）。所有文件都必须在「取消沙盒模式运行」下使用。

> 只要核心没加载，其它模块会自动降级为空操作并给出一次控制台提示，不会报错崩溃。

## 文件一览

| 文件 | ID | 积木数 | 负责什么 |
|---|---|---|---|
| 01_Caption_Core.js | `captionsuite` | 31 | 舞台挂载、状态机、rAF 打字机、分页、推进、事件广播、日志、存档总线、状态查询、系统重置 |
| 02_Caption_UI.js | `captionsuiteui` | 11 | 框体尺寸位置、配色、6 套一键主题、字体字号行高、描边光晕、背景图、分页规则 |
| 03_Caption_Choice.js | `captionsuitechoice` | 7 | 选项弹出（最多 9 个）、等待/自动/随机策略、竖排横排、自动选择延迟 |
| 04_Caption_Auto.js | `captionsuiteauto` | 9 | 自动播放开关与间隔、按字数自适应等待、屏幕按钮（位置/皮肤/大小）、快捷键 |
| 05_Caption_Portrait.js | `captionsuiteportrait` | 20 | 立绘显示切换、锚点/高度/偏移/镜像、出场动画、一次性与持续特效、合并变换、角色绑定、预加载 |
| 06_Caption_Bubble.js | `captionsuitebubble` | 12 | 说话气泡（舞台坐标 / 立绘头顶 / 字幕框上方）、5 种样式、尾巴开关、符号表情与自定义图标 |
| 07_Caption_History.js | `captionsuitehistory` | 13 | 历史面板（分组 / 正序 / 倒序）、历史按钮与快捷键、条数上限、按序号回看、导出文本、表情入史 |
| 08_Caption_Script.js | `captionsuitescript` | 11 | 整段剧本切句播放、`角色: 台词` 识别、行尾 `>>>选项A|选项B`、句间停顿、完成广播、队列控制 |
| 09_Caption_Save.js | `captionsuitesave` | 9 | 多槽位存档（含外观/立绘/历史/音效等全部模块状态）、存在判断、时间、导出导入 JSON |
| 10_Caption_Sound.js | `captionsuitesound` | 7 | 20 种合成预设、自定义波形音、打字音效与音色、音量、总开关 |
| 11_Caption_Base64.js | `captionsuitebase64` | 10 | 文本↔Base64、真实类型嗅探、转资源 URL、投放到立绘/表情/框背景、解码播放音频、下载、缓存统计 |

## 这次做了什么

**去重**
- 删掉完全等价的别名积木：`isCaptionVisible`、`getCurrentName`、`getCurrentPage`、`getTotalPages`、`getVersion` 的重复版本（旧名仍以兼容映射保留，旧工程不会红块）。
- `b64SetBoxBg` 与 `b64PutInto(字幕框背景)` 合并为一个。
- 三个气泡积木、四个立绘变换积木、三个配色积木分别收敛为同一个内部实现。

**合并**
- 立绘的 移动/缩放/旋转/不透明度 → 一个「立绘变换」积木（留空即保持原值）。
- `showSpeechBubble / showBubbleOnPortrait / showBubbleOnBox` → 同一个 `_spawn()`。
- 自动按钮与历史按钮 → 共用 `core.createButton()` 的定位/皮肤/快捷键逻辑。

**修掉的缺陷**
- 原「字幕 说话人/内容/选项」积木的选项被 `_hideChoices()` 误清空，选项永远不显示 —— 已修复。
- 原 `_customEmoticonUrl`、`_historyWithEmoticon`、`_settings_portraitVisible` 是写了不用的死变量 —— 现在分别变成可用的「符号表情图标」「历史附带表情」「立绘显隐状态」。

**性能**
- 打字机从 `setTimeout` 轮询改为 **单个 requestAnimationFrame 时间轴**，逐字计时，支持标点停顿，低帧率下也不会掉字堆积。
- 舞台矩形 / canvas 矩形带脏标记缓存（800ms 或布局变化时失效），避免逐帧 `getBoundingClientRect`。
- 布局与样式应用全部走 rAF 合帧；历史面板用 `DocumentFragment` 一次性插入；选项列表重建用批量插入。
- 立绘 `decoding="async"` + 预加载积木；音效用复音上限与节流保护；Base64 资源带 3MB 缓存上限。

**UI**
- 统一的毛玻璃层次、柔和双阴影、入场位移缩放动画、打字光标（闪烁竖线）、胶囊式说话人名牌。
- 选项卡片带序号徽章、悬停上浮、键盘焦点环；按钮玻璃拟态 + 开启态脉冲光晕。
- 气泡支持圆润/方形/暗色/像素/清新五种风格并可关闭尾巴；历史面板毛玻璃 + 时间戳 + 分组卡片。
- 6 套一键主题：深海、夜樱、竹青、琥珀、墨白、琉璃；全部尊重 `prefers-reduced-motion`。

## 兼容说明

- 核心扩展 ID 仍为 `captionsuite`，保留 `showBox / hideBox / sayAndWait / sayInstant / showCaption / finishTyping / nextPageOrAdvance / clearCaption / pauseTyping / resumeTyping / setSpeed / isTyping / isWaiting / isVisible / isPaused / hasNextPage / currentText / currentSpeaker / lastChoice / lastChoiceText / resetAll / getVersion` 等 opcode，旧工程可继续使用。
- 已移除的旧积木：`setBoxColor / setNameColor / setTextColor`（请用「字幕配色」）、`portraitMove / portraitScale / portraitRotate / portraitAlpha`（请用「立绘变换」）、`b64SetBoxBg`（请用「把 Base64 放入」）、`getCurrentText / getCurrentName / isCaptionVisible / version` 的别名版本。

## 关于扩展 ID（重要）

TurboWarp 规定扩展 ID **只能由小写字母 a-z 和数字 0-9 组成**，不能有空格、点号、下划线或任何其它符号。
如果 ID 里出现 `.` 之类字符，TurboWarp Desktop 会直接弹窗报错 **Error: Invalid extension id**。

本套件所有 ID 均已符合该规则（纯小写字母数字）：

```
captionsuite            captionsuitebubble      captionsuitescript
captionsuiteui          captionsuitehistory     captionsuitesave
captionsuitechoice      captionsuiteportrait    captionsuitesound
captionsuiteauto        captionsuitebase64
```

若你曾加载过带有 `captionsuite.xxx` 这种旧 ID 的版本，请在「扩展列表」里先移除旧条目，再重新加载新文件。

## 版本

`字幕扩展版本` 积木返回 `3.0.0`。
