/** One-line tooltip for Ctrl/⌘ multi-select on marketplace and filter chips. */
export function multiSelectChipTooltip(): string {
  if (typeof navigator === 'undefined') {
    return 'Hold Ctrl/⌘ to select multiple';
  }
  const platform = navigator.platform ?? '';
  const ua = navigator.userAgent ?? '';
  const macLike = /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS X/.test(ua);
  if (macLike) {
    return 'Hold ⌘ to select multiple';
  }
  return 'Hold Ctrl to select multiple';
}
