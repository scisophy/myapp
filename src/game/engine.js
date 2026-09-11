/* ============================================================
 * 口算擂台：游戏状态机
 * ============================================================
 * 【状态机是什么】
 * 游戏任何时刻都处于「三种状态」之一，而且只会按固定路径切换：
 *
 *    idle（等待开局）
 *      │ start(关卡)
 *      ▼
 *    playing（进行中） ── 答错 3 次 / 时间耗尽 / 主动结束 ──▶ over（结算）
 *      ▲                                                        │
 *      └──────────────── backToIdle（再来一局）◀────────────────┘
 *
 * 把状态写清楚，界面上就不用再猜「现在该显示什么」——
 * 渲染函数只要看 state.status 就能决定显示哪块界面。
 *
 * 【设计原则：这个文件不碰 DOM】
 * 它只管数据和规则，改完数据后调用 onChange(state) 通知界面去画。
 * 好处是游戏规则可以脱离页面独立测试，界面换一套写法也不用动这里。
 * ============================================================ */

import { LEVELS, makeQuestion } from "./generator.js";
import { readJSON, writeJSON } from "../core/storage.js";

/* 最高分存到浏览器本地时用的「钥匙名」。
   存成一个对象：{ addSub20: 120, mulDiv9: 260, ... }，每个关卡各记各的 */
const BEST_KEY = "mathgame.best";

/* 答对一题在 3 秒内完成，额外奖励的分 */
const SPEED_BONUS = 5;
/* 连击加成上限：最多按 10 连击计算（防止分数爆炸） */
const COMBO_CAP = 10;
/* 跳过一次扣掉的秒数 */
const SKIP_PENALTY = 5;

/**
 * 创建游戏引擎
 * @param {{ onChange: (state) => void }} options
 *        onChange 是「数据变了，请界面重新画一遍」的回调
 */
