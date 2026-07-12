const ANKI_URL = "http://127.0.0.1:8765";
const API_KEY = "anki-liao";

type AnkiResponse<T> = { result: T; error: string | null };

async function anki<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ANKI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, key: API_KEY, params }),
  });
  const json = (await res.json()) as AnkiResponse<T>;
  if (json.error) throw new Error(`AnkiConnect [${action}]: ${json.error}`);
  return json.result;
}

const MODEL_NAME = "IIQE-MCQ";
const DECK_NAME = "IIQE::test";

const MODEL = {
  modelName: MODEL_NAME,
  inOrderFields: ["Question", "OptionA", "OptionB", "OptionC", "OptionD", "AnswerLetter", "AnswerText", "Explanation", "Ref", "Source", "QuestionID"],
  css: `
.card { font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif; font-size: 18px; color: #222; background: #fff; padding: 20px; }
.options { margin-top: 16px; }
.option { display: block; padding: 6px 10px; margin: 4px 0; border-radius: 6px; background: #f4f4f5; }
.correct { background: #d1fae5; color: #065f46; font-weight: 600; }
.meta { margin-top: 16px; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 10px; }
.tag { display: inline-block; padding: 2px 8px; margin-right: 4px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-size: 12px; }
`,
  cardTemplates: [
    {
      Name: "IIQE MCQ",
      Front: `<div class="card">{{Question}}<div class="options">{{OptionA}}<br>{{OptionB}}<br>{{OptionC}}<br>{{OptionD}}</div></div>`,
      Back: `{{FrontSide}}<hr id="answer"><div class="card"><div class="option correct">✓ {{AnswerLetter}}: {{AnswerText}}</div>{{#Explanation}}<div style="margin-top:12px"><b>解析：</b>{{Explanation}}</div>{{/Explanation}}<div class="meta">{{Ref}} · {{Source}} · <span class="tag">id: {{QuestionID}}</span></div></div>`,
    },
  ],
};

async function main() {
  const version = await anki<number>("version");
  console.log("AnkiConnect version:", version);

  const models = await anki<string[]>("modelNames");
  if (!models.includes(MODEL_NAME)) {
    console.log("Creating model:", MODEL_NAME);
    await anki("createModel", MODEL);
  } else {
    console.log("Model exists:", MODEL_NAME);
  }

  const decks = await anki<string[]>("deckNames");
  if (!decks.includes(DECK_NAME)) {
    console.log("Creating deck:", DECK_NAME);
    await anki("createDeck", { deck: DECK_NAME });
  } else {
    console.log("Deck exists:", DECK_NAME);
  }

  const note = {
    deckName: DECK_NAME,
    modelName: MODEL_NAME,
    fields: {
      Question: "因心臟病產生的醫療開支最有可以被歸類為 _____________。",
      OptionA: "A. 純粹風險",
      OptionB: "B. 投機風險",
      OptionC: "C. 特定風險",
      OptionD: "D. 基本風險",
      AnswerLetter: "C",
      AnswerText: "特定風險",
      Explanation: "醫療開支屬於特定風險 (particular risk)，影響個人而非整體社會。",
      Ref: "1.1.2(a)",
      Source: "P1-exam-2021",
      QuestionID: "P1-exam-1",
    },
    tags: ["IIQE", "paper:P1", "source:exam", "ref:1.1.2(a)", "qid:P1-exam-1"],
  };

  const noteId = await anki<number>("addNote", { note });
  console.log("Created note id:", noteId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});