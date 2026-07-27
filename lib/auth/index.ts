import { redirect } from "next/navigation";
import { getSpursUser, spurs } from "@spurs-cloud/accounts/next";
import type { SpursUser } from "@spurs-cloud/accounts";
import { db, spursUsers } from "@/lib/db";

/** Auth is the shared Spurs session — one cookie covers every Spurs app. */
export type Session = SpursUser;

export async function getSession(): Promise<Session | null> {
  return getSpursUser();
}

/** Survey rows FK to spurs.users, so make sure the shared row exists. */
async function ensureSpursUser(user: SpursUser): Promise<void> {
  await db
    .insert(spursUsers)
    .values({ id: user.sub, name: user.name ?? null, email: user.email ?? null })
    .onConflictDoNothing();
}

export async function requireUser(): Promise<Session> {
  const user = await getSession();
  if (!user) redirect(spurs().loginUrl(`${process.env.APP_URL}/dashboard`));
  await ensureSpursUser(user);
  return user;
}
