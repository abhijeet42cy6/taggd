import React, { useState } from "react";
import { AlertTriangle, ArrowDown, DollarSign, TrendingUp, Users } from "lucide-react";
import { COW_DNA, COW_FIVE_G, COW_HERO, COW_KRF, COW_KSF, COW_METRICS, COW_PILLARS, COW_TIMELINE } from "@/components/code-of-work-data";
import "@/components/code-of-work-landing.css";

export type CodeOfWorkAudience = "cxo" | "non-cxo";

export function CodeOfWorkLanding({
  audience,
  showByTheNumbers,
}: {
  audience: CodeOfWorkAudience;
  /** Admin, platform_admin, or executive only — set from auth in the modal shell. */
  showByTheNumbers: boolean;
}) {
  const showCxo = audience === "cxo";
  const [dnaIdx, setDnaIdx] = useState(0);

  return (
    <div className="cow-landing">
      <section className="cow-hero">
        <div className="cow-hero-inner cow-anim">
          <span className="cow-eyebrow">{COW_HERO.eyebrow}</span>
          <h1>
            {COW_HERO.titleLine1}
            <br />
            <span className="cow-hero-grad">{COW_HERO.titleLine2}</span>
          </h1>
          <p className="cow-hero-desc cow-anim cow-anim-delay-1">{COW_HERO.description}</p>
          <div className="cow-scroll-hint cow-anim cow-anim-delay-2">
            <span>Scroll to explore</span>
            <ArrowDown size={20} strokeWidth={2} aria-hidden />
          </div>
        </div>
      </section>

      <section className="cow-section cow-section--wash">
        <div className="cow-section-inner">
          <div className="cow-stitle cow-anim">
            <h2>Our Purpose, Mission &amp; Vision</h2>
            <div className="cow-stitle-bar" />
          </div>
          <div className="cow-pillars cow-anim cow-anim-delay-1">
            {COW_PILLARS.map((p) => (
              <div key={p.label} className="cow-pillar">
                <div className="cow-pillar-label">{p.label}</div>
                <div className="cow-pillar-line" />
                <div className="cow-pillar-main">
                  {p.label === "Mission" ? (
                    <>
                      <span className="cow-accent">Power</span> Recruiters of Tomorrow.
                    </>
                  ) : p.label === "Purpose" ? (
                    <>
                      <span className="cow-accent">Create Success</span> for Each Hiring Manager.
                    </>
                  ) : (
                    <>
                      Fulfill <span className="cow-accent">1 Million Jobs</span> by 2030
                    </>
                  )}
                </div>
                {p.sub === "mission-atf" ? (
                  <p className="cow-pillar-sub">
                    With our <span className="cow-accent">ATF</span> (<span className="cow-accent">A</span>I{" "}
                    <span className="cow-accent">T</span>alent <span className="cow-accent">F</span>ulfillment) platform
                    that delivers exceptional experience to hiring managers, and candidates
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cow-section">
        <div className="cow-section-inner">
          <div className="cow-stitle cow-anim">
            <h2>Strategic Goals (2030)</h2>
            <div className="cow-stitle-bar" />
          </div>
          <div className="cow-grid-3">
            <div className="cow-card cow-anim" style={{ animationDelay: "0.06s" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "var(--accent)" }}>
                <DollarSign size={36} strokeWidth={1.35} aria-hidden />
              </div>
              <div className="cow-label-sm">Annual Revenue</div>
              <div className="cow-metric-lg">USD 41M</div>
              <div className="cow-card-body" style={{ marginTop: 6 }}>
                by 2030
              </div>
            </div>
            <div className="cow-card cow-anim" style={{ animationDelay: "0.12s" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "var(--accent)" }}>
                <Users size={36} strokeWidth={1.35} aria-hidden />
              </div>
              <div className="cow-label-sm">Brand &amp; Market Positioning</div>
              <p className="cow-card-body" style={{ textAlign: "center", fontWeight: 600, color: "var(--text)" }}>
                Establish the highest recall as an <span className="cow-accent">ATF</span> (AI Talent Fulfilment) company
              </p>
            </div>
            <div className="cow-card cow-anim" style={{ animationDelay: "0.18s" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "var(--accent)" }}>
                <TrendingUp size={36} strokeWidth={1.35} aria-hidden />
              </div>
              <div className="cow-label-sm">People Capability</div>
              <p className="cow-card-body">Build a Dream Team with per-member revenue of</p>
              <div className="cow-metric-lg" style={{ marginTop: 4 }}>
                USD 80K<span style={{ fontSize: "1rem", color: "var(--text-muted)", fontWeight: 600 }}>/year</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showCxo ? (
        <>
          <section className="cow-section cow-section--wash">
            <div className="cow-section-inner">
              <div className="cow-stitle cow-anim">
                <span className="cow-badge">CXO view</span>
                <h2>Our Key Success Factors (KSF)</h2>
                <div className="cow-stitle-bar" />
                <p className="cow-stitle-sub">The metrics that define our path to success</p>
              </div>
              <div className="cow-grid-3">
                {COW_KSF.map((k, i) => (
                  <div key={k.stat} className="cow-card cow-stat-card cow-anim" style={{ animationDelay: `${0.08 * (i + 1)}s` }}>
                    <div className="cow-stat-num">{k.stat}</div>
                    <p className="cow-card-body" style={{ textAlign: "center" }}>
                      {k.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="cow-section">
            <div className="cow-section-inner">
              <div className="cow-stitle cow-anim">
                <span className="cow-badge">CXO view</span>
                <h2>Our Key Risk Factors (KRF)</h2>
                <div className="cow-stitle-bar" />
                <p className="cow-stitle-sub">Risks we must actively manage</p>
              </div>
              <div className="cow-grid-3">
                {COW_KRF.map((text, i) => (
                  <div key={text} className="cow-card cow-anim" style={{ animationDelay: `${0.08 * (i + 1)}s` }}>
                    <div className="cow-risk-card">
                      <div className="cow-risk-icon">
                        <AlertTriangle size={20} strokeWidth={2} aria-hidden />
                      </div>
                      <div className="cow-risk-text">{text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}

      <section className="cow-section cow-section--wash">
        <div className="cow-section-inner">
          <div className="cow-stitle cow-anim">
            <h2>5Gs That Make a Tagger</h2>
            <div className="cow-stitle-bar" />
            <p className="cow-stitle-sub">The cultural DNA of every Tagger</p>
          </div>
          <div className="cow-grid-5">
            {COW_FIVE_G.map((g, i) => (
              <div key={g.name} className="cow-gcard cow-anim" style={{ animationDelay: `${0.05 * (i + 1)}s` }}>
                <span className="cow-gcard-bg" aria-hidden>
                  G
                </span>
                <div className="cow-gname">{g.name}</div>
                <p className="cow-gdesc">{g.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cow-section">
        <div className="cow-section-inner">
          <div className="cow-stitle cow-anim">
            <h2>The Road to 2030</h2>
            <div className="cow-stitle-bar" />
            <p className="cow-stitle-sub">Our strategic milestones mapped from launch to vision</p>
          </div>
          <div className="cow-timeline">
            {COW_TIMELINE.map((t, i) => (
              <div key={t.year} className="cow-tl-item cow-anim" style={{ animationDelay: `${0.05 * (i + 1)}s` }}>
                <div className="cow-tl-dot" aria-hidden />
                <div className="cow-tl-year">{t.year}</div>
                <div className="cow-tl-title">{t.title}</div>
                <p className="cow-tl-desc">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {showByTheNumbers ? (
        <section className="cow-section cow-section--wash">
          <div className="cow-section-inner">
            <div className="cow-stitle cow-anim">
              <h2>By the Numbers</h2>
              <div className="cow-stitle-bar" />
              <p className="cow-stitle-sub">The targets that drive every decision we make</p>
            </div>
            <div className="cow-metrics">
              {COW_METRICS.map((m, i) => (
                <div
                  key={m.label}
                  className={`cow-metric-card${m.highlight ? " cow-metric-card--hero" : ""} cow-anim`}
                  style={{ animationDelay: `${0.06 * (i + 1)}s` }}
                >
                  <div className="cow-metric-display">{m.display}</div>
                  <div className="cow-metric-label">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="cow-section">
        <div className="cow-section-inner">
          <div className="cow-stitle cow-anim">
            <h2>The Tagger DNA</h2>
            <div className="cow-stitle-bar" />
            <p className="cow-stitle-sub">The five forces that define who we are</p>
          </div>
          <div className="cow-dna cow-anim cow-anim-delay-1">
            <div className="cow-dna-list">
              {COW_DNA.map((d, i) => (
                <button
                  key={d.name}
                  type="button"
                  className={`cow-dna-item${dnaIdx === i ? " cow-dna-item--active" : ""}`}
                  onClick={() => setDnaIdx(i)}
                >
                  <span className="cow-dna-num">{i + 1}</span>
                  <div>
                    <div className="cow-dna-name">{d.name}</div>
                    <div className="cow-dna-snippet">{d.short}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="cow-dna-panel">
              <h3>{COW_DNA[dnaIdx]!.name}</h3>
              <p>{COW_DNA[dnaIdx]!.detail}</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="cow-footer">
        <p className="cow-footer-tag">Powering Recruiters of Tomorrow.</p>
        <p className="cow-footer-copy">© {new Date().getFullYear()} Taggd. All rights reserved.</p>
      </footer>
    </div>
  );
}
