// 临时校验脚本（验证完会删除）
const fs = require("fs");
const vm = require("vm");
const nodeCrypto = require("crypto");

/* ---------- 用 DOM 桩模拟浏览器环境，加载 script.js ---------- */
function stub() {
  const base = {
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    dataset: {}, style: {}, children: [], innerHTML: "", textContent: "", value: "",
    hidden: true, scrollLeft: 0, scrollWidth: 0, offsetWidth: 0, title: "",
    addEventListener() {}, appendChild() {}, removeChild() {}, setAttribute() {},
    getAttribute() { return "light"; }, focus() {}, blur() {}, select() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
  };
  return new Proxy(base, {
    get(t, p) { return p in t ? t[p] : undefined; },
    set(t, p, v) { t[p] = v; return true; },
  });
}

const ctx = {
  console,
  document: {
    getElementById: () => stub(),
    createElement: () => stub(),
    addEventListener() {},
    querySelectorAll: () => [],
    documentElement: stub(),
    body: stub(),
    execCommand: () => true,
  },
  window: { setTimeout, clearTimeout },
  localStorage: { getItem: () => null, setItem() {} },
  Element: class Element {},
  TextEncoder, TextDecoder,
  crypto: nodeCrypto.webcrypto,
  navigator: {},
  setTimeout, clearTimeout,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("d:/Doc/myapp/script.js", "utf8"), ctx);
console.log("① script.js 加载成功（含哈希模块）");

/* ---------- 2. MD5 与 Node 标准实现逐一对照 ---------- */
// 覆盖补位的各种边界长度：0 / 55 / 56 / 57 / 63 / 64 / 65 字节
const lengths = [0, 1, 2, 3, 55, 56, 57, 63, 64, 65, 119, 120, 121, 1000, 10000];
let bad = 0, total = 0;
for (const len of lengths) {
  const s = "a".repeat(len);
  const expect = nodeCrypto.createHash("md5").update(s, "utf8").digest("hex");
  const got = ctx.md5(s);
  total += 1;
  if (got !== expect) { bad += 1; console.log("  FAIL len=" + len, got, "!=", expect); }
}

// 多字节 / 常见测试向量
const texts = ["abc", "你好", "Hello, 世界! 🌍", "The quick brown fox jumps over the lazy dog",
  "1234567890", "×÷−π²√", "a".repeat(100) + "中文混合内容"];
for (const s of texts) {
  const expect = nodeCrypto.createHash("md5").update(s, "utf8").digest("hex");
  const got = ctx.md5(s);
  total += 1;
  if (got !== expect) { bad += 1; console.log("  FAIL", JSON.stringify(s), got, "!=", expect); }
}
console.log("② MD5 对照测试：" + (total - bad) + "/" + total + " 通过");
console.log("   空字符串 md5 =", ctx.md5(""), "(标准 d41d8cd98f00b204e9800998ecf8427e)");
console.log('   "abc" 的 md5 =', ctx.md5("abc"), "(标准 900150983cd24fb0d6963f7d28e17f72)");

/* ---------- 3. SHA 系列与 Node 标准实现对照 ---------- */
(async () => {
  const algs = [["SHA-1", "sha1"], ["SHA-256", "sha256"], ["SHA-512", "sha512"]];
  let shaBad = 0, shaTotal = 0;
  for (const [webName, nodeName] of algs) {
    for (const s of ["abc", "你好世界", "x".repeat(300)]) {
      const expect = nodeCrypto.createHash(nodeName).update(s, "utf8").digest("hex");
      const got = await ctx.shaDigest(webName, s);
      shaTotal += 1;
      if (got !== expect) { shaBad += 1; console.log("  FAIL", webName, s.slice(0, 8)); }
    }
  }
  console.log("③ SHA 对照测试：" + (shaTotal - shaBad) + "/" + shaTotal + " 通过");

  /* ---------- 4. 计算器原有求值功能回归 ---------- */
  const cases = [
    [["12", "+", "3", "×", "4"], 24],
    [["2", "π"], 2 * Math.PI],
    [["(", "1", "+", "2", ")", "²"], 9],
    [["10", "÷", "(", "4"], 2.5],
  ];
  let ok = 0;
  for (const [tokens, expect] of cases) {
    if (Math.abs(ctx.evaluateTokens(tokens) - expect) < 1e-9) ok += 1;
  }
  console.log("④ 计算器求值回归：" + ok + "/" + cases.length + " 通过");

  /* ---------- 5. HASH_BITS 位数与输出长度一致性 ---------- */
  const pairs = [["MD5", ctx.md5("x")], ["SHA-1", await ctx.shaDigest("SHA-1", "x")],
    ["SHA-256", await ctx.shaDigest("SHA-256", "x")], ["SHA-512", await ctx.shaDigest("SHA-512", "x")]];
  const mix = pairs.filter(([name, hex]) => ctx.HASH_BITS[name] === hex.length * 4);
  console.log("⑤ 位数表与实际输出长度一致：" + mix.length + "/4");
})();