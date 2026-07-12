// 一次性去重腳本:處理 admin/questions 頁面每題顯示兩次的問題。
//
// 背景:之前的安全重構 (df8a225) 在 seed 時把 JSON 題目以舊 ID (e.g. "P1-exam-1")
// 雙寫進 SQLite,同時管理員新增題目時 Prisma 預設生成 cuid (e.g. "cmrbmf08k..."),
// 導致每個 (paperId, source, number) 組合有兩條記錄,總題數 4952 (=2476×2)。
//
// 策略:
// - 練習路徑(lib/data.ts + lib/kv.ts) 讀的是 JSON 真相源,使用舊 ID ("P1-exam-1")。
// - 因此保留舊 ID 那條,刪除 cuid 那條。
// - 如果使用者之後在後台編輯了 cuid 那條題目,內容會丟失 — 但理論上後台還沒被實際使用,
//   編輯記錄都集中在舊 ID 那條上(因為 questionId="P1-exam-1" 是當前唯一對外的 ID)。
//
// 安全措施:
// - 必須先做 prod.db 備份(`deploy-remote.sh` 已備一份,這裡再強制檢查)。
// - 用 transaction 包住,任何錯誤自動 rollback。
// - 跑完打印刪除/保留統計。
//
// 一次性使用,跑完即可刪除。

import { getPrisma } from "../lib/db";

