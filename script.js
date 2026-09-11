/* ============================================================
 * 计算器逻辑（JavaScript）
 * ============================================================
 *
 * 【这个文件是干什么的】
 * HTML 负责「摆好按钮」，CSS 负责「好看」，这个文件负责「能算」：
 *   1. 记住用户按了什么（数据）
 *   2. 把用户按出来的内容算成结果（计算）
 *   3. 把结果画到屏幕上（渲染）
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
 *   for / while        循环
 *   对象.属性          取对象里的某个值
 *   数组[下标]         取数组里的第几个（下标从 0 开始）
 *   // 后面是注释，// 开头或 /* 包起来的内容电脑不会执行
 * ============================================================ */


/* ============================================================
 * 0. 基础常量：把「游戏的规则」集中写在这里
 * ============================================================
 * 这些表定义了「什么样的输入是合法的」。
 * 把它们集中放在文件开头，好处是以后想加新功能（比如加一个 ! 阶乘），
 * 只要在这里登记一下，下面的逻辑大多能自动适配。
 * ============================================================ */

/* 【小知识】键盘上的 "-" 和数学符号 "−" 是两个不同字符（后者更长）。
   界面按钮上用的是数学减号，为了不在代码里到处粘贴这个特殊字符，
   我们定义一个常量 MINUS 来代表它，代码可读性更好，也不容易打错。
   另外：数字里的负号也用这个字符，例如负数 -5 存储成字符串 "−5"。
   因为负号是「贴在数字身上」的，所以它和作为运算符的减号不会混淆。 */
const MINUS = "−"; // U+2212，同时作为“负号”（写在数字内部）和减号运算符

/* 二元运算符：需要「左边一个数 + 右边一个数」才能算，例如 3 + 4 */
const OPERATORS = ["+", MINUS, "×", "÷", "^"];

/* 函数记号：注意末尾都带着左括号，例如 "sin(" 。
   因为它天然表示「函数开始了，参数在括号里」。 */
const FUNCTIONS = ["sin(", "cos(", "tan(", "ln(", "log(", "√("];

/* 常量记号：有固定数值的符号 */
const CONSTANTS = ["π", "e"];

/* 后缀运算符：写在数字「后面」就能改变它的运算，例如 50% 或 3² */
const POSTFIX = ["%", "²"];

/* 【正则表达式】用来判断「一个字符串是不是数字」。
   /.../ 是正则的字面量写法，^ 表示开头，$ 表示结尾。
   逐段拆开看：
     ^−?                    开头可以有一个负号（可有可无，? 表示 0 个或 1 个）
     ( \d+(\.\d*)?  |  \.\d+ )   
         ├ \d+(\.\d*)?  像 12、12.、12.5  → \d 是数字，+ 表示至少 1 个
         └ | .\d+       像 .5            → 竖线 | 表示「或者」
     (e[+-]?\d+)?           可选的科学计数法部分，像 e+21、e-5
     i                      末尾的 i 表示忽略大小写（E 和 e 都算）
   用途：判断用户输入是不是「一个完整数字」，以及校验历史记录里的结果能否复用 */
const NUMBER_RE = /^−?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

/* 【对象】用大括号 {} 表示，里面是一组「键: 值」。
   这里把按钮上的文字和真正的数学函数对应起来。
   Math.sin 是 JS 内置的三角函数，直接用就行，不用自己实现。
   log 是例外：JS 只提供 Math.log（自然对数）和 Math.log10，
   这里的 "log(" 表示常用对数（以 10 为底），所以用箭头函数包了一层。
   (x) => Math.log10(x) 读作「给我一个 x，我返回 Math.log10(x)」 */
const FUNC_MAP = {
  "sin(": Math.sin,
  "cos(": Math.cos,
  "tan(": Math.tan,
  "ln(": Math.log,
  "log(": (x) => Math.log10(x),
  "√(": Math.sqrt,
};

/* 符号 → 数值的对照表 */
const CONST_MAP = {
  "π": Math.PI,
  "e": Math.E,
};

/* 存到浏览器本地的「钥匙名」。
   localStorage 是浏览器提供的小仓库，你关机重开数据还在，
   存进去时需要起个名字，就是下面这两个字符串。 */
const STORAGE_KEY = "calculator.history";
const THEME_KEY = "calculator.theme";


