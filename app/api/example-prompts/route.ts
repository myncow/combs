import { NextResponse } from "next/server";
import { listExamplePrompts } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await listExamplePrompts());
}
