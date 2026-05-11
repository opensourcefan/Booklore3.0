const TEXT_COLLATOR = new Intl.Collator(undefined, {
  sensitivity: 'base',
});

const LEADING_ZEROS_PATTERN = /^0+/;

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function normalizeNumericChunk(value: string): string {
  const normalized = value.replace(LEADING_ZEROS_PATTERN, '');
  return normalized.length > 0 ? normalized : '0';
}

export function naturalCompareStrings(left: string | null | undefined, right: string | null | undefined): number {
  if (left == null && right == null) {
    return 0;
  }

  if (left == null) {
    return 1;
  }

  if (right == null) {
    return -1;
  }

  const leftValue = String(left);
  const rightValue = String(right);

  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < leftValue.length && rightIndex < rightValue.length) {
    const leftChar = leftValue[leftIndex];
    const rightChar = rightValue[rightIndex];

    if (isDigit(leftChar) && isDigit(rightChar)) {
      let leftNumberEnd = leftIndex;
      while (leftNumberEnd < leftValue.length && isDigit(leftValue[leftNumberEnd])) {
        leftNumberEnd += 1;
      }

      let rightNumberEnd = rightIndex;
      while (rightNumberEnd < rightValue.length && isDigit(rightValue[rightNumberEnd])) {
        rightNumberEnd += 1;
      }

      const normalizedLeft = normalizeNumericChunk(leftValue.slice(leftIndex, leftNumberEnd));
      const normalizedRight = normalizeNumericChunk(rightValue.slice(rightIndex, rightNumberEnd));

      if (normalizedLeft.length !== normalizedRight.length) {
        return normalizedLeft.length - normalizedRight.length;
      }

      const numericComparison = TEXT_COLLATOR.compare(normalizedLeft, normalizedRight);
      if (numericComparison !== 0) {
        return numericComparison;
      }

      leftIndex = leftNumberEnd;
      rightIndex = rightNumberEnd;
      continue;
    }

    const comparison = TEXT_COLLATOR.compare(leftChar, rightChar);
    if (comparison !== 0) {
      return comparison;
    }

    leftIndex += 1;
    rightIndex += 1;
  }

  return (leftValue.length - leftIndex) - (rightValue.length - rightIndex);
}