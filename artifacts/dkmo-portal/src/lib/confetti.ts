import confetti from "canvas-confetti";

const DKMO_COLORS = ["#15803d", "#16a34a", "#22c55e", "#f59e0b", "#facc15", "#ffffff"];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** A subtle, premium celebration burst used after major positive actions. */
export function celebrate(): void {
  if (prefersReducedMotion()) return;
  confetti({
    particleCount: 70,
    spread: 70,
    startVelocity: 38,
    gravity: 0.9,
    scalar: 0.9,
    ticks: 160,
    origin: { y: 0.65 },
    colors: DKMO_COLORS,
    disableForReducedMotion: true,
  });
  window.setTimeout(() => {
    confetti({
      particleCount: 40,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors: DKMO_COLORS,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 40,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: DKMO_COLORS,
      disableForReducedMotion: true,
    });
  }, 180);
}

/** Party poppers firing from both left and right edges — used on login. */
export function partyPoppers(): void {
  if (prefersReducedMotion()) return;
  const end = Date.now() + 1600;
  const frame = () => {
    confetti({
      particleCount: 7,
      angle: 60,
      spread: 65,
      startVelocity: 55,
      origin: { x: 0, y: 0.75 },
      colors: DKMO_COLORS,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 7,
      angle: 120,
      spread: 65,
      startVelocity: 55,
      origin: { x: 1, y: 0.75 },
      colors: DKMO_COLORS,
      disableForReducedMotion: true,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

/** A bigger, longer celebration for milestone moments. */
export function celebrateMilestone(): void {
  if (prefersReducedMotion()) return;
  const end = Date.now() + 1200;
  const frame = () => {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.7 },
      colors: DKMO_COLORS,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.7 },
      colors: DKMO_COLORS,
      disableForReducedMotion: true,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
