import type { Metadata } from "next";
import { LEGAL } from "../legal-config";

export const metadata: Metadata = { title: "Terms of service" };

// Draft for legal review before launch.
export default function TermsPage() {
  return (
    <>
      <h1>Terms of service</h1>
      <p className="text-sm text-muted-foreground">Last updated {LEGAL.updated}</p>
      <p>
        These terms govern your use of {LEGAL.product}{LEGAL.company === LEGAL.product ? "" : `, a service of ${LEGAL.company}`}. By creating an account you agree to them. If you use {LEGAL.product} for a company or a client,
        you confirm you&apos;re authorised to accept these terms for them.
      </p>

      <h2>The service</h2>
      <p>
        {LEGAL.product} lets you connect social media accounts and schedule or publish posts to them. Each platform decides what it accepts; we check posts against published platform
        rules, but a platform may still reject, limit or remove a post.
      </p>

      <h2>Your accounts and content</h2>
      <ul>
        <li>Only connect accounts you own or are authorised to manage, and keep your login details safe.</li>
        <li>You own your content. You give us the permission needed to store it and send it to the platforms you choose.</li>
        <li>You are responsible for what you publish, and for following each platform&apos;s terms and Indian law.</li>
        <li>Don&apos;t use {LEGAL.product} for spam, impersonation, harassment, illegal content or to get around a platform&apos;s limits.</li>
      </ul>

      <h2>Availability</h2>
      <p>
        We work to publish every post on time, but we can&apos;t guarantee it: platforms have outages, change their APIs, or revoke access. We show you the status of every post and
        alert you when one fails.
      </p>

      <h2>Plans and payment</h2>
      <p>
        Paid plans are billed in Indian rupees, plus GST, through Razorpay. Prices and limits are shown before you pay. You can cancel at any time; your plan stays active until the
        end of the period you paid for.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can delete your account at any time. We may suspend accounts that break these terms or a platform&apos;s rules. On deletion we remove your data as described in the
        privacy policy.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, {LEGAL.company} is not liable for indirect losses, or for losses caused by a platform&apos;s actions, and our total liability is limited to the
        amount you paid us in the 12 months before the claim.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of India. Contact: {LEGAL.contactEmail}.</p>
    </>
  );
}
