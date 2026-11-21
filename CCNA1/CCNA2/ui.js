(() => {
  function initNavbar() {
    const navbar = document.querySelector(".navbar");
    if (!navbar) return;

    const update = () => navbar.classList.toggle("is-scrolled", window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  initNavbar();
  document.body.classList.add("page-ready");
})();
