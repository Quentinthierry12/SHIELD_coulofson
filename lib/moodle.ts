import { db } from "./db";

// One-way account sync: portal → Moodle (S.H.I.E.L.D. Academy) via Moodle Web Services.
// Best-effort everywhere — Moodle being down must never break a portal account action.

export const moodleEnabled = () => !!(process.env.MOODLE_URL && process.env.MOODLE_TOKEN);

// Moodle usernames: lowercase, restricted to the default allowed character set.
const muser = (matricule: string) => matricule.toLowerCase().replace(/[^a-z0-9._@-]/g, "");

async function call(fn: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams({
    wstoken: process.env.MOODLE_TOKEN!,
    wsfunction: fn,
    moodlewsrestformat: "json",
    ...params,
  });
  const res = await fetch(`${process.env.MOODLE_URL}/webservice/rest/server.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  // Moodle reports errors in the payload (HTTP 200 + {exception}), so surface them in the logs.
  if (json?.exception) console.error(`[moodle] ${fn}: ${json.errorcode} — ${json.message}`);
  return json;
}

async function findByUsername(username: string): Promise<number | null> {
  const r = await call("core_user_get_users_by_field", { field: "username", "values[0]": username });
  return Array.isArray(r) && r[0]?.id ? r[0].id : null;
}

// Create the Moodle account if missing (or relink), set/refresh its data. Stores moodle_id
// on the portal user. `password` is only applied when provided (available at create/register/change).
export async function syncMoodleUser(
  portalUserId: number,
  agent: { matricule: string; codename: string; division?: string; suspended?: boolean },
  password?: string
): Promise<{ id: number; created: boolean } | null> {
  if (!moodleEnabled()) return null;
  try {
    const pool = await db();
    const { rows } = await pool.query("SELECT moodle_id FROM users WHERE id = $1", [portalUserId]);
    let mid: number | null = rows[0]?.moodle_id || null;
    const username = muser(agent.matricule);
    if (!mid) mid = await findByUsername(username);
    const existed = !!mid;

    if (mid) {
      const p: Record<string, string> = {
        "users[0][id]": String(mid),
        // Username AND email follow the badge: without this, renaming an agent on the
        // portal would leave them signing in to the Academy with their old badge, and
        // carrying a stale address built from it.
        "users[0][username]": username,
        "users[0][email]": `${username}@shield.local`,
        "users[0][firstname]": agent.codename,
        "users[0][lastname]": agent.matricule,
        "users[0][suspended]": agent.suspended ? "1" : "0",
      };
      if (password) p["users[0][password]"] = password;
      await call("core_user_update_users", p);
    } else {
      // core_user_create_users takes no `suspended` param (update_users does) — sending it
      // fails the whole call with `invalidparameter`, so suspend in a second step.
      const created = await call("core_user_create_users", {
        "users[0][username]": username,
        "users[0][password]": password || Math.random().toString(36).slice(2) + "Aa1!",
        "users[0][firstname]": agent.codename,
        "users[0][lastname]": agent.matricule,
        "users[0][email]": `${username}@shield.local`,
        "users[0][auth]": "manual",
      });
      mid = Array.isArray(created) && created[0]?.id ? created[0].id : null;
      if (mid && agent.suspended) {
        await call("core_user_update_users", { "users[0][id]": String(mid), "users[0][suspended]": "1" });
      }
    }
    if (mid) await pool.query("UPDATE users SET moodle_id = $2 WHERE id = $1", [portalUserId, mid]);
    return mid ? { id: mid, created: !existed } : null;
  } catch (e) {
    console.error("[moodle] sync failed:", e);
    return null;
  }
}

export async function setMoodlePassword(portalUserId: number, password: string) {
  if (!moodleEnabled()) return;
  try {
    const pool = await db();
    const { rows } = await pool.query("SELECT moodle_id FROM users WHERE id = $1", [portalUserId]);
    if (rows[0]?.moodle_id) {
      await call("core_user_update_users", { "users[0][id]": String(rows[0].moodle_id), "users[0][password]": password });
    }
  } catch (e) {
    console.error("[moodle] sync failed:", e);
  }
}

export async function deleteMoodleUser(portalUserId: number) {
  if (!moodleEnabled()) return;
  try {
    const pool = await db();
    const { rows } = await pool.query("SELECT moodle_id FROM users WHERE id = $1", [portalUserId]);
    if (rows[0]?.moodle_id) await call("core_user_delete_users", { "userids[0]": String(rows[0].moodle_id) });
  } catch (e) {
    console.error("[moodle] sync failed:", e);
  }
}
