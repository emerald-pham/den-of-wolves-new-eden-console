export type TickerTextRange = {
  textLeft: number | null;
  textRight: number | null;
};

export function paintedTextRangesOverlap(
  previous: TickerTextRange,
  current: TickerTextRange,
): boolean {
  return previous.textRight !== null && current.textLeft !== null &&
    Number.isFinite(previous.textRight) && Number.isFinite(current.textLeft) &&
    current.textLeft < previous.textRight;
}
