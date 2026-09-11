/* ============================================================
 * 计算器逻辑
 * - 不使用 eval：使用递归下降解析器求值，安全且可控
 * - tokens：界面上的记号序列，例如 ["12.5", "×", "sin(", "π", ")"]
 * ============================================================ */

const MINUS = "−"; // U+2212，同时作为“负号”（写在数字内部）和减号运算符

const OPERATORS = ["+", MINUS, "×", "÷", "^"];
const FUNCTIONS = ["sin(", "cos(", "tan(", "ln(", "log(", "√("];
const CONSTANTS = ["π", "e"];
const POSTFIX = ["%", "²"];

const NUMBER_RE = /^−?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

const FUNC_MAP = {
  "sin(": Math.sin,
  "cos(": Math.cos,
  "tan(": Math.tan,
  "ln(": Math.log,
  "log(": (x) => Math.log10(x),
  "√(": Math.sqrt,
};

const CONST_MAP = {
  "π": Math.PI,
  "e": Math.E,
};

const STORAGE_KEY = "calculator.history";
const THEME_KEY = "calculator.theme";

const state = {
  tokens: [],
  history: [],
  justEvaluated: false,
};

/* ---------- DOM ---------- */
const exprEl = document.getElementById("expr");
const resultEl = document.getElementById("result");
const keysEl = document.getElementById("keys");
const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");
const historyBtn = document.getElementById("historyBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const themeBtn = document.getElementById("themeBtn");

/* ============================================================
 * 1. 解析与求值
 * ============================================================ */

function tokenize(tokens) {
  return tokens.map((raw) => {
    if (Object.prototype.hasOwnProperty.call(FUNC_MAP, raw)) {
      return { type: "func", fn: FUNC_MAP[raw] };
    }
    if (Object.prototype.hasOwnProperty.call(CONST_MAP, raw)) {
      return { type: "const", value: CONST_MAP[raw] };
    }
    if (raw === "(") return { type: "lparen" };
    if (raw === ")") return { type: "rparen" };
    if (raw === "%" || raw === "²") return { type: "postfix", op: raw };
    if (OPERATORS.includes(raw)) return { type: "op", op: raw };
    if (NUMBER_RE.test(raw)) {
      return { type: "num", value: parseFloat(raw.replace(MINUS, "-")) };
    }
    throw new Error("无法识别的记号：" + raw);
  });
}

/** 把 tokens 解析成数值；括号未闭合时自动补齐 */
function evaluateTokens(rawTokens) {
  const tokens = tokenize(rawTokens);

  // 自动补全右括号
  let depth = 0;
  for (const t of tokens) {
    if (t.type === "lparen") depth += 1;
    if (t.type === "rparen") depth -= 1;
  }
  for (let k = 0; k < depth; k += 1) tokens.push({ type: "rparen" });

  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];
  const atEnd = () => pos >= tokens.length;

  function parseExpression() {
    let value = parseTerm();
    while (!atEnd() && peek().type === "op" && (peek().op === "+" || peek().op === MINUS)) {
      const op = eat().op;
      const right = parseTerm();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  const startsOperand = (t) =>
    !!t && (t.type === "num" || t.type === "const" || t.type === "lparen" || t.type === "func");

  function parseTerm() {
    let value = parseUnary();
    for (;;) {
      const t = peek();
      if (!t) break;
      if (t.type === "op" && (t.op === "×" || t.op === "÷")) {
        eat();
        const right = parseUnary();
        value = t.op === "×" ? value * right : value / right;
      } else if (startsOperand(t)) {
        // 隐式乘法：2π、3(4+1)、(1+2)(3+4)
        value *= parseUnary();
      } else {
        break;
      }
    }
    return value;
  }

  function parseUnary() {
    const t = peek();
    if (t && t.type === "op" && (t.op === MINUS || t.op === "+")) {
      eat();
      const value = parseUnary();
      return t.op === MINUS ? -value : value;
    }
    return parsePower();
  }

  function parsePower() {
    const base = parsePostfix();
    const t = peek();
    if (t && t.type === "op" && t.op === "^") {
      eat();
      return Math.pow(base, parseUnary());
    }
    return base;
  }

  function parsePostfix() {
    let value = parsePrimary();
    for (;;) {
      const t = peek();
      if (t && t.type === "postfix") {
        eat();
        value = t.op === "%" ? value / 100 : value * value;
      } else {
        break;
      }
    }
    return value;
  }

  function parsePrimary() {
    const t = eat();
    if (!t) throw new Error("算式不完整");
    if (t.type === "num" || t.type === "const") return t.value;
    if (t.type === "lparen") {
      const value = parseExpression();
      const close = eat();
      if (!close || close.type !== "rparen") throw new Error("缺少右括号");
      return value;
    }
    if (t.type === "func") {
      const value = parseExpression();
      const close = eat();
      if (!close || close.type !== "rparen") throw new Error("缺少右括号");
      const out = t.fn(value);
      if (Number.isNaN(out)) throw new Error("数学错误");
      return out;
    }
    throw new Error("算式不完整");
  }

  const result = parseExpression();
  if (!atEnd()) throw new Error("算式不完整");
  return result;
}

/** 数字格式化：去掉浮点误差与多余的 0 */
function formatNumber(value) {
  if (!Number.isFinite(value)) return "错误";
  if (Number.isNaN(value)) return "错误";
  if (value === 0) return "0";

  const abs = Math.abs(value);
  if (abs >= 1e15 || abs < 1e-9) {
    let text = value.toExponential(8).replace(/\.?0+e/, "e");
    return text.replace("-", MINUS);
  }

  let text = String(parseFloat(value.toFixed(10)));
  return text.replace("-", MINUS);
}

/* ============================================================
 * 2. 渲染
 * ============================================================ */

function scrollToEnd(el) {
  el.scrollLeft = el.scrollWidth;
}

function tryEvaluate(tokens) {
  try {
    return { ok: true, value: evaluateTokens(tokens) };
  } catch (err) {
    return { ok: false };
  }
}

function render() {
  exprEl.textContent = state.tokens.join("");
  scrollToEnd(exprEl);

  let preview = "0";
  let isError = false;

  if (state.tokens.length > 0) {
    const full = tryEvaluate(state.tokens);
    if (full.ok) {
      preview = formatNumber(full.value);
      isError = preview === "错误";
    } else {
      // 输入尚未完整，退一步用最后一个完整片段做预览
      const partial = tryEvaluate(safePartialTokens());
      const text = partial.ok ? formatNumber(partial.value) : "…";
      preview = text === "错误" ? "…" : text;
    }
  }

  resultEl.textContent = preview;
  resultEl.classList.toggle("is-small", preview.length > 12);
  resultEl.classList.toggle("is-error", isError);
}

/** 输入到一半时的容错预览：尽量截取到最后一个完整片段 */
function safePartialTokens() {
  const tokens = state.tokens.slice();
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    const isIncomplete =
      OPERATORS.includes(last) || FUNCTIONS.includes(last) || last === "(";
    if (!isIncomplete) break;
    tokens.pop();
  }
  return tokens;
}

function renderHistory() {
  historyList.innerHTML = "";
  const hasItems = state.history.length > 0;
  historyEmpty.hidden = hasItems;

  state.history.forEach((item) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history__item";
    btn.title = "点击使用该结果";
    btn.innerHTML =
      '<small></small><strong></strong>';
    btn.querySelector("small").textContent = item.expression;
    btn.querySelector("strong").textContent = "= " + item.result;
    btn.addEventListener("click", () => useHistoryResult(item.result));
    li.appendChild(btn);
    historyList.appendChild(li);
  });
}

