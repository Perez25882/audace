# Design system

AUDACE is set in a tracked text wordmark. Newsreader supplies the wordmark and display typography. Manrope handles navigation, controls and supporting text. Both are variable fonts bundled with the storefront.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| Ivory | `#f8f5ee` | Site background and light text |
| Paper | `#fdfdfd` | Near-white illustration frames |
| Sand | `#eee6d9` | Editorial hero and selected surfaces |
| Espresso | `#30231e` | Primary text and action background |
| Charcoal | `#312d2a` | Footer |
| Muted | `#67584e` | Supporting text on light surfaces |
| Gold | `#866944` | Fine accents and active filter underline |
| Line | `#d9cec0` | Dividers |
| Burgundy | `#451c29` | Editorial detail panel and focus indicator |

## Layout

- The opening spread pairs a sand text panel with a white garment plate. On small screens, the text and garment stack in reading order.
- The collection uses two, three or four columns as space allows. Every card shows the complete front view and names its colour and sleeve length.
- The detail spread crops into the closure on the same Burgundy illustration used in the hero. Product pages show the full frame.
- The page frame has a maximum width of 87 rem and fluid gutters. Display sizes and section spacing scale with viewport width.
- Links use concise text with restrained directional icons. Repeated product images inside named links have empty alt text. The main garment views carry descriptive alt text.
- Native links and buttons receive visible focus outlines. Active filters use `aria-pressed`, count updates use a status region, and current variant links use `aria-current`. Controls remain visible across breakpoints. The layout uses no entrance animation or autoplay.

Shared components live in `src/components`. Global tokens and responsive styles live in `src/app/globals.css`.
