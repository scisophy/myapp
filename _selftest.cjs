// 临时自测脚本：用 DOM 桩在 Node 中加载 script.js 并验证解析器
const fs = require("fs");
const vm = require("vm");

const code = fs.readFileSync("d:/Doc/myapp/script.js", "utf8");

function stub() {
  const base = {
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    dataset: {}, style: {}, children: [], innerHTML: "", textContent: "",
    hidden: false, scrollLeft: 0, scrollWidth: 0, offsetWidth: 0, title: "",
    addEventListener() {}, appendChild() {}, setAttribute() {},
    getAttribute() { return "dark"; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
  };
  return new Proxy(base, {
    get(t, p) { return p in t ? t[p] : undefined; },
    set(t, p, v) { t[p] = v; return true; },
  });
}

const document = {
  getElementById: () => stub(),
  createElement: () => stub(),
  addEventListener() {},
  documentElement: stub(),
};

const ctx = {
  console,
  document,
  window: { matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {} },
  Element: class Element {},
};
vm.createContext(ctx);
vm.runInContext(code, ctx);

const cases = [
  [["1", "2", "+", "3", "×", "4"], 24],
  [["2", "(", "3", "+", "4", ")"], 14],
  [["2", "π"], 2 * Math.PI],
  [["√(", "9", ")"], 3],
  [["(", "1", "+", "2", ")", "²"], 9],
  [["5", "0", "%"], 0.5],
  [["2", "^", "1", "0"], 1024],
  [["−", "5", "+", "2"], -3],
  [["3", "−", "1", "0"], -7],
  [["sin(", "0", ")"], 0],
  [["log(", "1", "0", "0", ")"], 2],
  [["1", "0", "÷", "(", "4"], 2.5], // 自动补右括号
  [["1", "+", "2", "×", "3", "−", "4", "÷", "2"], 5],
  [["1", "2", ".", "5", "×", "2"], 25],
];

let failed = 0;
for (const [tokens, expect] of cases) {
  let got;
  try {
    got = ctx.evaluateTokens(tokens);
  } catch (err) {
    got = "抛出异常: " + err.message;
  }
  const ok = typeof got === "number" && Math.abs(got - expect) < 1e-9;
  if (!ok) failed += 1;
  console.log(ok ? "PASS" : "FAIL", tokens.join(" "), "=>", got, "(期望", expect + ")");
}

console.log("0.1 + 0.2 显示为:", ctx.formatNumber(0.1 + 0.2));
console.log("1 / 3 显示为:", ctx.formatNumber(1 / 3));
console.log("1 / 0 显示为:", ctx.formatNumber(1 / 0));
console.log("负一百显示为:", ctx.formatNumber(-100));
console.log(failed === 0 ? "全部通过" : failed + " 个用例失败");
