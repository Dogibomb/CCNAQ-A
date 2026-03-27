let questions = [];
let current = null;
let selected = new Set();
let checked = false;

fetch("ccna.json")
  .then(r => r.json())
  .then(data => {
    questions = data;
    loadQuestion();
  });

function loadQuestion() {
  checked = false;
  selected.clear();

  // Náhodná otázka
  current = questions[Math.floor(Math.random() * questions.length)];

  document.getElementById("question").textContent = current.question;

  const imgEl = document.getElementById("questionImage");
  if (current.image_url) {
    imgEl.src = current.image_url;
    imgEl.style.display = "block";
  } else {
    imgEl.style.display = "none";
  }

  const answersEl = document.getElementById("answers");
  answersEl.innerHTML = "";

  // Zjistíme, kolik odpovědí má uživatel vybrat
  const maxAllowed = Array.isArray(current.correct_answer) ? current.correct_answer.length : 1;

  current.options.forEach((optText) => {
    const btn = document.createElement("button");
    btn.textContent = optText;

    btn.onclick = () => {
      if (checked) return;

      if (selected.has(optText)) {
        // Pokud už je vybraná, zrušíme výběr
        selected.delete(optText);
        btn.classList.remove("selected");
      } else {
        // Pokud chceme vybrat novou, zkontrolujeme limit
        if (selected.size < maxAllowed) {
          selected.add(optText);
          btn.classList.add("selected");
        } else {
          // Pokud je limit (např. 1) a klikneš na jinou, prohodíme je (user-friendly chování)
          if (maxAllowed === 1) {
            selected.clear();
            document.querySelectorAll("#answers button").forEach(b => b.classList.remove("selected"));
            selected.add(optText);
            btn.classList.add("selected");
          } else {
            alert(`Můžete vybrat maximálně ${maxAllowed} odpovědi.`);
          }
        }
      }
    };
    answersEl.appendChild(btn);
  });
}

document.getElementById("check").onclick = () => {
  const correctList = Array.isArray(current.correct_answer) ? current.correct_answer : [current.correct_answer];
  
  if (checked || selected.size === 0) return;

  // Kontrola, zda uživatel vybral správný počet
  if (selected.size !== correctList.length) {
    alert(`Musíte vybrat přesně ${correctList.length} odpovědi.`);
    return;
  }

  checked = true;

  document.querySelectorAll("#answers button").forEach((btn) => {
    const btnText = btn.textContent;
    const isCorrect = correctList.includes(btnText);
    const isSelected = selected.has(btnText);

    if (isCorrect) {
      btn.classList.add("correct");
    } else if (isSelected && !isCorrect) {
      btn.classList.add("wrong");
    }
    btn.disabled = true;
  });
};

document.getElementById("next").onclick = loadQuestion;