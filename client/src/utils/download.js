// Saves something the page made (JSON, CSV, .ics) as a file on the visitor's device.
// Returns false when the browser refused, so the page can say so.
export function saveFile(filename, parts, type) {
  if (typeof document === 'undefined') return false;
  try {
    const href = URL.createObjectURL(new Blob(parts, { type }));
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Some browsers start the download after click() returns, so free the URL a little later
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return true;
  } catch {
    return false;
  }
}

export function saveJson(filename, data) {
  return saveFile(filename, [JSON.stringify(data, null, 2)], 'application/json;charset=utf-8');
}

// "2026-10-15", for file names
export function dateStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
