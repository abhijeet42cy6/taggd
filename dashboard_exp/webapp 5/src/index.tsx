import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()
app.use('/static/*', serveStatic({ root: './public' }))

app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Taggd — Code of Work</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --red:#E74B23;--orange:#FF4D00;--amber:#FF8C00;
  --bg:#FFFFFF;--bg-alt:#F7F5F2;--hero-bg:#06040A;
  --dark:#0D0A08;--text:#1A1A1A;--text-body:#3D3935;
  --text-muted:#8A8580;--card-border:rgba(0,0,0,0.06);
  --glow:rgba(231,75,35,0.4);
  --heading:'Outfit',sans-serif;--body:'Manrope',sans-serif
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:var(--body);background:var(--bg);color:var(--text);overflow-x:hidden}
::selection{background:var(--red);color:#fff}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:var(--bg-alt)}
::-webkit-scrollbar-thumb{background:var(--red);border-radius:3px}

/* NAV */
.nav{position:fixed;top:0;left:0;right:0;z-index:200;padding:16px 36px;display:flex;align-items:center;justify-content:space-between;transition:all .4s}
.nav.solid{background:rgba(255,255,255,.95);backdrop-filter:blur(24px);border-bottom:1px solid var(--card-border)}
.logo{display:flex;align-items:center;text-decoration:none}
/* Logo on dark hero: show white version; on solid nav: show normal */
.logo-img{height:32px;width:auto;display:block}
.nav:not(.solid) .logo-img{filter:brightness(0) invert(1)}
.toggle-wrap{display:flex;background:rgba(255,255,255,.10);border-radius:30px;padding:3px;border:1px solid rgba(255,255,255,.18);transition:all .4s}
.nav.solid .toggle-wrap{background:rgba(0,0,0,.04);border-color:var(--card-border)}
.toggle-btn{background:0 0;color:rgba(255,255,255,.65);border:none;border-radius:26px;padding:8px 20px;font-family:var(--heading);font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;transition:all .3s}
.nav.solid .toggle-btn{color:var(--text-muted)}
.toggle-btn.active{background:linear-gradient(135deg,var(--red),var(--orange));color:#fff}

/* HERO */
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;z-index:1;text-align:center;padding:120px 24px 80px;background:var(--hero-bg);overflow:hidden}
#planet-canvas{position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none}
.hero-content{position:relative;z-index:2}
.hero-tag{font-family:var(--body);font-size:12px;color:rgba(255,160,80,.9);letter-spacing:.25em;text-transform:uppercase;font-weight:700;margin-bottom:22px}
.hero h1{font-family:var(--heading);font-size:clamp(52px,9vw,108px);font-weight:900;color:#fff;letter-spacing:-.04em;line-height:1.02}
.hero h1 .grad{background:linear-gradient(135deg,#FF5722,#FF8C00);-webkit-background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 30px rgba(255,87,34,.6))}
.hero-desc{font-size:clamp(15px,1.8vw,19px);color:rgba(255,255,255,.48);max-width:500px;margin:24px auto 0;line-height:1.65}
.scroll-hint{position:absolute;bottom:36px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;animation:bounce 2.5s infinite}
.scroll-hint span{font-size:10px;color:rgba(255,255,255,.3);letter-spacing:.18em;text-transform:uppercase}

/* SECTIONS */
.section{padding:100px 24px;position:relative;z-index:1}
.section-inner{max-width:1200px;margin:0 auto}
.section-light{background:var(--bg)}.section-alt{background:var(--bg-alt)}.section-dark{background:var(--dark);color:#F5F2EF}
.reveal{opacity:0;transform:translateY(40px);transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .8s cubic-bezier(.16,1,.3,1)}
.reveal.visible{opacity:1;transform:translateY(0)}
.reveal-left{opacity:0;transform:translateX(-40px);transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1)}
.reveal-right{opacity:0;transform:translateX(40px);transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1)}
.reveal-left.visible,.reveal-right.visible{opacity:1;transform:translateX(0)}
.stitle{text-align:center;margin-bottom:60px}
.stitle h2{font-family:var(--heading);font-size:clamp(28px,4vw,48px);font-weight:800;letter-spacing:-.02em;margin:0}
.stitle-light h2{color:#F5F2EF}
.stitle .bar{width:60px;height:3px;background:linear-gradient(90deg,var(--red),var(--orange));margin:16px auto 0;border-radius:2px}
.stitle .sub{color:var(--text-muted);font-size:16px;margin-top:12px}
.stitle-light .sub{color:rgba(245,242,239,.55)}

/* CARDS */
.card{background:#fff;border:1px solid var(--card-border);border-radius:16px;padding:32px 28px;box-shadow:0 2px 16px rgba(0,0,0,.04);transition:all .5s cubic-bezier(.16,1,.3,1);cursor:default}
.card:hover{transform:translateY(-6px) scale(1.01);box-shadow:0 20px 60px rgba(231,75,35,.1),0 0 0 1px rgba(231,75,35,.1)}
.card-glow{border-color:rgba(231,75,35,.3)}

/* ── UNIFIED METRIC CARDS — all 5 same size, same font ── */
.card-metric{
  background:#FFFFFF;
  border:1.5px solid rgba(255,100,40,.18);
  border-radius:20px;
  padding:32px 20px 28px;
  position:relative;
  overflow:hidden;
  text-align:center;
  cursor:default;
  transition:all .5s cubic-bezier(.16,1,.3,1);
  box-shadow:0 3px 20px rgba(255,80,20,.09), 0 1px 4px rgba(0,0,0,.04);
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  min-height:160px;
}
.card-metric::before{
  content:'';position:absolute;
  left:50%;bottom:0;
  transform:translateX(-50%);
  width:80%;height:50%;
  background:radial-gradient(ellipse at 50% 100%, rgba(255,100,30,.13) 0%, rgba(255,140,50,.05) 50%, transparent 70%);
  pointer-events:none;
}
.card-metric:hover{
  transform:translateY(-6px) scale(1.02);
  box-shadow:0 22px 55px rgba(255,80,20,.18), 0 0 0 2px rgba(255,100,40,.20);
}
.metric-num{
  font-family:var(--heading);
  font-size:clamp(48px,5.5vw,72px);
  font-weight:900;
  background:linear-gradient(160deg,#FF6B35 10%,#E74B23 55%,#C43A10 100%);
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  background-clip:text;
  letter-spacing:-.03em;
  line-height:1;
  margin-bottom:10px;
  display:block;
  white-space:nowrap;
}
.metric-lbl{
  font-size:13px;
  color:#9A8A80;
  font-family:var(--body);
  font-weight:500;
  line-height:1.4;
  max-width:120px;
}

.grid-3{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}
.grid-5{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}
.grid-metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;text-align:center}
@media(max-width:900px){.grid-metrics{grid-template-columns:repeat(3,1fr)}}
@media(max-width:560px){.grid-metrics{grid-template-columns:repeat(2,1fr)}}

.pillars{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));background:#fff;border-radius:20px;border:1px solid var(--card-border);overflow:hidden;box-shadow:0 4px 30px rgba(0,0,0,.04)}
.pillar{padding:48px 36px;text-align:center;position:relative;border-right:1px solid var(--card-border)}
.pillar:last-child{border-right:none}
.pillar .vline{position:absolute;right:-1px;top:15%;height:70%;width:3px;background:linear-gradient(to bottom,transparent,var(--red),transparent);border-radius:2px}
.pillar:last-child .vline{display:none}
.pillar-label{font-family:var(--heading);font-size:14px;font-weight:800;color:var(--red);letter-spacing:.15em;margin-bottom:6px}
.pillar-line{width:40px;height:2px;background:var(--red);margin:0 auto 20px;border-radius:1px}
.pillar-main{font-family:var(--heading);font-size:clamp(20px,2.5vw,28px);font-weight:800;color:var(--text);line-height:1.3}
.pillar-sub{font-size:14px;color:var(--text-muted);margin-top:16px;line-height:1.6}

.cxo-badge{display:inline-block;background:linear-gradient(135deg,var(--red),var(--orange));color:#fff;font-size:10px;font-weight:700;font-family:var(--heading);padding:4px 12px;border-radius:20px;letter-spacing:.1em;text-transform:uppercase}
.cxo-section{max-height:2000px;opacity:1;overflow:hidden;transition:max-height .8s cubic-bezier(.16,1,.3,1),opacity .6s ease}
.cxo-section.hidden{max-height:0;opacity:0}

.metric-big{font-family:var(--heading);font-weight:900;color:var(--orange);line-height:1}
.metric-red{font-family:var(--heading);font-weight:900;color:var(--red);line-height:1}
.metric-grad{font-family:var(--heading);font-weight:900;background:linear-gradient(135deg,var(--red),var(--orange));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1.1}
.label-sm{font-size:13px;color:var(--text-muted);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}

.gcard{background:#fff;border:1px solid var(--card-border);border-radius:20px;padding:40px 32px;position:relative;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.04);transition:all .6s cubic-bezier(.16,1,.3,1)}
.gcard:hover{transform:translateY(-8px) scale(1.02);background:rgba(231,75,35,.03);border-color:rgba(231,75,35,.25);box-shadow:0 25px 60px rgba(231,75,35,.1)}
.gcard .bg-g{position:absolute;top:-15px;right:-5px;font-family:var(--heading);font-size:140px;font-weight:900;color:var(--red);opacity:.04;line-height:1;pointer-events:none;user-select:none;transition:opacity .5s}
.gcard:hover .bg-g{opacity:.1}
.gcard .gname{font-family:var(--heading);font-size:24px;font-weight:800;color:var(--red);margin-bottom:12px;position:relative}
.gcard .gdesc{font-size:15px;color:var(--text-body);line-height:1.7;position:relative}

.tl-wrap{position:relative}.tl-line{position:absolute;left:50%;top:0;bottom:0;width:2px;background:linear-gradient(to bottom,var(--red),transparent);transform:translateX(-50%);opacity:.3}
.tl-node{display:flex;align-items:center;justify-content:center;margin-bottom:40px}
.tl-side{flex:1;padding:0 24px}.tl-center{display:flex;flex-direction:column;align-items:center;z-index:2}
.tl-dot{width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,var(--red),var(--orange));box-shadow:0 0 20px var(--glow);border:3px solid var(--dark)}
.tl-year{font-family:var(--heading);font-weight:800;font-size:16px;color:#F5F2EF;margin-top:6px}
.tl-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:20px 24px;display:inline-block;max-width:340px;text-align:left;transition:all .4s}
.tl-card:hover{background:rgba(255,255,255,.1);border-color:rgba(231,75,35,.4);box-shadow:0 10px 40px rgba(231,75,35,.15)}
.tl-card-title{font-family:var(--heading);font-weight:700;color:var(--red);font-size:14px;margin-bottom:4px}
.tl-card-desc{font-family:var(--body);color:rgba(245,242,239,.55);font-size:13px;line-height:1.5}
.risk-icon{width:40px;height:40px;border-radius:10px;background:rgba(231,75,35,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0}

.dna-section{background:var(--dark);padding:120px 24px;position:relative;z-index:1;overflow:hidden}
.dna-section::before{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:radial-gradient(ellipse at 50% 30%,rgba(231,75,35,.08) 0%,transparent 60%);pointer-events:none}
.dna-inner{max-width:1100px;margin:0 auto;position:relative}
.dna-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:60px}
.dna-left{display:flex;flex-direction:column;justify-content:center;padding-right:60px}
.dna-item{display:flex;align-items:flex-start;gap:20px;padding:22px 24px;border-radius:16px;cursor:pointer;transition:all .4s cubic-bezier(.16,1,.3,1);border:1px solid transparent;margin-bottom:8px}
.dna-item:hover,.dna-item.active{background:rgba(231,75,35,.08);border-color:rgba(231,75,35,.2)}
.dna-item .dna-num{font-family:var(--heading);font-size:14px;font-weight:800;width:36px;height:36px;border-radius:50%;background:rgba(231,75,35,.12);color:var(--red);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .3s}
.dna-item.active .dna-num,.dna-item:hover .dna-num{background:var(--red);color:#fff}
.dna-item .dna-name{font-family:var(--heading);font-size:18px;font-weight:800;color:var(--red);margin-bottom:4px}
.dna-item .dna-desc{font-family:var(--body);font-size:14px;color:rgba(245,242,239,.5);line-height:1.6;max-height:0;overflow:hidden;transition:max-height .5s cubic-bezier(.16,1,.3,1),opacity .4s;opacity:0}
.dna-item.active .dna-desc{max-height:100px;opacity:1}
.dna-visual{width:100%;aspect-ratio:1;position:relative;display:flex;align-items:center;justify-content:center}
.dna-ring{position:absolute;border-radius:50%;border:1px solid rgba(231,75,35,.1);animation:dnaRotate 20s linear infinite}
.dna-ring:nth-child(1){width:100%;height:100%}.dna-ring:nth-child(2){width:75%;height:75%;animation-duration:15s;animation-direction:reverse}.dna-ring:nth-child(3){width:50%;height:50%;animation-duration:25s}
.dna-dot{position:absolute;width:12px;height:12px;border-radius:50%;background:var(--red);box-shadow:0 0 20px rgba(231,75,35,.4);transition:all .5s;cursor:pointer}
.dna-dot.active{width:20px;height:20px;box-shadow:0 0 40px rgba(231,75,35,.6);background:var(--orange)}
.dna-dot-label{position:absolute;font-family:var(--heading);font-weight:700;font-size:13px;color:rgba(245,242,239,.6);white-space:nowrap;transition:all .4s;cursor:pointer}
.dna-dot-label.active{color:var(--red);font-size:15px;font-weight:800}
.dna-center-icon{font-family:var(--heading);font-size:28px;font-weight:900;color:var(--red);opacity:.6;position:relative;z-index:2}
.dna-lines{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none}

/* FOOTER */
.footer{position:relative;z-index:1;padding:60px 24px 40px;background:var(--dark);text-align:center}
.footer-logo{height:28px;width:auto;filter:brightness(0) invert(1);opacity:.7}
.footer-tagline{font-size:14px;color:rgba(245,242,239,.5);margin:12px 0 4px}
.footer-copy{font-size:12px;color:rgba(245,242,239,.25)}

@keyframes fadeInUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
@keyframes bounce{0%,20%,50%,80%,100%{transform:translateX(-50%) translateY(0)}40%{transform:translateX(-50%) translateY(-10px)}60%{transform:translateX(-50%) translateY(-5px)}}
@keyframes dnaRotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.fade-in-up{animation:fadeInUp 1.1s ease-out both}

@media(max-width:900px){.dna-grid{grid-template-columns:1fr}.dna-left{padding-right:0;margin-bottom:40px}}
@media(max-width:768px){
  .nav{padding:12px 16px}.section{padding:60px 16px}
  .pillars{grid-template-columns:1fr}.pillar{border-right:none!important;border-bottom:1px solid var(--card-border)}.pillar:last-child{border-bottom:none}.pillar .vline{display:none}
  .grid-3,.grid-5{grid-template-columns:1fr}.grid-metrics{grid-template-columns:repeat(2,1fr)}
  .tl-node{flex-direction:column;text-align:center}.tl-side{padding:12px 0;text-align:center!important}.tl-line{display:none}
}
</style>
</head>
<body>

<!-- NAV -->
<nav class="nav" id="nav">
  <div></div>
  <div class="toggle-wrap">
    <button class="toggle-btn active" data-mode="cxo" onclick="setMode('cxo')">CXOs</button>
    <button class="toggle-btn" data-mode="non-cxo" onclick="setMode('non-cxo')">Non-CXOs</button>
  </div>
</nav>

<!-- HERO — 5 PLANET SOLAR SYSTEM + ANTI-GRAVITY PARTICLES -->
<section class="hero" id="hero">
  <canvas id="planet-canvas"></canvas>
  <div class="hero-content fade-in-up">
    <div class="hero-tag">Taggd Strategic Framework</div>
    <h1>Code of<br><span class="grad">Work</span></h1>
    <p class="hero-desc">The strategic and cultural compass that defines how Taggers create impact — powering the recruiters of tomorrow.</p>
  </div>
  <div class="scroll-hint">
    <span>Scroll to explore</span>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
  </div>
</section>

<!-- PURPOSE / MISSION / VISION -->
<section class="section section-alt" id="pillars-section"><div class="section-inner reveal">
  <div class="stitle"><h2>Our Purpose, Mission &amp; Vision</h2><div class="bar"></div></div>
  <div class="pillars">
    <div class="pillar"><div class="vline"></div><div class="pillar-label">PURPOSE</div><div class="pillar-line"></div><div class="pillar-main"><span style="color:var(--red)">Create Success</span> for Each Hiring Manager.</div></div>
    <div class="pillar"><div class="vline"></div><div class="pillar-label">MISSION</div><div class="pillar-line"></div><div class="pillar-main"><span style="color:var(--red)">Power</span> Recruiters of Tomorrow.</div><p class="pillar-sub">With our <span style="color:var(--red);font-weight:700">ATF</span> (<span style="color:var(--red)">A</span>I <span style="color:var(--red)">T</span>alent <span style="color:var(--red)">F</span>ulfillment) platform that delivers exceptional experience to hiring managers, and candidates</p></div>
    <div class="pillar"><div class="pillar-label">VISION</div><div class="pillar-line"></div><div class="pillar-main">Fulfill <span style="color:var(--orange);font-weight:900">1 Million Jobs</span> by 2030</div></div>
  </div>
</div></section>

<!-- STRATEGIC GOALS -->
<section class="section section-light" id="goals-section"><div class="section-inner reveal">
  <div class="stitle"><h2>Strategic Goals (2030)</h2><div class="bar"></div></div>
  <div class="grid-3">
    <div class="card" style="text-align:center">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E74B23" stroke-width="1.5" style="margin-bottom:16px"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
      <div class="label-sm">Annual Revenue</div>
      <div class="metric-big" style="font-size:52px">USD <span class="counter" data-end="41">0</span>M</div>
      <div style="font-size:16px;color:var(--text-muted);margin-top:8px">by 2030</div>
    </div>
    <div class="card" style="text-align:center">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E74B23" stroke-width="1.5" style="margin-bottom:16px"><circle cx="12" cy="8" r="5"/><path d="M6 20h12M8 16h8"/></svg>
      <div class="label-sm">Brand &amp; Market Positioning</div>
      <div style="font-family:var(--heading);font-size:20px;font-weight:800;color:var(--text);line-height:1.3;padding:0 8px">Establish the highest recall as an <span style="color:var(--red)">ATF</span> (AI Talent Fulfilment) company</div>
    </div>
    <div class="card" style="text-align:center">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E74B23" stroke-width="1.5" style="margin-bottom:16px"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
      <div class="label-sm">People Capability</div>
      <div style="font-size:14px;color:var(--text-body);line-height:1.6;margin-bottom:12px">Build a Dream Team with per-member revenue of</div>
      <div class="metric-big" style="font-size:48px">USD <span class="counter" data-end="80">0</span>K<span style="font-size:20px;color:var(--text-muted)">/year</span></div>
    </div>
  </div>
</div></section>

<!-- KSF CXO -->
<div class="cxo-section" id="ksf-wrap"><section class="section section-alt"><div class="section-inner reveal">
  <div style="text-align:center;margin-bottom:8px"><span class="cxo-badge">CXO View</span></div>
  <div class="stitle"><h2>&#10022; Our Key Success Factors (KSF)</h2><div class="bar"></div><p class="sub">The metrics that define our path to success</p></div>
  <div class="grid-3">
    <div class="card card-glow"><div class="metric-red" style="font-size:56px;margin-bottom:12px">2</div><div style="font-size:15px;color:var(--text-body);line-height:1.7">Minimum <strong>2 global partnerships</strong> and deliver <strong>1 mega sign-up per year</strong> through partnerships</div></div>
    <div class="card card-glow"><div class="metric-red" style="font-size:48px;margin-bottom:12px">100%</div><div style="font-size:15px;color:var(--text-body);line-height:1.7">100% of hiring through <span style="color:var(--red);font-weight:700">TARA</span> — No shadow processes; all fulfillment signals captured in one system</div></div>
    <div class="card card-glow"><div class="metric-red" style="font-size:48px;margin-bottom:12px">&#8805;25%</div><div style="font-size:15px;color:var(--text-body);line-height:1.7"><strong>International Revenue Mix</strong> of total revenue from international markets by 2030</div></div>
  </div>
</div></section></div>

<!-- KRF CXO -->
<div class="cxo-section" id="krf-wrap"><section class="section section-light"><div class="section-inner reveal">
  <div style="text-align:center;margin-bottom:8px"><span class="cxo-badge">CXO View</span></div>
  <div class="stitle"><h2>Our Key Risk Factors (KRF)</h2><div class="bar"></div><p class="sub">Risks we must actively manage</p></div>
  <div class="grid-3">
    <div class="card"><div style="display:flex;align-items:flex-start;gap:16px"><div class="risk-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E74B23" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg></div><div style="font-size:16px;color:var(--text-body);line-height:1.6">Delay in <strong>Changing the Way of Working</strong></div></div></div>
    <div class="card"><div style="display:flex;align-items:flex-start;gap:16px"><div class="risk-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E74B23" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg></div><div style="font-size:16px;color:var(--text-body);line-height:1.6">Delay in achieving <strong>Product-Market fit</strong></div></div></div>
    <div class="card"><div style="display:flex;align-items:flex-start;gap:16px"><div class="risk-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E74B23" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg></div><div style="font-size:16px;color:var(--text-body);line-height:1.6">Eyes Off <strong>Profitability</strong> (ROI) | Working Capital</div></div></div>
  </div>
</div></section></div>

<!-- 5Gs -->
<section class="section section-alt" id="fivegs-section"><div class="section-inner reveal">
  <div class="stitle"><h2>5Gs That Make a Tagger</h2><div class="bar"></div><p class="sub">The cultural DNA of every Tagger</p></div>
  <div class="grid-5" id="gvalues"></div>
</div></section>

<!-- TIMELINE -->
<section class="section section-dark" id="timeline-section"><div class="section-inner">
  <div class="stitle stitle-light"><h2>The Road to 2030</h2><div class="bar"></div><p class="sub">Our strategic milestones mapped from launch to vision</p></div>
  <div class="tl-wrap" id="timeline"><div class="tl-line"></div></div>
</div></section>

<!-- METRICS — 1M card uses special class -->
<section class="section section-light" id="metrics-section"><div class="section-inner reveal">
  <div class="stitle"><h2>By the Numbers</h2><div class="bar"></div><p class="sub">The targets that drive every decision we make</p></div>
  <div class="grid-metrics" id="metrics-grid"></div>
</div></section>

<!-- DNA -->
<section class="dna-section" id="dna-section">
  <div class="dna-inner">
    <div class="stitle stitle-light reveal"><h2>The Tagger DNA</h2><div class="bar"></div><p class="sub">The five forces that define who we are</p></div>
    <div class="dna-grid">
      <div class="dna-left reveal" id="dna-list"></div>
      <div style="transition-delay:200ms" class="reveal">
        <div class="dna-visual" id="dna-visual">
          <div class="dna-ring"></div><div class="dna-ring"></div><div class="dna-ring"></div>
          <svg class="dna-lines" id="dna-lines" viewBox="0 0 400 400"></svg>
          <div class="dna-center-icon">5G</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FOOTER -->
<footer class="footer">
  <p class="footer-tagline">Powering Recruiters of Tomorrow.</p>
  <p class="footer-copy">&copy; 2025 Taggd. All rights reserved.</p>
</footer>

<script>
/* ═══════════════════════════════════════════════════════════════
   5G PLANET SOLAR SYSTEM — Anti-Gravity Style Hero Canvas
   Orange-black gradient planets, floating particles, orbital rings
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const canvas = document.getElementById('planet-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H, CX, CY;

  function resize(){
    W  = canvas.width  = canvas.offsetWidth;
    H  = canvas.height = canvas.offsetHeight;
    CX = W / 2;
    CY = H / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  /* Mouse parallax */
  let mx = 0, my = 0;
  window.addEventListener('mousemove', e => {
    mx = (e.clientX / window.innerWidth  - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  /* ─── STAR FIELD ─── */
  const STARS = Array.from({length:320}, () => ({
    x:  Math.random(),
    y:  Math.random(),
    r:  0.3 + Math.random() * 1.6,
    a:  0.15 + Math.random() * 0.75,
    tw: Math.random() * Math.PI * 2,
    ts: 0.006 + Math.random() * 0.018
  }));

  /* ─── ANTI-GRAVITY PARTICLES (rising dashes) ─── */
  function makeParticle(){
    return {
      x:    Math.random(),                      // 0-1 fraction of W
      y:    0.5 + Math.random() * 0.55,         // start in lower half
      vy:   -(0.0003 + Math.random() * 0.0008), // rise speed (fraction/frame)
      vx:   (Math.random() - 0.5) * 0.00015,
      len:  4 + Math.random() * 14,             // dash length px
      a:    0.3 + Math.random() * 0.65,
      fade: 0,
      life: 0.6 + Math.random() * 0.4,         // total life 0-1
      age:  0,
      col:  Math.random() < 0.65 ? 'orange' : Math.random() < 0.5 ? 'red' : 'amber'
    };
  }
  const PARTICLES = Array.from({length:280}, () => {
    const p = makeParticle();
    p.y = Math.random();  // scatter initial positions
    p.age = Math.random() * p.life;
    return p;
  });
  const PCOLORS = { orange:[255,100,30], red:[230,50,10], amber:[255,180,50] };

  /* ─── 5G PLANETS ─── */
  const PLANET_DEFS = [
    { label:'Go-getter', rFrac:0.185, speed:0.0058, angle:0.0,    tilt:0.38 },
    { label:'Gifted',    rFrac:0.285, speed:0.0040, angle:1.26,   tilt:0.36 },
    { label:'Genuine',   rFrac:0.375, speed:0.0028, angle:2.51,   tilt:0.34 },
    { label:'Guides',    rFrac:0.465, speed:0.0019, angle:3.77,   tilt:0.32 },
    { label:'Grounded',  rFrac:0.550, speed:0.0013, angle:5.03,   tilt:0.30 },
  ];
  // Body colour triplets  [highlight, midtone, dark-edge]
  const BODY_COLORS = [
    ['rgba(255,190,90,1)','rgba(255,87,34,1)','rgba(60,8,0,0.95)'],
    ['rgba(255,215,110,1)','rgba(255,100,0,0.97)','rgba(80,18,0,0.92)'],
    ['rgba(255,150,80,1)','rgba(210,50,10,0.98)','rgba(50,5,0,0.93)'],
    ['rgba(255,210,90,1)','rgba(255,165,0,0.97)','rgba(80,28,0,0.90)'],
    ['rgba(255,130,70,1)','rgba(210,42,5,0.97)','rgba(45,4,0,0.94)']
  ];
  const GLOW_COLORS = [
    'rgba(255,87,34,0.55)',
    'rgba(255,109,0,0.55)',
    'rgba(255,69,0,0.52)',
    'rgba(255,143,0,0.50)',
    'rgba(221,44,0,0.52)'
  ];
  PLANET_DEFS.forEach(p => { p.trail = []; });

  /* ─── ASTEROID BELT ─── */
  const ASTEROIDS = Array.from({length:110}, () => ({
    angle:   Math.random() * Math.PI * 2,
    rFrac:   0.415 + Math.random() * 0.048,
    size:    0.7 + Math.random() * 2.1,
    speed:   0.0009 + Math.random() * 0.0011,
    opacity: 0.12 + Math.random() * 0.32
  }));

  /* ─── COMET ─── */
  const COMET = { angle: 0.8, rFrac: 0.68, speed: 0.020, size: 3, tailLen: 60 };

  /* helper — draw orbit ellipse */
  function drawOrbit(cx, cy, r, tilt, alpha){
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, tilt);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = \`rgba(255,120,40,\${alpha})\`;
    ctx.lineWidth   = 0.85;
    ctx.setLineDash([5, 9]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  let frame = 0;

  function render(){
    requestAnimationFrame(render);
    frame++;

    const minD = Math.min(W, H);
    const px   = CX + mx * 16;
    const py   = CY + my * 16;

    /* ── background — deep dark gradient ── */
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(px, py, 0, px, py, Math.max(W,H) * 0.82);
    bg.addColorStop(0,   'rgba(28,10,4,1)');
    bg.addColorStop(0.28,'rgba(14,4,1,1)');
    bg.addColorStop(0.6, 'rgba(6,2,8,1)');
    bg.addColorStop(1,   'rgba(2,1,5,1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* ── stars ── */
    STARS.forEach(s => {
      s.tw += s.ts;
      const a = s.a * (0.55 + 0.45 * Math.sin(s.tw));
      ctx.beginPath();
      ctx.arc(s.x * W + mx * 12, s.y * H + my * 12, s.r, 0, Math.PI * 2);
      ctx.fillStyle = \`rgba(255,200,150,\${a})\`;
      ctx.fill();
    });

    /* ── anti-gravity particles (rising dashes) ── */
    PARTICLES.forEach(p => {
      p.age += 0.004;
      if(p.age >= p.life){ Object.assign(p, makeParticle()); return; }
      p.x += p.vx;
      p.y += p.vy;
      const progress  = p.age / p.life;
      const alpha     = p.a * Math.sin(progress * Math.PI);  // fade in/out
      const [r,g,b]   = PCOLORS[p.col];
      // draw dash
      const sx = p.x * W;
      const sy = p.y * H;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = \`rgb(\${r},\${g},\${b})\`;
      ctx.lineWidth   = 1.2;
      ctx.shadowColor = \`rgba(\${r},\${g},\${b},0.6)\`;
      ctx.shadowBlur  = 4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + p.vx * W * 80, sy + p.vy * H * 80 - p.len);
      ctx.stroke();
      ctx.restore();
    });

    /* ── asteroid belt ── */
    ASTEROIDS.forEach(a => {
      a.angle += a.speed;
      const ar = minD * a.rFrac;
      const ax = px + Math.cos(a.angle) * ar;
      const ay = py + Math.sin(a.angle) * ar * 0.36;
      ctx.beginPath();
      ctx.arc(ax, ay, a.size, 0, Math.PI * 2);
      ctx.fillStyle = \`rgba(190,80,20,\${a.opacity})\`;
      ctx.fill();
    });

    /* ── orbit rings ── */
    PLANET_DEFS.forEach(p => {
      drawOrbit(px, py, minD * p.rFrac, p.tilt, 0.14);
    });

    /* ── SUN — orange+black glowing core ── */
    const sunR = minD * 0.082;
    // outer corona glow
    const corona = ctx.createRadialGradient(px, py, 0, px, py, sunR * 4);
    corona.addColorStop(0,   'rgba(255,110,20,0.28)');
    corona.addColorStop(0.3, 'rgba(255,60,0,0.12)');
    corona.addColorStop(0.65,'rgba(160,25,0,0.05)');
    corona.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(px, py, sunR * 4, 0, Math.PI*2);
    ctx.fillStyle = corona; ctx.fill();

    // solar surface pulse
    const pulse = 1 + Math.sin(frame * 0.055) * 0.042;
    const sunG  = ctx.createRadialGradient(px - sunR*0.28, py - sunR*0.28, 0, px, py, sunR * pulse);
    sunG.addColorStop(0,    'rgba(255,245,190,1)');
    sunG.addColorStop(0.10, 'rgba(255,210,70,1)');
    sunG.addColorStop(0.30, 'rgba(255,110,10,1)');
    sunG.addColorStop(0.58, 'rgba(210,42,0,0.97)');
    sunG.addColorStop(0.80, 'rgba(80,10,0,0.94)');
    sunG.addColorStop(1,    'rgba(0,0,0,0.92)');
    ctx.beginPath(); ctx.arc(px, py, sunR * pulse, 0, Math.PI * 2);
    ctx.fillStyle = sunG; ctx.fill();

    // hot-spot swirls on surface
    for(let i = 0; i < 6; i++){
      const sa = (i / 6) * Math.PI * 2 + frame * 0.017;
      const sx = px + Math.cos(sa) * sunR * 0.40;
      const sy = py + Math.sin(sa) * sunR * 0.40;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sunR * 0.42);
      sg.addColorStop(0, 'rgba(255,230,90,0.20)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(sx, sy, sunR * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = sg; ctx.fill();
    }

    // "5G" label on sun
    ctx.save();
    ctx.font = \`900 \${Math.round(sunR * 0.54)}px Outfit,sans-serif\`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle  = 'rgba(255,230,140,0.94)';
    ctx.shadowColor = 'rgba(255,160,40,0.9)';
    ctx.shadowBlur  = 18;
    ctx.fillText('5G', px, py);
    ctx.restore();

    /* ── PLANETS ── */
    PLANET_DEFS.forEach((p, idx) => {
      p.angle += p.speed;
      const orbitR = minD * p.rFrac;
      const pSize  = minD * (0.034 - idx * 0.0026);  // inner biggest
      const rawX   = Math.cos(p.angle) * orbitR;
      const rawY   = Math.sin(p.angle) * orbitR * p.tilt;
      const plX    = px + rawX;
      const plY    = py + rawY;
      const behind = Math.sin(p.angle) < 0;
      const dim    = behind ? 0.55 : 1.0;

      /* trail */
      p.trail.push({x: plX, y: plY});
      if(p.trail.length > 65) p.trail.shift();
      if(p.trail.length > 1){
        for(let i = 1; i < p.trail.length; i++){
          const prog = i / p.trail.length;
          ctx.beginPath();
          ctx.moveTo(p.trail[i-1].x, p.trail[i-1].y);
          ctx.lineTo(p.trail[i].x,   p.trail[i].y);
          ctx.strokeStyle = \`rgba(255,130,40,\${prog * 0.30 * dim})\`;
          ctx.lineWidth   = prog * pSize * 0.55;
          ctx.stroke();
        }
      }

      /* glow halo */
      ctx.globalAlpha = dim;
      const glowR = pSize * 3.2;
      const glH   = ctx.createRadialGradient(plX, plY, 0, plX, plY, glowR);
      glH.addColorStop(0, GLOW_COLORS[idx]);
      glH.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(plX, plY, glowR, 0, Math.PI * 2);
      ctx.fillStyle = glH; ctx.fill();

      /* planet body */
      const bc   = BODY_COLORS[idx];
      const pGrad = ctx.createRadialGradient(
        plX - pSize*0.32, plY - pSize*0.36, 0,
        plX, plY, pSize
      );
      pGrad.addColorStop(0,    bc[0]);
      pGrad.addColorStop(0.45, bc[1]);
      pGrad.addColorStop(1,    bc[2]);
      ctx.beginPath(); ctx.arc(plX, plY, pSize, 0, Math.PI * 2);
      ctx.fillStyle = pGrad; ctx.fill();

      /* specular highlight */
      const spec = ctx.createRadialGradient(
        plX - pSize*0.33, plY - pSize*0.37, 0,
        plX - pSize*0.33, plY - pSize*0.37, pSize * 0.52
      );
      spec.addColorStop(0, 'rgba(255,255,210,0.45)');
      spec.addColorStop(1, 'rgba(255,255,210,0)');
      ctx.beginPath(); ctx.arc(plX, plY, pSize, 0, Math.PI * 2);
      ctx.fillStyle = spec; ctx.fill();

      ctx.globalAlpha = 1;

      /* Saturn-like rings on Guides (idx=3) */
      if(idx === 3){
        ctx.save();
        ctx.translate(plX, plY);
        ctx.scale(1, 0.28);
        ctx.beginPath(); ctx.arc(0, 0, pSize * 2.2, 0, Math.PI * 2);
        ctx.strokeStyle = \`rgba(255,190,70,\${0.55 * dim})\`;
        ctx.lineWidth   = pSize * 0.38; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, pSize * 2.85, 0, Math.PI * 2);
        ctx.strokeStyle = \`rgba(255,150,40,\${0.32 * dim})\`;
        ctx.lineWidth   = pSize * 0.22; ctx.stroke();
        ctx.restore();
      }

      /* label */
      const lAlpha = behind ? 0.40 : 0.95;
      ctx.save();
      ctx.font = \`700 \${Math.max(11, pSize * 0.68)}px Outfit,sans-serif\`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle    = \`rgba(255,220,160,\${lAlpha})\`;
      ctx.shadowColor  = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur   = 9;
      ctx.fillText(p.label, plX, plY + pSize + 6);
      ctx.restore();
    });

    /* ── COMET ── */
    COMET.angle += COMET.speed;
    const cR = minD * COMET.rFrac;
    const cX = px + Math.cos(COMET.angle) * cR;
    const cY = py + Math.sin(COMET.angle) * cR * 0.26;
    for(let i = 0; i < COMET.tailLen; i++){
      const ta   = COMET.angle - i * 0.017;
      const tx   = px + Math.cos(ta) * cR;
      const ty   = py + Math.sin(ta) * cR * 0.26;
      const prog = (COMET.tailLen - i) / COMET.tailLen;
      ctx.beginPath();
      ctx.arc(tx, ty, COMET.size * prog, 0, Math.PI * 2);
      ctx.fillStyle = \`rgba(255,210,110,\${prog * 0.60})\`;
      ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cX, cY, COMET.size * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,245,190,0.98)'; ctx.fill();
  }

  render();
})();

/* ══════════════════════════════════════
   UI LOGIC
══════════════════════════════════════ */
function setMode(m){
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  document.querySelectorAll('.cxo-section').forEach(s => s.classList.toggle('hidden', m !== 'cxo'));
}

window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('solid', scrollY > 80);
}, { passive: true });

const rObs = new IntersectionObserver(e => {
  e.forEach(x => { if(x.isIntersecting) x.target.classList.add('visible'); });
}, { threshold: .1 });
document.querySelectorAll('.reveal,.reveal-left,.reveal-right').forEach(e => rObs.observe(e));

const cObs = new IntersectionObserver(e => {
  e.forEach(x => {
    if(!x.isIntersecting || x.target.dataset.done) return;
    x.target.dataset.done = '1';
    const end = +x.target.dataset.end, dur = end > 1000 ? 3200 : 2000, st = Date.now();
    !function tick(){
      const prog = Math.min((Date.now()-st)/dur, 1);
      const ea   = 1 - Math.pow(1 - prog, 3);
      x.target.textContent = Math.floor(ea * end).toLocaleString();
      if(prog < 1) requestAnimationFrame(tick);
    }();
  });
}, { threshold: .3 });
document.querySelectorAll('.counter').forEach(e => cObs.observe(e));

/* 5G cards */
const gVals = [
  { n:"Go-getter", d:"Focus on Solutions. Embrace ambiguity. Deliver outcomes, resourcefully." },
  { n:"Gifted",    d:"Exceptional. Make connections that others miss. Thrive on change and making things simple." },
  { n:"Genuine",   d:"Authentic. Transparent. Known for candour and being consistent on and off face." },
  { n:"Guides",    d:"Curious seekers and admired sources of knowledge in their areas of expertise." },
  { n:"Grounded",  d:"Accepting of divergent thoughts to find the best solution there is." }
];
const gG = document.getElementById('gvalues');
gVals.forEach((v, i) => {
  const d = document.createElement('div');
  d.className = 'gcard reveal';
  d.style.transitionDelay = i * 120 + 'ms';
  d.innerHTML = '<div class="bg-g">G</div><div class="gname">' + v.n + '</div><p class="gdesc">' + v.d + '</p>';
  gG.appendChild(d); rObs.observe(d);
});

/* Timeline */
const tlD = [
  { y:"2025", t:"Platform Launch & TARA Adoption",    d:"100% of hiring through TARA — No shadow processes; all fulfillment signals in one system" },
  { y:"2026", t:"First Global Partnerships",           d:"Minimum 2 global partnerships secured and deliver 1 mega sign-up per year" },
  { y:"2027", t:"International Expansion",             d:"International Revenue Mix ≥25% of total revenue from international markets" },
  { y:"2028", t:"Scaling the Dream Team",              d:"Build a Dream Team of Agents, AI Natives — per-member revenue of USD 80K/year" },
  { y:"2029", t:"Market Leadership",                   d:"Establish the highest recall as an ATF (AI Talent Fulfilment) company" },
  { y:"2030", t:"Fulfill 1 Million Jobs",              d:"Annual Revenue: USD 41M — Vision achieved" }
];
const tW = document.getElementById('timeline');
tlD.forEach((n, i) => {
  const isL = i % 2 === 0;
  const nd  = document.createElement('div');
  nd.className = 'tl-node ' + (isL ? 'reveal-left' : 'reveal-right');
  nd.style.transitionDelay = i * 150 + 'ms';
  const cH = '<div class="tl-card"><div class="tl-card-title">' + n.t + '</div><div class="tl-card-desc">' + n.d + '</div></div>';
  nd.innerHTML = '<div class="tl-side" style="text-align:right">' + (isL ? cH : '') + '</div>' +
    '<div class="tl-center"><div class="tl-dot"></div><div class="tl-year">' + n.y + '</div></div>' +
    '<div class="tl-side" style="text-align:left">' + (!isL ? cH : '') + '</div>';
  tW.appendChild(nd); rObs.observe(nd);
});

/* Metrics — 1M card special treatment */
const mts = [
  { e:1000000, p:'', s:'', l:'Jobs to Fulfill by 2030', isMillion:true },
  { e:41,  p:'$', s:'M', l:'Revenue Target' },
  { e:80,  p:'$', s:'K', l:'Per-Member Revenue' },
  { e:25,  p:'', s:'%', l:'International Revenue Mix' },
  { e:2,   p:'', s:'',  l:'Global Partnerships Min.' }
];
const mG = document.getElementById('metrics-grid');
mts.forEach((m, i) => {
  const d = document.createElement('div');
  d.style.transitionDelay = i * 100 + 'ms';
  d.className = 'card-metric reveal';
  if(m.isMillion){
    d.innerHTML = '<span class="metric-num">1M</span><div class="metric-lbl">' + m.l + '</div>';
  } else {
    d.innerHTML = '<span class="metric-num">' + m.p + '<span class="counter" data-end="' + m.e + '">0</span>' + m.s + '</span>' +
      '<div class="metric-lbl">' + m.l + '</div>';
  }
  mG.appendChild(d); rObs.observe(d);
  d.querySelectorAll('.counter').forEach(c => cObs.observe(c));
});

/* DNA radial */
(function(){
  const vals = [
    { n:"Go-getter", d:"Focus on Solutions. Embrace ambiguity.", angle:-90 },
    { n:"Gifted",    d:"Make connections that others miss.",     angle:-18 },
    { n:"Genuine",   d:"Authentic. Transparent. Consistent.",   angle: 54 },
    { n:"Guides",    d:"Admired sources of knowledge.",         angle:126 },
    { n:"Grounded",  d:"Accepting of divergent thoughts.",      angle:198 }
  ];
  const list = document.getElementById('dna-list');
  const visual = document.getElementById('dna-visual');
  const linesSvg = document.getElementById('dna-lines');
  let active = 0;
  const radius = 150, cx = 200, cy = 200;
  const dots = [], labels = [];

  vals.forEach((v, i) => {
    const item = document.createElement('div');
    item.className = 'dna-item' + (i === 0 ? ' active' : '');
    item.innerHTML = '<div class="dna-num">' + (i+1) + '</div><div><div class="dna-name">' + v.n + '</div><div class="dna-desc">' + v.d + '</div></div>';
    item.onclick = () => setA(i);
    list.appendChild(item);
  });

  vals.forEach((v, i) => {
    const rad = v.angle * Math.PI / 180;
    const x = Math.cos(rad) * radius + cx;
    const y = Math.sin(rad) * radius + cy;
    const dot = document.createElement('div');
    dot.className = 'dna-dot' + (i === 0 ? ' active' : '');
    dot.style.cssText = 'left:' + (x-6) + 'px;top:' + (y-6) + 'px;';
    dot.onclick = () => setA(i);
    visual.appendChild(dot);
    dots.push({ el: dot, x, y });
    const label = document.createElement('div');
    label.className = 'dna-dot-label' + (i === 0 ? ' active' : '');
    const lx = Math.cos(rad) * (radius + 32) + cx;
    const ly = Math.sin(rad) * (radius + 32) + cy;
    label.style.cssText = 'left:' + lx + 'px;top:' + ly + 'px;transform:translate(-50%,-50%);';
    label.textContent = v.n;
    label.onclick = () => setA(i);
    visual.appendChild(label);
    labels.push(label);
  });

  function drawLines(){
    let path = '';
    for(let i = 0; i < dots.length; i++){
      const next = (i+1) % dots.length;
      path += '<line x1="' + dots[i].x + '" y1="' + dots[i].y + '" x2="' + dots[next].x + '" y2="' + dots[next].y + '" stroke="#E74B23" stroke-width="1" opacity="0.15"/>';
    }
    for(let i = 0; i < dots.length; i++){
      const skip = (i+2) % dots.length;
      path += '<line x1="' + dots[i].x + '" y1="' + dots[i].y + '" x2="' + dots[skip].x + '" y2="' + dots[skip].y + '" stroke="#E74B23" stroke-width="0.5" opacity="0.08"/>';
    }
    path += '<line x1="' + cx + '" y1="' + cy + '" x2="' + dots[active].x + '" y2="' + dots[active].y + '" stroke="#E74B23" stroke-width="2" opacity="0.4"/>';
    linesSvg.innerHTML = path;
  }
  drawLines();

  function setA(i){
    active = i;
    document.querySelectorAll('.dna-item').forEach((el, j) => el.classList.toggle('active', j === i));
    dots.forEach((d, j) => {
      d.el.classList.toggle('active', j === i);
      d.el.style.width  = (j===i ? 20 : 12) + 'px';
      d.el.style.height = (j===i ? 20 : 12) + 'px';
      d.el.style.left   = (d.x - (j===i ? 10 : 6)) + 'px';
      d.el.style.top    = (d.y - (j===i ? 10 : 6)) + 'px';
    });
    labels.forEach((l, j) => l.classList.toggle('active', j === i));
    drawLines();
  }
})();
</script>
</body>
</html>`)
})

export default app
