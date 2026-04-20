import { Resend } from "resend";

const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
};

const getFromEmail = () =>
  process.env.RESEND_FROM_EMAIL || "Beatific.co <noreply@beatific.co>";

export const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const sendVerificationEmail = async (email: string, code: string, name: string) => {
  const resend = getResend();

  const html = `
    <div style="font-family: 'Inter', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
      <h2 style="color: #212B36; margin: 0 0 8px;">Verify your email</h2>
      <p style="color: #637381; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Hi ${name}, use the code below to verify your email address.
      </p>
      <div style="background: #F4F6F8; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #00A76F;">${code}</span>
      </div>
      <p style="color: #919EAB; font-size: 12px; margin: 0;">
        This code expires in 15 minutes. If you didn't request this, ignore this email.
      </p>
    </div>
  `;

  if (!resend) {
    console.log(`\n📧 VERIFICATION EMAIL → ${email}\n   Code: ${code}\n`);
    return;
  }

  await resend.emails.send({
    from: getFromEmail(),
    to: email,
    subject: `${code} — Verify your Beatific.co email`,
    html,
  });
};

export const sendInvitationEmail = async (
  email: string,
  companyName: string,
  inviterName: string,
  inviteLink: string
) => {
  const resend = getResend();

  const html = `
    <div style="font-family: 'Inter', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
      <h2 style="color: #212B36; margin: 0 0 8px;">You're invited!</h2>
      <p style="color: #637381; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        ${inviterName} has invited you to join <strong>${companyName}</strong> on Beatific.co.
      </p>
      <a href="${inviteLink}" style="display: inline-block; background: #00A76F; color: #fff; padding: 12px 32px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 14px;">
        Accept Invitation
      </a>
      <p style="color: #919EAB; font-size: 12px; margin: 24px 0 0;">
        This invitation expires in 7 days.
      </p>
    </div>
  `;

  if (!resend) {
    console.log(`\n📧 INVITATION EMAIL → ${email}\n   Company: ${companyName}\n   Link: ${inviteLink}\n`);
    return;
  }

  await resend.emails.send({
    from: getFromEmail(),
    to: email,
    subject: `Join ${companyName} on Beatific.co`,
    html,
  });
};
