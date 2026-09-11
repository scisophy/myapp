# 项目长期记忆

## myapp —— 古典风网页计算器（含哈希与口算训练）

- 远程仓库：https://github.com/scisophy/myapp （public，分支 `main`）
- 技术栈：Vite 8 + 原生 ES 模块，**不使用** Vue/React 等框架；纯前端，无后端、无接口
- 目录约定：
  - `src/core/` 纯逻辑层，**禁止触碰 DOM**：`expression.js`（表达式求值）、`hash.js`（MD5/SHA）、`storage.js`（localStorage 封装）
  - `src/app/` 计算器与弹层界面：`calculator.js`、`hashPanel.js`、`keyboard.js`（优先级键盘路由：GAME 30 > MODAL 20 > CALCULATOR 10）
  - `src/game/` 口算训练：`generator.js`（出题）、`engine.js`（状态机与计分）、`panel.js`（界面）
  - `src/styles/` 按模块拆分的 CSS：`base.css`（变量与主题）、`calculator.css`、`modal.css`、`game.css`
- 主题机制：CSS 变量定义在 `:root` 与 `html[data-theme="dark"]`，JS 只改 `<html>` 的 `data-theme` 属性
- 常用命令：`npm run dev`（开发）/ `npm run build`（打包到 dist）/ `npm run preview`（预览产物）
- localStorage 键名：`calculator.history`、`calculator.theme`、`mathgame.best`
- 出题规则约定：答案必须是非负整数，除法必须整除

## 用户偏好

- 用户是编程初学者：写代码时要配**详尽的中文注释**，解释每段代码的作用、关键语法和思路，不要只给简洁实现。
- 沟通使用简体中文。
