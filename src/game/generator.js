/* ============================================================
 * 口算出题引擎
 * ============================================================
 * 【这个文件干什么】
 * 随机「摇」出一道合适的口算题，交给游戏界面显示。
 * 它是纯逻辑，不碰任何界面元素，所以可以单独拿来测试。
 *
 * 【出题的三条铁律】
 *   1. 答案必须是「非负整数」——小学生还没学负数和小数
 *   2. 除法必须「除得尽」——先想好除数与商，再相乘得到被乘数，
 *      这样永远不会摇出 7 ÷ 2 这种题（下面有详细说明）
 *   3. 结果不能太离谱——每个关卡都限定了数字范围
 *
 * 【四个关卡】
 *   20 以内加减  → 热身，练基本加减法
 *   九九乘除      → 乘法口诀表范围内，练乘除
 *   四则混合      → 带括号和优先级，先乘除后加减
 *   两位数挑战    → 进位加减与两位数乘一位数，心算进阶
 * ============================================================ */

/* 【注意减号】这里用的是数学减号 "−"（U+2212），不是键盘上的 "-"。
   和计算器显示风格保持一致，看起来更修长。
   乘号 "×"、除号 "÷" 同理。 */
const MINUS = "−";

/* ============================================================
 * 1. 关卡配置表
 * ============================================================
 * 把这些参数集中写在一张表里，好处是：
 *   加一个新关卡 = 在数组里加一项 + 在下面 TEMPLATES 里加一组出题函数
 *   界面会自动多出一张关卡卡片（见 panel.js），不用改 HTML。
 * ============================================================ */
export const LEVELS = [
  {
    id: "addSub20",
    name: "20 以内加减",
    stars: 1,          // 难度星级：决定每答对一题的基础分（star × 10）
    seconds: 60,       // 本局总时长（秒）
    lives: 3,          // 生命值：答错扣一条，扣完结束
    desc: "个位数与 20 以内的加减，先把基本口算练熟",
  },
  {
    id: "mulDiv9",
    name: "九九乘除",
    stars: 2,
    seconds: 60,
    lives: 3,
    desc: "乘法口诀表范围内的乘除法，除法一定能整除",
  },
  {
    id: "mixed",
    name: "四则混合",
    stars: 3,
    seconds: 90,
    lives: 3,
    desc: "带括号与优先级的混合运算，先乘除后加减",
  },
  {
    id: "twoDigit",
    name: "两位数挑战",
    stars: 4,
    seconds: 90,
    lives: 3,
    desc: "两位数加减与两位数乘一位数，心算进阶训练",
  },
];


/* ============================================================
 * 2. 两个随机小工具
 * ============================================================ */

/** 返回 [min, max] 闭区间内的一个随机整数（两端都能取到） */
function randInt(min, max) {
  /* Math.random() 得到 [0, 1) 之间的小数（能取到 0，取不到 1）。
     × (max - min + 1) 之后向下取整，再加上 min，
     就能均匀地落在 min..max 上。
     举例：randInt(2, 5) → 可能得到 2、3、4、5 */
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 从数组里随便挑一个元素 */
function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}


/* ============================================================
 * 3. 各关卡的「出题模板」
 * ============================================================
 * 每个模板是一个函数，返回 { text, answer }：
 *     text   题面，例如 "13 − 5"（注意是字符串，用来显示）
 *     answer 正确答案，是数字（用来判定对错）
 *
 * 如果某次随机出来的题不合适（答案不合法、数字太大……），
 * 模板就返回 null，让外层「重新摇一次」。
 * 这种「先随便摇，摇到合适的为止」的思路，比写一堆 if 去精确构造要简单得多，
 * 而且更容易看懂。 */
