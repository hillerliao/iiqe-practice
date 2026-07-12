import { cn } from "@/lib/utils";
import { splitQuestionStatements } from "@/lib/questionText";

// Renders a question stem. When the stem contains multiple roman-numeral
// sub-statements (i. ii. iii. ...), each statement is shown on its own line
// while preserving the original internal spacing. Otherwise it renders the raw
// text unchanged.
export function QuestionStem({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const { lead, items } = splitQuestionStatements(text);

  if (items.length === 0) {
    return (
      <span className={cn("whitespace-pre-wrap break-words", className)}>
        {text}
      </span>
    );
  }

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {lead}
      {items.map((it, i) => (
        <span key={i}>
          <br />
          {it}
        </span>
      ))}
    </span>
  );
}
