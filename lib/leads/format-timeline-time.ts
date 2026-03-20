/**
 * Format for activity timeline stamps: hour, minutes, seconds, milliseconds (12h).
 * Example: 6:06.00.042 am
 */
export function formatTimelineTime(date: Date): string {
  const h24 = date.getHours();
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const mmm = String(date.getMilliseconds()).padStart(3, "0");
  const ap = h24 < 12 ? "am" : "pm";
  return `${h12}:${mm}.${ss}.${mmm} ${ap}`;
}
