/* ============================================================
 * 计算器模块
 * ============================================================
 * 【这个文件负责什么】
 *   1. 记住用户按了什么（state，数据）
 *   2. 把数据算成结果（调用 ../core/expression.js）
 *   3. 把结果画到屏幕上（render，渲染）
 *   4. 接收鼠标点击和键盘按键
 *
 * 【核心思路：数据驱动界面】
 * 我们不直接去改屏幕上的文字，而是先维护一份「数据」，
 * 数据变了就整体重新渲染一遍界面。
 * 这样就永远不会出现「屏幕显示的」和「实际计算的」不一致的情况。
 *
 * 【不认识新语法？先看这几个】
 *   const 常量 = 值;   声明一个「不可重新赋值」的变量（推荐默认用它）
 *   let  变量 = 值;   声明一个「可以重新赋值」的变量
 *   function 名字(参数) { ... }   定义一个函数（一段可重复使用的代码）
 *   (参数) => 结果     箭头函数，是上面写法更短的版本
 *   if (条件) { ... } else { ... }   条件判断
 *   对象.属性          取对象里的某个值
 *   数组[下标]         取数组里的第几个（下标从 0 开始）
 * ============================================================ */

import {
  MINUS,
  OPERATORS,
  FUNCTIONS,
  CONSTANTS,
  POSTFIX,
  NUMBER_RE,
  evaluateTokens,
  formatNumber,
  tryEvaluate,
} from "../core/expression.js";
import { readJSON, writeJSON } from "../core/storage.js";
import { registerKeyHandler, KEY_PRIORITY } from "./keyboard.js";

/* 历史记录存到浏览器本地时用的「钥匙名」 */
const HISTORY_KEY = "calculator.history";

/* 最多保留多少条历史记录（防止用久了数据越堆越多） */
const MAX_HISTORY = 50;

/* 键盘按键 → 界面记号的对照表。
   为什么不用 if 判断所有按键？用「表」来转换，代码更短也更好维护，
   这种写法叫「查表法」 */
const KEYBOARD_MAP = {
  "*": "×",       // 键盘上是星号，显示成乘号
  x: "×",         // 用字母 x 也能当乘号
  "/": "÷",
  "-": MINUS,     // 键盘的减号 → 数学减号
  "+": "+",
  "^": "^",
  "%": "%",
  "(": "(",
  ")": ")",
  ".": ".",
};

/**
 * 初始化计算器（页面加载后调用一次）
 * 它会自己找到页面上的元素、绑定事件、画出初始界面
 */