/* ============================================================
 * 1. 全局状态 state
 * ============================================================
 * 【这是整个程序最重要的东西】
 * 它记录了「当前这一刻」计算器的全部情况：
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
  tokens: [],            // 空数组 []：还没有按任何键
  history: [],
  justEvaluated: false,
};


/* ============================================================
 * 2. 找到页面上要用到的元素（DOM 引用）
 * ============================================================
 * document.getElementById("xxx") 的意思是：
 * 「去 HTML 里找到 id 等于 xxx 的那个元素，交给我」。
 *
 * 为什么要在开头就找好？
 *   以后每次要用的时候直接拿变量名，不用反复查找，代码更清爽、速度也更快。
 *   这些元素在页面打开后就一直存在，不会消失，所以存一次就够。
 *
 * 注意：这里的变量名和 HTML 里的 id 是对应的，可以对照着 index.html 看。 */
const exprEl = document.getElementById("expr");                   // 显示屏第一行：算式
const resultEl = document.getElementById("result");               // 显示屏第二行：结果
const keysEl = document.getElementById("keys");                   // 整个按键区（用来做「事件委托」）
const historyPanel = document.getElementById("historyPanel");     // 历史面板整体
const historyList = document.getElementById("historyList");       // 历史记录列表（ul）
const historyEmpty = document.getElementById("historyEmpty");     // 「暂无记录」提示
const historyBtn = document.getElementById("historyBtn");         // 右上角历史按钮
const clearHistoryBtn = document.getElementById("clearHistoryBtn"); // 清空历史按钮
const themeBtn = document.getElementById("themeBtn");             // 主题切换按钮


/* ============================================================
 * 3. 计算第一步：词法分析（tokenize）
 * ============================================================
 * 目标：把界面上的「字符串记号」翻译成计算机能理解的结构。
 *
 * 举例：输入 ["π", "×", "2"]
 * 翻译成：
 *   [ {type:"const", value:3.1415...},
 *     {type:"op",    op:"×"},
 *     {type:"num",   value:2} ]
 *
 * 为什么要翻译？因为字符串 "π" 没法直接参与计算，
 * 得先换成数字 3.14159...，并告诉程序「它是什么类型的记号」。
 *
 * 【map 是什么】
 * 数组的 map 方法：对数组里每个元素执行一次你给的函数，
 * 把返回值收集成一个「新数组」。原数组不变。
 * 例如 [1,2,3].map(n => n*2) 得到 [2,4,6]。 */
function tokenize(tokens) {
  return tokens.map((raw) => {
    /* 【为什么要写 Object.prototype.hasOwnProperty.call(FUNC_MAP, raw) 这么长？】
       它是在问：「FUNC_MAP 这个对象自己有 raw 这个属性吗？」
       为什么不直接写 FUNC_MAP[raw]？因为对象会继承一些内置属性，
       如果你写 FUNC_MAP["constructor"] 也能取到东西，会产生误判。
       用 hasOwnProperty 只查「自己定义的属性」，最严谨。
       后面的 CONST_MAP、KEYBOARD_MAP 也是同样的道理。 */
    if (Object.prototype.hasOwnProperty.call(FUNC_MAP, raw)) {
      // 是函数记号。fn 存下对应的数学函数，等会儿求值时直接调用
      return { type: "func", fn: FUNC_MAP[raw] };
    }
    if (Object.prototype.hasOwnProperty.call(CONST_MAP, raw)) {
      // 是常量（π 或 e），把它的数值存起来
      return { type: "const", value: CONST_MAP[raw] };
    }
    // 左括号、右括号：各用一个类型标记，方便后面配对
    if (raw === "(") return { type: "lparen" };
    if (raw === ")") return { type: "rparen" };
    // 后缀运算（%、²）
    if (raw === "%" || raw === "²") return { type: "postfix", op: raw };
    // 四则运算与乘方
    if (OPERATORS.includes(raw)) return { type: "op", op: raw };
    // 数字：先用正则确认它是合法的数字写法，再转成真正的数值
    if (NUMBER_RE.test(raw)) {
      /* replace(MINUS, "-") 把数学减号换成普通减号，
         因为 parseFloat（把字符串转成数字的函数）只认普通减号。
         例如 "−5" → "-5" → -5 */
      return { type: "num", value: parseFloat(raw.replace(MINUS, "-")) };
    }
    /* 走到这里说明遇到了不认识的记号。
       主动抛出错误（throw），让调用方用 try/catch 接住，
       这比自己乱猜、算出错误结果要好得多。 */
    throw new Error("无法识别的记号：" + raw);
  });
}


