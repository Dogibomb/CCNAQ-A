# UI / Motion Toolbox

This file is a reference and decision guide.

Do not install or use a library merely because it appears here.

## Motion

Primary animation solution for normal React / UI work.

Use for:
- entrances and exits
- hover and tap states
- viewport reveals
- layout transitions
- scroll progress
- small spatial transitions

Prefer this for most UI animation.

## Fancy Components

Repository:
https://github.com/danielpetho/fancy

Documentation:
https://fancycomponents.dev

Animated React components and microinteraction patterns.

Use for:
- interaction inspiration
- polished microinteractions
- unusual but useful animated components

Inspect and adapt patterns rather than assembling pages from showcase components.

## React Bits

Repository:
https://github.com/DavidHDev/react-bits

Large catalog of React animation, text, image, background, and interaction effects.

Use selectively as:
- interaction reference
- animation implementation reference
- source for unusual visual treatments

Avoid flashy effects that compete with the content or make a commercial site feel like a demo page.

## GSAP

Repository:
https://github.com/greensock/GSAP

Use for advanced animation problems such as:
- complex timelines
- ScrollTrigger sequences
- pinned storytelling
- tightly synchronized multi-element motion
- advanced SVG or canvas animation

Do not use GSAP for ordinary button, hover, or reveal animation when Motion or CSS is sufficient.

## Lenis

Repository:
https://github.com/darkroomengineering/lenis

Smooth scrolling and scroll synchronization library.

Useful for:
- deliberately smoothed scrolling
- synchronized scroll animation
- advanced GSAP / WebGL experiences

Do not add it simply to make a site feel "premium".

Native scrolling is preferable unless the design clearly benefits from smoothing.

Respect reduced-motion preferences.

## Vanta

Repository:
https://github.com/tengbao/vanta

WebGL animated background effects.

Use rarely.

Appropriate only when an ambient animated background is part of the actual art direction.

Normally avoid for practical commercial sites.

## 21st.dev

Use for human-designed React component and layout references.

Prefer it for:
- discovering composition patterns
- studying interaction ideas
- finding implementation starting points

Do not let its showcase aesthetic determine the identity of the project.

## Kokonut UI

Configured through the project's component registry.

Use selectively for distinctive UI patterns that fit the chosen direction.

Adapt styling and behavior to the project.

## Selection Principle

Choose the simplest tool that solves the visual problem well:

CSS
→ Motion
→ Fancy / React Bits
→ GSAP
→ WebGL / Vanta

More complex does not mean better.

The design direction always comes before the library.
