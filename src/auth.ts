import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db/mongo";
import { User } from "@/lib/db/models";
import { rateLimit } from "@/lib/ratelimit";
import { createUserWithWorkspace } from "@/lib/services/accounts";

class InvalidLogin extends CredentialsSignin {
  code = "invalid_credentials";
}
class EmailNotVerified extends CredentialsSignin {
  code = "email_not_verified";
}
class TooManyAttempts extends CredentialsSignin {
  code = "too_many_attempts";
}

let dummyHash: string | undefined;

const credentialsSchema =z.object({ email: z.email(), password: z.string().min(1) });

const providers = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) throw new InvalidLogin();
      const email = parsed.data.email.toLowerCase();

      const limit = await rateLimit("login", email, 10, "15 m");
      if (!limit.ok) throw new TooManyAttempts();

      await db();
      const user = await User.findOne({ email });
      // Compare against a dummy hash when the user is missing, so timing doesn't reveal accounts.
      const hash = user?.passwordHash ?? (dummyHash ??= await bcrypt.hash("not-a-real-password", 12));
      const ok = await bcrypt.compare(parsed.data.password, hash);
      if (!user || !user.passwordHash || !ok) throw new InvalidLogin();
      if (!user.emailVerifiedAt) throw new EmailNotVerified();
      return { id: user._id.toString(), email: user.email, name: user.name, image: user.image };
    },
  }),
  ...(process.env.AUTH_GOOGLE_ID ? [Google({ allowDangerousEmailAccountLinking: false })] : []),
];

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      if (!profile?.email || !profile.email_verified) return false;
      await db();
      const email = profile.email.toLowerCase();
      const existing = await User.findOne({ $or: [{ googleId: account.providerAccountId }, { email }] });
      if (existing) {
        // Link Google to an existing email account only when Google vouches for that email.
        if (!existing.googleId) existing.googleId = account.providerAccountId;
        existing.emailVerifiedAt ??= new Date();
        if (!existing.image && profile.picture) existing.image = profile.picture as string;
        await existing.save();
      } else {
        await createUserWithWorkspace({
          email,
          name: (profile.name as string) || email.split("@")[0],
          googleId: account.providerAccountId,
          image: (profile.picture as string) ?? undefined,
          emailVerified: true,
        });
      }
      return true;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "google" && profile?.email) {
        await db();
        const u = await User.findOne({ email: profile.email.toLowerCase() }).select("_id");
        if (u) token.uid = u._id.toString();
      } else if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
