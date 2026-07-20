/**
 * 主题切换快捷键（⇧D）验证脚本
 *
 * 运行：npm run verify:theme-shortcut
 *
 * 覆盖：
 *  1. nextToggledMode 切换语义（light↔dark 对调、往返一致性）
 *  2. ⇧D 匹配矩阵（shiftOnly + event.code === "KeyD"）
 *  3. 与练习页按键体系互斥：不命中 9 个搜题 provider、不影响裸键答题
 */

import {
  noModifiers,
  parseAnswerKey,
  shiftOnly,
} from "../lib/practice-shortcuts";
import { matchQuestionSearchProvider } from "../lib/question-search";
import { nextToggledMode } from "../lib/theme";
import {
  THEME_SHORTCUT_CODE,
  THEME_SHORTCUT_LABEL,
} from "../components/theme-shortcut";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS  ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${message}`);
  }
}

function keyboardEvent(
  code: string,
  init: {
    key?: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    repeat?: boolean;
  } = {}
): KeyboardEvent {
  return {
    code,
    key: init.key ?? code.replace(/^Key/, "").toLowerCase(),
    shiftKey: init.shiftKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    repeat: init.repeat ?? false,
  } as unknown as KeyboardEvent;
}

/** 模拟 ThemeShortcut 组件内的匹配逻辑。 */
function isThemeShortcut(event: KeyboardEvent): boolean {
  return shiftOnly(event) && event.code === THEME_SHORTCUT_CODE;
}

console.log("== nextToggledMode 切换语义 ==");
assert(nextToggledMode("light") === "dark", "light → dark");
assert(nextToggledMode("dark") === "light", "dark → light");
assert(
  nextToggledMode(nextToggledMode("light")) === "light",
  "往返一致：light → dark → light"
);
assert(
  nextToggledMode(nextToggledMode("dark")) === "dark",
  "往返一致：dark → light → dark"
);

console.log("\n== ⇧D 匹配矩阵 ==");
assert(
  isThemeShortcut(keyboardEvent("KeyD", { shiftKey: true })),
  "Shift+KeyD 命中快捷键"
);
assert(
  !isThemeShortcut(keyboardEvent("KeyD")),
  "裸键 D 不命中（答题键 d 不受影响）"
);
assert(
  !isThemeShortcut(keyboardEvent("KeyD", { shiftKey: true, ctrlKey: true })),
  "Ctrl+Shift+D 不命中"
);
assert(
  !isThemeShortcut(keyboardEvent("KeyD", { shiftKey: true, metaKey: true })),
  "Meta+Shift+D 不命中"
);
assert(
  !isThemeShortcut(keyboardEvent("KeyD", { shiftKey: true, altKey: true })),
  "Alt+Shift+D 不命中"
);
assert(
  !isThemeShortcut(keyboardEvent("KeyT", { shiftKey: true })),
  "Shift+KeyT 不命中（仅 KeyD 有效）"
);

console.log("\n== 与练习页按键体系互斥 ==");
assert(
  matchQuestionSearchProvider(keyboardEvent("KeyD", { shiftKey: true })) ===
    undefined,
  "⇧D 不命中任何搜题 provider"
);
assert(
  parseAnswerKey("d") === "d",
  "裸键 d 仍是有效答题键（选项 D）"
);
assert(
  noModifiers(keyboardEvent("KeyD")),
  "裸键 D 通过 noModifiers（练习页答题路径不变）"
);
assert(
  !noModifiers(keyboardEvent("KeyD", { shiftKey: true })),
  "⇧D 不通过 noModifiers（不会误触发答题）"
);

console.log("\n== 常量约定 ==");
assert(THEME_SHORTCUT_CODE === "KeyD", "快捷键物理键位为 KeyD");
assert(THEME_SHORTCUT_LABEL === "⇧D", "展示标签为 ⇧D");

console.log("");
if (failures > 0) {
  console.error(`${failures} 项断言失败`);
  process.exit(1);
}
console.log("全部断言通过");
