/* ============================================================
 * 口算擂台：界面层
 * ============================================================
 * 【分工】
 *   generator.js 负责「出题」
 *   engine.js    负责「规则和计分」（状态机）
 *   panel.js     负责「显示和接收点击」（本文件）
 *
 * 界面层只做三件事：
 *   1. 把 engine.state 里的数据显示出来（render）
 *   2. 把用户的操作转告给 engine（点击、打字、回车）
 *   3. 管理那个每秒走一格的定时器
 *
 * 这就是常说的「改数据 → 重渲染」：界面永远不自己记状态，
 * 状态都在 engine 里，避免「屏幕显示的和实际分数不一致」这类 bug。
 * ============================================================ */

import { LEVELS } from "./generator.js";
import { createGameEngine } from "./engine.js";
import { registerKeyHandler, KEY_PRIORITY } from "../app/keyboard.js";

export function initGamePanel() {
  /* ============================================================
   * 1. 元素引用
   * ============================================================ */
  const gameBtn = document.getElementById("gameBtn");         // 顶部「靶心」按钮
  const gameModal = document.getElementById("gameModal");     // 整个弹层
  const gameCloseBtn = document.getElementById("gameCloseBtn");// 右上角关闭按钮

  const setupEl = document.getElementById("gameSetup");       // 选择关卡界面
  const levelsEl = document.getElementById("gameLevels");     // 关卡卡片容器
  const playEl = document.getElementById("gamePlay");         // 答题界面
  const overEl = document.getElementById("gameOver");         // 结算界面

  const scoreEl = document.getElementById("gameScore");       // 得分
  const comboEl = document.getElementById("gameCombo");       // 连击
  const livesEl = document.getElementById("gameLives");       // 生命
  const timeEl = document.getElementById("gameTime");         // 剩余时间
  const questionEl = document.getElementById("gameQuestion"); // 题目大字
  const answerEl = document.getElementById("gameAnswer");     // 答案输入框
  const feedbackEl = document.getElementById("gameFeedback"); // 一句反馈
  const padEl = document.getElementById("gamePad");           // 虚拟数字键盘

  const skipBtn = document.getElementById("gameSkipBtn");     // 跳过
  const quitBtn = document.getElementById("gameQuitBtn");     // 结束本局
  const againBtn = document.getElementById("gameAgainBtn");   // 再来一局

  const summaryEl = document.getElementById("gameSummary");   // 结算的详细数据
  const overTitleEl = document.getElementById("gameOverTitle");// 结算标题

  /* ============================================================
   * 2. 创建引擎，并告诉它「数据一变就重画」
   * ============================================================ */
  const engine = createGameEngine({ onChange: render });

  /* 定时器的编号。结束时必须清掉，否则关掉弹层后它还在偷偷倒计时 */
  let timerId = 0;

  function startTimer() {
    stopTimer();
    /* setInterval(函数, 毫秒)：每隔一段时间就执行一次。
       这里每秒调用一次 engine.tick()，让倒计时减 1 */
    timerId = window.setInterval(() => engine.tick(), 1000);
  }

  function stopTimer() {
    if (timerId !== 0) {
      window.clearInterval(timerId);
      timerId = 0;
    }
  }

  /* ============================================================
   * 3. 渲染：把数据画到界面上
   * ============================================================ */
  function render(state) {
    /* 三块界面互斥显示：靠 hidden 属性控制谁出现。
       hidden 是 HTML 内置属性，效果等于 CSS 的 display:none */
    setupEl.hidden = state.status !== "idle";
    playEl.hidden = state.status !== "playing";
    overEl.hidden = state.status !== "over";

    if (state.status === "playing") {
      renderPlaying(state);
    } else if (state.status === "over") {
      renderOver(state);
    } else {
      renderSetup();
    }

    /* 只有进行中才需要每秒倒计时 */
    if (state.status === "playing") {
      if (timerId === 0) startTimer();
    } else {
      stopTimer();
    }
  }

  /* ---------------- 选关卡界面 ---------------- */
  function renderSetup() {
    /* 最佳成绩可能刚被刷新，所以每次回到这个界面都重新生成一遍卡片 */
    levelsEl.innerHTML = "";

    LEVELS.forEach((level) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "level";
      /* 用 JS 拼一小段 HTML 是这里最省事的写法。
         内容全部来自代码里写死的 LEVELS，不含用户输入，所以没有安全风险 */
      card.innerHTML = `
        <span class="level__stars"></span>
        <span class="level__name"></span>
        <span class="level__desc"></span>
        <span class="level__meta"></span>
      `;
      // 星级用实心方块表示，一眼看出难度
      card.querySelector(".level__stars").textContent = "★".repeat(level.stars);
      card.querySelector(".level__name").textContent = level.name;
      card.querySelector(".level__desc").textContent = level.desc;
      card.querySelector(".level__meta").textContent =
        `${level.seconds} 秒 · ${level.lives} 条命 · 最佳 ${engine.getBest(level.id)} 分`;

      /* 用箭头函数包一层，是为了「传参」而不是「立刻执行」。
         如果直接写 card.addEventListener("click", startGame(level.id))，
         游戏会在页面加载时就自动开始（因为函数被立刻调用了）。 */
      card.addEventListener("click", () => startGame(level.id));
      levelsEl.appendChild(card);
    });
  }

  /* ---------------- 答题界面 ---------------- */
  function renderPlaying(state) {
    scoreEl.textContent = String(state.score);
    comboEl.textContent = state.combo > 0 ? `×${state.combo}` : "—";
    /* "♥".repeat(n) 把心形重复 n 次，例如 3 条命得到 "♥♥♥"。
       注意 repeat 的参数必须是整数且 ≥ 0 */
    livesEl.textContent = "♥".repeat(Math.max(0, state.lives));
    timeEl.textContent = String(state.secondsLeft);

    questionEl.textContent = `${state.question.text} = ?`;

    /* 时间不多了，给倒计时加个红色样式（CSS 里 .is-urgent 定成红色） */
    timeEl.classList.toggle("is-urgent", state.secondsLeft <= 10);
    /* 连击 ≥ 3 时高亮显示连击数，给玩家一点正反馈 */
    comboEl.classList.toggle("is-hot", state.combo >= 3);

    feedbackEl.textContent = state.feedback;
    feedbackEl.className = "game__feedback";
    if (state.feedbackType) feedbackEl.classList.add(`is-${state.feedbackType}`);

    // 输入框始终跟随我们的输入缓存（见下面 syncAnswer 的说明）
    answerEl.value = answerCache;
  }

  /* ---------------- 结算界面 ---------------- */
  function renderOver(state) {
    const total = state.correct + state.wrong;
    /* 正确率：分母为 0 时不能直接除，否则得到 NaN（屏幕上会显示 "NaN%"）。
       所以用三元运算符兜一下 */
    const accuracy = total > 0 ? Math.round((state.correct / total) * 100) : 0;

    overTitleEl.textContent = state.isNewBest ? "破纪录了！" : "本局结束";

    summaryEl.innerHTML = `
      <li><span>本局得分</span><strong></strong></li>
      <li><span>答对 / 答错 / 跳过</span><strong></strong></li>
      <li><span>正确率</span><strong></strong></li>
      <li><span>最高连击</span><strong></strong></li>
      <li><span>历史最佳</span><strong></strong></li>
    `;
    const values = [
      `${state.score} 分`,
      `${state.correct} / ${state.wrong} / ${state.skipped}`,
      `${accuracy}%`,
      `×${state.maxCombo}`,
      `${state.best} 分`,
    ];
    /* querySelectorAll 拿到的是「列表」，要用 forEach 遍历。
       第二个参数是下标 index，用它去取对应的文字 */
    summaryEl.querySelectorAll("strong").forEach((el, index) => {
      el.textContent = values[index];
    });
  }

  /* ============================================================
   * 4. 答案输入
   * ============================================================
   * 【为什么不直接把输入框的值当数据】
   * 因为我们要同时支持三种输入方式：
   *     ① 物理键盘打字   ② 虚拟数字键盘点击   ③ 手机系统键盘
   * 如果每次都去读输入框，就得处理「光标位置」「选区」等各种麻烦事。
   *
   * 这里的做法是：用一个变量 answerCache 记住答案字符串，
   * 所有输入方式都去改它，改完统一回写到输入框。
   * 这就是「单一数据源」的思想——数据只有一个出入口，才不会乱。 */
  let answerCache = "";

  function syncAnswer() {
    answerEl.value = answerCache;
  }

  function pressDigit(digit) {
    if (engine.state.status !== "playing") return;
    /* 限制长度，避免玩家一直按 0 把数字按到几十位 */
    if (answerCache.length >= 6) return;
    answerCache += digit;
    syncAnswer();
  }

  function pressBackspace() {
    if (engine.state.status !== "playing") return;
    answerCache = answerCache.slice(0, -1);   // 去掉最后一个字符
    syncAnswer();
  }

  function pressClear() {
    answerCache = "";
    syncAnswer();
  }

  /** 提交时把输入缓存清空，为下一题做准备 */
  function submitCurrent() {
    if (engine.state.status !== "playing") return;
    engine.submit(answerCache);
    answerCache = "";
    syncAnswer();
  }

  function skipCurrent() {
    engine.skip();
    answerCache = "";
    syncAnswer();
  }

  /* ============================================================
   * 5. 开局 / 收尾
   * ============================================================ */
  function startGame(levelId) {
    answerCache = "";
    engine.start(levelId);      // 引擎改数据 → 触发 render
    answerEl.value = "";
    /* focus 让光标落到输入框里。
       这样桌面端可以直接用键盘打字，手机上也会自动弹出数字键盘
       （输入框设了 inputmode="numeric"） */
    answerEl.focus();
  }

  /* ============================================================
   * 6. 虚拟数字键盘：由 JS 动态生成
   * ============================================================
   * 键位排布和真实计算器一样，右下角是退格。
   * 每个按键用 data-key 标记自己是谁，点击时统一处理。 */
  /* 键位按手机计算器的习惯排列：上面 7-9，中间 4-6，下面 1-3，
     最后一行是退格、0、确定。配合 CSS 里的 3 列网格正好排成 4 行。
     其中「确定」会被 CSS 拉宽占满整行（grid-column: span 3） */
  const PAD_KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "⌫", "0", "确定"];

  PAD_KEYS.forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pad__key";
    btn.dataset.key = key;
    btn.textContent = key;
    if (key === "确定") btn.classList.add("pad__key--ok");
    if (key === "⌫") btn.classList.add("pad__key--soft");
    padEl.appendChild(btn);
  });

  /* 事件委托：只在容器上绑一次，靠 data-key 分辨按的是谁 */
  padEl.addEventListener("click", (event) => {
    const btn = event.target.closest(".pad__key");
    if (!btn) return;

    const key = btn.dataset.key;
    if (key === "⌫") pressBackspace();
    else if (key === "确定") submitCurrent();
    else pressDigit(key);
  });

  /* ============================================================
   * 7. 其他按钮
   * ============================================================ */

  /* 输入框内容被改动（手机上用系统键盘打字时走这里）。
     为什么用 input 事件？因为它能同时覆盖键入、粘贴、语音输入等情况。 */
  answerEl.addEventListener("input", () => {
    /* /\D/g 这个正则里，\D 表示「非数字字符」，g 表示全局替换。
       把所有非数字字符删掉，防止玩家输入字母或负号 */
    answerCache = answerEl.value.replace(/\D/g, "").slice(0, 6);
    answerEl.value = answerCache;
  });

  skipBtn.addEventListener("click", skipCurrent);
  quitBtn.addEventListener("click", () => engine.finish());
  againBtn.addEventListener("click", () => {
    answerCache = "";
    engine.backToIdle();        // 回到关卡列表
  });

  /* 打开游戏弹层 */
  gameBtn.addEventListener("click", () => {
    if (isOpen()) {
      close();
      return;
    }
    gameModal.hidden = false;
    gameBtn.classList.add("is-active");
    gameBtn.setAttribute("aria-expanded", "true");
    render(engine.state);
  });

  function isOpen() {
    return !gameModal.hidden;
  }

  function close() {
    /* 关闭前先结束这一局，避免关掉后定时器还在后台跑 */
    if (engine.state.status === "playing") engine.finish();
    stopTimer();
    gameModal.hidden = true;
    gameBtn.classList.remove("is-active");
    gameBtn.setAttribute("aria-expanded", "false");
  }

  gameCloseBtn.addEventListener("click", close);

  /* 点黑幕关闭 */
  gameModal.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal__backdrop")) close();
  });

  /* ============================================================
   * 8. 键盘
   * ============================================================
   * 优先级最高：只要游戏弹层开着，计算器就别想抢走按键。
   *
   * 数字键我们「不处理」，让它自然打进输入框
   * （打开时已经 focus 到输入框了，浏览器会自己完成输入）。
   * 我们只负责回车提交和 Esc 退出。 */
  registerKeyHandler(KEY_PRIORITY.GAME, (event) => {
    if (!isOpen()) return false;      // 弹层没开，不掺和

    if (event.key === "Escape") {
      close();
      return true;
    }

    if (engine.state.status === "playing") {
      if (event.key === "Enter" || event.key === "=") {
        event.preventDefault();       // 阻止「回车触发当前焦点按钮」的默认行为
        submitCurrent();
        return true;
      }
      if (event.key === "Backspace") {
        /* 这里不用自己删：输入框会自己处理退格，
           处理完触发 input 事件，answerCache 会自动同步 */
        return true;
      }
    }

    return true;   // 游戏开着时，键盘事件不再往下传
  });

  /* 页面加载后先画一遍关卡列表（此时弹层还没打开，画了也看不见，
     但能让数据先就位，打开时立刻有内容） */
  render(engine.state);
}
