import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LetterRain from "./LetterRain.jsx";
import { prepareQuery } from "../api.js";

// Public landing: hero shows ONLY the search. Typing is allowed — submitting
// holds the query server-side for 8 minutes, then jumps to signup; after
// auth the question auto-sends into the new account's chats (deferred
// execution — no anonymous quota burn). Scroll reveals the about sections;
// scrolling past the end wraps back to the hero search.
export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const scroller = useRef(null);
  const endSentinel = useRef(null);
  const looping = useRef(false);
  const [teaser, setTeaser] = useState("");
  const [holding, setHolding] = useState(false);
  const [holdError, setHoldError] = useState("");

  async function submitTeaser(e) {
    e.preventDefault();
    const query = teaser.trim();
    if (!query || holding) return;
    setHolding(true);
    setHoldError("");
    try {
      const { pendingToken } = await prepareQuery(query);
      sessionStorage.setItem("wiki:pending-token", pendingToken);
    } catch {
      // Prepare failed (rate limit, DB nap) — the raw text below still lets
      // signup send it as a plain question.
      setHoldError("Couldn't hold that — you can still sign up and ask it.");
    } finally {
      sessionStorage.setItem("wiki:pending-query", query);
      setHolding(false);
      navigate("/login", {
        state: { mode: "register", from: location.pathname },
      });
    }
  }

  useEffect(() => {
    const root = scroller.current;
    const sentinel = endSentinel.current;
    if (!root || !sentinel) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !looping.current) {
          // Instant restart — no upward travel animation. The hero reads as
          // the next round of the loop.
          looping.current = true;
          root.scrollTo({ top: 0, behavior: "auto" });
          setTimeout(() => {
            looping.current = false;
          }, 500);
        }
      },
      { root, threshold: 0.5 }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing" ref={scroller}>
      <LetterRain />

      <section className="landing-hero">
        <div className="landing-brand">WIKIPEDIA AGENT</div>
        <form className="landing-search" onSubmit={submitTeaser}>
          <span className="landing-search-icon" aria-hidden="true">⌕</span>
          <input
            className="landing-search-input"
            aria-label="Search Wikipedia"
            placeholder="Ask Wikipedia anything…"
            value={teaser}
            onChange={(e) => setTeaser(e.target.value)}
            disabled={holding}
          />
          <span className="landing-search-hint">
            {holding ? "holding…" : "sign up to start"}
          </span>
        </form>
        {holdError && <p className="landing-hold-error" role="alert">{holdError}</p>}
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
        <h2 className="landing-sub">Under the hood</h2>
        <div className="landing-stack">
          <div><span>Frontend</span>React 19 + Vite + React Router</div>
          <div><span>Backend</span>Express 4 (ESM) on Node 24</div>
          <div><span>Data</span>MongoDB Atlas — chats, users, sessions, wiki cache</div>
          <div><span>Brains</span>OpenRouter · Groq · Mistral (Gemini + HF when keyed)</div>
          <div><span>Quality</span>Follow-up rewrite, topic-switch detection, 24h recency gate</div>
          <div><span>Ship</span>Docker single-origin image, Vitest 138 green, zero-quota CI</div>
        </div>
        <p className="muted">Built as a learning project, kept honest by tests.</p>
      </section>

      <section className="landing-about landing-maker">
        <h2>Who made this</h2>
        <p>
          Designed and built as a portfolio piece — one developer, one truth
          source, far too many free-tier models.
        </p>
        <div className="landing-links">
          <a
            href="https://my-intranet.vercel.app/"
            target="_blank"
            rel="noreferrer"
            className="landing-icon-link"
            aria-label="Maker's portfolio"
            title="Maker's portfolio"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </a>
          <a
            href="https://github.com/Bruh-Ryan/small-agent-project"
            target="_blank"
            rel="noreferrer"
            className="landing-icon-link"
            aria-label="Project source on GitHub"
            title="Project source on GitHub"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
            </svg>
          </a>
        </div>
        <p className="muted">Keep scrolling — the page topples back to search.</p>
      </section>

      <div className="landing-loop" ref={endSentinel} aria-hidden="true">· · ·</div>
    </div>
  );
}
