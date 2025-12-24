**Role:** Expert Frontend Developer & Data Storyteller
**Task:** Generate a 'GrowthBook Wrapped 2025' interactive React slideshow component.
**Aesthetic:** Spotify Wrapped meets Glassmorphism — dark mode, gradient-rich, bold typography.

---

## Phase 0: Brand & Design Constraints

### Color Palette (Use GrowthBook Brand Colors)
| Purpose | Colors |
|---------|--------|
| **Primary Gradient** | `#7B45EA` (purple) → `#2076FF` (blue) → `#06B8F4` (cyan) |
| **Wins/Success** | Emerald/Teal gradients (`from-emerald-500 to-teal-600`) |
| **Losses/Learnings** | Rose/Amber gradients (`from-rose-500 to-amber-600`) |
| **Neutral/Stats** | Zinc/Slate gradients (`from-zinc-800 to-slate-900`) |

*Constraint:* Never use flat solid backgrounds. Always use deep, rich gradients (e.g., `bg-gradient-to-br from-indigo-950 via-purple-900 to-black`).

### Typography
| Element | Style |
|---------|-------|
| **Hero Metrics** | `text-7xl md:text-8xl font-black tracking-tighter` |
| **Headlines** | `text-2xl md:text-3xl font-bold leading-tight` |
| **Labels** | `text-xs uppercase tracking-widest text-white/60` |
| **Body** | `text-base md:text-lg text-white/80` |

**Fonts:** Import from Google Fonts:
- Display/Metrics: `Inter` (weight 800)
- Body: `Inter` (weights 400, 500)
- Mono: `IBM Plex Mono` (weight 400)

### Visual Motifs
- **Glassmorphism containers:** `bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl`
- **Glow effects:** Use `shadow-[0_0_60px_-15px_rgba(123,69,234,0.5)]` for emphasis

---

## Phase 1: Data Acquisition & Processing

### Step 1: Fetch Data
1. Call `get_experiments` with `{ mode: 'summary', limit: 100 }`.
2. Call `get_projects` to map project IDs to human-readable names.

*Note: This may take 30-60 seconds. Tell the user to hang tight* 

### Step 2: Calculate Metrics

**A. Summary Stats**
| Variable | Calculation |
|----------|-------------|
| `total` | `summary.total` (stopped experiments only) |
| `drafts` | `_meta.excluded.draft` |
| `running` | `_meta.excluded.running` |
| `totalUsers` | `summary.totalUsers` |
| `winRate` | `summary.winRate` (as percentage) |
| `lossRate` | `summary.byVerdict.lost / summary.total` |
| `inconclusiveRate` | `summary.byVerdict.inconclusive / summary.total` |
| `avgDuration` | `summary.avgDurationDays` |
| `medianDuration` | `summary.medianDurationDays` |
| `srmFailureRate` | `summary.srmFailureRate` |
| `guardrailRegressionRate` | `summary.guardrailRegressionRate` |

**B. Monthly Trends**
- Parse `summary.byMonth` keys (format: `'2025-12'`)
- Identify **Busiest Month**: month with highest `ended` count
- Calculate **H1 vs H2 Velocity**: sum of Jan-Jun vs Jul-Dec completions

**C. Project Insights**
- Join `summary.byProject` with project names from `get_projects`
- Find: Project with most experiments, project with highest win rate
- If only one project exists, skip comparative insights

**D. Tag Insights**
- If `summary.byTag` is empty → skip tag slide
- Otherwise: most common tag, highest win-rate tag

**E. Winners & Losers**
| Variable | Source |
|----------|--------|
| `biggestWinner` | `topWinners[0]` (highest lift) |
| `biggestLearning` | `topLosers[0]` (frame as 'Impact Avoided') |
| `top3Wins` | `topWinners.slice(0, 3)` |

**F. Fun Facts**
- **Longest experiment:** Max `durationDays` from `experiments[]`
- **Most users:** Max `totalUsers` from `experiments[]`
- **Quickest win:** Min `durationDays` where `verdict === 'won'`
- **SRM catches:** `srmIssues.length` (frame positively: 'GrowthBook protected your data integrity')

