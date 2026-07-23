import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_AUTO_ADVANCE_DELAY_MS,
  autoAdvanceDelayFromValue,
  autoAdvanceDelayToValue,
  autoAdvanceStorageKey,
  formatAutoAdvanceDelay,
  isAutoAdvanceDelay,
  parseAutoAdvanceDelay,
} from "../lib/auto-advance";
import {
  getPreferences,
  migrateSession,
  savePreferences,
} from "../lib/kv";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS  ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${message}`);
  }
}

async function main(): Promise<void> {
  console.log("== 自動跳轉偏好值 ==");
  assert(DEFAULT_AUTO_ADVANCE_DELAY_MS === 20000, "預設值為 20 秒");
  for (const value of [1000, 20000, null] as const) {
    assert(isAutoAdvanceDelay(value), `${String(value)} 是允許值`);
    const serialized = autoAdvanceDelayToValue(value);
    assert(autoAdvanceDelayFromValue(serialized) === value, `${String(value)} 可往返轉換`);
  }
  assert(!isAutoAdvanceDelay(0), "0 不是允許值");
  assert(!isAutoAdvanceDelay(1200), "舊的 1.2 秒不是允許值");
  assert(!isAutoAdvanceDelay(3000), "舊的 3 秒不是允許值");
  assert(!isAutoAdvanceDelay(5000), "舊的 5 秒不是允許值");
  assert(!isAutoAdvanceDelay(10000), "舊的 10 秒不是允許值");
  assert(parseAutoAdvanceDelay("20000") === 20000, "非法型別回退到 20 秒");
  assert(parseAutoAdvanceDelay(3000) === 20000, "舊的 3 秒轉換為 20 秒");
  assert(parseAutoAdvanceDelay(5000) === 20000, "舊的 5 秒轉換為 20 秒");
  assert(parseAutoAdvanceDelay(10000) === 20000, "舊的 10 秒轉換為 20 秒");
  assert(autoAdvanceDelayFromValue("1200") === undefined, "拒絕未列出的 UI 值");
  assert(autoAdvanceDelayFromValue("3000") === undefined, "UI 不再接受舊的 3 秒值");
  assert(autoAdvanceDelayFromValue("5000") === undefined, "UI 不再接受舊的 5 秒值");
  assert(autoAdvanceDelayFromValue("10000") === undefined, "UI 不再接受舊的 10 秒值");
  assert(formatAutoAdvanceDelay(null) === "不自動跳轉", "null 顯示為不自動跳轉");
  assert(formatAutoAdvanceDelay(1000) === "1 秒後跳轉", "1 秒顯示完整跳轉文案");
  assert(formatAutoAdvanceDelay(20000) === "20 秒後跳轉", "20 秒顯示完整跳轉文案");
  assert(
    autoAdvanceStorageKey("session-a") !== autoAdvanceStorageKey("session-b"),
    "本地儲存鍵按識別碼隔離",
  );

  const menuSource = readFileSync(
    path.join(process.cwd(), "components", "AutoAdvanceMenu.tsx"),
    "utf8",
  );
  const radioGroupStart = menuSource.indexOf("<DropdownMenuRadioGroup");
  const radioGroupEnd = menuSource.indexOf("</DropdownMenuRadioGroup>");
  const labelPosition = menuSource.indexOf("<DropdownMenuLabel>");
  assert(
    radioGroupStart >= 0 &&
      radioGroupEnd > radioGroupStart &&
      labelPosition > radioGroupStart &&
      labelPosition < radioGroupEnd,
    "下拉選單標籤位於 Base UI 單選群組內",
  );
  const radioItemStart = menuSource.indexOf("<DropdownMenuRadioItem");
  const radioItemTagEnd = menuSource.indexOf(">", radioItemStart);
  assert(
    radioItemStart >= 0 &&
      radioItemTagEnd > radioItemStart &&
      menuSource.slice(radioItemStart, radioItemTagEnd).includes("closeOnClick"),
    "選擇自動跳轉選項後會關閉下拉選單",
  );

  const sessionSource = readFileSync(
    path.join(process.cwd(), "lib", "session.ts"),
    "utf8",
  );
  const sessionMutators = sessionSource.slice(
    sessionSource.indexOf("export function setCustomSessionId"),
    sessionSource.indexOf("export const SESSION_CHANGE_EVENT"),
  );
  assert(
    !sessionMutators.includes("emitSessionChange("),
    "本地識別碼寫入不會在 Cookie 重建前發布切換事件",
  );

  const settingsSource = readFileSync(
    path.join(process.cwd(), "app", "settings", "page.tsx"),
    "utf8",
  );
  const saveSessionPosition = settingsSource.indexOf("setCustomSessionId(inputId)");
  const saveCookiePosition = settingsSource.indexOf("await reestablishSession()", saveSessionPosition);
  const saveEventPosition = settingsSource.indexOf("emitSessionChange(", saveCookiePosition);
  assert(
    saveSessionPosition >= 0 &&
      saveCookiePosition > saveSessionPosition &&
      saveEventPosition > saveCookiePosition,
    "自訂識別碼切換事件在簽名 Cookie 重建後發布",
  );

  const preferencesApiSource = readFileSync(
    path.join(process.cwd(), "app", "api", "preferences", "route.ts"),
    "utf8",
  );
  assert(
    preferencesApiSource.includes("sessionId: session.sessionId"),
    "偏好 API 回應包含已驗證的會話識別碼",
  );

  const providerSource = readFileSync(
    path.join(process.cwd(), "components", "auto-advance-provider.tsx"),
    "utf8",
  );
  assert(
    providerSource.includes("AUTO_ADVANCE_PENDING_PREFIX") &&
      (providerSource.includes("navigator?.locks") ||
        providerSource.includes("locks?.request")),
    "偏好同步保留待同步值並跨分頁串行寫入",
  );
  assert(
    providerSource.includes("syncError") &&
      providerSource.includes("sessionId !== sessionId"),
    "偏好同步會顯示失敗狀態並核對服務端會話身份",
  );

  console.log("\n== 儲存與遷移 ==");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const source = `verify-auto-source-${suffix}`;
  const destination = `verify-auto-destination-${suffix}`;
  const destinationWinsSource = `verify-auto-source-wins-${suffix}`;
  const destinationWinsTarget = `verify-auto-target-wins-${suffix}`;

  await savePreferences(source, {
    autoAdvanceDelayMs: null,
    updatedAt: new Date().toISOString(),
  });
  assert((await getPreferences(source))?.autoAdvanceDelayMs === null, "顯式關閉可持久化");
  await migrateSession(source, destination);
  assert((await getPreferences(source)) === null, "遷移後移除來源偏好");
  assert((await getPreferences(destination))?.autoAdvanceDelayMs === null, "遷移保留顯式關閉");

  await savePreferences(destinationWinsSource, {
    autoAdvanceDelayMs: 1000,
    updatedAt: new Date().toISOString(),
  });
  await savePreferences(destinationWinsTarget, {
    autoAdvanceDelayMs: 20000,
    updatedAt: new Date().toISOString(),
  });
  await migrateSession(destinationWinsSource, destinationWinsTarget);
  assert(
    (await getPreferences(destinationWinsTarget))?.autoAdvanceDelayMs === 20000,
    "目標已有偏好時保留目標值",
  );
  assert((await getPreferences(destinationWinsSource)) === null, "衝突遷移仍移除來源偏好");

  console.log("");
  if (failures > 0) {
    console.error(`${failures} 項斷言失敗`);
    process.exit(1);
  }
  console.log("全部斷言通過");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
