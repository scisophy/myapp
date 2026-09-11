/* ============================================================
 * 本地存储小工具（localStorage 的封装）
 * ============================================================
 * 【localStorage 是什么】
 * 浏览器提供的一个「小仓库」：存进去的数据关机重开还在，
 * 但只能存字符串，而且同一个网站的所有页面共享它。
 *
 * 【为什么要封装一层】
 * 直接调 localStorage 有两个麻烦：
 *   1. 存对象/数组必须先 JSON.stringify，取出来要 JSON.parse
 *   2. 在「无痕/隐私模式」或存储空间满时会直接抛错，
 *      如果不处理，整个页面就崩了
 * 下面几个函数把这两件事一次性解决：取不到就给默认值，绝不抛错。
 * ============================================================ */

/** 读出并解析一个 JSON 值；不存在或已损坏时返回 fallback（默认值） */
export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);   // 读出来是字符串，没存过则是 null
    if (raw === null) return fallback;
    // JSON.parse 可能因为数据被改坏而抛错，所以放在 try 里
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (err) {
    return fallback;   // 出错就当没有存过
  }
}

/** 把一个值序列化成 JSON 存进去；失败时静默忽略 */
export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    /* 忽略：无痕模式或空间不足。功能照常用，只是记不住 */
  }
}

/** 读一个纯字符串；不存在时返回 fallback */
export function readString(key, fallback = "") {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch (err) {
    return fallback;
  }
}

/** 存一个纯字符串 */
export function writeString(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (err) {
    /* 忽略 */
  }
}
