import { useId } from "react";

/** Original half full world: a reader, a book, a little landscape and daylight.
 * Decorative brand artwork, never a depiction of a reported event. The scene
 * is intentionally one connected illustration, not a collection of stickers.
 */
export default function BrandWorldArtwork({
  variant = "welcome",
  className = "",
}: {
  variant?: "welcome" | "completion" | "handoff";
  className?: string;
}) {
  const unique = useId().replace(/:/g, "");
  const lavender = `${unique}-lavender`;
  const book = `${unique}-book`;
  const isComplete = variant === "completion";
  return (
    <svg
      viewBox="0 0 480 390"
      className={`brand-world-artwork ${className}`.trim()}
      data-variant={variant}
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <defs>
        <linearGradient id={lavender} x1="160" y1="80" x2="330" y2="292" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e8dcff" />
          <stop offset="1" stopColor="#b9a0e0" />
        </linearGradient>
        <linearGradient id={book} x1="190" y1="231" x2="305" y2="302" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff8dd" />
          <stop offset="1" stopColor="#f0d995" />
        </linearGradient>
      </defs>

      {/* One continuous landscape opens beyond the figure. */}
      <path d="M31 289C73 241 125 249 171 265C225 217 308 218 359 265C396 257 430 272 452 306C411 336 348 345 241 346C151 347 65 331 31 305Z" fill="#c3d9c1" />
      <path d="M49 304C119 272 147 309 221 298C305 285 344 309 427 300C388 343 299 355 218 350C131 349 74 329 49 304Z" fill="#aac9b3" />
      <path d="M283 309C310 291 338 298 353 310C327 315 311 326 298 340L260 345C268 330 274 317 283 309Z" fill="#f9f1da" />

      {/* The warm daylight and headphone cable are parts of the landscape. */}
      <path d="M338 103C338 79 356 62 379 63C403 65 416 84 412 107C393 99 365 99 338 103Z" fill="#f1d58d" />
      <path d="M345 108C367 102 395 106 408 116" stroke="#f1d58d" strokeWidth="4" strokeLinecap="round" />
      <path d="M72 207C83 200 90 189 90 173M90 173C72 174 68 184 72 196C83 196 91 186 90 173ZM90 173C95 157 106 156 113 161C111 174 103 181 90 173Z" fill="#6f997e" stroke="#6f997e" strokeWidth="3" strokeLinejoin="round" />
      <path d="M83 206L92 261" stroke="#527762" strokeWidth="4" strokeLinecap="round" />
      <path d="M76 223C60 207 45 212 47 224C57 239 70 238 79 233M89 231C99 211 114 209 119 222C112 236 102 240 89 239" fill="#6f997e" />
      <path d="M65 257H108L102 285C92 293 81 293 71 285L65 257Z" fill="#d49784" />

      {/* Half full's familiar petal silhouette, now an expressive main figure. */}
      <path d="M176 111C169 77 194 63 220 84C238 57 268 65 275 92C308 78 333 102 319 130C352 146 352 178 325 195C342 221 326 245 296 247C288 280 255 289 234 265C211 287 180 272 175 247C143 247 125 223 144 198C116 176 126 143 155 139C147 123 158 113 176 111Z" fill={`url(#${lavender})`} />
      <path d="M174 121C162 123 156 135 161 147" stroke="#f9f0ff" strokeWidth="8" strokeLinecap="round" opacity=".8" />
      <path d="M170 155C169 103 201 82 237 82C278 82 306 111 303 157" stroke="#285044" strokeWidth="12" strokeLinecap="round" />
      <path d="M173 153C168 141 153 145 152 158L152 185C153 196 168 199 174 188Z" fill="#365a4d" />
      <path d="M301 152C307 142 320 147 320 160V185C319 197 305 199 300 188Z" fill="#365a4d" />
      <path d="M159 158V182M311 159V182" stroke="#a6c5ad" strokeWidth="4" strokeLinecap="round" />
      {isComplete ? (
        <>
          <path d="M199 164Q207 155 215 164M251 164Q259 155 267 164" stroke="#283d34" strokeWidth="5" strokeLinecap="round" />
          <path d="M219 187Q233 205 248 186" stroke="#283d34" strokeWidth="5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="208" cy="165" rx="4.5" ry="6.5" fill="#283d34" />
          <ellipse cx="260" cy="165" rx="4.5" ry="6.5" fill="#283d34" />
          <path d="M223 187Q234 197 245 186" stroke="#283d34" strokeWidth="4.5" strokeLinecap="round" />
        </>
      )}
      <ellipse cx="191" cy="184" rx="11" ry="4.5" fill="#e6a8aa" opacity=".7" />
      <ellipse cx="275" cy="184" rx="11" ry="4.5" fill="#e6a8aa" opacity=".7" />

      {/* The book is a real foreground object the character holds. */}
      <path d="M169 224C190 219 212 226 234 238C256 225 280 221 303 225L297 286C274 282 254 290 234 301C213 288 194 282 172 285Z" fill="#987654" />
      <path d="M173 218C194 214 214 221 234 233C253 220 278 216 300 220L295 279C272 275 252 284 234 295C215 283 194 277 177 279Z" fill={`url(#${book})`} />
      <path d="M234 234V294" stroke="#c6ac72" strokeWidth="2" />
      <path d="M187 237C198 236 212 241 222 247M188 248C201 249 211 252 220 257M246 249C258 241 272 236 285 238M246 260C258 253 270 250 283 249" stroke="#bda66f" strokeWidth="3" strokeLinecap="round" />
      <path d="M168 235C148 226 141 242 153 253L177 260L173 242Z" fill="#b59bd5" />
      <path d="M302 235C320 227 331 241 317 253L295 260L297 242Z" fill="#b59bd5" />
      <path d="M189 285C177 297 169 303 160 302C157 288 160 278 175 269M275 285C285 297 297 304 307 300C307 286 301 277 295 273" fill="#826696" />
      <path d="M318 192C336 228 326 265 349 277C363 283 376 273 376 260" stroke="#365a4d" strokeWidth="3" strokeLinecap="round" />

      {/* A single daily spark, intentionally quiet and attached to the book. */}
      <path d="M117 104L121 116L133 120L121 124L117 136L113 124L101 120L113 116Z" fill="#d6b468" />
      <path d="M354 212L357 220L365 223L357 226L354 234L351 226L343 223L351 220Z" fill="#b39bcc" />
    </svg>
  );
}
