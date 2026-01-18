fetch("ccna.json")
  .then(res => res.json())
  .then(data => buildTable(data));

function buildTable(questions) {
  const tbody = document.querySelector("#questionsTable tbody");
  tbody.innerHTML = "";

  questions.forEach((q, index) => {
    const answersHTML = buildAnswersList(q.answers);

    const correctHTML = q.answers
      .filter(a => a.correct)
      .map(a => `<li>${a.text}</li>`)
      .join("");

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${q.question}</td>
      <td>${answersHTML}</td>
      <td>
        <button class="reveal-btn">Reveal</button>
        <ol class="correct-list hidden">
          ${correctHTML}
        </ol>
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
}

function buildAnswersList(answers) {
  return `
    <ol class="answers-list">
      ${answers.map(a => `<li>${a.text}</li>`).join("")}
    </ol>
  `;
}
