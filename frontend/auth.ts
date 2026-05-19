import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        totp_code: {},
      },
      async authorize(credentials) {
        const response = await fetch(`${API_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials?.email,
            password: credentials?.password,
            totp_code: credentials?.totp_code || undefined,
          }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        if (!data.access_token || !data.academy) return null;
        return {
          id: data.academy.id,
          email: data.academy.email,
          name: data.academy.academy_name,
          accessToken: data.access_token,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "placeholder",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "placeholder",
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user && "accessToken" in user) token.accessToken = user.accessToken;
      return token;
    },
    session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
