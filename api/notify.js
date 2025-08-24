//const Notification = require("../database/notification"); gotta add that in
const { User, Hunt } = require("../database");

// Dynamic loaders so app runs even if packages aren't installed
function loadNodemailer() {
  try {
    return require("nodemailer");
  } catch (e) {
    return null;
  }
}
function loadTwilio() {
  try {
    return require("twilio");
  } catch (e) {
    return null;
  }
}

async function logNotification({ userId, type, template, status, error }) {
  try {
    await Notification.create({
      userId,
      type,
      template,
      deliveryStatus: status || "queued",
      sentAt: status === "sent" ? new Date() : null,
      errorMessage: error || null,
    });
  } catch (e) {
    console.warn("[notify] failed to log notification:", e?.message || e);
  }
}

function buildTransport() {
  const nodemailer = loadNodemailer();
  if (!nodemailer) return null;

  // Prefer a single URL (e.g. SMTP URI); otherwise fall back to discrete vars
  const url = process.env.MAIL_TRANSPORT_URL || process.env.SMTP_URL || null;
  if (url) {
    try {
      return nodemailer.createTransport(url);
    } catch (e) {
      console.warn("[notify] failed to create transport from URL:", e?.message || e);
      return null;
    }
  }

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendEmail({ to, subject, text, html }) {
  const transport = buildTransport();
  if (!transport) return { ok: false, reason: "no-transport" };
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || "no-reply@sidequest.app";
  try {
    await transport.sendMail({ from, to, subject, text, html });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Optional SMS via Twilio
async function sendSMS({ to, body }) {
  const twilio = loadTwilio();
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!twilio || !sid || !token || !from || !to) {
    return { ok: false, reason: "not-configured" };
  }
  try {
    const client = twilio(sid, token);
    await client.messages.create({ from, to, body });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return null;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2,"0")).join(":");
}

/** Send notifications when a user completes a hunt */
async function sendHuntCompletion({ user, hunt, userHunt }) {
  const when = userHunt?.completedAt ? new Date(userHunt.completedAt) : new Date();
  const dur = formatDuration(userHunt?.totalTimeSeconds);
  const subject = `🎉 You completed "${hunt.title}"!`;
  const bodyText = `Congrats ${user.username}! You completed "${hunt.title}" on ${when.toLocaleString()}${dur ? ` in ${dur}`: ""}.`;
  const html = `<p>Congrats <strong>${user.username}</strong>!<br/>You completed "<strong>${hunt.title}</strong>" on <strong>${when.toLocaleString()}</strong>${dur ? ` in <strong>${dur}</strong>`: ""}.</p>
<p><a href="/api/users/${user.id}/certificate/${hunt.id}?download=1">Download your certificate</a></p>`;

  // Player email
  if (user.email) {
    const resp = await sendEmail({ to: user.email, subject, text: bodyText, html });
    await logNotification({
      userId: user.id,
      type: "email",
      template: "hunt_completed_player",
      status: resp.ok ? "sent" : "failed",
      error: resp.error,
    });
  }

  // Creator email
  if (hunt.creator && hunt.creator.email) {
    const cSubj = `✅ ${user.username} finished your hunt "${hunt.title}"`;
    const cBody = `${user.username} just completed "${hunt.title}" on ${when.toLocaleString()}${dur ? ` in ${dur}`: ""}.`;
    const resp = await sendEmail({ to: hunt.creator.email, subject: cSubj, text: cBody, html: `<p>${cBody}</p>` });
    await logNotification({
      userId: hunt.creator.id,
      type: "email",
      template: "hunt_completed_creator",
      status: resp.ok ? "sent" : "failed",
      error: resp.error,
    });
  }
}

module.exports = { sendHuntCompletion, sendEmail, sendSMS, logNotification };