/* ============================================================
 * 4. 计算第二步：求值（evaluateTokens）
 * ============================================================
 * 【为什么要这么麻烦？为什么不用 eval？】
 * eval 能把字符串当代码执行，一行就能算完，但它极其危险：
 * 如果字符串来自用户输入，用户可以构造出删除文件、盗取数据的代码。
 * 而且各家计算器的「×、÷、%」写法 eval 也看不懂。
 * 所以我们自己写一个「递归下降解析器」——这是编译器课程里的经典算法。
 *
 * 【核心难点：运算优先级】
 * 3 + 4 × 2 必须等于 11，而不是 14。怎么做到？
 * 办法是把「优先级」翻译成「函数的调用层次」：
 *
 *   parseExpression（最低优先级）只处理 + −
 *        └─ parseTerm 只处理 × ÷ 和隐式乘法
 *               └─ parseUnary 只处理正负号
 *                      └─ parsePower 只处理 ^（右结合）
 *                             └─ parsePostfix 只处理 % ²
 *                                    └─ parsePrimary 处理数字、括号、函数（最优先）
 *
 * 越是「先算」的运算，函数写得越靠里（被调用得越深）。
 * 这样 3+4×2 解析时，加号看到右边是「一个完整的乘法结果」，
 * 自然就得到 3 + 8 = 11。
 *
 * 也叫「递归下降」：每个函数都会调用比自己优先级更高的那个函数，
 * 遇到括号时又会回到最低优先级的 parseExpression，如此循环。
 * ============================================================ */
