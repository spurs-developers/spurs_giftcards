import { NextResponse } from "next/server";
import { spurs } from "@spurs-cloud/accounts/next";

export async function GET() {
  const appUrl = process.env.APP_URL ?? "http://127.0.0.1:3500";
  return NextResponse.redirect(spurs().loginUrl(`${appUrl}/dashboard`));
}
