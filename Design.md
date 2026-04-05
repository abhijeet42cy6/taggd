# Dissect Design System

ChatGPT-style UI design guidelines for fonts, sizes, spacing, colors, and layout. Use this to keep the product looking clean and "AI-native."

---

## 1) Overall Look & Feel (ChatGPT vibe)

**Principles**

- Minimal, calm, distraction-free
- High readability (text-first UI)
- Soft contrast, neutral tones
- Clear hierarchy, nothing screaming for attention
- Rounded corners, subtle borders, light shadows

**Layout style**

- Centered content column
- Side margins for breathing space
- Cards/sections separated by spacing, not heavy borders

---

## 2) Typography (Fonts + Sizes)

### Font Family

Use modern system UI fonts:

```css
font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
```

Premium alternatives: **Inter**, **SF Pro (Apple)**, **Roboto (Android)**

### Font Size Scale

| Type            | Size    | Weight  | Usage                             |
| --------------- | ------- | ------- | --------------------------------- |
| Page Title      | 28–32px | 600–700 | Big screens, hero heading         |
| Section Heading | 18–20px | 600     | "Chat", "Settings", "Upload docs" |
| Normal Text     | 14–16px | 400–500 | Main content                      |
| Small Text      | 12–13px | 400     | timestamps, hints                 |
| Code/Mono       | 13–14px | 400–500 | JSON output, logs                 |

**Defaults**

- Body text: **15–16px**
- Line-height: **1.5 to 1.7**

```css
body { font-size: 16px; line-height: 1.6; }
h1 { font-size: 30px; font-weight: 700; }
h2 { font-size: 20px; font-weight: 600; }
small { font-size: 12px; opacity: 0.7; }
```

---

## 3) Spacing + Layout

### Main Container Width

- Max width: **720px to 880px**
- Recommended: **800px**

```css
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}
```

### Spacing System (8px grid)

Use: **8, 12, 16, 24, 32, 48**

- Between sections: **24–32px**
- Inside cards: **16–20px**
- Between text lines: **10–14px**

---

## 4) Colors

### Light Mode Palette

| Token      | Hex       | Usage                    |
| ---------- | --------- | ------------------------ |
| Background | `#FFFFFF` | Page background          |
| Surface/Card | `#F9FAFB` | Cards, inputs, surfaces |
| Border     | `#E5E7EB` | Borders, dividers        |
| Text       | `#111827` | Primary text             |
| Secondary  | `#4B5563` | Secondary text           |
| Muted      | `#6B7280` | Hints, placeholders      |
| Accent     | `#10A37F` | Buttons, links, focus    |
| Error      | `#EF4444` | Errors                   |
| Warning    | `#F59E0B` | Warnings                 |

### Dark Mode Palette (OpenAI/ChatGPT-style — neutral grey, no blue)

