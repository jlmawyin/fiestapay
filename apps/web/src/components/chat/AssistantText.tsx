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

interface LabelSpan {
  label: boolean;
  text: string;
}

// Backtick delimiters use \x60 so no literal backtick pair can collapse.
const LABEL_PATTERN = /(\x60[^\x60\n]+\x60)|("[^"\n]+")|(«[^»\n]+»)/g;

function stripDelimiters(match: string): string {
  if (match.startsWith('`') && match.endsWith('`')) return match.slice(1, -1);
  if (match.startsWith('"') && match.endsWith('"')) return match.slice(1, -1);
  if (match.startsWith('«') && match.endsWith('»')) return match.slice(1, -1);
  return match;
}

/**
 * Button-name spans: "double quotes", «guillemets» and `backticks` all render
 * as a highlighted label with the delimiters removed. Backticks never leak.
 */
export function splitLabelSpans(text: string): LabelSpan[] {
  const spans: LabelSpan[] = [];
  let cursor = 0;
  LABEL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LABEL_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) spans.push({ label: false, text: text.slice(cursor, match.index) });
    spans.push({ label: true, text: stripDelimiters(match[0]) });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) spans.push({ label: false, text: text.slice(cursor) });
  return spans.filter((span) => span.text.length > 0);
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return splitAssistantText(text).flatMap((segment, boldIndex) => {
    const nodes = splitLabelSpans(segment.text).map((span, spanIndex) => {
      const key = `${keyPrefix}-b${boldIndex}-s${spanIndex}`;
      return span.label ? (
        <span key={key} className="fp-assistant-label">
          {span.text}
        </span>
      ) : (
        <React.Fragment key={key}>{span.text}</React.Fragment>
      );
    });
    return segment.bold ? [<strong key={`${keyPrefix}-strong${boldIndex}`}>{nodes}</strong>] : nodes;
  });
}

export type AssistantBlock =
  | { kind: 'para'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] };

const UNORDERED_ITEM = /^(\s*[-*•]\s+)(.+)$/;
const ORDERED_ITEM = /^(\s*\d+[.)]\s+)(.+)$/;

function listItemOf(line: string): { ordered: boolean; item: string } | null {
  const ordered = ORDERED_ITEM.exec(line);
  if (ordered?.[2]) return { ordered: true, item: ordered[2].trim() };
  const unordered = UNORDERED_ITEM.exec(line);
  if (unordered?.[2]) return { ordered: false, item: unordered[2].trim() };
  return null;
}

/** Blank-line paragraphs; runs of -, *, • or 1. items become lists. */
export function splitAssistantBlocks(text: string): AssistantBlock[] {
  const blocks: AssistantBlock[] = [];
  for (const raw of text.split(/\n\s*\n/)) {
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) continue;
    const parsed = lines.map(listItemOf);
    if (parsed.every((entry) => entry !== null)) {
      const items = (parsed as { ordered: boolean; item: string }[]).map((entry) => entry.item);
      const ordered = (parsed as { ordered: boolean; item: string }[]).every((entry) => entry.ordered);
      blocks.push({ kind: ordered ? 'ol' : 'ul', items });
    } else {
      blocks.push({ kind: 'para', text: lines.join('\n') });
    }
  }
  return blocks;
}

/**
 * Safe renderer for chat messages: React escapes everything, so HTML, scripts
 * and links from the model stay literal text. Never uses dangerouslySetInnerHTML
 * and never renders anchors.
 */
export const AssistantText: React.FC<{ text: string }> = ({ text }) => (
  <span className="fp-assistant-text">
    {splitAssistantBlocks(text).map((block, blockIndex) => {
      if (block.kind === 'para') {
        return <p key={blockIndex}>{renderInline(block.text, `p${blockIndex}`)}</p>;
      }
      const items = block.items.map((item, itemIndex) => (
        <li key={itemIndex}>{renderInline(item, `b${blockIndex}i${itemIndex}`)}</li>
      ));
      return block.kind === 'ol' ? <ol key={blockIndex}>{items}</ol> : <ul key={blockIndex}>{items}</ul>;
    })}
  </span>
);
