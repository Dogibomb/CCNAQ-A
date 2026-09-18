(() => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function injectAmbientNetwork() {
    const ambient = document.createElement("div");
    ambient.className = "ambient-network";
    ambient.setAttribute("aria-hidden", "true");

    const packetMarkup = prefersReducedMotion
      ? ""
      : `
        <circle class="packet-dot" r="2.4">
          <animateMotion dur="14s" repeatCount="indefinite" path="M90 230 L310 140 L535 250 L780 155 L1040 260 L1320 170" />
        </circle>
        <circle class="packet-dot" r="1.9" opacity=".7">
          <animateMotion dur="18s" begin="-7s" repeatCount="indefinite" path="M160 690 L390 560 L665 685 L930 555 L1250 690" />
        </circle>`;

    ambient.innerHTML = `
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" role="presentation">
        <path class="network-line" d="M90 230 L310 140 L535 250 L780 155 L1040 260 L1320 170" />
        <path class="network-line" d="M160 690 L390 560 L665 685 L930 555 L1250 690" />
        <path class="network-line" d="M310 140 L390 560" />
        <path class="network-line" d="M535 250 L665 685" />
        <path class="network-line" d="M780 155 L930 555" />
        <path class="network-line" d="M1040 260 L1250 690" />
        <circle class="network-node" cx="90" cy="230" r="3" />
        <circle class="network-node" cx="310" cy="140" r="4" />
        <circle class="network-node" cx="535" cy="250" r="3" />
        <circle class="network-node" cx="780" cy="155" r="4" />
        <circle class="network-node" cx="1040" cy="260" r="3" />
        <circle class="network-node" cx="1320" cy="170" r="4" />
        <circle class="network-node" cx="160" cy="690" r="4" />
        <circle class="network-node" cx="390" cy="560" r="3" />
        <circle class="network-node" cx="665" cy="685" r="4" />
        <circle class="network-node" cx="930" cy="555" r="3" />
        <circle class="network-node" cx="1250" cy="690" r="4" />
        ${packetMarkup}
      </svg>`;

    document.body.prepend(ambient);
  }

  function initPointerLight() {
    if (window.matchMedia("(pointer: coarse)").matches || prefersReducedMotion) return;

    let frame = null;
    let nextX = window.innerWidth * 0.5;
    let nextY = window.innerHeight * 0.35;

    window.addEventListener("pointermove", (event) => {
      nextX = event.clientX;
      nextY = event.clientY;
      if (frame) return;

      frame = requestAnimationFrame(() => {
        document.documentElement.style.setProperty("--mouse-x", `${nextX}px`);
        document.documentElement.style.setProperty("--mouse-y", `${nextY}px`);
        frame = null;
      });
    }, { passive: true });
  }

  function initNavbar() {
    const navbar = document.querySelector(".navbar");
    if (!navbar) return;

    const update = () => navbar.classList.toggle("is-scrolled", window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  injectAmbientNetwork();
  initPointerLight();
  initNavbar();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.body.classList.add("page-ready"));
  });
})();
