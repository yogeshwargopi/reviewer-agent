import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { getDb } from "./db/client";
import { accounts, authenticators, sessions, users, verificationTokens } from "./db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    authenticatorsTable: authenticators,
  }),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user, profile }) {
      if (user?.id) token.sub = user.id;
      if (profile && typeof profile === "object" && "login" in profile && typeof profile.login === "string") {
        token.githubLogin = profile.login;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.githubLogin = typeof token.githubLogin === "string" ? token.githubLogin : null;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, profile }) {
      if (!user.id || !profile || typeof profile !== "object") return;
      const login = "login" in profile && typeof profile.login === "string" ? profile.login : null;
      const githubId =
        "id" in profile && (typeof profile.id === "number" || typeof profile.id === "string")
          ? String(profile.id)
          : null;
      if (!login && !githubId) return;
      await getDb().update(users).set({ githubLogin: login, githubId }).where(eq(users.id, user.id));
    },
  },
});