---

## Phase 2: Slide Manifest (10 Slides)

| # | Slide | Key Content | Background Gradient |
|---|-------|-------------|---------------------|
| 1 | **Intro** | 'Your 2025 Wrapped' + GrowthBook logo | Brand purple→blue→cyan |
| 2 | **Volume** | Total experiments + total users reached | Brand gradient |
| 3 | **Win Rate** | Hero metric: X% win rate | Emerald/teal |
| 4 | **Biggest Winner** | Experiment name + lift + hypothesis | Emerald/teal |
| 5 | **Biggest Learning** | 'You avoided a -X% impact' | Rose/amber (positive framing) |
| 6 | **Velocity** | Busiest month + H1 vs H2 comparison | Zinc/slate |
| 7 | **Rigor** | SRM catches + guardrail saves | Zinc/slate |
| 8 | **Fun Facts** | 2-3 memorable stats | Brand gradient |
| 9 | **Summary** | Quick stats grid (4-6 metrics) | Brand gradient |
| 10 | **Share Card** | Privacy-safe summary for screenshots | Holographic brand gradient |

### Slide Skip Logic
| Condition | Action |
|-----------|--------|
| `total === 0` | Show 'No completed experiments' single slide |
| `total < 3` | Show simplified 5-slide version |
| `topWinners.length === 0` | Skip slides 4, 8 |
| `topLosers.length === 0` | Skip slide 5 |
| `byTag` is empty | Skip any tag-related content |
| `srmIssues.length === 0` | Simplify slide 7 |

---

## Phase 3: React Component Architecture

### File Structure
Single-file React component with:
- Framer Motion for animations
- Tailwind CSS for styling
- Google Fonts import in `<style>` tag

### Core Components
```tsx
// Reusable slide wrapper
<SlideContainer gradient='from-purple-950 via-indigo-900 to-black'>
  {children}
</SlideContainer>

// Features:
// - Full viewport height with safe area padding (notch-friendly)
// - Vertical centering for hero content
// - Consistent padding: p-6 md:p-12
// - Glass card option for content containers
```

### Loading State
While data is fetching, display:
- Animated gradient background (subtle movement)
- Pulsing GrowthBook logo or circular spinner
- Text: 'Crunching your 2025 experiments...' with fade animation
- Optional: Fake progress bar (0→90% over 10s, pause until loaded)

### Navigation
- **Click/Tap:** Right half → next, Left half → previous
- **Keyboard:** Arrow keys (← →), Spacebar (next)
- **Swipe:** Support touch swipe gestures
- **Progress indicator:** Dot navigation at bottom (current slide highlighted)

### Animation Specs (Critical)

**Directional Awareness:**
```tsx
// Track direction for enter/exit animations
const [[page, direction], setPage] = useState([0, 0]);

// Variants
const variants = {
  enter: (dir) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir < 0 ? '100%' : '-100%', opacity: 0 }),
};
```

**Physics:**
```tsx
transition: { 
  type: 'spring', 
  stiffness: 300, 
  damping: 30 
}
```

**Staggered Entrance (per slide):**
1. `0ms` — Background/container fades in
2. `150ms` — Label slides up (`y: 20 → 0`)
3. `300ms` — Hero metric pops in (`scale: 0.8 → 1`, `opacity: 0 → 1`)
4. `450ms` — Supporting text/chart fades in
5. `600ms` — Any secondary elements

**Exit Strategy:**
- Use `mode='popLayout'` in `<AnimatePresence>`
- Outgoing slide exits while incoming enters (parallax crossfade)

### Accessibility
- `prefers-reduced-motion`: Disable spring animations, use simple fades
- Semantic HTML: Use `<section>` for slides, `<h1>` for hero metrics
- Screen reader: `aria-live='polite'` for slide changes

---

## Phase 4: The Share Card (Slide 10)

### Purpose
A screenshot-optimized slide users can share on social media.

