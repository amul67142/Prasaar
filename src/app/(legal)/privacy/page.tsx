import type { Metadata } from "next";
import { LEGAL } from "../legal-config";

export const metadata: Metadata = { title: "Privacy policy" };

// Draft for legal review before launch.
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="text-sm text-muted-foreground">Last updated {LEGAL.updated}</p>
      <p>
        {LEGAL.company === LEGAL.product ? LEGAL.product : `${LEGAL.product}, run by ${LEGAL.company},`} (&quot;we&quot;) respects your privacy. This policy explains what personal data we process when you use {LEGAL.product}, why, and the rights you have under the
        Digital Personal Data Protection Act, 2023 and other applicable law.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, email address, password (stored only as a one-way hash) or your Google account ID if you log in with Google.</li>
        <li>Connected social accounts: the account or page name, profile picture, public ID and the access tokens the platform gives us. Tokens are encrypted at rest.</li>
        <li>Content you create: post text, media files you upload, schedules, and the results the platforms send back (post IDs, links, errors).</li>
        <li>Workspace data: team members, roles and invitations.</li>
        <li>Technical data: IP address and basic request logs for security and abuse prevention.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To publish the posts you schedule, at the time you choose, to the accounts you connect.</li>
        <li>To show you your calendar, post status and errors, and to email you when a post fails or a login is about to expire.</li>
        <li>To keep the service secure and to meet legal, tax and accounting obligations.</li>
      </ul>
      <p>We do not sell your data, use it for advertising, or post anything without your action or schedule.</p>

      <h2>Consent</h2>
      <p>
        We process your data on the basis of the consent you give when you create an account, and to perform the service you asked for. You can withdraw consent at any time by
        deleting your account; we then stop processing, except where the law requires us to keep records.
      </p>

      <h2>Social platform data</h2>
      <p>
        When you connect Facebook, Instagram, LinkedIn, YouTube, Telegram, Bluesky or Mastodon, we receive only the permissions you approve on that platform&apos;s screen. We use them only to
        publish and manage the posts you create in {LEGAL.product}. When you remove an account, we delete its tokens. You can also remove our access from the platform&apos;s own settings, or
        ask us to delete Facebook and Instagram data using our <a href="/data-deletion">data deletion</a> page.
      </p>

      <h2>YouTube</h2>
      <p>
        {LEGAL.product} uses YouTube API Services to upload the videos you schedule to your YouTube channel. By connecting a channel you agree to the{" "}
        <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>, and Google&apos;s use of your data is governed by the{" "}
        <a href="https://policies.google.com/privacy">Google Privacy Policy</a>. We store your channel&apos;s name, ID and picture, and an access token that lets us upload on your behalf.
        We don&apos;t read or change anything else on your channel. Disconnecting the channel in {LEGAL.product} deletes the token; you can also revoke our access at any time from{" "}
        <a href="https://myaccount.google.com/permissions">Google security settings</a>.
      </p>

      <h2>Where your data is stored</h2>
      <p>
        Our database and application servers run in Mumbai, India. Media files are stored on our servers and served through a content delivery network, because the platforms fetch
        images and videos by public link. We use service providers for hosting, email delivery and error tracking, bound by contracts to protect your data.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account and workspace data: while your account is active.</li>
        <li>Publish logs: 90 days.</li>
        <li>Media attached to published posts: removed 30 days after publishing unless you keep it in your media library.</li>
        <li>Invoices and tax records: for the period required by Indian law.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask to access, correct or erase your personal data, and to nominate someone to exercise your rights. Email {LEGAL.contactEmail} from your account&apos;s email address. We
        reply within 30 days.
      </p>

      <h2>Security and breaches</h2>
      <p>
        Tokens and secrets are encrypted with AES-256-GCM, passwords are hashed, and every query is limited to your workspace. If a personal data breach occurs, we will inform the Data
        Protection Board of India and affected users as the law requires.
      </p>

      <h2>Grievance officer</h2>
      <p>
        {LEGAL.grievanceOfficer}
        <br />
        {LEGAL.company}, {LEGAL.address}
        <br />
        Email: {LEGAL.contactEmail}
      </p>
    </>
  );
}
