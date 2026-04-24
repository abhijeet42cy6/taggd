export const COW_HERO = {
  eyebrow: "Taggd Strategic Framework",
  titleLine1: "Code of",
  titleLine2: "Work",
  description:
    "The strategic and cultural compass that defines how Taggers create impact — powering the recruiters of tomorrow.",
} as const;

export const COW_PILLARS = [
  { label: "Purpose" as const, sub: null as string | null },
  { label: "Mission" as const, sub: "mission-atf" as const },
  { label: "Vision" as const, sub: null as string | null },
] as const;

export const COW_KSF = [
  {
    stat: "2",
    text: "Minimum 2 global partnerships and deliver 1 mega sign-up per year through partnerships",
  },
  {
    stat: "100%",
    text: "100% of hiring through TARA — No shadow processes; all fulfillment signals captured in one system",
  },
  {
    stat: "≥25%",
    text: "International Revenue Mix of total revenue from international markets by 2030",
  },
] as const;

export const COW_KRF = [
  "Delay in Changing the Way of Working",
  "Delay in achieving Product-Market fit",
  "Eyes Off Profitability (ROI) | Working Capital",
] as const;

export const COW_FIVE_G = [
  { name: "Go-getter", desc: "Focus on Solutions. Embrace ambiguity. Deliver outcomes, resourcefully." },
  { name: "Gifted", desc: "Exceptional. Make connections that others miss. Thrive on change and making things simple." },
  { name: "Genuine", desc: "Authentic. Transparent. Known for candour and being consistent on and off face." },
  { name: "Guides", desc: "Curious seekers and admired sources of knowledge in their areas of expertise." },
  { name: "Grounded", desc: "Accepting of divergent thoughts to find the best solution there is." },
] as const;

export const COW_TIMELINE = [
  { year: "2025", title: "Platform Launch & TARA Adoption", desc: "100% of hiring through TARA — No shadow processes; all fulfillment signals in one system" },
  { year: "2026", title: "First Global Partnerships", desc: "Minimum 2 global partnerships secured and deliver 1 mega sign-up per year" },
  { year: "2027", title: "International Expansion", desc: "International Revenue Mix ≥25% of total revenue from international markets" },
  { year: "2028", title: "Scaling the Dream Team", desc: "Build a Dream Team of Agents, AI Natives — per-member revenue of USD 80K/year" },
  { year: "2029", title: "Market Leadership", desc: "Establish the highest recall as an ATF (AI Talent Fulfilment) company" },
  { year: "2030", title: "Fulfill 1 Million Jobs", desc: "Annual Revenue: USD 41M — Vision achieved" },
] as const;

export const COW_METRICS = [
  { display: "1M", label: "Jobs to Fulfill by 2030", highlight: true },
  { display: "$41M", label: "Revenue Target", highlight: false },
  { display: "$80K", label: "Per-Member Revenue", highlight: false },
  { display: "25%", label: "International Revenue Mix", highlight: false },
  { display: "2", label: "Global Partnerships Min.", highlight: false },
] as const;

export const COW_DNA = [
  { name: "Go-getter", short: "Focus on Solutions. Embrace ambiguity.", detail: "Focus on Solutions. Embrace ambiguity. Deliver outcomes, resourcefully." },
  { name: "Gifted", short: "Make connections that others miss.", detail: "Exceptional. Make connections that others miss. Thrive on change and making things simple." },
  { name: "Genuine", short: "Authentic. Transparent. Consistent.", detail: "Authentic. Transparent. Known for candour and being consistent on and off face." },
  { name: "Guides", short: "Admired sources of knowledge.", detail: "Curious seekers and admired sources of knowledge in their areas of expertise." },
  { name: "Grounded", short: "Accepting of divergent thoughts.", detail: "Accepting of divergent thoughts to find the best solution there is." },
] as const;
