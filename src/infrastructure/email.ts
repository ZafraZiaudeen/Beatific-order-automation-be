import { Resend } from "resend";

type InviteEmailResult = {
  delivered: boolean;
  mode: "provider" | "logged";
  error?: string;
  id?: string;
};

type InvitationEmailOptions = {
  email: string;
  companyName: string;
  inviterName: string;
  inviteLink: string;
  role: string;
  expiresAt: Date;
  expiresInHours: number;
};

const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
};

const getFromEmail = () =>
  process.env.RESEND_FROM_EMAIL || "Beatific.co <noreply@beatific.co>";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });

const formatRoleLabel = (role: string) =>
  role ? role.charAt(0).toUpperCase() + role.slice(1) : "Member";

const getRoleDescription = (role: string) => {
  if (role === "admin") {
    return "Can manage products, orders, and team invitations.";
  }

  return "Can view and process orders.";
};

const formatInviteLifetime = (hours: number) => {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  return `${hours} hour${hours === 1 ? "" : "s"}`;
};

const formatInviteExpiry = (expiresAt: Date) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(expiresAt);

const getProviderErrorMessage = (error: unknown) => {
  if (!error) return "Email provider rejected the request";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;

  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return "Email provider rejected the request";
};

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
    console.log(`\nVERIFICATION EMAIL -> ${email}\n   Code: ${code}\n`);
    return;
  }

  const { error } = await resend.emails.send({
    from: getFromEmail(),
    to: email,
    subject: `${code} - Verify your Beatific.co email`,
    html,
  });

  if (error) {
    throw new Error(getProviderErrorMessage(error));
  }
};

