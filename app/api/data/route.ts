// app/api/data/route.ts
import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DATA_PATH = join(process.cwd(), "data", "housing.json");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (existsSync(DATA_PATH)) {
      const raw = readFileSync(DATA_PATH, "utf-8");
      return NextResponse.json(JSON.parse(raw));
    }
    return NextResponse.json({ snapshots: [], lastUpdated: null });
  } catch {
    return NextResponse.json({ snapshots: [], lastUpdated: null });
  }
}
