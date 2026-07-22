// ---- Faction branding & lore (approach B: one codebase, many RP factions) ----
// Everything faction-specific reads from here. Values come from NEXT_PUBLIC_* env vars, which
// Next inlines at BUILD time and are readable from both server and client components, with
// S.H.I.E.L.D. defaults so the current deployment is unchanged when nothing is set.
//
// References must be to the literal `process.env.NEXT_PUBLIC_*` (not a dynamic key) — that is
// the only form Next inlines into the client bundle. To spin up another faction, set these on
// its own Coolify app and swap the logo assets in public/.
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "S.H.I.E.L.D.",
  short: process.env.NEXT_PUBLIC_BRAND_SHORT || "S.H.I.E.L.D.",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || "Central Document System",
  full: process.env.NEXT_PUBLIC_BRAND_FULL || "Strategic Homeland Intervention, Enforcement and Logistics Division",
  emoji: process.env.NEXT_PUBLIC_BRAND_EMOJI || "🦅",
  accent: process.env.NEXT_PUBLIC_BRAND_ACCENT || "#4da6ff",
  protocol: process.env.NEXT_PUBLIC_LORE_PROTOCOL || "Protocol 7-Alpha",
  destroyProtocol: process.env.NEXT_PUBLIC_LORE_DESTROY || "Destruction Protocol 4-Delta",
  discordCommandsUrl:
    process.env.NEXT_PUBLIC_DISCORD_COMMANDS_URL ||
    "https://discord.com/channels/1371057544579252224/1513475225474306069",
  terms: {
    agent: process.env.NEXT_PUBLIC_TERMS_AGENT || "Agent",
    officer: process.env.NEXT_PUBLIC_TERMS_OFFICER || "Officer",
    division: process.env.NEXT_PUBLIC_TERMS_DIVISION || "Division",
    mission: process.env.NEXT_PUBLIC_TERMS_MISSION || "Mission",
  },
};

// The notification prefix used across push/Discord messages, e.g. "🦅 **S.H.I.E.L.D. TRANSMISSION**".
export const dmPrefix = (headline = "TRANSMISSION") => `${brand.emoji} **${brand.name} ${headline}**`;
