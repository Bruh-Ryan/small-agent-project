import { useEffect, useRef } from "react";

const GLYPHS = "WIKIPEDIA?*!#";
const MAX_DROPS = 60;

// Fixed full-page canvas of falling letters behind the landing content.
// Respects prefers-reduced-motion (renders one static frame, no loop).
export default function LetterRain() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let drops = [];
    let raf = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      const count = Math.min(MAX_DROPS, Math.max(24, Math.floor(w / 24)));
      drops = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        speed: 0.6 + Math.random() * 1.6,
        char: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        size: 14 + Math.random() * 18,
        alpha: 0.08 + Math.random() * 0.14,
      }));
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = "center";
      for (const d of drops) {
        ctx.font = `${d.size}px system-ui, sans-serif`;
        ctx.fillStyle = `rgba(140, 170, 255, ${d.alpha.toFixed(3)})`;
        ctx.fillText(d.char, d.x, d.y);
        d.y += d.speed;
        if (d.y > h + 24) {
          d.y = -24;
          d.x = Math.random() * w;
          d.char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
      }
      raf = requestAnimationFrame(draw);
    }

    resize();
    seed();
    if (reduced) {
      // One static frame only — no motion.
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = "center";
      for (const d of drops) {
        ctx.font = `${d.size}px system-ui, sans-serif`;
        ctx.fillStyle = `rgba(140, 170, 255, ${d.alpha.toFixed(3)})`;
        ctx.fillText(d.char, d.x, d.y);
      }
      return undefined;
    }
    draw();

    const onResize = () => {
      resize();
      seed();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="letter-rain" aria-hidden="true" />;
}
