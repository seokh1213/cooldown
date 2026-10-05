export async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return copyWithSelection(value);
  }
}

function copyWithSelection(value: string): boolean {
  const selection = document.getSelection();
  const previous = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : undefined;
  const focused = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  try {
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    focused?.focus();
    if (selection && previous) { selection.removeAllRanges(); selection.addRange(previous); }
  }
}
