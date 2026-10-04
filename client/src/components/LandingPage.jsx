import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LetterRain from "./LetterRain.jsx";

// Public landing: hero shows ONLY the search. Typing/focus jumps to signup
// (query discarded — composer starts empty after auth). Scroll reveals the
// about sections; scrolling past the end wraps back to the hero search.
export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const scroller = useRef(null);
  const endSentinel = useRef(null);
  const looping = useRef(false);

  function goSignup() {
    navigate("/login", {
      state: { mode: "register", from: location.pathname },
    });
  }

  useEffect(() => {
    const root = scroller.current;
    const sentinel = endSentinel.current;
    if (!root || !sentinel) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !looping.current) {
          looping.current = true;
          root.scrollTo({ top: 0, behavior: "smooth" });
          setTimeout(() => {
            looping.current = false;
          }, 900);
        }
      },
      { root, threshold: 0.4 }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing" ref={scroller}>
      <LetterRain />

      <section className="landing-hero">
        <div className="landing-brand">WIKIPEDIA AGENT</div>
        <div className="landing-search" aria-label="Search Wikipedia — sign up to start">
          <span className="landing-search-icon" aria-hidden="true">⌕</span>
          <input
            className="landing-search-input"
            aria-label="Search Wikipedia"
            placeholder="Ask Wikipedia anything…"
            onFocus={goSignup}
            onChange={goSignup}
          />
          <span className="landing-search-hint">sign up to start</span>
        </div>
        <div className="landing-scroll-cue" aria-hidden="true">scroll ↓</div>
      </section>

      <section className="landing-about">
        <h2>The world&apos;s first overcomplicated Wikipedia search engine</h2>
        <p>
          One truth source. Many free-tier brains. You ask a question, an LLM
          planner picks the articles, four fetch paths raid Wikipedia, and a
          grounded answer comes back with sources — never hallucinated facts.
        </p>
        <div className="landing-cards">
          <div className="landing-card">
            <h3>Plans before it speaks</h3>
            <p>Token budget, depth (lead/full), and exact article titles — decided up front, shown in the plan panel.</p>
          </div>
          <div className="landing-card">
            <h3>Raids Wikipedia four ways</h3>
            <p>Lead extracts, full articles, wikitext tables for “List of” pages, infobox incumbents for “who leads X now”.</p>
          </div>
          <div className="landing-card">
            <h3>Never dies on quota</h3>
            <p>Any-error fallback across 16 free-tier models. All down? A friendly bubble, not a stack trace.</p>
          </div>
        </div>
      </section>

      <section className="landing-about">
        <h2>Under the hood</h2>
        <div className="landing-stack">
          <div><span>Frontend</span>React 19 + Vite + React Router</div>
          <div><span>Backend</span>Express 4 (ESM) on Node 24</div>
          <div><span>Data</span>MongoDB Atlas — chats, users, sessions, wiki cache</div>
          <div><span>Brains</span>OpenRouter · Groq · Mistral (Gemini + HF when keyed)</div>
          <div><span>Quality</span>Follow-up rewrite, topic-switch detection, 24h recency gate</div>
          <div><span>Ship</span>Docker single-origin image, Vitest 138 green, zero-quota CI</div>
        </div>
        <p className="muted">Built as a learning project, kept honest by tests. Keep scrolling — the page topples back to search.</p>
        <div ref={endSentinel} className="landing-end" aria-hidden="true" />
      </section>
    </div>
  );
}
