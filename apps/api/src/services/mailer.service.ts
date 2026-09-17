// No email provider is wired up yet (see CLAUDE.md / .env.example). Until one
// is, every "sent" email is just logged here so the codepaths that depend on
// email delivery (OTP sign-in, etc.) are otherwise complete and testable.
//
// To go live: pick a provider (AWS SES fits well since deploy already runs on
// EC2 and it's usage-billed with a real free tier there, but Resend/SendGrid
// work too), add its SDK + credentials to apps/api/.env, and replace the body
// of sendMail() with a real API call. Nothing else in the codebase needs to
// change — every caller already goes through this one function.

export async function sendMail(opts: { to: string; subject: string; text: string }) {
  console.log(`[mailer] (stub, not actually sent) to=${opts.to} subject=${JSON.stringify(opts.subject)}\n${opts.text}`);
}
