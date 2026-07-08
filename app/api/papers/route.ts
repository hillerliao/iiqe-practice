import { NextResponse } from "next/server";
import { getPapers } from "@/lib/data";

export async function GET() {
  const papers = getPapers();
  return NextResponse.json({ papers });
}
