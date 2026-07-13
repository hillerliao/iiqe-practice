import assert from "node:assert/strict";
import {
  QUESTION_SEARCH_PROVIDERS,
  buildQuestionSearchUrl,
  matchQuestionSearchProvider,
  type QuestionSearchProviderId,
  type ShiftKeyboardLike,
} from "../lib/question-search";
import {
  INTERACTIVE_TARGET_SELECTOR,
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

assert.equal(QUESTION_SEARCH_PROVIDERS.length, 6);
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

const handbookEvent = keyboardEvent("KeyH");
assert.equal(noModifiers(handbookEvent), true, "KeyH should remain a plain handbook action");
assert.equal(matchQuestionSearchProvider(handbookEvent), undefined);
assert.equal(
  matchQuestionSearchProvider(keyboardEvent("KeyH", { shiftKey: true })),
  undefined,
  "Shift+H should not collide with a search provider",
);

for (const [key, expected] of [
  ["1", "a"],
  ["2", "b"],
  ["3", "c"],
  ["4", "d"],
  ["A", "a"],
  ["B", "b"],
  ["C", "c"],
  ["D", "d"],
] as const) {
  assert.equal(parseAnswerKey(key), expected, `${key} should select answer ${expected}`);
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

const query = "中文 & ? = # 空格";
const encodedQuery = "%E4%B8%AD%E6%96%87%20%26%20%3F%20%3D%20%23%20%E7%A9%BA%E6%A0%BC";
const expectedUrls: Record<QuestionSearchProviderId, string> = {
  google: `https://www.google.com/search?q=${encodedQuery}`,
  baidu: `https://chat.baidu.com/search?word=${encodedQuery}`,
  chatgpt: `https://chatgpt.com/?q=${encodedQuery}&hints=search&ref=ext`,
  kimi: `https://www.kimi.com/?prefill_prompt=${encodedQuery}&send_immediately=true`,
  xiaohongshu: `https://www.xiaohongshu.com/ai_chat?keyword=${encodedQuery}`,
  felo: `https://felo.ai/search?q=${encodedQuery}`,
};

for (const provider of QUESTION_SEARCH_PROVIDERS) {
  const url = buildQuestionSearchUrl(provider.id, query);
  assert.equal(url, expectedUrls[provider.id], `${provider.id} URL should be correct`);
  assert.equal(url.includes(query), false, `${provider.id} URL should encode the query`);
}

console.log("[keyboard-search] OK: keyboard shortcuts and search URLs verified");