| Token      | Hex       | Usage                    |
| ---------- | --------- | ------------------------ |
| Background | `#0F0F0F` | Page background (near black) |
| Surface/Card | `#171717` | Cards, surfaces (dark grey) |
| Border     | `#2E2E2E` | Borders, dividers (neutral grey) |
| Text       | `#EDEDED` | Primary text (white/light grey) |
| Secondary  | `#A6A6A6` | Secondary text           |
| Selected/Hover | `#2E2E2E` | Selected nav, chips (grey) |
| Accent     | Softer green (~#34C4A0) | Brand green — softer, easier on eyes in dark mode |

Use low saturation. Keep the UI calm and focused. Dark mode uses a slightly lighter, less saturated green than light mode for better visibility and harmony.

### Color Usage Guidelines (Light & Dark)

**Always use semantic tokens** — never hardcode hex or Tailwind gray classes:

| Use Case        | Class                    | Avoid                    |
| --------------- | ------------------------ | ------------------------- |
| Page background | `bg-background`          | `bg-white`, `bg-gray-900` |
| Primary text    | `text-foreground`        | `text-black`, `text-white`|
| Secondary text  | `text-muted-foreground`  | `text-gray-500`, `text-gray-400` |
| Borders         | `border-border`          | `border-gray-200`, `border-zinc-700` |
| Cards/surfaces  | `bg-card`, `bg-muted`    | `bg-gray-50`, `bg-white`  |
| Hover states    | `hover:bg-muted`         | `hover:bg-gray-100`       |
| Buttons/links   | `bg-primary`, `text-primary` | `bg-green-500`      |

**Accent colors** (green, blue, amber) — use Tailwind with dark variants for icons/badges:
- `text-green-600 dark:text-green-400`
- `text-blue-600 dark:text-blue-400`
- Ensures icons remain visible in both modes.

---

## 5) Buttons

### Primary Button

- Height: **40–44px**
- Radius: **10–12px**
- Font: **14–15px / 600**
- Background: accent green
- Hover: slightly darker

```css
.btn-primary {
  height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  font-weight: 600;
  background: #10A37F;
  color: white;
}
```

### Secondary Button

- Light gray background
- Optional border

```css
.btn-secondary {
  height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  background: #F3F4F6;
  color: #111827;
}
```

---

## 6) Input Fields

### Text Input

- Height: **44–48px**
- Radius: **12px**
- Background: light gray card
- Border: subtle

```css
.input {
  height: 48px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid #E5E7EB;
  background: #F9FAFB;
  outline: none;
}
.input:focus {
  border-color: #10A37F;
  box-shadow: 0 0 0 3px rgba(16,163,127,0.15);
}
```

### Chat Composer

- Multiline textarea
- Send icon button
- Attachment on left
- Generous padding

---

## 7) Cards / Message Bubbles

ChatGPT-style messages are block-like, not bubble-heavy.

- **User messages**: slightly tinted card (`#F3F4F6`)
- **Assistant messages**: plain text on background
- **Radius**: 16px
- **Padding**: 12–16px

---

## 8) Code Blocks & JSON Output

- Font: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas`
- Background: `#0F172A` (dark slate)
- Text: `#E5E7EB`
- Radius: 12px
- Padding: 14px
- Scroll for long content

---

## 9) Icons

- Use **Lucide** or **Heroicons**
- Minimal stroke icons

**Sizes**

- 18px (inline)
- 20–22px (buttons)
- 24px (main actions)

---

## 10) Shadows & Borders

**Borders**

- `1px solid #E5E7EB` (light)
- `1px solid #273244` (dark)

**Shadows**

```css
.shadow-soft {
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
```

Avoid heavy shadows.

---

## 11) Animations

- Duration: **150–220ms**
- Easing: `ease-out`
- Use for hover/focus only

---

## 12) CSS Variables Reference

The app uses **HSL components** (no `hsl()` wrapper in the variable — Tailwind wraps them). Source of truth: `frontend/src/index.css` (`:root` and `.dark`).

| CSS Variable       | Light (approx hex) | Dark (approx hex) |
| ------------------ | -------------------- | ----------------- |
| `--background`     | `#FFFFFF`            | `#0F0F0F`         |
| `--foreground`     | `#111827`            | `#EDEDED`         |
| `--card`           | `#F9FAFB`            | `#171717`         |
| `--muted`          | `#F9FAFB` / `#F3F4F6` | `#1F1F1F`      |
| `--muted-foreground` | `#6B7280`         | `#A6A6A6`         |
| `--border` / `--input` | `#E5E7EB`       | `#2E2E2E`         |
| `--primary`        | `#10A37F` (165 83% 35%) | Softer green (165 65% 50%) |
| `--ring`           | matches primary      | matches primary   |
| `--radius`         | `0.75rem` (12px base; `rounded-xl` etc.) | same |

Dark mode is **neutral grey** (OpenAI-style), not blue-tinted HSL.

---

## 13) Component Checklist

- [x] Buttons: 44px height (h-11), 12px radius (rounded-xl)
- [x] Inputs: 48px height (h-12), 12px radius (rounded-xl)
- [x] Cards: 16px radius (rounded-2xl), subtle border + shadow-soft
- [x] Chat messages: block style, 16px radius
- [x] Code blocks: dark slate (#0F172A) bg, monospace font
- [x] Icons: 18–24px, Lucide minimal stroke

## 14) Implementation Notes

- **Primary color** = accent green (#10A37F) in both light and dark modes for buttons, links, focus
- **Light mode** uses the palette above; **dark mode** uses the ChatGPT-style dark palette
- CSS variables in `frontend/src/index.css`; components use Tailwind semantic tokens

## 15) Semantic Token Usage (Preferred)

Use these Tailwind classes instead of raw colors:

| Use Case        | Class                    | Avoid              |
| --------------- | ------------------------ | ------------------ |
| Page background | `bg-background`          | `bg-white`, `bg-gray-*` |
| Primary text    | `text-foreground`        | `text-black`, `text-gray-900` |
| Secondary text  | `text-muted-foreground`  | `text-gray-500`, `text-gray-600` |
| Borders         | `border-border`          | `border-gray-200`  |
| Cards/surfaces  | `bg-card`, `bg-muted`    | `bg-gray-50`       |
| Buttons/links   | `bg-primary`, `text-primary` | `bg-green-500` |
| Focus ring      | `ring-ring`              | `ring-blue-500`    |