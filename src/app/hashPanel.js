/* ============================================================
 * 哈希计算面板（弹层 / Modal）
 * ============================================================
 * 【什么是「模态框」】
 * 一块浮在所有内容上面的面板。打开时背景变暗，
 * 用户得先关掉它才能操作别的地方。
 *
 * 【交互流程】
 *   1. 点顶部的「#」按钮 → 弹层出现，光标自动落进输入框
 *   2. 输入任意文本 → 实时算出哈希值（input 事件）
 *   3. 点算法按钮 → 换一种算法重算
 *   4. 点「复制」→ 把结果放进剪贴板
 *   5. 点 ✕、点黑幕、或按 Esc → 关闭
 * ============================================================ */

import { HASH_BITS, HASH_ALGORITHMS, computeHash } from "../core/hash.js";
import { registerKeyHandler, KEY_PRIORITY } from "./keyboard.js";

export function initHashPanel() {
  /* ---- 找到相关元素 ---- */
  const hashBtn = document.getElementById("hashBtn");           // 顶部的「#」按钮
  const hashModal = document.getElementById("hashModal");       // 整个弹层（用它判断开没开）
  const hashCloseBtn = document.getElementById("hashCloseBtn"); // 弹层右上角的关闭按钮
  const hashInput = document.getElementById("hashInput");       // 输入文本的多行文本框
  const hashAlgs = document.getElementById("hashAlgs");         // 算法按钮组的容器
  const hashAlgName = document.getElementById("hashAlgName");   // 结果区左上角显示的算法名
  const hashBits = document.getElementById("hashBits");         // 结果区右上角显示的位数
  const hashResult = document.getElementById("hashResult");     // 显示哈希结果的区域
  const hashCopyBtn = document.getElementById("hashCopyBtn");   // 「复制」按钮

  /* 当前选中的算法，默认用 MD5（最短最直观，适合先用它理解概念） */
  let currentAlg = "MD5";

  /* 【防止「抢跑」的小机关】每次开始计算前，给这次任务发一个递增的编号。
     因为 SHA 的计算是异步的（要等浏览器算完才能拿到结果），
     如果用户手速很快，「前一次输入的结果」可能比「后一次输入的」更晚返回，
     直接把迟到的旧结果写上去，屏幕上就会显示错误的内容。
     有了编号，写结果之前先对一下号，对不上就丢掉不要。 */
  let taskId = 0;

  /* ============================================================
   * 1. 算法按钮：由数组动态生成
   * ============================================================
   * 为什么不在 HTML 里手写 4 个按钮？
   * 因为「有哪些算法」属于数据（HASH_ALGORITHMS），
   * 数据驱动界面才是好习惯：以后要加 SM3，只改数组，不用碰 HTML。 */
  HASH_ALGORITHMS.forEach((alg) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hash__alg";
    btn.dataset.alg = alg;       // 记录自己的算法名，点击时靠它认人
    btn.textContent = alg;
    btn.classList.toggle("is-active", alg === currentAlg);  // 默认选中 MD5
    hashAlgs.appendChild(btn);
  });

  /* ============================================================
   * 2. 计算并显示结果
   * ============================================================ */
  async function updateResult() {
    const text = hashInput.value;
    taskId += 1;                       // 领一个号，标记「这是第几次计算」
    const myId = taskId;

    // 更新结果区左上角（算法名）和右上角（位数）的说明文字
    hashAlgName.textContent = currentAlg;
    hashBits.textContent = HASH_BITS[currentAlg] + " 位";

    /* 空输入时显示一个短横线占位。
       为什么不显示结果？因为空字符串确实有哈希值（d41d8cd98f00b204e9800998ecf8427e），
       但对使用者来说「什么都没输入却冒出一串乱码」会让人困惑，所以这里选择不显示。 */
    if (text === "") {
      hashResult.textContent = "—";
      hashResult.className = "hash__value is-empty";
      return;
    }

    hashResult.className = "hash__value";   // 去掉 is-empty，恢复正常的琥珀色样式
    hashResult.textContent = "计算中…";

    let value;
    try {
      value = await computeHash(currentAlg, text);
    } catch (err) {
      /* 会失败通常是两种情况：
         ① crypto.subtle 不存在（用 http:// 打开、或浏览器太老时会出现）
         ② 算法名写错 */
      if (myId !== taskId) return;        // 已经有过更新的计算，这次结果作废
      hashResult.className = "hash__value is-error";
      hashResult.textContent = "当前环境不支持该算法，请改用 https / localhost 打开，或先试试 MD5。";
      return;
    }

    /* 【关键】等待的这段时间里，用户可能已经改了输入。
       如果编号变了，说明有更新的计算在跑，这次的旧结果直接丢掉，不能覆盖屏幕。 */
    if (myId !== taskId) return;

    hashResult.textContent = value;
  }

  /* ============================================================
   * 3. 打开 / 关闭弹层
   * ============================================================ */

  /** 弹层现在开着吗？（hidden 属性为 false 才算开着） */
  function isOpen() {
    return !hashModal.hidden;
  }

  function open() {
    hashModal.hidden = false;             // 去掉 hidden 属性 → 弹层出现
    hashBtn.classList.add("is-active");   // 顶部按钮高亮，提示「功能正在使用中」
    hashBtn.setAttribute("aria-expanded", "true");
    hashInput.focus();                    // 光标自动落进输入框，打开就能直接打字
    updateResult();                       // 如果之前输过内容，恢复显示它对应的哈希
  }

  function close() {
    hashModal.hidden = true;
    hashBtn.classList.remove("is-active");
    hashBtn.setAttribute("aria-expanded", "false");
    /* 让输入框失去焦点。这样关闭后，键盘事件才会重新交给计算器，
       而不是继续被输入框接收 */
    hashInput.blur();
  }

  /* ============================================================
   * 4. 事件绑定
   * ============================================================ */

  /* 点顶部的「#」按钮：开着就关，关着就开 */
  hashBtn.addEventListener("click", () => {
    if (isOpen()) close();
    else open();
  });

  /* 点弹层右上角的 ✕ */
  hashCloseBtn.addEventListener("click", close);

  /* 点黑幕也能关闭（这是弹窗的通用交互习惯）。
     这里判断「被点到的元素是谁」：只有点到黑幕本身时才关闭；
     点在面板内部的任何东西上，event.target 都会是面板里的元素，于是什么也不做。 */
  hashModal.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal__backdrop")) close();
  });

  /* 输入框内容一变就重新算。
     为什么用 input 事件而不是 keydown？
     因为 keydown 只告诉你「按了哪个键」，而有些输入不来自按键
     （比如右键粘贴、输入法选字、语音输入）。
     input 事件在「内容真的变了」时才触发，是处理输入框最合适的事件。 */
  hashInput.addEventListener("input", updateResult);

  /* 切换算法。
     这里用了「事件委托」：把监听器绑在按钮组的父元素上，
     靠 event.target 反查到底点中了哪个按钮 */
  hashAlgs.addEventListener("click", (event) => {
    const button = event.target.closest(".hash__alg");
    if (!button) return;

    currentAlg = button.dataset.alg;   // 读取 data-alg，例如 "SHA-256"

    /* 把「选中」样式的类从旧按钮挪到新按钮上。
       toggle(类名, 条件)：第二个参数为 true 表示加上、false 表示移除，
       所以一次遍历就完成了「选中的点亮、其余的熄灭」。 */
    hashAlgs.querySelectorAll(".hash__alg").forEach((el) => {
      el.classList.toggle("is-active", el === button);
    });

    updateResult();   // 换了算法立刻重算
  });

  /* 把结果复制到剪贴板 */
  hashCopyBtn.addEventListener("click", async () => {
    const value = hashResult.textContent;
    // 还没算完、或者处于占位/报错状态时，不复制
    if (!value || value === "—" || value === "计算中…") return;

    let success = false;
    try {
      /* navigator.clipboard 是现代浏览器提供的剪贴板接口。
         它同样是异步的，要 await；
         而且只在「安全环境」（https 或 localhost）下才可用。 */
      await navigator.clipboard.writeText(value);
      success = true;
    } catch (err) {
      success = false;
    }

    if (!success) {
      /* 降级方案：老办法。
         造一个看不见的文本框放进页面，把内容塞进去、全选，
         再让浏览器执行「复制」这个命令。
         这套写法已经被官方标记为「不推荐」，
         但在不支持新接口的环境里，它是唯一还能用的办法。 */
      const temp = document.createElement("textarea");
      temp.value = value;
      temp.style.position = "fixed";  // 固定定位，不占页面空间、不引起滚动
      temp.style.opacity = "0";       // 完全透明，用户看不见它
      document.body.appendChild(temp); // 必须先放进页面里才允许被选中
      temp.select();                   // 选中里面的全部文字
      try {
        success = document.execCommand("copy");
      } catch (err) {
        success = false;
      }
      document.body.removeChild(temp); // 用完立刻删掉，别留在页面上
    }

    /* 给用户一个明确的反馈：按钮文字临时变一下。
       没有反馈的话，用户不知道到底复制成功没有。 */
    const original = hashCopyBtn.textContent;
    hashCopyBtn.textContent = success ? "已复制" : "复制失败";
    window.setTimeout(() => {
      hashCopyBtn.textContent = original;
    }, 1200);
  });

  /* 键盘接管：优先级高于计算器。
     返回 true 的意思是「这个键由我负责，别再给计算器了」。
     注意：返回 true 并不会阻止浏览器默认行为，
     所以文本框里照常能打字、按钮照常能响应回车。 */
  registerKeyHandler(KEY_PRIORITY.MODAL, (event) => {
    if (!isOpen()) return false;            // 没打开，不掺和

    if (event.key === "Escape") {           // 打开状态按 Esc 关闭（弹窗通用习惯）
      close();
      return true;
    }
    return true;                            // 打开着：键盘全归弹层，计算器别插手
  });
}
