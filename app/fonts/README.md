# Plus Jakarta Sans

Original variable font by Tokotype, self-hosted with Next's local-font loader.
Downloaded from the official Google Fonts source repository:
https://github.com/google/fonts/tree/main/ofl/plusjakartasans

The unmodified `PlusJakartaSans-Variable.ttf` contains normal weights 200–800.
Copyright and the SIL Open Font License 1.1 are retained in `OFL.txt`.
No browser-time Google Fonts request is required.

Load in `app/layout.tsx`:

```tsx
import localFont from "next/font/local";
const jakarta = localFont({
  src: "./fonts/PlusJakartaSans-Variable.ttf",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
  preload: true,
});
// <html lang="en" className={jakarta.variable}>
```
