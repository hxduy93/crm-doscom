import type { Decision, Env } from "./types";

interface NotifyPayload {
  subject: string;
  textBody: string;
}

export async function sendImportantNotification(
  env: Env,
  decisions: Decision[],
  runId: number,
  dailySpendUsd: number
): Promise<void> {
  const important = decisions.filter((d) => d.importance === "high");
  if (important.length === 0) return;

  const lines = important.map(
    (d, i) =>
      `${i + 1}. [${d.action_type.toUpperCase()}] ${d.campaign_name ?? d.campaign_id}\n` +
      `   Payload: ${JSON.stringify(d.payload)}\n` +
      `   Lý do: ${d.reasoning}\n`
  );
  const body = [
    `FB Ads Auto Agent — run #${runId}`,
    `Time: ${new Date().toISOString()}`,
    `Daily spend so far: $${dailySpendUsd.toFixed(2)}`,
    `Account: ${env.AD_ACCOUNT_ID}`,
    `Shadow mode: ${env.SHADOW_MODE}`,
    "",
    `${important.length} HIGH-IMPORTANCE decision(s):`,
    "",
    ...lines,
    "",
    "—",
    "Xem chi tiết: query D1 table `decisions` WHERE run_id = " + runId,
  ].join("\n");

  await sendViaGmailSmtp(env, {
    subject: `[FB Agent] ${important.length} high-priority action(s) — spend $${dailySpendUsd.toFixed(0)}`,
    textBody: body,
  });
}

async function sendViaGmailSmtp(env: Env, payload: NotifyPayload): Promise<void> {
  const r = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: env.NOTIFY_EMAIL }],
        },
      ],
      from: { email: env.NOTIFY_EMAIL, name: "FB Ads Auto Agent" },
      subject: payload.subject,
      content: [{ type: "text/plain", value: payload.textBody }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error(`Notify failed ${r.status}: ${t.slice(0, 300)}`);
  }
}
