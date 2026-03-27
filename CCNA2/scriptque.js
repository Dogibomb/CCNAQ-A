fetch("ccna.json")
  .then(res => res.json())
  .then(data => buildTable(data));

function buildTable(questions) {
  const tbody = document.querySelector("#questionsTable tbody");
  tbody.innerHTML = "";

  questions.forEach((q) => {
    // Příprava obrázku
    const imageHTML = q.image_url 
      ? `<br><img src="${q.image_url}" class="question-img clickable-img" style="max-width:200px; cursor:pointer; margin-top:10px; border: 1px solid #444;">` 
      : "";

    // Seznam všech možností
    const optionsHTML = `<ol class="answers-list">${q.options.map(opt => `<li>${opt}</li>`).join("")}</ol>`;

    // Formátování správných odpovědí (pole -> text pod sebou)
    const correctAnswersText = Array.isArray(q.correct_answer) 
      ? q.correct_answer.join("<br>—<br>") 
      : q.correct_answer;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="margin-bottom:10px; font-weight: bold;">${q.question}</div>
        ${imageHTML}
      </td>
      <td>${optionsHTML}</td>
      <td>
        <button class="reveal-btn">Reveal</button>
        <div class="correct-box hidden" style="margin-top:10px; color: #2ecc71; font-weight: bold; background: #1a2a1a; padding: 10px; border-radius: 5px; border-left: 4px solid #2ecc71;">
          ${correctAnswersText}
          ${q.explanation ? `<hr style="border: 0; border-top: 1px solid #333; margin: 10px 0;"><small style="color: #bbb; font-weight: normal; display: block;">${q.explanation}</small>` : ""}
        </div>
      </td>
    `;

    // Reveal logika
    const button = tr.querySelector(".reveal-btn");
    const correctBox = tr.querySelector(".correct-box");

    button.addEventListener("click", () => {
      correctBox.classList.remove("hidden");
      button.textContent = "Revealed";
      button.disabled = true;
      button.style.opacity = "0.5";
    });

    tbody.appendChild(tr);
  });

  enableImageZoom();
}

// Funkce pro zvětšování obrázků po kliknutí
function enableImageZoom() {
  let overlay = document.querySelector(".image-overlay");
  
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "image-overlay hidden";
    // Inline styly pro overlay
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      background: 'rgba(0,0,0,0.9)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '1000',
      cursor: 'pointer'
    });
    
    overlay.innerHTML = `<img class="overlay-img" style="max-width:90%; max-height:90%; border: 2px solid #3498db; box-shadow: 0 0 20px rgba(0,0,0,0.5);">`;
    document.body.appendChild(overlay);
    
    overlay.onclick = () => {
      overlay.style.display = "none";
      overlay.classList.add("hidden");
    };
  }

  const overlayImg = overlay.querySelector(".overlay-img");
  
  document.querySelectorAll(".clickable-img").forEach(img => {
    img.onclick = () => {
      overlayImg.src = img.src;
      overlay.style.display = "flex";
      overlay.classList.remove("hidden");
    };
  });
}