import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

// Configure AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / SES_FROM_EMAIL
// in the environment to send for real. Without them (e.g. local dev), sendMail()
// logs the message instead of sending it, so every codepath that depends on
// email delivery (OTP sign-in, etc.) still works end to end without AWS access.
const fromEmail = process.env.SES_FROM_EMAIL;
const sesConfigured = Boolean(
  fromEmail && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
);

const ses = sesConfigured
  ? new SESv2Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export async function sendMail(opts: { to: string; subject: string; text: string }) {
  if (!ses) {
    console.log(`[mailer] (stub, not actually sent) to=${opts.to} subject=${JSON.stringify(opts.subject)}\n${opts.text}`);
    return;
  }
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: fromEmail,
      Destination: { ToAddresses: [opts.to] },
      Content: {
        Simple: {
          Subject: { Data: opts.subject },
          Body: { Text: { Data: opts.text } },
        },
      },
    })
  );
}
