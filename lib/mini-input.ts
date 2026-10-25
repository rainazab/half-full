/** Treat paste/IME as one deliberate cell entry; ignore punctuation and digits. */
export function miniInputLetter(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 1);
}