function useHistoryResult(result) {
  state.tokens = NUMBER_RE.test(result) ? [result] : ["0"];
  state.justEvaluated = true;
  render();
}

/* ============================================================
 * 3. 输入行为
 * ============================================================ */

function lastToken() {
  return state.tokens[state.tokens.length - 1];
}

function isValueToken(token) {
  return (
    NUMBER_RE.test(token) ||
    CONSTANTS.includes(token) ||
    POSTFIX.includes(token) ||
    token === ")"
  );
}

function insert(value) {
  if (state.justEvaluated) {
    const keep = OPERATORS.includes(value) || POSTFIX.includes(value);
    if (!keep) state.tokens = [];
    state.justEvaluated = false;
  }

  const last = lastToken();

  // 数字与小数点
  if (/^[0-9]$/.test(value) || value === ".") {
    if (last && NUMBER_RE.test(last) && !/e/i.test(last)) {
      if (value === "." && last.includes(".")) return;
      state.tokens[state.tokens.length - 1] = last + value;
    } else if (value === ".") {
      state.tokens.push("0.");
    } else {
      state.tokens.push(value);
    }
    return;
  }

  // 运算符
  if (OPERATORS.includes(value)) {
    if (!last) {
      if (value === MINUS) state.tokens.push(value);
      return;
    }
    if (OPERATORS.includes(last)) {
      state.tokens[state.tokens.length - 1] = value;
      return;
    }
    if (last === "(") return;
    state.tokens.push(value);
    return;
  }

  if (value === "(") {
    state.tokens.push(value);
    return;
  }

  if (value === ")") {
    const open =
      state.tokens.filter((t) => t === "(").length -
      state.tokens.filter((t) => t === ")").length;
    if (open > 0 && !OPERATORS.includes(last) && last !== "(") state.tokens.push(value);
    return;
  }

  if (value === "%" || value === "²") {
    if (last && isValueToken(last)) state.tokens.push(value);
    return;
  }

  // 函数与常量
  state.tokens.push(value);
}

