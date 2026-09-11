/* ============================================================
 * 键盘事件路由
 * ============================================================
 * 【要解决的问题】
 * 页面上有三块东西都想知道用户按了什么键：
 *    1. 口算擂台（弹出时，数字键应该填进答题框）
 *    2. 哈希面板（弹出时，字母要能正常打进文本框）
 *    3. 计算器（没弹层时，数字键应该按到计算器上）
 *
 * 如果三块各写一个 document.addEventListener("keydown", ...)，
 * 那么按一次 "7"，三边都会收到，计算器背地里也在偷偷输入数字。
 *
 * 【解决办法：给监听器排优先级】
 * 每个模块调用 registerKeyHandler(优先级, 处理函数) 报名，
 * 按键发生时按优先级从高到低依次询问，谁先「认领」就到此为止。
 *
 *   处理函数返回 true  → 我处理了，后面的别管（事件被「消费」掉）
 *   处理函数返回 false → 跟我没关系，继续问下一个
 *
 * 这其实就是浏览器自身的事件模型（冒泡 + preventDefault）的简化版，
 * 也是很多框架里「中间件」「拦截器」的思路。
 * ============================================================ */

/** 优先级常量：数字大的先拿到按键 */
export const KEY_PRIORITY = {
  GAME: 30,        // 口算擂台，最高：游戏进行时其它地方都不该响应
  MODAL: 20,       // 弹层（哈希面板）
  CALCULATOR: 10,  // 计算器，最低：兜底的那个
};

/* 报名的处理函数都放在这个数组里 */
const handlers = [];

/**
 * 注册一个按键处理函数
 * @param {number} priority 优先级，越大越先被调用（用 KEY_PRIORITY 里的常量）
 * @param {(event: KeyboardEvent) => boolean} handle 返回 true 表示「这个键归我管」
 */
export function registerKeyHandler(priority, handle) {
  handlers.push({ priority, handle });

  /* 每次注册后重新排序：优先级大的排前面。
     这样遍历数组时，第一个「认领」的自然是优先级最高的。
     sort 的比较函数返回负数表示 a 排在 b 前面。 */
  handlers.sort((a, b) => b.priority - a.priority);
}

/** 启动全局键盘监听。整个页面只需要调用一次（在 main.js 里） */
export function startKeyboardRouter() {
  document.addEventListener("keydown", (event) => {
    for (const { handle } of handlers) {
      if (handle(event) === true) return;   // 已被认领，停止向下询问
    }
  });
}
