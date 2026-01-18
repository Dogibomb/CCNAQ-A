let questions = [];
let current = null;
let selected = new Set();
let checked = false;

fetch("../ccna.json")
  .then(r => r.json())
  .then(data => {
    questions = data;
    loadQuestion();
  });

function isMultiCorrect(question) {
  return question.answers.filter(a => a.correct).length > 1;
}


function loadQuestion() {
  checked = false;
  selected.clear();

  current = questions[Math.floor(Math.random() * questions.length)];
  document.getElementById("question").textContent = current.question;

  const answersEl = document.getElementById("answers");
  answersEl.innerHTML = "";

  const multi = isMultiCorrect(current);

  current.answers.forEach((a, i) => {
    const btn = document.createElement("button");
    btn.textContent = a.text;

    btn.onclick = () => {
      if (checked) return;

      if (!multi) {
        // single choice → zruš ostatní
        selected.clear();
        document
          .querySelectorAll("#answers button")
          .forEach(b => b.classList.remove("selected"));
      }

      btn.classList.toggle("selected");
      selected.has(i) ? selected.delete(i) : selected.add(i);
    };

    answersEl.appendChild(btn);
  });
}

document.getElementById("check").onclick = () => {
  if (checked) return;
  checked = true;

  document.querySelectorAll("#answers button").forEach((btn, i) => {
    const correct = current.answers[i].correct;
    const isSelected = selected.has(i);

    if (correct && isSelected) btn.classList.add("correct");
    else if (!correct && isSelected) btn.classList.add("wrong");
    else if (correct && !isSelected) btn.classList.add("missed");

    btn.disabled = true;
  });
};

document.getElementById("next").onclick = loadQuestion;