/** 把 tokens 解析成数值；括号未闭合时自动补齐 */
function evaluateTokens(rawTokens) {
  // 第一步：先做词法分析，拿到带类型的记号数组
  const tokens = tokenize(rawTokens);

  /* 第二步：自动补全右括号。
     用户输入 "sin(30" 忘了右括号时，我们宽容一点，自动当它是 "sin(30)"。
     做法：数一下左括号比右括号多几个，就补几个右括号到末尾。 */
  let depth = 0;                        // depth 记录「还没配对的左括号数量」
  for (const t of tokens) {
    /* for...of 是遍历数组的写法，每次循环 t 就是数组里的一个元素，
       比用下标 i 去取更直观 */
    if (t.type === "lparen") depth += 1;  // 遇到左括号，欠一个
    if (t.type === "rparen") depth -= 1;  // 遇到右括号，还一个
  }
  /* 循环 depth 次，每次往数组末尾追加一个右括号对象。
     push 是「往数组末尾添加一个元素」，pop 则是「删掉最后一个」 */
  for (let k = 0; k < depth; k += 1) tokens.push({ type: "rparen" });

  /* 第三步：准备一个「游标」来逐个读取记号。
     想像手指在记号列表上滑动，pos 就是手指当前的位置（下标）。
     这个技巧叫「指针遍历」，配合下面三个小工具函数非常好用：*/
  let pos = 0;
  const peek = () => tokens[pos];        // 看一眼当前记号，但手指不移动
  const eat = () => tokens[pos++];       // 取出当前记号，并把手指往后移一格
  const atEnd = () => pos >= tokens.length; // 是否已经读完了？

  /* ---------- 处理「加减」：优先级最低 ---------- */
  function parseExpression() {
    // 先拿到一个「项」（可能是一个完整的乘除运算的结果）
    let value = parseTerm();
    /* 只要后面还跟着 + 或 −，就继续算。
       while 循环的每一轮：吃掉运算符 → 解析右边的项 → 做加减。
       这样 1+2+3 会依次累加成 6 */
    while (!atEnd() && peek().type === "op" && (peek().op === "+" || peek().op === MINUS)) {
      const op = eat().op;               // 先吃掉运算符，一定要在解析右边之前吃
      const right = parseTerm();         // 再解析右边的数
      /* 三元运算符：条件 ? 成立时的值 : 不成立时的值。
         读作「如果 op 是加号，就用 value + right，否则用 value - right」 */
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  /* 判断「当前记号是不是一个操作数的开头」。
     用于实现隐式乘法：2π、3(4+1)、(1+2)(3+4) 这种省略乘号的写法。
     !!t 的作用是把值强制转换成布尔值（t 存在就是 true，不存在就是 false） */
  const startsOperand = (t) =>
    !!t && (t.type === "num" || t.type === "const" || t.type === "lparen" || t.type === "func");

  /* ---------- 处理「乘除」和隐式乘法 ---------- */
  function parseTerm() {
    let value = parseUnary();
    /* 这里用 for(;;)，是一个「无限循环」的写法（三个部分都留空）。
       因为退出条件写在里面（break），这样代码层次更清楚 */
    for (;;) {
      const t = peek();
      if (!t) break;                     // 没有记号了，结束
      if (t.type === "op" && (t.op === "×" || t.op === "÷")) {
        eat();
        const right = parseUnary();
        value = t.op === "×" ? value * right : value / right;
      } else if (startsOperand(t)) {
        // 隐式乘法：2π、3(4+1)、(1+2)(3+4)
        /* value *= parseUnary() 是缩写，等同于 value = value * parseUnary()。
           其他常见缩写：+= -= *= /= ，还有自增 ++ 自减 -- */
        value *= parseUnary();
      } else {
        // 既不是乘除，也不是操作数开头，说明这个「项」结束了
        break;
      }
    }
    return value;
  }

  /* ---------- 处理「正负号」：一元运算符 ---------- */
  function parseUnary() {
    const t = peek();
    if (t && t.type === "op" && (t.op === MINUS || t.op === "+")) {
      eat();
      /* 注意这里是「递归调用自己」：- - 5 也能正确处理。
         因为 -5 中的负号没有右边的数，所以必须在更靠里的层级处理 */
      const value = parseUnary();
      return t.op === MINUS ? -value : value;
    }
    // 没有正负号，交给下一层
    return parsePower();
  }

  /* ---------- 处理「乘方」^ ---------- */
  function parsePower() {
    const base = parsePostfix();         // 先取底数
    const t = peek();
    if (t && t.type === "op" && t.op === "^") {
      eat();
      /* 指数部分用 parseUnary 而不是 parsePower，
         这让 ^ 变成「右结合」：2^3^2 会算成 2^(3^2)=512，
         符合数学惯例。Math.pow(底数, 指数) 就是乘方 */
      return Math.pow(base, parseUnary());
    }
    return base;
  }

  /* ---------- 处理「后缀」% 和 ² ---------- */
  function parsePostfix() {
    let value = parsePrimary();
    for (;;) {
      const t = peek();
      if (t && t.type === "postfix") {
        eat();
        /* % 当百分号用（50% → 0.5），
           ² 是平方（x² → x×x） */
        value = t.op === "%" ? value / 100 : value * value;
      } else {
        break;
      }
    }
    return value;
  }

  /* ---------- 最底层：数字、括号、函数 ---------- */
  function parsePrimary() {
    const t = eat();                     // 这里用 eat 而不是 peek，因为「确定要消费掉它」
    if (!t) throw new Error("算式不完整"); // 例如输入 "1+"，解析右边时发现没有东西了

    // 情况一：数字或常量，它的值早就存好了，直接返回
    if (t.type === "num" || t.type === "const") return t.value;

    // 情况二：左括号 → 把括号里的内容交给最外层函数重新解析
    if (t.type === "lparen") {
      const value = parseExpression();   // 这里就是「递归下降」的关键一步
      const close = eat();               // 括号里的内容读完，应该紧跟一个右括号
      if (!close || close.type !== "rparen") throw new Error("缺少右括号");
      return value;
    }

    // 情况三：函数，例如 sin(30)
    if (t.type === "func") {
      const value = parseExpression();   // 先算出括号里的值（参数）
      const close = eat();
      if (!close || close.type !== "rparen") throw new Error("缺少右括号");
      /* 调用函数。t.fn 就是前面 tokenize 时存下的 Math.sin 之类的方法。
         把函数存在变量里再调用，这种写法叫「把函数当作值来传递」。 */
      const out = t.fn(value);
      /* NaN 是 "Not a Number"，表示数学上无意义的结果。
         例如 √(-1) 或 log(-5) 会得到 NaN，这种情况直接当错误处理 */
      if (Number.isNaN(out)) throw new Error("数学错误");
      return out;
    }

    // 其他情况都算输入不完整，例如算式以 ")" 开头
    throw new Error("算式不完整");
  }

  // 正式开算：从优先级最低的表达式开始
  const result = parseExpression();

  /* 算完了，但记号必须全部用光。
     如果还有剩，说明输入里有不合法的东西，例如 "1+2)" */
  if (!atEnd()) throw new Error("算式不完整");
  return result;
}


/* ============================================================
 * 5. 数字格式化（formatNumber）
 * ============================================================
 * 把计算出来的数字变成「好看、好读」的字符串，顺手解决 JS 的浮点误差问题。 */
/** 数字格式化：去掉浮点误差与多余的 0 */
function formatNumber(value) {
  /* 【重要知识点】JS 里 0.1 + 0.2 不等于 0.3，而是 0.30000000000000004！
     因为计算机用二进制存小数，有些小数存不精确（就像十进制写不出 1/3）。
     后面会用 toFixed(10) 只保留 10 位来解决这个问题。 */

  /* isFinite 判断「是不是有限数字」。
     1/0 得到 Infinity（无穷大），0/0 得到 NaN，这两种都无法显示，统一返回「错误」 */
  if (!Number.isFinite(value)) return "错误";
  if (Number.isNaN(value)) return "错误";
  // 特判 0，避免显示成 "0.00" 之类
  if (value === 0) return "0";

  const abs = Math.abs(value);           // 取绝对值（无论正负都变成正数）
  /* 数值太大或太小时，普通写法会变成一长串 0，很难看。
     所以改用科学计数法显示，例如 1.5e+21 */
  if (abs >= 1e15 || abs < 1e-9) {
    /* toExponential(8) 保留 8 位小数的科学计数法，例如 1.50000000e+21
       然后 replace(/\.?0+e/, "e") 把「尾随的 0 和小数点」删掉 → 1.5e+21 */
    let text = value.toExponential(8).replace(/\.?0+e/, "e");
    // 把普通减号替换成好看的数学减号
    return text.replace("-", MINUS);
  }

  /* 常规情况：toFixed(10) 保留 10 位小数，
     它会把 0.30000000000000004 变成 "0.3000000000"，
     再用 parseFloat 转回数字（自动去掉末尾的 0），
     最后用 String() 转成字符串，就得到干净的 "0.3"。
     这是一行里套了三层函数调用，可以像剥洋葱一样从里往外读：
     value → toFixed(10) → parseFloat → String */
  let text = String(parseFloat(value.toFixed(10)));
  return text.replace("-", MINUS);
}


/* ============================================================
 * 6. 渲染：把 state 里的数据「画」到屏幕上
 * ============================================================ */

/* 小工具：让横向滚动条自动滚到最右边。
   scrollLeft 是「已滚动的距离」，scrollWidth 是「内容总宽度」，
   两者相等就等于滚到了最右边。
   用户输入很长的算式时，这样能始终看到最新的部分 */
function scrollToEnd(el) {
  el.scrollLeft = el.scrollWidth;
}

/* 安全求值：把「可能失败的计算」包起来。
   try { 正常执行的代码 } catch (错误变量) { 出错时执行这里 }
   好处：不用在调用处到处写 try/catch，只需检查返回的 ok 是不是 true。
   返回对象里用 ok 来表示「成功了吗」，这是很常见的一种设计 */
function tryEvaluate(tokens) {
  try {
    return { ok: true, value: evaluateTokens(tokens) };
  } catch (err) {
    return { ok: false };
  }
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
    btn.innerHTML =
      '<small></small><strong></strong>';
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
 * 7. 输入行为：用户按不同键时发生什么
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
  /* slice(0, 50) 取前 50 条，实现「只保留最近 50 条」的限制，
     防止用久了数据越堆越多 */
  state.history = state.history.slice(0, 50);
  saveHistory();   // 写进浏览器本地存储

  /* 把结果本身变成一个「数字记号」，这样用户可以接着对它运算，
     例如算完 2+3= 直接按 ×4 得到 20 */
  state.tokens = [result];
  state.justEvaluated = true;
  render();
  renderHistory();
}


/* ============================================================
 * 8. 事件绑定：让按钮真的能响应点击
 * ============================================================
 * addEventListener("事件名", 处理函数) = 「当发生这件事时，执行这个函数」 */

/* 【事件委托】只给「按键区」这一个父元素绑定监听，
   而不是给 30 个按钮各绑一次。
   原理：点击事件会从被点的元素一路「冒泡」到父元素，
   所以在父元素上也能收到，再用 event.target 反查点到了谁。

   好处：① 代码只写一遍 ② 以后动态新增的按钮也能自动生效，不用重新绑定 */
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

/* 监听整个页面的键盘按下事件 */
document.addEventListener("keydown", (event) => {
  /* 解构赋值：从 event 对象里把 key 属性单独取出来存成变量。
     等价于 const key = event.key; 只是写法更短 */
  const { key } = event;

  // 焦点在功能按钮上时，交给按钮自身的默认行为
  /* 例如用户用 Tab 键跳到「历史记录」按钮上按回车，
     应该执行「打开面板」，而不是被我们拦截去当做等号 */
  if (
    event.target instanceof Element &&
    event.target.closest(".icon-btn, .text-btn, .history__item")
  ) {
    return;
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

  // 数字键 0-9
  if (/^[0-9]$/.test(key)) {
    event.preventDefault();
    /* 模板字符串：用反引号 ` 包起来的字符串，里面可以用 ${表达式} 插入变量。
       这里动态拼出选择器，例如按键 "7" 时得到 [data-value="7"] */
    flash(keysEl.querySelector(`[data-value="${key}"]`));
    insert(key);
    render();
    return;
  }

  // 最后查表处理 + - * / 等符号
  if (Object.prototype.hasOwnProperty.call(KEYBOARD_MAP, key)) {
    event.preventDefault();
    const value = KEYBOARD_MAP[key];
    flash(keysEl.querySelector(`[data-value="${value}"]`));
    insert(value);
    render();
  }
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
  saveHistory();     // 本地存储也要一起清掉，否则刷新会「复活」
  renderHistory();
});

/* ---------------- 主题切换 ---------------- */

/* 应用主题：给 <html> 标签设置 data-theme 属性。
   CSS 里 html[data-theme="dark"] 那一段就是靠这个属性生效的 */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    /* 记住用户的选择，下次打开还是这个主题。
       必须转成字符串再存，localStorage 只能存字符串 */
    localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    /* 浏览器的「无痕/隐私模式」可能会禁止写入本地存储，
       这时会报错。我们选择忽略它，功能照常用，只是记不住偏好 */
  }
}

themeBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  // 在当前主题的反面之间来回切换
  applyTheme(current === "light" ? "dark" : "light");
});

