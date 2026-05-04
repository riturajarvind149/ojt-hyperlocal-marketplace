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
 * Creates a nodemailer transporter using explicit Gmail SMTP settings.
 * Using explicit host/port instead of service:"gmail" is more reliable
 * on cloud platforms like Render.
 */
function getTransporter() {
  if (hasRealCredentials()) {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,           // SSL on port 465
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }
  return null;
}

/**
 * Send an email with a hard timeout wrapper.
 * Never throws — always resolves (returns null on failure).
 */
async function sendMail(to, subject, html) {
  const transporter = getTransporter();

  if (!transporter) {
    console.warn(`[EmailService] No credentials configured — skipping email to ${to}`);
    console.warn(`[EmailService] Set EMAIL_USER and EMAIL_PASS in environment variables.`);
    return null;
  }

  // Wrap in a timeout so a hanging SMTP connection never blocks the API response
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Email send timeout after 20s")), 20000)
  );

  try {
    const sendPromise = transporter.sendMail({
      from: `"LocalHire" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });

    const info = await Promise.race([sendPromise, timeoutPromise]);
    console.log(`[EmailService] Email sent to ${to} — MessageId: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`[EmailService] Failed to send email to ${to}: ${err.message}`);
    return null;  // Never throw — callers handle null gracefully
  }
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
