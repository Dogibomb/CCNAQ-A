# Agent Instructions & Design Quality

Follow the `portfolio-ui-workflow` skill in `.agents/skills/portfolio-ui-workflow/` and read `references/ui-motion-toolbox.md` before adding UI or animation dependencies.

## Design Quality, Originality, Accessibility, and Trust
The UI must feel intentionally designed by a human, not generated from a generic AI landing-page template.

### Avoid Generic AI-Design Patterns
- Do not use harsh gradients, rainbow color schemes, neon saturation, or generic purple-on-black aesthetics.
- Do not use radial glowing orbs, decorative dot grids, sparkle icons, liquid-glass everywhere, or excessive drop shadows.
- Avoid repetitive rows of exactly three feature cards and generic bento grids unless justified.
- Never invent testimonials, fake reviews, fake client names, or exaggerated metrics.
- Never add mouse-following glows, custom cursors, magnetic buttons, or pointer-repulsion effects.

### Things Allowed When Justified
- Subtle, purposeful microinteractions and state feedback.
- Restrained Lucide icons (do not decorate every label with an icon).
- Controlled elevation/shadows to establish depth and hierarchy.

### Accessibility & QA Checklist
- Verify contrast ratios, keyboard navigation, and visible focus rings.
- Respect `prefers-reduced-motion` across all animated components.
- Inspect responsive layouts across realistic desktop, tablet, and mobile viewports.
- Ensure no console or runtime errors remain after changes.
