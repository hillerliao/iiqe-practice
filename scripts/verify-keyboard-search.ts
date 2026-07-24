import assert from "node:assert/strict";
import {
  QUESTION_SEARCH_PROVIDERS,
  buildQuestionSearchUrl,
  matchQuestionSearchProvider,
  type QuestionSearchProviderId,
  type ShiftKeyboardLike,
} from "../lib/question-search";
import {
  ENTER_ACTIVATABLE_TARGET_SELECTOR,
  INTERACTIVE_TARGET_SELECTOR,
  getAnswerShortcutLabel,
  isEnterActivatableTargetDescriptor,
  isInteractiveTargetDescriptor,
  noModifiers,
  parseAnswerKey,
  shouldHandleKeyRepeat,
} from "../lib/practice-shortcuts";

function keyboardEvent(
  code: string,
  overrides: Partial<ShiftKeyboardLike> = {},
): ShiftKeyboardLike {
  return {
    code,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...overrides,
  };
}

assert.equal(QUESTION_SEARCH_PROVIDERS.length, 9);
for (const provider of QUESTION_SEARCH_PROVIDERS) {
  const shiftOnlyEvent = keyboardEvent(provider.shortcutKey, { shiftKey: true });
  assert.equal(
    matchQuestionSearchProvider(shiftOnlyEvent)?.id,
    provider.id,
    `${provider.id} should match its Shift-only shortcut`,
  );

  const rejectedEvents = [
    keyboardEvent(provider.shortcutKey),
    keyboardEvent(provider.shortcutKey, { shiftKey: true, ctrlKey: true }),
    keyboardEvent(provider.shortcutKey, { shiftKey: true, metaKey: true }),
    keyboardEvent(provider.shortcutKey, { shiftKey: true, altKey: true }),
  ];
  for (const event of rejectedEvents) {
    assert.equal(
      matchQuestionSearchProvider(event),
      undefined,
      `${provider.id} should reject missing or mixed modifiers`,
    );
  }
}

for (const [code, providerId] of [
  ["KeyF", "felo"],
  ["KeyX", "xiaohongshu"],
] as const) {
  const plainEvent = keyboardEvent(code);
  const shiftedEvent = keyboardEvent(code, { shiftKey: true });

  assert.equal(noModifiers(plainEvent), true, `${code} should remain a plain action`);
  assert.equal(matchQuestionSearchProvider(plainEvent), undefined);
  assert.equal(noModifiers(shiftedEvent), false);
  assert.equal(matchQuestionSearchProvider(shiftedEvent)?.id, providerId);
}

const reportEvent = keyboardEvent("KeyR");
assert.equal(noModifiers(reportEvent), true, "KeyR should remain a plain report action");
assert.equal(matchQuestionSearchProvider(reportEvent), undefined);
assert.equal(
  matchQuestionSearchProvider(keyboardEvent("KeyR", { shiftKey: true })),
  undefined,
  "Shift+R should not collide with a search provider",
);
for (const modifiers of [
  { shiftKey: true },
  { ctrlKey: true },
  { metaKey: true },
  { altKey: true },
]) {
  assert.equal(
    noModifiers(keyboardEvent("KeyR", modifiers)),
    false,
    "Modified KeyR should not trigger the plain report action",
  );
}

const handbookEvent = keyboardEvent("KeyH");
assert.equal(noModifiers(handbookEvent), true, "KeyH should remain a plain handbook action");
assert.equal(matchQuestionSearchProvider(handbookEvent), undefined);
assert.equal(
  matchQuestionSearchProvider(keyboardEvent("KeyH", { shiftKey: true })),
  undefined,
  "Shift+H should not collide with a search provider",
);

for (const [key, expected, shortcutLabel] of [
  ["1", "a", "A / 1"],
  ["2", "b", "B / 2"],
  ["3", "c", "C / 3"],
  ["4", "d", "D / 4"],
  ["A", "a", "A / 1"],
  ["B", "b", "B / 2"],
  ["C", "c", "C / 3"],
  ["D", "d", "D / 4"],
] as const) {
  assert.equal(parseAnswerKey(key), expected, `${key} should select answer ${expected}`);
  assert.equal(
    getAnswerShortcutLabel(expected),
    shortcutLabel,
    `${expected} should expose its exact shortcut label`,
  );
}

assert.equal(shouldHandleKeyRepeat({ repeat: false }), true);
assert.equal(shouldHandleKeyRepeat({ repeat: true }), false);

for (const tagName of ["input", "textarea", "select"]) {
  assert.equal(
    isInteractiveTargetDescriptor({ tagName }),
    true,
    `<${tagName}> should be interactive by tag`,
  );
}
for (const tagName of ["button", "a"]) {
  assert.equal(
    isInteractiveTargetDescriptor({ tagName }),
    false,
    `<${tagName}> should not keep global shortcuts disabled after click`,
  );
}
assert.equal(
  isInteractiveTargetDescriptor({ isContentEditable: true }),
  true,
  "contenteditable should be interactive by descriptor",
);

for (const targetKind of [
  "textbox",
  "combobox",
  "listbox",
  "menu",
  "dialog",
]) {
  let receivedSelector: string | undefined;
  const target = {
    closest(selector: string): unknown {
      receivedSelector = selector;
      return { targetKind };
    },
  };
  assert.equal(
    isInteractiveTargetDescriptor(target),
    true,
    `${targetKind} should be interactive through closest()`,
  );
  assert.equal(receivedSelector, INTERACTIVE_TARGET_SELECTOR);
}

assert.equal(
  isEnterActivatableTargetDescriptor({ tagName: "div" }),
  false,
  "plain content should allow the global Enter shortcut",
);
for (const targetKind of ["button", "link"] as const) {
  let receivedSelector: string | undefined;
  const target = {
    closest(selector: string): unknown {
      receivedSelector = selector;
      return { targetKind };
    },
  };
  assert.equal(
    isEnterActivatableTargetDescriptor(target),
    true,
    `${targetKind} should keep its native Enter activation`,
  );
  assert.equal(receivedSelector, ENTER_ACTIVATABLE_TARGET_SELECTOR);
}

const query = "中文 & ? = # 空格";
const encodedQuery = "%E4%B8%AD%E6%96%87%20%26%20%3F%20%3D%20%23%20%E7%A9%BA%E6%A0%BC";
const expectedUrls: Record<QuestionSearchProviderId, string> = {
  google: `https://www.google.com/search?q=${encodedQuery}`,
  baidu: `https://chat.baidu.com/search?word=${encodedQuery}`,
  chatgpt: `https://chatgpt.com/?q=${encodedQuery}&hints=search&ref=ext`,
  kimi: `https://www.kimi.com/?prefill_prompt=${encodedQuery}&send_immediately=true`,
  xiaohongshu: `https://www.xiaohongshu.com/ai_chat?keyword=${encodedQuery}`,
  felo: `https://felo.ai/search?q=${encodedQuery}`,
  sogou: `https://www.sogou.com/aimode/search?sourceid=5_00_19&query=${encodedQuery}`,
  bing: `https://www.bing.com/search?q=${encodedQuery}&iscopilotedu=1&form=MA13G7`,
  zhihu: `https://zhida.zhihu.com/search?q=${encodedQuery}`,
};

for (const provider of QUESTION_SEARCH_PROVIDERS) {
  const url = buildQuestionSearchUrl(provider.id, query);
  assert.equal(url, expectedUrls[provider.id], `${provider.id} URL should be correct`);
  assert.equal(url.includes(query), false, `${provider.id} URL should encode the query`);
}

console.log("[keyboard-search] OK: keyboard shortcuts and search URLs verified");
