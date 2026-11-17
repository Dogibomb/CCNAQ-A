---
name: portfolio-ui-workflow
description: Design, redesign, prototype, implement, or significantly modify the UI and interaction architecture. Use for substantial visual or interaction changes, not routine content edits or isolated bug fixes.
---

# Portfolio UI workflow

Follow all project-wide rules in `AGENTS.md`, especially the design originality,
accessibility, privacy, copyright, truthful-content, and QA requirements.

## 1. Inspect before designing

Inspect the relevant pages, components, styles, content, tests, project brief, and existing design decisions before changing the UI.

Identify:
- the actual user goal
- the business/content problem
- existing intentional visual decisions
- reusable assets
- technical constraints

Evaluate existing tokens and design system variables against the actual product rather than treating them as an unchangeable direction.

## 2. Prefer browser-first design exploration

For website and interaction design, prefer building and evaluating real prototypes in the browser instead of treating static Figma frames as the default source of truth.

For substantial new UI:
- explore multiple genuinely different directions when the direction is uncertain
- use the `prototype` skill when useful to compare variants
- inspect the result at real desktop and mobile viewport sizes
- evaluate the page while scrolling, not only from screenshots
- include realistic imagery/content weight as early as practical
- iterate on composition before expanding the design to many routes

Do not spend significant time polishing a full page system before the core homepage / hero / navigation direction is convincing.

Figma remains useful for:
- research
- moodboards
- information architecture
- focused visual exploration
- reviewing supplied design files
- case-study artifacts
- situations where the user explicitly requests Figma-first work

Do not default to Figma-first simply because Figma tools are connected.

## 3. Use design guidance deliberately

Use `impeccable` for critique, layout review, visual hierarchy, generic-AI pattern detection, polish, and design auditing.

Use `emil-design-eng` when relevant for design-engineering judgment, interaction quality, typography, spacing, and motion decisions.

When `ui-ux-pro-max` is available, use it as an additional research and reasoning layer for:
- design-system direction
- typography
- color systems
- UX patterns
- industry-specific recommendations
- accessibility and anti-pattern checks

Treat its output as guidance, not as an automatic design direction.

Use specialized design-engineering skills when they apply instead of relying only on generic model taste.

Do not treat any one skill, component library, design system, or reference site as the design direction.

Reference sites should be analyzed for concrete principles such as:
- composition
- hierarchy
- image usage
- rhythm
- density
- interaction
- conversion timing

Do not copy recognizable arrangements or signature visual devices.

## 4. Read the UI and motion toolbox

Before substantial interaction, animation, or visual implementation work, read:

`references/ui-motion-toolbox.md`

Use it as a decision guide for available libraries, repositories, interaction references, and animation techniques.

Do not install every referenced library.

Choose a dependency only when:
- it solves a concrete design or interaction problem
- the simpler existing tool cannot solve it cleanly
- its accessibility and performance implications are understood

Prefer the simplest appropriate implementation.

Typical escalation:

CSS
→ Motion
→ Fancy / React Bits pattern
→ GSAP
→ WebGL / Vanta

Do not escalate merely because a more elaborate effect exists.

## 5. Components are ingredients, not layouts

Prefer shadcn/ui for standard accessible primitives.

Use 21st.dev, Kokonut UI, and other configured registries when an existing human-designed implementation genuinely helps the chosen design.

Search component libraries for:
- implementation ideas
- interaction patterns
- structural references
- reusable primitives

Do not:
- pick a component first and design the page around it
- assemble a homepage from unrelated showcase components
- use animation/effects merely because a library provides them
- assume a component's default styling belongs in this project

Adapt typography, spacing, color, layout, imagery, borders, and behavior so the final result belongs to the project.

## 6. Motion is part of the design

Plan interaction and motion while evaluating the real browser experience.

For significant motion work:

1. Use `find-animation-opportunities` when useful to identify where motion would improve the experience.
2. Use `animate`, `motion`, or the most appropriate implementation tool to build the interaction.
3. Inspect the animation in the actual browser.
4. Use `improve-animations` when the result feels mechanically correct but visually weak.
5. Use `review-animations` for a final motion-specific review.

Use motion purposefully for:
- hierarchy
- spatial continuity
- state changes
- navigation
- revealing important media
- guiding attention
- connecting sections during scroll
- improving perceived responsiveness

Avoid:
- animation on every element
- gratuitous parallax
- pointer-following glow
- mouse repulsion
- custom cursors
- decorative particle systems
- constant background motion
- effects that reduce readability
- motion used to disguise weak composition
- long blocking intro sequences

Respect `prefers-reduced-motion`.

Do not assume smooth scrolling is automatically better.
Use Lenis only when the resulting experience benefits from it.

Use GSAP only when advanced timelines or scroll choreography genuinely require it.

## 7. Implementation & Dependency Discipline

Keep dependencies intentional and inspect their implementation, maintenance state, licensing, bundle implications, and accessibility before adoption.

When using external open-source UI or motion code:
- verify its license
- understand what code is being copied or installed
- adapt it to this project's design system
- avoid unnecessary dependency duplication

## 8. Evaluate visually before expanding scope

After creating an important visual direction:

- open it in the browser
- inspect desktop
- inspect mobile
- scroll through the experience
- check typography and image crops
- inspect interaction states
- inspect motion timing and choreography
- check browser console/runtime errors
- critique the actual rendered result

Do not judge quality only from source code.

If the core direction is weak, revise it before building additional pages.

Do not multiply a mediocre visual system across the project.

## 9. QA

After significant UI changes:

- run automated tests when available (`npm run test:e2e` / Playwright)
- add targeted tests when useful
- verify keyboard navigation
- verify visible focus states
- check responsive layouts (desktop, tablet, mobile)
- check reduced motion
- check console/runtime errors
- verify links and primary flows
- verify animations do not break interaction
- verify no horizontal overflow
- verify mobile touch behavior where relevant

Fix issues found and rerun affected checks before considering the work complete.

Use the project's `components.json`, existing scripts, and established architecture.

Keep design exploration, dependencies, and implementation within the scope of the user's request.
