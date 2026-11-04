import React from 'react';

export interface AssistantTextSegment {
  bold: boolean;
  text: string;
}

const BOLD_MARKER = '**';

/**
 * Splits assistant text into plain and bold segments for the **marker** syntax.
 * It is intentionally small and total: React escapes every segment, so HTML or scripts
 * from the model or the person stay literal text. An opening marker without a closing
 * marker is dropped instead of leaking a visible "**".
 */
export function splitAssistantText(text: string): AssistantTextSegment[] {
  const segments: AssistantTextSegment[] = [];
  let rest = text;

  while (rest.length > 0) {
    const open = rest.indexOf(BOLD_MARKER);
    if (open === -1) {
      segments.push({ bold: false, text: rest });
      break;
    }
    if (open > 0) segments.push({ bold: false, text: rest.slice(0, open) });

    const afterOpen = rest.slice(open + BOLD_MARKER.length);
    const close = afterOpen.indexOf(BOLD_MARKER);
    if (close === -1) {
      if (afterOpen.length > 0) segments.push({ bold: false, text: afterOpen });
      break;
    }
    segments.push({ bold: true, text: afterOpen.slice(0, close) });
    rest = afterOpen.slice(close + BOLD_MARKER.length);
  }

  return segments.filter((segment) => segment.text.length > 0);
}

/** Safe renderer for chat messages: never uses dangerouslySetInnerHTML. */
export const AssistantText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {splitAssistantText(text).map((segment, index) =>
      segment.bold ? (
        <strong key={index}>{segment.text}</strong>
      ) : (
        <React.Fragment key={index}>{segment.text}</React.Fragment>
      ),
    )}
  </>
);
