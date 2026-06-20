/**
 * Hijri (Islamic) date helpers backed by the browser's Intl engine using the
 * Umm al-Qura calendar — no extra dependency required.
 */
export function getHijriDate(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

export function getHijriWeekday(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
      weekday: "long",
    }).format(date);
  } catch {
    return "";
  }
}