export function createGameEngine({ onChange }) {
  /* 历史最佳：从本地读回来。它不是游戏过程中的临时数据，
     所以放在 state 外面单独维护，避免被重置逻辑清掉。 */
  const best = readJSON(BEST_KEY, {});
  const bestMap = best && typeof best === "object" ? best : {};

  /* ============================================================
   * 全部游戏数据都放在这一个对象里
   * ============================================================ */
  const state = {
    status: "idle",        // idle | playing | over

    level: null,           // 当前关卡（LEVELS 里的一项）
    question: null,        // 当前题目 { text, answer }

    score: 0,              // 总得分
    combo: 0,              // 当前连击数
    maxCombo: 0,           // 本局最高连击
    lives: 0,              // 剩余生命
    secondsLeft: 0,        // 剩余秒数

    correct: 0,            // 答对题数
    wrong: 0,              // 答错题数
    skipped: 0,            // 跳过题数

    /* 界面提示信息。type 决定提示的颜色：
       "ok" 绿色、"bad" 红色、"" 无 */
    feedback: "",
    feedbackType: "",

    best: 0,               // 本关的历史最佳分
    isNewBest: false,      // 本局是否破了记录
  };

  /* 本题开始的时间戳，用来算「答题用了多久」 */
  let questionStartAt = 0;

  /** 通知界面：数据变了，重新画一遍 */
  function notify() {
    onChange(state);
  }

  /* ============================================================
   * 开局
   * ============================================================ */
  function start(levelId) {
    /* find 会在数组里找出「第一个符合条件的元素」。
       如果没找到会返回 undefined，所以后面用 || LEVELS[0] 兜底 */
    const level = LEVELS.find((item) => item.id === levelId) || LEVELS[0];

    state.status = "playing";
    state.level = level;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.lives = level.lives;
    state.secondsLeft = level.seconds;
    state.correct = 0;
    state.wrong = 0;
    state.skipped = 0;
    state.feedback = "";
    state.feedbackType = "";
    state.isNewBest = false;
    state.best = Number(bestMap[level.id]) || 0;
    state.question = makeQuestion(level.id);
    questionStartAt = Date.now();

    notify();
  }

  /* ============================================================
   * 出下一题
   * ============================================================ */
  function nextQuestion() {
    state.question = makeQuestion(state.level.id);
    questionStartAt = Date.now();   // 重新计时，用于「3 秒内答对」的奖励
  }

  /* ============================================================
   * 提交一个答案
   * ============================================================ */
  function submit(rawAnswer) {
    if (state.status !== "playing") return;

    /* Number("") 会得到 0，那不是用户想表达的，所以先挡掉空输入 */
    const text = String(rawAnswer).trim();
    if (text === "") {
      state.feedback = "先写出答案再确定";
      state.feedbackType = "bad";
      notify();
      return;
    }

    const value = Number(text);

    // ---------------- 答对 ----------------
    if (value === state.question.answer) {
      const level = state.level;
      const base = level.stars * 10;                        // 基础分：关卡星级 × 10
      /* 连击加成：每连击 +2 分，但最多按 10 连击算。
         注意用的是「本题答对之前」的连击数，
         所以第一次答对没有加成，第二次 +2，第三次 +4…… */
      const comboBonus = Math.min(state.combo, COMBO_CAP) * 2;
      const usedMs = Date.now() - questionStartAt;
      const speedBonus = usedMs <= 3000 ? SPEED_BONUS : 0;  // 3 秒内作答的奖励
      const gained = base + comboBonus + speedBonus;

      state.score += gained;
      state.combo += 1;
      /* Math.max 取两个数里较大的那个，用来记录历史最高连击 */
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.correct += 1;

      /* 拼一句反馈，把加分明细也写出来，玩家能看懂分是怎么来的 */
      const parts = [`基础 ${base}`];
      if (comboBonus > 0) parts.push(`连击 +${comboBonus}`);
      if (speedBonus > 0) parts.push(`手速 +${speedBonus}`);
      state.feedback = `答对！+${gained} 分（${parts.join("，")}）`;
      state.feedbackType = "ok";

      nextQuestion();
      notify();
      return;
    }

    // ---------------- 答错 ----------------
    const correctAnswer = state.question.answer;
    state.wrong += 1;
    state.combo = 0;              // 连击清零
    state.lives -= 1;             // 扣一条命
    state.feedback = `答错了，正确答案是 ${correctAnswer}`;
    state.feedbackType = "bad";

    if (state.lives <= 0) {
      finish();                   // 生命用光，直接结算
      return;
    }

    /* 答错也要出下一题，否则玩家会卡在错题上。
       正确答案已经写在提示里了，玩家看得到。 */
    nextQuestion();
    notify();
  }

  /* ============================================================
   * 跳过一题：不算对也不算错，只是倒扣时间
   * ============================================================ */
  function skip() {
    if (state.status !== "playing") return;

    state.skipped += 1;
    state.combo = 0;
    state.secondsLeft = Math.max(0, state.secondsLeft - SKIP_PENALTY);
    state.feedback = `已跳过（−${SKIP_PENALTY} 秒），正确答案是 ${state.question.answer}`;
    state.feedbackType = "bad";

    if (state.secondsLeft <= 0) {
      finish();
      return;
    }

    nextQuestion();
    notify();
  }

  /* ============================================================
   * 每秒走一格：由界面上的定时器调用
   * ============================================================ */
  function tick() {
    if (state.status !== "playing") return;

    state.secondsLeft -= 1;
    if (state.secondsLeft <= 0) {
      state.secondsLeft = 0;
      finish();
      return;
    }
    notify();
  }

  /* ============================================================
   * 结算
   * ============================================================ */
  function finish() {
    if (state.status !== "playing") return;

    state.status = "over";
    state.combo = 0;

    const levelId = state.level.id;
    const oldBest = Number(bestMap[levelId]) || 0;

    if (state.score > oldBest) {
      bestMap[levelId] = state.score;
      writeJSON(BEST_KEY, bestMap);   // 刷新记录，写回本地存储
      state.isNewBest = true;
    }
    state.best = Number(bestMap[levelId]) || 0;

    notify();
  }

  /** 回到「选择关卡」界面 */
  function backToIdle() {
    state.status = "idle";
    state.feedback = "";
    state.feedbackType = "";
    notify();
  }

  /** 读某个关卡的历史最佳分（界面在展示关卡列表时要用） */
  function getBest(levelId) {
    return Number(bestMap[levelId]) || 0;
  }

  /* 只把「改数据的方法」暴露出去，外面不能直接乱改 state，
     这样游戏规则始终集中在上面这几个函数里，容易维护 */
  return { state, start, submit, skip, tick, finish, backToIdle, getBest };
}