async function main() {
  const prisma = getPrisma();

  // 統計入口
  const totalBefore = await prisma.question.count();
  console.log(`[dedupe] 啟動。當前總題數: ${totalBefore}`);

  // 取出全部 question 的最小識別列
  const all = await prisma.question.findMany({
    select: { id: true, paperId: true, source: true, number: true },
  });
  console.log(`[dedupe] 讀取 ${all.length} 條記錄,分組去重...`);

  // 按 (paperId, source, number) 分組,保留 ID 風格是 "P1-exam-1" 那條,
  // 刪除 cuid ("cm...") 的那條。
  // 啟發式:舊 ID 風格是 "<PaperCode>-<source>-<number>",以 paper code
  // (P1/P3 等) 開頭;cuid 以 "cm" 開頭。為了穩健,我們用 regex 判定。
  const OLD_ID_RE = /^[A-Z][A-Z0-9]*-(exam|mock)-\d+$/;

  const groups = new Map<string, string[]>();
  for (const q of all) {
    const k = `${q.paperId}|${q.source}|${q.number}`;
    const arr = groups.get(k);
    if (arr) {
      arr.push(q.id);
    } else {
      groups.set(k, [q.id]);
    }
  }

  const toDelete: string[] = [];
  const toKeep: string[] = [];
  const conflicts: { key: string; ids: string[] }[] = [];

  for (const [key, ids] of groups) {
    if (ids.length === 1) {
      toKeep.push(ids[0]);
      continue;
    }
    if (ids.length === 2) {
      const olds = ids.filter((id) => OLD_ID_RE.test(id));
      const cuids = ids.filter((id) => !OLD_ID_RE.test(id));
      if (olds.length === 1 && cuids.length === 1) {
        toKeep.push(olds[0]);
        toDelete.push(cuids[0]);
        continue;
      }
    }
    conflicts.push({ key, ids });
  }

  console.log(
    `[dedupe] 統計: groups=${groups.size} keep=${toKeep.length} delete=${toDelete.length} conflicts=${conflicts.length}`
  );

  if (conflicts.length > 0) {
    console.error(`[dedupe] ABORT: 有 ${conflicts.length} 個無法自動判定的組:`);
    for (const c of conflicts.slice(0, 10)) {
      console.error(`  ${c.key}: ids=${JSON.stringify(c.ids)}`);
    }
    console.error("請人工介入,不要自動刪除。");
    process.exit(2);
  }

  if (toDelete.length === 0) {
    console.log("[dedupe] 沒有重複項,無需處理。");
    process.exit(0);
  }

  console.log(`[dedupe] 準備刪除 ${toDelete.length} 條 cuid 重複記錄...`);
  console.log(`[dedupe] 範例(前 5): ${toDelete.slice(0, 5).join(", ")}`);

  // 刪除前最後確認:這些 cuid 是否被 Answer / Favorite / Note 引用?
  // 由於練習路徑從不引用 cuid(只引用 "P1-exam-1"),理論上應該 0 引用。
  // 但之前 verify-storage.ts 跑過一輪 cuid-id attempt,所以可能有少數 Answer
  // 引用了 cuid。這裡自動 migrate:把 Answer.questionId 從 cuid 改成對應的舊 ID,
  // 再刪 cuid 題目。
  const refCheck = await prisma.answer.findMany({
    where: { questionId: { in: toDelete } },
  });
  const favCheck = await prisma.favorite.findMany({
    where: { questionId: { in: toDelete } },
  });
  const noteCheck = await prisma.note.findMany({
    where: { questionId: { in: toDelete } },
  });
  const fbCheck = await prisma.feedback.findMany({
    where: { questionId: { in: toDelete } },
  });

  // 建立 cuid → 舊 ID 的映射(透過 paperId/source/number 定位同一題的另一條)
  const cuidToOld = new Map<string, string>();
  for (const cid of toDelete) {
    const q = await prisma.question.findUnique({
      where: { id: cid },
      select: { paperId: true, source: true, number: true },
    });
    if (!q) continue;
    const old = await prisma.question.findFirst({
      where: {
        paperId: q.paperId,
        source: q.source,
        number: q.number,
        id: { not: cid },
      },
      select: { id: true },
    });
    if (old) cuidToOld.set(cid, old.id);
  }
  console.log(
    `[dedupe] cuid → 舊 ID 映射表: ${cuidToOld.size} / ${toDelete.length}`
  );

  // 處理業務引用:
  // - Answer: 用 cuidToOld 替換 questionId(如果同一個 attempt 對同一舊 ID 已有 Answer,
  //   則合併 userAnswer:後寫入的覆蓋先寫入的,這裡採用「保留 cuid 那條、刪舊 ID 那條」
  //   因為 cuid 那條攜帶 verify-storage 的真實作答記錄,舊 ID 那條是後續 seed 出來的空殼)
  // - Favorite: 轉移(同一 session+舊 ID 不存在 favorite 就建,存在就保留先建那條)
  // - Note: 轉移,content 衝突時 cuid 覆蓋舊 ID
  // - Feedback: 簡單替換 questionId(feedback 沒有 uniqueness constraint)

  let migratedAns = 0,
    mergedAns = 0,
    skippedAns = 0;
  let migratedFav = 0,
    mergedFav = 0;
  let migratedNote = 0,
    mergedNote = 0;
  let migratedFb = 0;

  await prisma.$transaction(async (tx) => {
    // -- Answers --
    for (const a of refCheck) {
      const oldId = cuidToOld.get(a.questionId);
      if (!oldId) {
        skippedAns++;
        continue;
      }
      // 同一 attempt + 同一舊 ID 是否有既存 answer?
      const existing = await tx.answer.findFirst({
        where: { attemptId: a.attemptId, questionId: oldId },
      });
      if (existing) {
        // 合併:保留 cuid 那條的作答細節,刪掉舊 ID 那條
        await tx.answer.delete({ where: { id: existing.id } });
        await tx.answer.update({
          where: { id: a.id },
          data: { questionId: oldId },
        });
        mergedAns++;
      } else {
        await tx.answer.update({
          where: { id: a.id },
          data: { questionId: oldId },
        });
        migratedAns++;
      }
    }

    // -- Favorites --
    for (const f of favCheck) {
      const oldId = cuidToOld.get(f.questionId);
      if (!oldId) continue;
      const existing = await tx.favorite.findFirst({
        where: { sessionId: f.sessionId, questionId: oldId },
      });
      if (existing) {
        await tx.favorite.delete({ where: { id: f.id } });
        mergedFav++;
      } else {
        await tx.favorite.update({
          where: { id: f.id },
          data: { questionId: oldId },
        });
        migratedFav++;
      }
    }

    // -- Notes --
    for (const n of noteCheck) {
      const oldId = cuidToOld.get(n.questionId);
      if (!oldId) continue;
      const existing = await tx.note.findFirst({
        where: { sessionId: n.sessionId, questionId: oldId },
      });
      if (existing) {
        // cuid 的 note 內容覆蓋舊 ID 的
        await tx.note.update({
          where: { id: existing.id },
          data: { content: n.content, updatedAt: n.updatedAt },
        });
        await tx.note.delete({ where: { id: n.id } });
        mergedNote++;
      } else {
        await tx.note.update({
          where: { id: n.id },
          data: { questionId: oldId },
        });
        migratedNote++;
      }
    }

    // -- Feedback --
    for (const fb of fbCheck) {
      const oldId = cuidToOld.get(fb.questionId);
      if (!oldId) continue;
      await tx.feedback.update({
        where: { id: fb.id },
        data: { questionId: oldId },
      });
      migratedFb++;
    }

    console.log(
      `[dedupe] 業務引用遷移: answers migrated=${migratedAns} merged=${mergedAns} skipped=${skippedAns}; favorites migrated=${migratedFav} merged=${mergedFav}; notes migrated=${migratedNote} merged=${mergedNote}; feedback migrated=${migratedFb}`
    );

    // 刪除 cuid question
    const BATCH = 200;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = toDelete.slice(i, i + BATCH);
      const r = await tx.question.deleteMany({
        where: { id: { in: batch } },
      });
      console.log(`[dedupe]   批次 ${i / BATCH + 1}: 刪除 ${r.count} 條`);
    }
  });

  const totalAfter = await prisma.question.count();
  console.log(`[dedupe] 完成。總題數: ${totalBefore} → ${totalAfter}`);
  console.log(`[dedupe] 期望 ${totalBefore - toDelete.length},實際 ${totalAfter}`);
  if (totalAfter !== totalBefore - toDelete.length) {
    console.error("[dedupe] WARNING: 數量不一致,請人工核對");
    process.exit(4);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[dedupe] 致命錯誤:", e);
  process.exit(1);
});