export function initCalculator() {
  /* ============================================================
   * 1. 找到页面上要用到的元素（DOM 引用）
   * ============================================================
   * document.getElementById("xxx") 的意思是：
   * 「去 HTML 里找到 id 等于 xxx 的那个元素，交给我」。
   *
   * 为什么开头就找好？以后每次要用的时候直接拿变量名，
   * 不用反复查找，代码更清爽、速度也更快。 */
  const exprEl = document.getElementById("expr");                    // 显示屏第一行：算式
  const resultEl = document.getElementById("result");                // 显示屏第二行：结果
  const keysEl = document.getElementById("keys");                    // 整个按键区（用来做「事件委托」）
  const historyPanel = document.getElementById("historyPanel");      // 历史面板整体
  const historyList = document.getElementById("historyList");        // 历史记录列表（ul）
  const historyEmpty = document.getElementById("historyEmpty");      // 「暂无记录」提示
  const historyBtn = document.getElementById("historyBtn");          // 右上角历史按钮
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");// 清空历史按钮

  /* ============================================================
   * 2. 全局状态 state
   * ============================================================
   * 【这是整个模块最重要的东西】它记录了「当前这一刻」计算器的全部情况：
   *
   *   state.tokens         用户按出来的记号序列（用数组存，每个元素是一个字符串）
   *                        例如 ["12.5", "×", "sin(", "π", ")"]
   *                        界面上显示的算式就是它们直接拼起来的："12.5×sin(π)"
   *
   *   state.history        历史记录列表，每个元素形如
   *                        { expression: "1+1 =", result: "2" }
   *
   *   state.justEvaluated  刚刚按过等号吗？
   *                        true 的作用：按完等号后再按数字，应该「重新开始」而不是接着算；
   *                        但按的是运算符时，应该「接着结果继续算」。
   *
   * 为什么用数组而不是一个长字符串？
   *   因为「退格」要能整体删掉 "sin(" 这 4 个字符，而不是只删一个字母。
   *   用数组，每个记号是一个整体，删起来干净利落。 */
  const state = {
    tokens: [],
    history: loadHistory(),   // 从本地存储读回上次的记录（见文件后半部分）
    justEvaluated: false,
  };

  /* ============================================================
   * 3. 渲染：把 state 里的数据「画」到屏幕上
   * ============================================================ */

  /* 小工具：让横向滚动条自动滚到最右边。
     scrollLeft 是「已滚动的距离」，scrollWidth 是「内容总宽度」，
     两者相等就等于滚到了最右边。
     用户输入很长的算式时，这样能始终看到最新的部分 */
  function scrollToEnd(el) {
    el.scrollLeft = el.scrollWidth;
  }

  /** 输入到一半时的容错预览：尽量截取到最后一个完整片段 */
  function safePartialTokens() {
    /* slice() 复制一份数组再操作，不修改原始数据（好习惯：
       不要在「读数」的函数里偷偷改动 state） */
    const tokens = state.tokens.slice();
    /* 从末尾往前删，直到最后一个记号是「完整的」为止。
       下面这些记号出现在末尾时都表示「话还没说完」：
         "12+"    末尾是运算符，右边还缺数
         "sin("   末尾是函数，括号里还空着
         "("      括号刚开，还没内容 */
    while (tokens.length > 0) {
      const last = tokens[tokens.length - 1];
      const isIncomplete =
        OPERATORS.includes(last) || FUNCTIONS.includes(last) || last === "(";
      if (!isIncomplete) break;
      tokens.pop();   // 删掉最后一个元素
    }
    return tokens;
  }

  /* 【核心函数】渲染整个界面。
     每次用户按了键，都会调用它，让屏幕和 state 保持一致 */
  function render() {
    /* 拼接算式并显示。
       join("") 把数组拼成字符串，中间不插任何字符，例如
       ["12", "+", "3"] → "12+3" */
    exprEl.textContent = state.tokens.join("");
    scrollToEnd(exprEl);

    let preview = "0";     // 准备显示的结果，默认是 0
    let isError = false;   // 是否为错误状态

    if (state.tokens.length > 0) {
      // 先试着完整算一遍
      const full = tryEvaluate(state.tokens);
      if (full.ok) {
        preview = formatNumber(full.value);
        isError = preview === "错误";
      } else {
        // 输入尚未完整，退一步用最后一个完整片段做预览
        /* 例如用户刚输入 "12+"，完整算式算不了，
           但我们希望屏幕上先显示 12，而不是空白或报错 */
        const partial = tryEvaluate(safePartialTokens());
        const text = partial.ok ? formatNumber(partial.value) : "…";
        preview = text === "错误" ? "…" : text;
      }
    }

    resultEl.textContent = preview;   // 写入文字内容
    /* classList.toggle(类名, 条件)：
       条件为 true 就加上这个类，为 false 就移除。
       下面两行的意思是「结果太长就缩小字号」「出错就变成红色」 */
    resultEl.classList.toggle("is-small", preview.length > 12);
    resultEl.classList.toggle("is-error", isError);
  }

  /* 渲染历史记录列表。
     注意：列表里的每条记录都是「动态创建」的 HTML，
     这种由 JS 现场造出来的界面元素，叫「动态 DOM」 */
  function renderHistory() {
    // 先清空原有内容，避免重复添加
    historyList.innerHTML = "";

    const hasItems = state.history.length > 0;
    // hidden 是 HTML 内置属性，设为 true 就相当于不显示
    historyEmpty.hidden = hasItems;

    /* forEach 遍历数组：对每个元素执行一次你给的函数。
       这里的 item 就是一条记录，形如 { expression: "1+1 =", result: "2" } */
    state.history.forEach((item) => {
      // 造一个 <li>（列表项）和一个 <button>（可以点击）
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history__item";     // 给它穿上样式
      btn.title = "点击使用该结果";         // 鼠标悬停时的提示文字
      /* 先用 innerHTML 搭好骨架（两个空标签），
         再用 textContent 填内容 —— 这样做是为了安全：
         textContent 会把文字「原样显示」，不会把内容当成 HTML 代码执行 */
      btn.innerHTML = "<small></small><strong></strong>";
      btn.querySelector("small").textContent = item.expression;
      btn.querySelector("strong").textContent = "= " + item.result;

      /* 给这条记录绑定点击事件：点一下就把它曾经的结果取回计算区。
         注意这里用了箭头函数，它记住了「当前这一轮的 item」，
         所以每条记录点击后恢复的都是自己的结果 */
      btn.addEventListener("click", () => useHistoryResult(item.result));

      li.appendChild(btn);            // 把按钮塞进 li
      historyList.appendChild(li);    // 再把 li 塞进列表
    });
  }

  /* 点击历史记录时：把那条结果放进算式，方便继续计算 */
  function useHistoryResult(result) {
    /* 先检查它是不是合法的数字（历史数据来自本机存储，可能被手动改坏），
       不合法就退回 0，避免程序出错 */
    state.tokens = NUMBER_RE.test(result) ? [result] : ["0"];
    state.justEvaluated = true;   // 标记为「刚算完」，接着按数字会重新开始
    render();
  }

  /* ============================================================
   * 4. 输入行为：用户按不同键时发生什么
   * ============================================================
   * insert / negate / backspace / clearAll / equals
   * 这五个函数是用户操作的真正入口。
   * 它们的共同套路是：只修改 state.tokens，然后交给 render() 去画界面。 */

  /* 取最后一个记号。
     数组长度减 1 就是最后一个元素的下标（下标从 0 开始）。
     如果数组是空的，这里会返回 undefined（表示「什么也没有」） */
  function lastToken() {
    return state.tokens[state.tokens.length - 1];
  }

  /* 判断这个记号「是不是一个算好的值」。
     用于决定「%」「²」能不能直接跟在它后面。
     例如 3% 合法，但 "+%" 不合法 */
  function isValueToken(token) {
    return (
      NUMBER_RE.test(token) ||      // 是数字
      CONSTANTS.includes(token) ||  // 是 π 或 e
      POSTFIX.includes(token) ||    // 已经是 % 或 ² （允许 3%% 这种叠加）
      token === ")"                 // 是右括号，例如 (1+2)²
    );
  }

  /* 【核心函数】插入一个记号。
     value 是从按钮 data-value 拿到的字符串，例如 "7"、"×"、"sin(" */
  function insert(value) {
    /* 处理「刚按完等号」的特殊情况：
       按完 = 之后，如果接着按数字，应该清空重新开始输入；
       如果接着按运算符，则保留结果继续算（例如算完 2+3= 再按 ×4）。 */
    if (state.justEvaluated) {
      const keep = OPERATORS.includes(value) || POSTFIX.includes(value);
      if (!keep) state.tokens = [];   // 清空，等于从零开始
      state.justEvaluated = false;
    }

    const last = lastToken();

    // 数字与小数点
    /* /^[0-9]$/ 是正则，表示「一个字符，且必须是 0 到 9 之间的数字」。
       test() 返回 true / false */
    if (/^[0-9]$/.test(value) || value === ".") {
      /* 关键点：连续输入的数字要「合并成同一个记号」，
         否则 "1" 和 "2" 会是两个数字，算出来变成 1×2。
         条件说明：
           last 存在       → 数组里已经有东西
           NUMBER_RE.test  → 最后一个是数字
           !/e/i.test(last)→ 而且不是科学计数法（那种情况不能再往后追加数字） */
      if (last && NUMBER_RE.test(last) && !/e/i.test(last)) {
        // 已经有一个小数点时，再按 . 就没反应（防止出现 1.2.3）
        if (value === "." && last.includes(".")) return;
        /* 把最后一个元素「改长一点」：直接在后面拼上这次按的字符。
           注意这里没有用 push（那会新增一个元素），而是重新赋值最后一个元素 */
        state.tokens[state.tokens.length - 1] = last + value;
      } else if (value === ".") {
        /* 直接按小数点时自动补前导零，让输入变成 "0." 而不是 "."，
           这样 NUMBER_RE 才认得出它是数字 */
        state.tokens.push("0.");
      } else {
        state.tokens.push(value);   // 普通数字，新增一个记号
      }
      return;   // return 表示「这个函数到此结束」，后面的代码不再执行
    }

    // 运算符
    if (OPERATORS.includes(value)) {
      if (!last) {
        /* 算式开头就按运算符。
           只有负号有意义（比如一开始就输入 -5），其他都忽略 */
        if (value === MINUS) state.tokens.push(value);
        return;
      }
      if (OPERATORS.includes(last)) {
        /* 连着按两个运算符（例如先按 + 又按 ×），
           用新运算符「替换」旧的，而不是两个都留着 */
        state.tokens[state.tokens.length - 1] = value;
        return;
      }
      if (last === "(") return;   // 左括号后面直接跟运算符没有意义，忽略
      state.tokens.push(value);
      return;
    }

    if (value === "(") {
      state.tokens.push(value);
      return;
    }

    if (value === ")") {
      /* 只有「还有没配对的左括号」时才允许输入右括号，
         否则会出现 "1+2)" 这种非法算式。
         算法：数一遍左括号有几个、右括号有几个，多出来的才是可用的 */
      const open =
        state.tokens.filter((t) => t === "(").length -
        state.tokens.filter((t) => t === ")").length;
      if (open > 0 && !OPERATORS.includes(last) && last !== "(") state.tokens.push(value);
      return;
    }

    if (value === "%" || value === "²") {
      // 只有当前面是一个完整的值时才允许（比如 50% 可以，"×%" 不行）
      if (last && isValueToken(last)) state.tokens.push(value);
      return;
    }

    // 函数与常量
    // 能走到这里的就是 sin( / cos( / π / e 这类，直接放进数组即可
    state.tokens.push(value);
  }

  /* 正负号切换（± 键）
     实现方式：把负号「贴进数字内部」，例如 5 → "−5"，再按一次又变回 5。
     这么做的好处是：它和作为运算符的减号不会混淆，退格时也能一起删掉 */
  function negate() {
    const last = lastToken();
    if (!last) {
      // 算式还空着，先放一个负号，等着用户接着输入数字
      state.tokens.push(MINUS);
      state.justEvaluated = false;
      return;
    }
    if (NUMBER_RE.test(last)) {
      /* startsWith 判断字符串是不是以某个内容开头。
         slice(1) 表示「从下标 1 开始取到结尾」，也就是去掉第一个字符。
         于是：已带负号 → 去掉负号；没有负号 → 加上负号。 */
      state.tokens[state.tokens.length - 1] = last.startsWith(MINUS)
        ? last.slice(1)
        : MINUS + last;
      state.justEvaluated = false;
    }
    // 如果最后一个是 ")" 或 π 这种，无法贴负号，就什么也不做
  }

  /* 退格（⌫ 键） */
  function backspace() {
    const last = lastToken();
    if (!last) return;   // 已经是空的了，不用删

    /* 如果最后是一个「多位数」，只删掉最后一位字符；
       如果只剩一个字符了，就把整个记号删掉。
       这样 "125" 按三次退格会依次变成 "12" → "1" → 空 */
    if (NUMBER_RE.test(last) && last.length > 1) {
      /* slice(0, -1) 表示「从开头取到倒数第二个字符之前」，
         也就是去掉最后一个字符 */
      const next = last.slice(0, -1);
      // 如果删完只剩一个负号，或者变成空字符串，就直接把整个记号删掉
      if (next === MINUS || next === "") state.tokens.pop();
      else state.tokens[state.tokens.length - 1] = next;
    } else {
      /* 非数字记号（如 "sin(" "×" "π"）是一个整体，一次删掉整个。
         这就是开头说的「用数组存记号」的好处 */
      state.tokens.pop();
    }
    state.justEvaluated = false;
  }

  /* 全部清空（AC 键）：把状态恢复到初始值 */
  function clearAll() {
    state.tokens = [];
    state.justEvaluated = false;
  }

  /* 等号（= 键）：正式计算并存进历史记录 */
  function equals() {
    if (state.tokens.length === 0) return;   // 什么也没输入，不处理

    let result;
    try {
      result = formatNumber(evaluateTokens(state.tokens));
    } catch (err) {
      /* 算式不完整或非法（例如刚输入 "12+"），直接什么都不做。
         静默返回比弹窗报错更符合计算器的使用习惯 */
      return;
    }
    if (result === "错误") return;   // 比如除以 0，不算一次有效计算

    /* unshift 是「往数组开头插入一个元素」。
       历史记录要最新的在最上面，所以用 unshift 而不是 push */
    state.history.unshift({
      expression: state.tokens.join("") + " =",   // 记下原始算式，末尾加个等号好看
      result,
    });
    /* slice(0, 50) 取前 50 条，实现「只保留最近 50 条」的限制 */
    state.history = state.history.slice(0, MAX_HISTORY);
    writeJSON(HISTORY_KEY, state.history);   // 写进浏览器本地存储

    /* 把结果本身变成一个「数字记号」，这样用户可以接着对它运算，
       例如算完 2+3= 直接按 ×4 得到 20 */
    state.tokens = [result];
    state.justEvaluated = true;
    render();
    renderHistory();
  }

  /* ============================================================
   * 5. 鼠标点击：事件委托
   * ============================================================
   * 【事件委托】只给「按键区」这一个父元素绑定监听，
   * 而不是给 30 个按钮各绑一次。
   * 原理：点击事件会从被点的元素一路「冒泡」到父元素，
   * 所以在父元素上也能收到，再用 event.target 反查点到了谁。
   *
   * 好处：① 代码只写一遍 ② 以后动态新增的按钮也能自动生效 */
  keysEl.addEventListener("click", (event) => {
    /* closest(".key") 从被点击的元素往上找最近的 .key 元素。
       这样即使用户点的是按钮里的 SVG 图标（而不是按钮本身），也能正确找到按钮 */
    const button = event.target.closest(".key");
    if (!button) return;   // 点在了按键之间的空隙，忽略

    /* dataset 用来读取 HTML 里的 data-* 属性：
       data-action="equals"  → button.dataset.action 得到 "equals"
       data-value="7"        → button.dataset.value  得到 "7" */
    const action = button.dataset.action;
    const value = button.dataset.value;

    /* 按优先级分派到对应的处理函数。
       if / else if 会从上往下依次判断，命中一个就跳过其余 */
    if (action === "clear") clearAll();
    else if (action === "back") backspace();
    else if (action === "negate") negate();
    else if (action === "equals") equals();
    else if (value) insert(value);

    /* 等号那个分支内部已经调用过 render 了，避免重复渲染 */
    if (action !== "equals") render();
  });

  /* 点击右上角时钟图标：开关历史面板 */
  historyBtn.addEventListener("click", () => {
    /* classList.toggle 返回一个布尔值，表示「操作之后这个类到底有没有」。
       所以 open 就等于「面板现在是打开状态吗」 */
    const open = historyPanel.classList.toggle("is-open");
    historyBtn.classList.toggle("is-active", open);        // 图标跟着高亮/熄灭
    /* setAttribute 给元素设置属性。
       这里同步更新无障碍属性，让读屏软件知道面板是开着还是关着 */
    historyBtn.setAttribute("aria-expanded", String(open));
    if (open) renderHistory();   // 打开时才刷新列表内容
  });

  /* 点击「清空」：删除全部历史记录 */
  clearHistoryBtn.addEventListener("click", () => {
    state.history = [];
    writeJSON(HISTORY_KEY, state.history);   // 本地存储也要一起清掉，否则刷新会「复活」
    renderHistory();
  });

  /* 记录定时器的编号，方便取消上一个还没结束的定时器 */
  let flashTimer = 0;

  /** 让被按下的（物理）按键短暂呈现按下状态 */
  function flash(button) {
    if (!button) return;   // 没找到对应按钮就算了

    /* 先把之前所有正在闪的按键恢复，避免快速连按时多个按钮一起亮 */
    document
      .querySelectorAll(".key.is-flash")   // 找出所有带 is-flash 的按键
      .forEach((el) => el.classList.remove("is-flash"));  // 逐个移除这个类

    /* void button.offsetWidth 这行的作用是「强制浏览器立刻重新计算布局」。
       不这么写的话，浏览器会把「移除类」和「添加类」合并成一次处理，
       动画就不会重新播放。这是个小技巧，知道有这么回事就行 */
    void button.offsetWidth;

    button.classList.add("is-flash");   // 加上类 = 按键呈现按下外观

    /* setTimeout(函数, 毫秒) 表示「过 150 毫秒后执行这个函数」。
       这里用来在 150 毫秒后把按下状态取消，做出「一闪而过」的效果。
       clearTimeout 用来取消上一个还没执行的定时器，
       否则快速连按时会有多个定时器互相抢着改状态 */
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => button.classList.remove("is-flash"), 150);
  }

  /* ============================================================
   * 6. 键盘输入
   * ============================================================
   * 处理函数返回 true 表示「这个键我管了」，路由就不会再问后面的模块。
   * 计算器优先级最低，属于「兜底」：只要弹层/游戏没接管，按键就归它。 */
  registerKeyHandler(KEY_PRIORITY.CALCULATOR, (event) => {
    const { key } = event;

    /* 焦点在功能按钮上时，交给按钮自身的默认行为。
       例如用户用 Tab 键跳到「历史记录」按钮上按回车，
       应该执行「打开面板」，而不是被我们拦截去当做等号 */
    if (
      event.target instanceof Element &&
      event.target.closest(".icon-btn, .text-btn, .history__item")
    ) {
      return false;
    }

    if (key === "Enter" || key === "=") {
      /* preventDefault 阻止浏览器的默认行为。
         例如按下空格或回车时，浏览器可能会「点击」当前获得焦点的按钮，
         不阻止的话同一次按键会生效两次 */
      event.preventDefault();
      /* 让屏幕上对应的按钮也「动一下」，制造真实按键的反馈。
         querySelector 用 CSS 选择器语法查找元素：
         [data-action="equals"] 表示「带有 data-action 属性且值为 equals 的元素」 */
      flash(keysEl.querySelector('[data-action="equals"]'));
      equals();
      return true;
    }

    if (key === "Backspace") {
      event.preventDefault();
      flash(keysEl.querySelector('[data-action="back"]'));
      backspace();
      render();
      return true;
    }

    if (key === "Escape" || key === "Delete") {
      event.preventDefault();
      flash(keysEl.querySelector('[data-action="clear"]'));
      clearAll();
      render();
      return true;
    }

    // 数字键 0-9
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      /* 模板字符串：用反引号 ` 包起来的字符串，里面可以用 ${表达式} 插入变量。
         这里动态拼出选择器，例如按键 "7" 时得到 [data-value="7"] */
      flash(keysEl.querySelector(`[data-value="${key}"]`));
      insert(key);
      render();
      return true;
    }

    // 最后查表处理 + - * / 等符号
    if (Object.prototype.hasOwnProperty.call(KEYBOARD_MAP, key)) {
      event.preventDefault();
      const value = KEYBOARD_MAP[key];
      flash(keysEl.querySelector(`[data-value="${value}"]`));
      insert(value);
      render();
      return true;
    }

    return false;   // 其他按键（字母等）不处理，让浏览器自己来
  });

  /* 程序启动时先画一遍初始界面（显示屏显示 0） */
  renderHistory();
  render();
}

/* ============================================================
 * 本地存储：把历史记录存进浏览器
 * ============================================================ */

/** 从本地读回历史记录；数据不是数组就当作空 */
function loadHistory() {
  const saved = readJSON(HISTORY_KEY, []);
  return Array.isArray(saved) ? saved.slice(0, MAX_HISTORY) : [];
}
