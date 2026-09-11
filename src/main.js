/* ============================================================
 * 入口文件 main.js
 * ============================================================
 * 【Vite 项目的「总装车间」】
 * index.html 里只写了一句 <script type="module" src="/src/main.js"></script>，
 * 所有代码都从这里长出来。这个文件只干三件事：
 *
 *   1. 把样式文件引进页面（Vite 允许在 JS 里 import CSS）
 *   2. 按顺序初始化每个功能模块
 *   3. 管理全局的主题切换（因为它跨越所有模块）
 *
 * 【为什么要拆成这么多模块】
 * 原来的 script.js 有 1400 多行，什么都写在一起。
 * 拆开之后每个文件只管一件事，好处是：
 *   - 想改口算游戏的计分规则，只需要看 game/engine.js
 *   - 想改计算器的显示，只需要看 app/calculator.js
 *   - core 目录里的算法（表达式、哈希）不依赖页面，可以复用和单独测试
 * ============================================================ */

/* ---------------- 1. 引入样式 ----------------
   Vite 会把这几行变成页面上真正的 <style>；
   执行 npm run build 时，它们还会被压缩合并成一个 css 文件 */
import "./styles/base.css";
import "./styles/calculator.css";
import "./styles/modal.css";
import "./styles/game.css";

/* ---------------- 2. 引入各功能模块 ---------------- */
import { initCalculator } from "./app/calculator.js";
import { initHashPanel } from "./app/hashPanel.js";
import { startKeyboardRouter } from "./app/keyboard.js";
import { initGamePanel } from "./game/panel.js";
import { readString, writeString } from "./core/storage.js";

/* 主题偏好存到浏览器时用的「钥匙名」 */
const THEME_KEY = "calculator.theme";

/* ============================================================
 * 3. 主题切换
 * ============================================================
 * 原理很简单：给 <html> 标签换一个 data-theme 属性，
 * CSS 里 html[data-theme="dark"] 那一大段变量就会生效，
 * 于是整站配色自动切换 —— 一行 CSS 规则都不用改。 */
function initTheme() {
  const themeBtn = document.getElementById("themeBtn");

  /** 应用主题，并记住用户的选择 */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    writeString(THEME_KEY, theme);   // 下次打开还是这个主题
  }

  /* 默认用日间羊皮纸主题；之前选过就尊重用户的选择 */
  const saved = readString(THEME_KEY, "light");
  applyTheme(saved || "light");

  themeBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    // 在当前主题的反面之间来回切换
    applyTheme(current === "light" ? "dark" : "light");
  });
}

/* ============================================================
 * 4. 启动
 * ============================================================
 * 为什么能直接执行？因为 <script type="module"> 默认带 defer 效果：
 * 浏览器会等 HTML 全部解析完（页面上所有按钮都就位了）才执行它。
 * 所以这里能安全地 getElementById，不需要再套一层 DOMContentLoaded。 */
function main() {
  initTheme();        // 主题要最先执行，避免页面先闪一下亮色
  initCalculator();   // 计算器（含历史记录）
  initHashPanel();    // 哈希计算弹层
  initGamePanel();    // 口算擂台

  /* 键盘路由放在最后启动：
     前面各个模块在初始化时已经把自己的按键处理函数「报名」进去了，
     现在打开监听，一有按键就按优先级分发 */
  startKeyboardRouter();
}

main();
