/**
 * CCNA LAB — Interactive App Logic & Motion Controller
 * Synthesizing emil-design-eng, portfolio-ui-workflow, and motion best practices.
 */

document.addEventListener("DOMContentLoaded", () => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ==========================================================================
     1. SITE HEADER SCROLL OBSERVER
     ========================================================================== */
  const siteHeader = document.getElementById("siteHeader");
  if (siteHeader) {
    const handleScroll = () => {
      if (window.scrollY > 16) {
        siteHeader.classList.add("is-scrolled");
      } else {
        siteHeader.classList.remove("is-scrolled");
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
  }

  /* ==========================================================================
     2. HERO LIVE INTERACTIVE DRILL PREVIEW
     ========================================================================== */
  const previewOptions = document.querySelectorAll(".preview-opt");
  const previewCheckBtn = document.getElementById("previewCheckBtn");
  const previewResetBtn = document.getElementById("previewResetBtn");
  const previewFeedback = document.getElementById("previewFeedback");
  const previewStatus = document.getElementById("previewStatus");
  const exhibitToggle = document.getElementById("exhibitToggle");
  const exhibitDetails = document.getElementById("exhibitDetails");

  let selectedOpt = null;
  let isChecked = false;

  // Exhibit Accordion Toggle
  if (exhibitToggle && exhibitDetails) {
    exhibitToggle.addEventListener("click", () => {
      const isExpanded = exhibitToggle.getAttribute("aria-expanded") === "true";
      exhibitToggle.setAttribute("aria-expanded", String(!isExpanded));
      exhibitDetails.hidden = isExpanded;
    });
  }

  // Answer Option Selection
  previewOptions.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isChecked) return; // Locked once checked
      const opt = btn.dataset.opt;
      selectOption(opt);
    });
  });

  function selectOption(opt) {
    selectedOpt = opt;
    previewOptions.forEach((b) => {
      const isThis = b.dataset.opt === opt;
      b.classList.toggle("is-selected", isThis);
      b.setAttribute("aria-checked", String(isThis));
    });

    previewCheckBtn.disabled = false;
    previewResetBtn.disabled = false;
    previewStatus.textContent = `Selected: Option ${opt}`;
    previewStatus.style.color = "var(--primary-light)";
  }

  // Check Answer Handler
  if (previewCheckBtn) {
    previewCheckBtn.addEventListener("click", () => {
      if (!selectedOpt || isChecked) return;
      isChecked = true;

      const selectedButton = document.querySelector(`.preview-opt[data-opt="${selectedOpt}"]`);
      const isCorrect = selectedButton && selectedButton.dataset.correct === "true";

      previewOptions.forEach((b) => {
        if (b.dataset.correct === "true") {
          b.classList.add("is-correct");
        } else if (b.dataset.opt === selectedOpt && !isCorrect) {
          b.classList.add("is-wrong");
        }
      });

      // Show Verified Cisco Explanation
      previewFeedback.hidden = false;
      if (isCorrect) {
        previewFeedback.className = "preview-feedback is-correct";
        previewFeedback.innerHTML = `
          <strong>✓ Route Verified Correct (Option D).</strong><br>
          <em>Topic 14.4.9 Explanation:</em> The destination <code>2001:db8:cafe:5::1</code> does not match the more specific <code>/64</code> subnets (cafe:1, cafe:2, cafe:3). Router R1 matches the default route <code>::/0</code> and immediately forwards the packet out <code>Serial0/0/0</code>.
        `;
        previewStatus.textContent = "Route verified: Correct";
        previewStatus.style.color = "var(--success)";
      } else {
        previewFeedback.className = "preview-feedback is-wrong";
        previewFeedback.innerHTML = `
          <strong>✗ Route Rejected: Incorrect Interface.</strong><br>
          <em>Analysis:</em> The packet will not exit ${selectedButton ? selectedButton.querySelector(".opt-copy").textContent : "this port"}. Because no specific <code>2001:db8:cafe:5::/64</code> route exists, Router R1 falls back to the default static route <code>::/0 via Serial0/0/0</code>.
        `;
        previewStatus.textContent = "Route rejected: Incorrect";
        previewStatus.style.color = "var(--danger)";
      }

      previewCheckBtn.disabled = true;
    });
  }

  // Reset Handler
  if (previewResetBtn) {
    previewResetBtn.addEventListener("click", resetPreview);
  }

  function resetPreview() {
    selectedOpt = null;
    isChecked = false;

    previewOptions.forEach((b) => {
      b.classList.remove("is-selected", "is-correct", "is-wrong");
      b.setAttribute("aria-checked", "false");
    });

    if (previewFeedback) {
      previewFeedback.hidden = true;
      previewFeedback.innerHTML = "";
    }

    if (previewStatus) {
      previewStatus.textContent = "Awaiting selection";
      previewStatus.style.color = "var(--text-faint)";
    }

    if (previewCheckBtn) previewCheckBtn.disabled = true;
    if (previewResetBtn) previewResetBtn.disabled = true;
  }

  // Keyboard Shortcuts for Drill Preview
  document.addEventListener("keydown", (e) => {
    // Only intercept when not focused on an input/textarea
    const activeTag = document.activeElement ? document.activeElement.tagName : "";
    if (["INPUT", "TEXTAREA", "SELECT"].includes(activeTag)) return;

    if (["1", "2", "3", "4"].includes(e.key) && !isChecked) {
      const idx = parseInt(e.key, 10) - 1;
      const optKeys = ["A", "B", "C", "D"];
      if (optKeys[idx]) {
        selectOption(optKeys[idx]);
      }
    } else if (e.key === "Enter" && selectedOpt && !isChecked) {
      e.preventDefault();
      if (previewCheckBtn) previewCheckBtn.click();
    } else if (e.key === "Escape" && (selectedOpt || isChecked)) {
      resetPreview();
    }
  });


  /* ==========================================================================
     3. INTERACTIVE SYLLABUS DOMAIN EXPLORER
     ========================================================================== */
  const domainTabs = document.querySelectorAll(".domain-tab");
  const detailKicker = document.getElementById("detailKicker");
  const detailTitle = document.getElementById("detailTitle");
  const detailDesc = document.getElementById("detailDesc");
  const detailExhibits = document.getElementById("detailExhibits");
  const detailCommands = document.getElementById("detailCommands");
  const detailTraps = document.getElementById("detailTraps");
  const detailCount = document.getElementById("detailCount");
  const detailDrillLink = document.getElementById("detailDrillLink");

  const domainData = {
    switching: {
      kicker: "TOPICS 1–4 • CORE SWITCHING",
      title: "VLANs, Trunking & Inter-VLAN Routing",
      desc: "Master switchport access and 802.1Q trunking behavior, dynamic trunking protocol (DTP) states, native VLAN mismatch security vulnerabilities, and legacy router-on-a-stick vs. Layer 3 SVI routing architectures.",
      exhibits: "Switchport config, MAC tables, DTP negotiation",
      commands: "show interfaces trunk, show vlan brief",
      traps: "Native VLAN frame tags, allowed VLAN lists",
      count: "48 Verified Records",
      linkText: "Start Topics 1–4 Drill"
    },
    redundancy: {
      kicker: "TOPICS 5–9 • LAN REDUNDANCY & SECURITY",
      title: "STP (802.1D/w), EtherChannel & FHRP (HSRP)",
      desc: "Analyse Spanning Tree Bridge Protocol Data Units (BPDUs), Root Bridge election ties, port roles (Root, Designated, Alternate), LACP/PAgP bundling parameters, and HSRP virtual gateway failover states.",
      exhibits: "STP port roles, EtherChannel flags, HSRP priority",
      commands: "show spanning-tree, show etherchannel summary",
      traps: "Forward Delay timers, mismatched channel-group modes",
      count: "38 Verified Records",
      linkText: "Start Topics 5–9 Drill"
    },
    routing: {
      kicker: "TOPICS 10–14 • DYNAMIC ROUTING & IP SERVICES",
      title: "Static Routes, OSPFv2 Single-Area & DHCPv4/SLAAC",
      desc: "Calculate metric costs, verify point-to-point and broadcast OSPF neighbor adjacencies, troubleshoot Dead/Hello timer mismatches, configure DHCP pools, and inspect IPv6 global unicast auto-configuration.",
      exhibits: "show ip route, OSPF LSAs, DHCP binding tables",
      commands: "show ip ospf neighbor, show ip route ospf",
      traps: "Subnet mask mismatches, passive-interface blocks",
      count: "62 Verified Records",
      linkText: "Start Topics 10–14 Drill"
    },
    wireless: {
      kicker: "TOPICS 15–16 • WLAN ARCHITECTURE & SECURITY",
      title: "WLC Management, 802.11 Protocols & Endpoint Defense",
      desc: "Inspect Wireless LAN Controller (WLC) GUI topologies, lightweight AP CAPWAP tunnels, WPA2/WPA3 Enterprise authentication with 802.1X RADIUS, and switchport security defenses (Port Security, DHCP Snooping, DAI).",
      exhibits: "WLC WLAN summaries, Port-security violations, DAI logs",
      commands: "show port-security, show ip dhcp snooping binding",
      traps: "Sticky MAC aging limits, untrusted DHCP ports",
      count: "24 Verified Records",
      linkText: "Start Topics 15–16 Drill"
    }
  };

  domainTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const domainKey = tab.dataset.domain;
      if (!domainData[domainKey]) return;

      // Update active tab state
      domainTabs.forEach((t) => {
        const isCurrent = t === tab;
        t.classList.toggle("is-active", isCurrent);
        t.setAttribute("aria-selected", String(isCurrent));
      });

      // Update detail card content smoothly
      const data = domainData[domainKey];
      if (detailKicker) detailKicker.textContent = data.kicker;
      if (detailTitle) detailTitle.textContent = data.title;
      if (detailDesc) detailDesc.textContent = data.desc;
      if (detailExhibits) detailExhibits.textContent = data.exhibits;
      if (detailCommands) detailCommands.textContent = data.commands;
      if (detailTraps) detailTraps.textContent = data.traps;
      if (detailCount) detailCount.textContent = data.count;
      if (detailDrillLink) {
        detailDrillLink.querySelector("span").textContent = data.linkText;
      }
    });
  });


  /* ==========================================================================
     4. STAGGERED ENTRANCE REVEAL SYSTEM
     ========================================================================== */
  if (!prefersReducedMotion && "IntersectionObserver" in window) {
    const revealElements = document.querySelectorAll(
      ".workflow-card, .domain-tab, .domain-detail-card, .arch-card, .finale-box"
    );

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.05,
        rootMargin: "0px 0px 100px 0px"
      }
    );

    revealElements.forEach((el, index) => {
      el.classList.add("reveal-item");
      el.style.setProperty("--reveal-delay", `${(index % 4) * 80}ms`);
      observer.observe(el);
    });
  }
});
