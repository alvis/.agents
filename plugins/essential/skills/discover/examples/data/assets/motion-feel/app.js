const cheap = document.getElementById("cheap");
const tuned = document.getElementById("tuned");
const ms = document.getElementById("ms");
const msOut = document.getElementById("msOut");
const reading = document.getElementById("reading");
const tunedLabel = document.getElementById("tunedLabel");
const controls = document.getElementById("controls");

function curve() {
  return controls.querySelector('input[name="curve"]:checked').value;
}

function apply() {
  const duration = `${ms.value}ms`;
  tuned.style.transition = `transform ${duration} ${curve()}, opacity ${duration} ${curve()}`;
  msOut.textContent = duration;
  tunedLabel.textContent = `${curve()} · ${duration}`;
  reading.textContent = `linear · 500ms against ${curve()} · ${duration}`;
}

function play() {
  cheap.classList.remove("in");
  tuned.classList.remove("in");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cheap.classList.add("in");
      tuned.classList.add("in");
    });
  });
}

controls.addEventListener("input", apply);
document.getElementById("play").addEventListener("click", play);

apply();
play();