export const sendInvitationEmail = async ({
  email,
  companyName,
  inviterName,
  inviteLink,
  role,
  expiresAt,
  expiresInHours,
}: InvitationEmailOptions): Promise<InviteEmailResult> => {
  const resend = getResend();
  const roleLabel = formatRoleLabel(role);
  const roleDescription = getRoleDescription(role);
  const inviteLifetime = formatInviteLifetime(expiresInHours);
  const expiryLabel = formatInviteExpiry(expiresAt);
  const safeCompanyName = escapeHtml(companyName);
  const safeInviterName = escapeHtml(inviterName);
  const safeInviteLink = escapeHtml(inviteLink);
  const safeEmail = escapeHtml(email);

  const html = `
    <div style="margin: 0; padding: 0; background: #edf5f0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #edf5f0;">
        <tr>
          <td align="center" style="padding: 32px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 640px;">
              <tr>
                <td style="padding: 0 0 18px; text-align: center;">
                  <span style="display: inline-block; font-family: Arial, Helvetica, sans-serif; font-size: 13px; letter-spacing: 0.2em; text-transform: uppercase; color: #0f8f67; font-weight: 700;">
                    Beatific
                  </span>
                </td>
              </tr>
              <tr>
                <td style="background: linear-gradient(135deg, #0f8f67 0%, #14b57d 100%); border-radius: 28px 28px 0 0; padding: 28px 32px;">
                  <div style="font-family: Arial, Helvetica, sans-serif; color: #dff8ee; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; margin-bottom: 12px;">
                    Team Invitation
                  </div>
                  <div style="font-family: Arial, Helvetica, sans-serif; color: #ffffff; font-size: 30px; line-height: 1.2; font-weight: 700; margin: 0;">
                    You're invited to join ${safeCompanyName}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="background: #ffffff; border: 1px solid #dbe9e0; border-top: none; border-radius: 0 0 28px 28px; padding: 0 32px 32px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td style="padding-top: 28px;">
                        <div style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.7; color: #29443a;">
                          <strong>${safeInviterName}</strong> invited you to join Beatific as a
                          <span style="display: inline-block; margin-left: 6px; padding: 4px 10px; border-radius: 999px; background: #dcfce7; color: #166534; font-size: 13px; font-weight: 700;">
                            ${roleLabel}
                          </span>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top: 18px;">
                        <div style="background: #f6fbf8; border: 1px solid #dbe9e0; border-radius: 20px; padding: 22px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td width="50%" valign="top" style="padding: 0 10px 14px 0;">
                                <div style="font-family: Arial, Helvetica, sans-serif; color: #6b7e76; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">
                                  Access level
                                </div>
                                <div style="font-family: Arial, Helvetica, sans-serif; color: #10231d; font-size: 20px; line-height: 1.3; font-weight: 700; margin-bottom: 6px;">
                                  ${roleLabel}
                                </div>
                                <div style="font-family: Arial, Helvetica, sans-serif; color: #486158; font-size: 13px; line-height: 1.6;">
                                  ${roleDescription}
                                </div>
                              </td>
                              <td width="50%" valign="top" style="padding: 0 0 14px 10px;">
                                <div style="font-family: Arial, Helvetica, sans-serif; color: #6b7e76; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">
                                  Expires
                                </div>
                                <div style="font-family: Arial, Helvetica, sans-serif; color: #10231d; font-size: 20px; line-height: 1.3; font-weight: 700; margin-bottom: 6px;">
                                  ${expiryLabel} UTC
                                </div>
                                <div style="font-family: Arial, Helvetica, sans-serif; color: #486158; font-size: 13px; line-height: 1.6;">
                                  This invite stays active for ${inviteLifetime}.
                                </div>
                              </td>
                            </tr>
                            <tr>
                              <td colspan="2" style="padding-top: 10px;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                  <tr>
                                    <td style="padding: 14px 0; border-top: 1px solid #dbe9e0;">
                                      <span style="display: inline-block; width: 120px; font-family: Arial, Helvetica, sans-serif; color: #6b7e76; font-size: 12px; font-weight: 700;">Company</span>
                                      <span style="font-family: Arial, Helvetica, sans-serif; color: #10231d; font-size: 14px;">${safeCompanyName}</span>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 14px 0; border-top: 1px solid #dbe9e0;">
                                      <span style="display: inline-block; width: 120px; font-family: Arial, Helvetica, sans-serif; color: #6b7e76; font-size: 12px; font-weight: 700;">Invited email</span>
                                      <span style="font-family: Arial, Helvetica, sans-serif; color: #10231d; font-size: 14px;">${safeEmail}</span>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 14px 0 0; border-top: 1px solid #dbe9e0;">
                                      <span style="display: inline-block; width: 120px; font-family: Arial, Helvetica, sans-serif; color: #6b7e76; font-size: 12px; font-weight: 700;">Invited by</span>
                                      <span style="font-family: Arial, Helvetica, sans-serif; color: #10231d; font-size: 14px;">${safeInviterName}</span>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding: 28px 0 18px;">
                        <a href="${safeInviteLink}" style="display: inline-block; background: #0f8f67; color: #ffffff; padding: 15px 30px; border-radius: 14px; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 700; text-decoration: none;">
                          Accept Invitation
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top: 2px;">
                        <div style="font-family: Arial, Helvetica, sans-serif; color: #6b7e76; font-size: 12px; line-height: 1.6; margin-bottom: 10px;">
                          If the button does not work, copy and paste this secure invitation link into your browser:
                        </div>
                        <div style="background: #f6fbf8; border: 1px dashed #b8d2c6; border-radius: 14px; padding: 14px;">
                          <a href="${safeInviteLink}" style="font-family: Arial, Helvetica, sans-serif; color: #0f8f67; font-size: 12px; line-height: 1.7; word-break: break-all; text-decoration: none;">
                            ${safeInviteLink}
                          </a>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top: 18px;">
                        <div style="font-family: Arial, Helvetica, sans-serif; color: #6b7e76; font-size: 12px; line-height: 1.7;">
                          For security, unused invitations automatically expire. You can ask your workspace owner or admin for a new invite anytime.
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  if (!resend) {
    console.log(
      `\nINVITATION EMAIL -> ${email}\n   Company: ${companyName}\n   Role: ${roleLabel}\n   Expires: ${expiresAt.toISOString()}\n   Link: ${inviteLink}\n`
    );
    return {
      delivered: false,
      mode: "logged",
      error: "Invitation email delivery is not configured",
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: `You're invited as ${roleLabel} to ${companyName}`,
      html,
    });

    if (error) {
      const message = getProviderErrorMessage(error);
      console.error(`Invitation email failed for ${email}: ${message}`);
      return {
        delivered: false,
        mode: "provider",
        error: message,
      };
    }

    return {
      delivered: true,
      mode: "provider",
      id: data?.id,
    };
  } catch (error) {
    const message = getProviderErrorMessage(error);
    console.error(`Invitation email failed for ${email}: ${message}`);
    return {
      delivered: false,
      mode: "provider",
      error: message,
    };
  }
};