/* ---------------- 历史记录持久化（存进浏览器本地） ---------------- */

/* 保存历史到 localStorage */
function saveHistory() {
  try {
    /* JSON.stringify 把数组/对象转成字符串，因为 localStorage 只能存字符串。
       例如 [{a:1}] 会变成 '[{"a":1}]' */
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
  } catch (err) {
    /* 忽略（例如存储空间已满或隐私模式限制） */
  }
}

/* 从 localStorage 读回历史 */
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);   // 读出来是个字符串
    if (raw) {
      /* JSON.parse 是上面 stringify 的反操作，把字符串还原成数组。
         万一存储的内容被改坏了导致解析失败，会跳到下面的 catch */
      const parsed = JSON.parse(raw);
      // 再确认一下确实是数组才使用，防止脏数据让程序崩溃
      if (Array.isArray(parsed)) state.history = parsed.slice(0, 50);
    }
  } catch (err) {
    // 数据坏了就当没有历史记录
    state.history = [];
  }
}

/* ---------------- 初始化：程序启动时跑一次 ---------------- */

/* 这是「立即执行函数表达式（IIFE）」：
   (function 名字() { ... })()  —— 定义完立刻调用，只执行一次。
   好处是里面的变量不会污染外面的全局范围。
   网页加载完会按顺序把所有代码读一遍，读到这个位置它就跑起来了。 */
(function init() {
  // 默认使用日间羊皮纸主题，更贴合古典风格
  let theme = "light";
  try {
    const saved = localStorage.getItem(THEME_KEY);
    /* 如果用户之前选过主题，就尊重他的选择。
       注意：没有存储值时 getItem 返回的是 null，if 判断时会当作「假」 */
    if (saved) theme = saved;
  } catch (err) {
    /* 忽略 */
  }
  applyTheme(theme);   // 应用主题（同时会把它写回存储）

  loadHistory();       // 读回上次的历史记录
  renderHistory();     // 画到面板上
  render();            // 画出初始的显示屏（显示 0）
})();
