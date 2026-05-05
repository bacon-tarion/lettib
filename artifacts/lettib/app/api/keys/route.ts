import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", route: "/api/keys" });
}