function negate() {
  const last = lastToken();
  if (!last) {
    state.tokens.push(MINUS);
    state.justEvaluated = false;
    return;
  }
  if (NUMBER_RE.test(last)) {
    state.tokens[state.tokens.length - 1] = last.startsWith(MINUS)
      ? last.slice(1)
      : MINUS + last;
    state.justEvaluated = false;
  }
}

function backspace() {
  const last = lastToken();
  if (!last) return;
  if (NUMBER_RE.test(last) && last.length > 1) {
    const next = last.slice(0, -1);
    if (next === MINUS || next === "") state.tokens.pop();
    else state.tokens[state.tokens.length - 1] = next;
  } else {
    state.tokens.pop();
  }
  state.justEvaluated = false;
}

function clearAll() {
  state.tokens = [];
  state.justEvaluated = false;
}

function equals() {
  if (state.tokens.length === 0) return;
  let result;
  try {
    result = formatNumber(evaluateTokens(state.tokens));
  } catch (err) {
    return;
  }
  if (result === "错误") return;

  state.history.unshift({
    expression: state.tokens.join("") + " =",
    result,
  });
  state.history = state.history.slice(0, 50);
  saveHistory();

  state.tokens = [result];
  state.justEvaluated = true;
  render();
  renderHistory();
}

/* ============================================================
 * 4. 事件绑定
 * ============================================================ */

keysEl.addEventListener("click", (event) => {
  const button = event.target.closest(".key");
  if (!button) return;

  const action = button.dataset.action;
  const value = button.dataset.value;

  if (action === "clear") clearAll();
  else if (action === "back") backspace();
  else if (action === "negate") negate();
  else if (action === "equals") equals();
  else if (value) insert(value);

  if (action !== "equals") render();
});

const KEYBOARD_MAP = {
  "*": "×",
  x: "×",
  "/": "÷",
  "-": MINUS,
  "+": "+",
  "^": "^",
  "%": "%",
  "(": "(",
  ")": ")",
  ".": ".",
};

document.addEventListener("keydown", (event) => {
  const { key } = event;

  // 焦点在功能按钮上时，交给按钮自身的默认行为
  if (
    event.target instanceof Element &&
    event.target.closest(".icon-btn, .text-btn, .history__item")
  ) {
    return;
  }

  if (key === "Enter" || key === "=") {
    event.preventDefault();
    flash(keysEl.querySelector('[data-action="equals"]'));
    equals();
    return;
  }
  if (key === "Backspace") {
    event.preventDefault();
    flash(keysEl.querySelector('[data-action="back"]'));
    backspace();
    render();
    return;
  }
  if (key === "Escape" || key === "Delete") {
    event.preventDefault();
    flash(keysEl.querySelector('[data-action="clear"]'));
    clearAll();
    render();
    return;
  }

  if (/^[0-9]$/.test(key)) {
    event.preventDefault();
    flash(keysEl.querySelector(`[data-value="${key}"]`));
    insert(key);
    render();
    return;
  }

  if (Object.prototype.hasOwnProperty.call(KEYBOARD_MAP, key)) {
    event.preventDefault();
    const value = KEYBOARD_MAP[key];
    flash(keysEl.querySelector(`[data-value="${value}"]`));
    insert(value);
    render();
  }
});

function flash(button) {
  if (!button) return;
  button.classList.remove("is-flash");
  void button.offsetWidth;
  button.classList.add("is-flash");
}

historyBtn.addEventListener("click", () => {
  const open = historyPanel.classList.toggle("is-open");
  historyBtn.classList.toggle("is-active", open);
  historyBtn.setAttribute("aria-expanded", String(open));
  if (open) renderHistory();
});

clearHistoryBtn.addEventListener("click", () => {
  state.history = [];
  saveHistory();
  renderHistory();
});

/* ---------- 主题 ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    /* 忽略隐私模式下的存储异常 */
  }
}

themeBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "light" ? "dark" : "light");
});

/* ---------- 历史记录持久化 ---------- */
function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
  } catch (err) {
    /* 忽略 */
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) state.history = parsed.slice(0, 50);
    }
  } catch (err) {
    state.history = [];
  }
}

/* ---------- 初始化 ---------- */
(function init() {
  let theme = "dark";
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) theme = saved;
    else if (window.matchMedia("(prefers-color-scheme: light)").matches) theme = "light";
  } catch (err) {
    /* 忽略 */
  }
  applyTheme(theme);

  loadHistory();
  renderHistory();
  render();
})();