### Design Specs
| Property | Value |
|----------|-------|
| Aspect ratio | 1:1 (square) |
| Ideal dimensions | 1080×1080px equivalent |
| Background | Holographic gradient: brand colors with subtle transparency |
| Padding | 48px safe margins |
| Contrast | High — white text on dark gradient |

### Content Rules

✅ **INCLUDE:**
- Total experiments completed
- Win rate (%)
- Learning rate (%) — `lost / total`
- Inconclusive rate (%)
- Total users reached
- Year: '2025'
- Footer: 'Powered by GrowthBook' with SVG logo

❌ **EXCLUDE (Privacy):**
- Experiment names
- Project names
- Hypothesis text
- Specific lift percentages
- Owner/user names
- Any identifiable business data

### Layout Suggestion
* This only suggests the arrangment of elements. Ensure spacing, whitespace, text hierarchy all meet best practices.
```
┌─────────────────────────────┐
│                             │
│      YOUR 2025 WRAPPED      │
│                             │
│             12              │
│         experiments         │
│                             │
│   60%    20%    20%         │
│   wins  learns  inconc.     │
│                             │
│      45,000 users           │
│                             │
│   ─────────────────────     │
│   Powered by [GB Logo]      │
└─────────────────────────────┘
```

### Logo Asset
```svg
<svg xmlns='http://www.w3.org/2000/svg' width='313' height='50' fill='none'><g fill-rule='evenodd' clip-path='url(#a)' clip-rule='evenodd'><path fill='#fff' d='M54.904 28.479c0 10.154 7.594 16.81 16.93 16.81 5.61 0 10.109-2.331 13.301-5.878V27.264H69.85v5.005h9.626v5.052c-1.45 1.36-4.353 2.915-7.642 2.915-6.385 0-11.125-4.956-11.125-11.758 0-6.802 4.74-11.708 11.125-11.708 1.637-.001 3.25.39 4.706 1.143a10.284 10.284 0 0 1 3.662 3.18l4.643-2.622c-2.612-3.742-6.723-6.754-13.011-6.754-9.336 0-16.93 6.608-16.93 16.762Zm34.531 16.178h5.079V28.673c1.016-1.651 3.87-3.109 5.998-3.109a7.47 7.47 0 0 1 1.596.146v-5.053c-3.048 0-5.853 1.749-7.594 3.984v-3.45h-5.079v23.466Zm25.875.584c7.497 0 12.043-5.588 12.043-12.34 0-6.706-4.546-12.293-12.043-12.293-7.401 0-11.996 5.587-11.996 12.292 0 6.753 4.595 12.34 11.996 12.34Zm0-4.518c-4.305 0-6.724-3.643-6.724-7.822 0-4.13 2.419-7.774 6.724-7.774 4.353 0 6.771 3.644 6.771 7.774 0 4.177-2.418 7.822-6.771 7.822Zm36.079 3.934h5.321l7.255-23.466h-5.272l-2.467 8.527-2.466 8.526-5.563-17.053h-4.45l-5.562 17.053-4.934-17.053h-5.273l7.255 23.466h5.322l5.417-17.198 5.417 17.198Zm21.664.584c2.37 0 3.869-.632 4.788-1.507l-1.209-3.839c-.387.438-1.306.826-2.273.826-1.452 0-2.225-1.165-2.225-2.768V25.66h4.74v-4.47h-4.74V14.78h-5.079v6.413h-3.869v4.47h3.869v13.554c0 3.887 2.08 6.024 5.998 6.024Zm22.779-.584h5.079V28.043c0-4.81-2.515-7.434-7.546-7.434-3.676 0-6.723 1.944-8.271 3.79V12.251h-5.078v32.405h5.078V28.285c1.21-1.603 3.435-3.158 5.998-3.158 2.854 0 4.74 1.117 4.74 4.761v14.77Zm10.347 0h16.301c6.045 0 9.383-3.741 9.383-8.745 0-3.983-2.806-7.433-6.24-7.967 2.999-.632 5.611-3.352 5.611-7.434 0-4.567-3.289-8.26-9.189-8.26h-15.866v32.407Zm5.659-18.996v-8.405h9.046c2.901 0 4.547 1.798 4.547 4.226 0 2.429-1.646 4.178-4.547 4.178l-9.046.001Zm0 13.992v-8.988h9.286c3.241 0 4.934 2.04 4.934 4.47 0 2.818-1.838 4.518-4.934 4.518h-9.286Zm34.627 5.587c7.498 0 12.045-5.587 12.045-12.34 0-6.704-4.547-12.291-12.045-12.291-7.4 0-11.997 5.586-11.997 12.291 0 6.753 4.597 12.34 11.997 12.34Zm0-4.517c-4.304 0-6.723-3.643-6.723-7.822 0-4.13 2.419-7.774 6.723-7.774 4.355 0 6.772 3.644 6.772 7.774 0 4.177-2.417 7.822-6.772 7.822Zm26.261 4.517c7.498 0 12.045-5.587 12.045-12.34 0-6.704-4.547-12.291-12.045-12.291-7.401 0-11.995 5.586-11.995 12.291 0 6.753 4.594 12.34 11.995 12.34Zm0-4.517c-4.305 0-6.724-3.643-6.724-7.822 0-4.13 2.419-7.774 6.724-7.774 4.354 0 6.771 3.644 6.771 7.774 0 4.177-2.417 7.822-6.771 7.822Zm31.194 3.934h6.384l-9.915-12.826 9.723-10.64h-6.287l-10.304 11.32v-20.26h-5.079v32.407h5.079v-6.316l3.24-3.352 7.159 9.667Z'/><path fill='#06B8F4' d='M16.26 17.4 46.626.242s-2.863 2.53-2.737 8.004c.134 5.835 2.737 8.004 2.737 8.004l-3.568-1.633-27.933 10.982s-.678-1.908-.69-3.346c-.028-3.549 1.825-4.851 1.825-4.851Z'/><path fill='#2076FF' d='M9.8 28.619 42.978 16.43s-2.862 2.529-2.736 8.004c.134 5.834 2.736 8.004 2.736 8.004l-4.634-1.792-29.779 5.887s-.577-1.76-.588-3.064c-.028-3.55 1.825-4.851 1.825-4.851Z'/><path fill='#7B45EA' d='m3.346 38.503 35.004-6.307s-2.863 2.53-2.737 8.004c.135 5.835 2.737 8.004 2.737 8.004H3.607s-2.055-1.254-2.086-5.032c-.029-3.55 1.825-4.67 1.825-4.67Z'/></g><defs><clipPath id='a'><path fill='#fff' d='M0 .012h312.5v49.883H0z'/></clipPath></defs></svg>
```

---

## Phase 5: Date & Number Formatting

### Dates
| Context | Format | Example |
|---------|--------|---------|
| Monthly trends | `'MMMM yyyy'` | 'December 2025' |
| Specific dates | `'MMM d, yyyy'` | 'Dec 11, 2025' |

Use `Intl.DateTimeFormat('en-US', options)` for consistency.

### Numbers
| Type | Format | Example |
|------|--------|---------|
| Percentages | 0 decimal places | '60%' |
| Users (large) | Abbreviated with suffix | '45K' or '1.2M' |
| Users (small) | Comma-separated | '8,500' |
| Lift | 1 decimal + sign | '+26.1%' |
| Days | Integer | '23 days' |

---

## Final Checklist

Before outputting the component, verify:

- [ ] All 10 slides render (or appropriate subset based on data)
- [ ] Slide navigation works (click, keyboard, swipe)
- [ ] Animations are smooth and directional
- [ ] Loading state displays during data fetch
- [ ] Edge cases handled (empty tags, single project, no winners)
- [ ] Share card contains NO private data
- [ ] GrowthBook logo renders correctly on dark background
- [ ] Fonts load from Google Fonts
- [ ] Mobile responsive (test at 375px width)
- [ ] `prefers-reduced-motion` respected