const TEMPLATES = {
  /* ---------------- 关卡 1：20 以内加减 ---------------- */
  addSub20: [
    /** a + b，且和不超过 20 */
    () => {
      const a = randInt(2, 15);
      /* 关键：b 的上限是 20 - a，这样 a + b 一定 ≤ 20 */
      const b = randInt(2, 20 - a);
      return { text: `${a} + ${b}`, answer: a + b };
    },
    /** a − b，且结果不为负（所以 b 必须小于 a） */
    () => {
      const a = randInt(6, 20);
      const b = randInt(1, a - 1);   // 上限是 a-1，保证 a-b ≥ 1
      return { text: `${a} ${MINUS} ${b}`, answer: a - b };
    },
    /** 连减：a − b − c，中间结果和最终结果都不为负 */
    () => {
      const a = randInt(10, 20);
      const b = randInt(1, a - 2);
      const c = randInt(1, a - b);   // 保证 a - b - c ≥ 0
      return { text: `${a} ${MINUS} ${b} ${MINUS} ${c}`, answer: a - b - c };
    },
    /** 加减混合：a + b − c */
    () => {
      const a = randInt(3, 10);
      const b = randInt(2, 20 - a);
      const c = randInt(1, a + b - 1);
      return { text: `${a} + ${b} ${MINUS} ${c}`, answer: a + b - c };
    },
  ],

  /* ---------------- 关卡 2：九九乘除 ---------------- */
  mulDiv9: [
    /** 乘法口诀：两个 2~9 的数相乘 */
    () => {
      const a = randInt(2, 9);
      const b = randInt(2, 9);
      return { text: `${a} × ${b}`, answer: a * b };
    },
    /** 除法：一定能整除。
        做法是「反着来」——先定除数和商，再相乘得到被除数。
        比如先想好 8 和 6，就有 48 ÷ 8 = 6。
        这样构造出来的题，答案永远是整数，绝不会出现 7 ÷ 2。 */
    () => {
      const divisor = randInt(2, 9);    // 除数
      const quotient = randInt(2, 9);   // 商
      const dividend = divisor * quotient;  // 被除数
      return { text: `${dividend} ÷ ${divisor}`, answer: quotient };
    },
    /** 乘除混合：a × b ÷ c，同样保证整除 */
    () => {
      const a = randInt(2, 9);
      const b = randInt(2, 9);
      const c = randInt(2, 9);
      const total = a * b;              // 先算乘
      if (total % c !== 0) return null; // 除不尽就作废，重新摇
      return { text: `${a} × ${b} ÷ ${c}`, answer: total / c };
    },
    /** 填空式乘加：a × b + c，练「两步心算」 */
    () => {
      const a = randInt(2, 9);
      const b = randInt(2, 9);
      const c = randInt(2, 20);
      return { text: `${a} × ${b} + ${c}`, answer: a * b + c };
    },
  ],

  /* ---------------- 关卡 3：四则混合 ---------------- */
  mixed: [
    /** a + b × c —— 考察「先乘后加」，很多人会算错成 (a+b)×c */
    () => {
      const a = randInt(3, 20);
      const b = randInt(2, 9);
      const c = randInt(2, 9);
      return { text: `${a} + ${b} × ${c}`, answer: a + b * c };
    },
    /** a × b − c —— 保证结果不为负，所以 c 不能超过 a×b */
    () => {
      const a = randInt(3, 9);
      const b = randInt(3, 9);
      const product = a * b;
      const c = randInt(2, product - 1);
      return { text: `${a} × ${b} ${MINUS} ${c}`, answer: product - c };
    },
    /** (a + b) × c —— 有括号就先算括号，和上一题正好形成对比 */
    () => {
      const a = randInt(2, 12);
      const b = randInt(2, 12);
      const c = randInt(2, 6);
      return { text: `(${a} + ${b}) × ${c}`, answer: (a + b) * c };
    },
    /** a ÷ b + c —— 除法先反着构造，保证整除 */
    () => {
      const b = randInt(2, 9);
      const quotient = randInt(2, 9);
      const a = b * quotient;
      const c = randInt(2, 20);
      return { text: `${a} ÷ ${b} + ${c}`, answer: quotient + c };
    },
    /** a × b + c × d —— 两个乘法分别算完再相加 */
    () => {
      const a = randInt(2, 9);
      const b = randInt(2, 9);
      const c = randInt(2, 9);
      const d = randInt(2, 9);
      return { text: `${a} × ${b} + ${c} × ${d}`, answer: a * b + c * d };
    },
  ],

  /* ---------------- 关卡 4：两位数挑战 ---------------- */
  twoDigit: [
    /** 两位数 + 两位数（会有进位），和控制在 99 以内 */
    () => {
      const a = randInt(11, 79);
      /* b 的上限是 99 - a，这样两数之和不会超过 99，
         题目难度稳定在「两位数 + 两位数得两位数」。
         注意 randInt 要求 min ≤ max，a 最大 79 时区间是 (11, 20)，依然合法 */
      const b = randInt(11, 99 - a);
      return { text: `${a} + ${b}`, answer: a + b };
    },
    /** 两位数 − 两位数，保证不为负 */
    () => {
      const a = randInt(30, 99);
      const b = randInt(11, a - 1);
      return { text: `${a} ${MINUS} ${b}`, answer: a - b };
    },
    /** 两位数 × 一位数 */
    () => {
      const a = randInt(11, 49);
      const b = randInt(3, 9);
      return { text: `${a} × ${b}`, answer: a * b };
    },
    /** 两位数 ÷ 一位数（整除） */
    () => {
      const divisor = randInt(3, 9);
      const quotient = randInt(3, 12);
      const dividend = divisor * quotient;
      return { text: `${dividend} ÷ ${divisor}`, answer: quotient };
    },
    /** 两位数 × 一位数 − 两位数，两步心算 */
    () => {
      const a = randInt(11, 29);
      const b = randInt(3, 6);
      const product = a * b;
      const c = randInt(10, product - 1);
      return { text: `${a} × ${b} ${MINUS} ${c}`, answer: product - c };
    },
  ],
};


/* ============================================================
 * 4. 对外接口：摇出一道题
 * ============================================================ */

/* 记住上一道题的题面，避免连续两次出到一模一样的题（体验会变差） */
let lastText = "";

/**
 * 摇出一道指定关卡的题目
 * @param {string} levelId 关卡 id，例如 "mulDiv9"
 * @returns {{text: string, answer: number}}
 */
export function makeQuestion(levelId) {
  const templates = TEMPLATES[levelId] || TEMPLATES.addSub20;

  /* 最多尝试 30 次。为什么要循环？
     因为模板可能返回 null（这道题不合适），或者摇出的题面和上一题重复。
     重摇的代价极小，所以用这种简单粗暴但可靠的办法。 */
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const question = pick(templates)();

    // 模板主动放弃了这一道
    if (!question) continue;

    /* 兜底校验：答案必须是「非负整数」。
       只要有一点不符合，就重新摇（宁可多摇几次，也不能出坏题） */
    const bad =
      typeof question.answer !== "number" ||
      !Number.isInteger(question.answer) ||
      question.answer < 0;
    if (bad) continue;

    // 和上一题重复，重摇
    if (question.text === lastText) continue;

    lastText = question.text;
    return question;
  }

  /* 万一运气差到 30 次都没成功（概率极低），
     返回一道绝对正确的保底题，保证游戏不会卡死。 */
  lastText = "2 + 3";
  return { text: "2 + 3", answer: 5 };
}
