/* ============================================================
 * 计算内核：把一串「记号」算成一个数
 * ============================================================
 * 【为什么要单独抽成一个文件】
 * 这部分代码和界面（按钮长什么样、屏幕怎么显示）毫无关系，
 * 它只干一件事：给一串记号，返回一个数字。
 *
 * 这种「只认数据、不碰界面」的模块叫「纯逻辑模块」，
 * 好处是：可以在任何地方复用（比如下面的口算游戏也要用它来验证答案），
 * 而且测试起来非常方便，不用管页面。
 *
 * 【对外提供的东西（export）】
 *   MINUS / OPERATORS / ...  各种记号规则表
 *   tokenize()        第一步：把字符串记号翻译成带类型的对象
 *   evaluateTokens()  第二步：递归下降求值
 *   formatNumber()    第三步：把数字变成好看的字符串
 * ============================================================ */

/* 【小知识】键盘上的 "-" 和数学符号 "−" 是两个不同字符（后者更长）。
   界面按钮上用的是数学减号，为了不在代码里到处粘贴这个特殊字符，
   我们定义一个常量 MINUS 来代表它，代码可读性更好，也不容易打错。
   另外：数字里的负号也用这个字符，例如负数 -5 存储成字符串 "−5"。
   因为负号是「贴在数字身上」的，所以它和作为运算符的减号不会混淆。 */
export const MINUS = "−"; // U+2212，同时作为“负号”（写在数字内部）和减号运算符

/* 二元运算符：需要「左边一个数 + 右边一个数」才能算，例如 3 + 4 */
export const OPERATORS = ["+", MINUS, "×", "÷", "^"];

/* 函数记号：注意末尾都带着左括号，例如 "sin(" 。
   因为它天然表示「函数开始了，参数在括号里」。 */
export const FUNCTIONS = ["sin(", "cos(", "tan(", "ln(", "log(", "√("];

/* 常量记号：有固定数值的符号 */
export const CONSTANTS = ["π", "e"];

/* 后缀运算符：写在数字「后面」就能改变它的运算，例如 50% 或 3² */
export const POSTFIX = ["%", "²"];

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
export const NUMBER_RE = /^−?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

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


/* ============================================================
 * 第一步：词法分析（tokenize）
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
export function tokenize(tokens) {
  return tokens.map((raw) => {
    /* 【为什么要写 Object.prototype.hasOwnProperty.call(FUNC_MAP, raw) 这么长？】
       它是在问：「FUNC_MAP 这个对象自己有 raw 这个属性吗？」
       为什么不直接写 FUNC_MAP[raw]？因为对象会继承一些内置属性，
       如果你写 FUNC_MAP["constructor"] 也能取到东西，会产生误判。
       用 hasOwnProperty 只查「自己定义的属性」，最严谨。 */
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
 * 第二步：求值（evaluateTokens）
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
export function evaluateTokens(rawTokens) {
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
     这个技巧叫「指针遍历」，配合下面三个小工具函数非常好用： */
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
 * 第三步：数字格式化（formatNumber）
 * ============================================================
 * 把计算出来的数字变成「好看、好读」的字符串，顺手解决 JS 的浮点误差问题。 */
/** 数字格式化：去掉浮点误差与多余的 0 */
export function formatNumber(value) {
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
    const text = value.toExponential(8).replace(/\.?0+e/, "e");
    // 把普通减号替换成好看的数学减号
    return text.replace("-", MINUS);
  }

  /* 常规情况：toFixed(10) 保留 10 位小数，
     它会把 0.30000000000000004 变成 "0.3000000000"，
     再用 parseFloat 转回数字（自动去掉末尾的 0），
     最后用 String() 转成字符串，就得到干净的 "0.3"。
     这是一行里套了三层函数调用，可以像剥洋葱一样从里往外读：
     value → toFixed(10) → parseFloat → String */
  const text = String(parseFloat(value.toFixed(10)));
  return text.replace("-", MINUS);
}


/* ============================================================
 * 安全求值：把「可能失败的计算」包起来
 * ============================================================
 * try { 正常执行的代码 } catch (错误变量) { 出错时执行这里 }
 * 好处是：调用处不用到处写 try/catch，只要检查返回的 ok 是不是 true。
 * 返回一个带 ok 标记的对象，是很常见的一种设计。 */
export function tryEvaluate(tokens) {
  try {
    return { ok: true, value: evaluateTokens(tokens) };
  } catch (err) {
    return { ok: false };
  }
}
