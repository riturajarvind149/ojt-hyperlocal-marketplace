const nodemailer = require("nodemailer");

/**
 * Returns true only when real email credentials are configured
 * (not the placeholder values from .env template).
 */
function hasRealCredentials() {
  const user = process.env.EMAIL_USER || "";
  const pass = process.env.EMAIL_PASS || "";
  return (
    user.length > 0 &&
    pass.length > 0 &&
    !user.includes("your_email") &&
    !pass.includes("your_app_password")
  );
}

/**
 * Creates a nodemailer transporter.
 * - Uses Gmail/SMTP when real credentials are set in .env
 * - Falls back to console-only mode (no network) when credentials are placeholders
 */
async function getTransporter() {
  if (hasRealCredentials()) {
    return nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  // No real credentials — use Ethereal test account (free, no setup needed)
  // Ethereal emails are NOT delivered; preview URL is logged to console.
  try {
    const testAccount = await nodemailer.createTestAccount();
    console.warn("[EmailService] Using Ethereal test account (emails not delivered).");
    console.warn("[EmailService] Set EMAIL_USER and EMAIL_PASS in .env to send real emails.");
    return nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
  } catch {
    // Ethereal unavailable (no internet) — return null, callers handle gracefully
    return null;
  }
}

/**
 * Send an email. Returns silently if transporter is unavailable.
 */
async function sendMail(to, subject, html) {
  const transporter = await getTransporter();
  if (!transporter) {
    console.warn(`[EmailService] Cannot send email to ${to} — no transporter available.`);
    return null;
  }
  const info = await transporter.sendMail({
    from: `"LocalHire" <${process.env.EMAIL_USER || "noreply@localhire.app"}>`,
    to,
    subject,
    html
  });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[EmailService] Preview: ${previewUrl}`);
  }
  return info;
}

async function sendVerificationEmail(toEmail, otp, name) {
  return sendMail(
    toEmail,
    "Verify your LocalHire account",
    `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px">
      <h2 style="color:#2563eb">LocalHire — Email Verification</h2>
      <p>Hi <strong>${name}</strong>,</p>
      <p>Use the OTP below to verify your email address. It expires in <strong>15 minutes</strong>.</p>
      <div style="font-size:2rem;font-weight:700;letter-spacing:0.3em;text-align:center;padding:20px;background:#f1f5f9;border-radius:8px;margin:24px 0">${otp}</div>
      <p style="color:#6b7280;font-size:0.85rem">If you didn't create a LocalHire account, you can safely ignore this email.</p>
    </div>`
  );
}

async function sendPasswordResetEmail(toEmail, otp, name) {
  return sendMail(
    toEmail,
    "Reset your LocalHire password",
    `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px">
      <h2 style="color:#dc2626">LocalHire — Password Reset</h2>
      <p>Hi <strong>${name}</strong>,</p>
      <p>Use the OTP below to reset your password. It expires in <strong>15 minutes</strong>.</p>
      <div style="font-size:2rem;font-weight:700;letter-spacing:0.3em;text-align:center;padding:20px;background:#fef2f2;border-radius:8px;margin:24px 0">${otp}</div>
      <p style="color:#6b7280;font-size:0.85rem">If you didn't request a password reset, you can safely ignore this email.</p>
    </div>`
  );
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
