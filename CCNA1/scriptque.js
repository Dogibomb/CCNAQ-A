fetch("ccna.json")
  .then(res => res.json())
  .then(data => buildTable(data));

function buildTable(questions) {
  const tbody = document.querySelector("#questionsTable tbody");
  tbody.innerHTML = "";

  questions.forEach((q) => {

    // IMAGE (klikací)
    const imageHTML = q.img_url
      ? `
        <br>
        <img 
          src="${q.img_url}" 
          class="question-img clickable-img"
          alt="Question Image"
        >
      `
      : "";

    const answersHTML = buildAnswersList(q.answers);

    // správné odpovědi + čísla
    const correctHTML = q.answers
      .map((a, i) => a.correct
        ? `<li><strong>${i + 1}.</strong> ${a.text}</li>`
        : null
      )
      .filter(Boolean)
      .join("");

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        ${q.question}
        ${imageHTML}
      </td>

      <td>${answersHTML}</td>

      <td>
        <button class="reveal-btn">Reveal</button>
        <ul class="correct-list hidden">
          ${correctHTML}
        </ul>
      </td>
    `;

    const button = tr.querySelector(".reveal-btn");
    const correctList = tr.querySelector(".correct-list");

    button.addEventListener("click", () => {
      correctList.classList.remove("hidden");
      button.disabled = true;
      button.textContent = "Revealed";
      button.classList.add("revealed");
    });

    tbody.appendChild(tr);
  });

  enableImageZoom();
}

function buildAnswersList(answers) {
  return `
    <ol class="answers-list">
      ${answers.map(a => `<li>${a.text}</li>`).join("")}
    </ol>
  `;
}

/* =========================
   IMAGE ZOOM SYSTEM
========================= */

function enableImageZoom() {

  // vytvoří overlay jen jednou
  let overlay = document.querySelector(".image-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "image-overlay hidden";
    overlay.innerHTML = `<img class="overlay-img">`;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", () => {
      overlay.classList.add("hidden");
    });
  }

  const overlayImg = overlay.querySelector(".overlay-img");

  document.querySelectorAll(".clickable-img").forEach(img => {
    img.addEventListener("click", () => {
      overlayImg.src = img.src;
      overlay.classList.remove("hidden");
    });
  });
}