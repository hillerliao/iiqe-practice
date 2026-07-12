import { NextResponse } from "next/server";
import { getPapersAsync } from "@/lib/data";

export async function GET() {
  const papers = await getPapersAsync();
  return NextResponse.json({ papers });
}
