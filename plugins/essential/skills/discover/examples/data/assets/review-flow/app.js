// folds every alike thread into the first one of its group, in place.
const threads = document.getElementById("threads");
const count = document.getElementById("count");
const hint = document.getElementById("hint");

threads.addEventListener("click", (event) => {
  const button = event.target.closest(".merge");
  if (!button) return;

  const group = button.dataset.group;
  const alike = [...threads.querySelectorAll(`.thread[data-group="${group}"]`)];
  for (const thread of alike.slice(1)) thread.classList.add("is-folded");

  button.disabled = true;
  button.textContent = `Merged ${alike.length}`;
  count.textContent = threads.querySelectorAll(".thread:not(.is-folded)").length;
  hint.textContent = "Folded threads are kept, not deleted — unmerging is a reload away.";
});
