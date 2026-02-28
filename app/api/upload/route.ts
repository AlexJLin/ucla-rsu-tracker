// app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Use /tmp on Vercel (only writable directory in serverless), cwd/data locally
const DATA_PATH = process.env.VERCEL
  ? join("/tmp", "housing.json")
  : join(process.cwd(), "data", "housing.json");

function ensureDataDir() {
  const dir = process.env.VERCEL ? "/tmp" : join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// Parse "M/D/YYYY H:MM" or "M/D/YYYY HH:MM" into an ISO string
function parseLastUpdated(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/"/g, "").trim();
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(.*)$/);
  if (!match) return null;
  const [, month, day, year, hour, minute] = match;
  const suffix = match[6]?.trim().toUpperCase() || "";
  let h = parseInt(hour);
  if (suffix.includes("PM") && h < 12) h += 12;
  if (suffix.includes("AM") && h === 12) h = 0;
  const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), h, parseInt(minute));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseCSV(text: string): { rows: any[]; lastUpdated: string | null } {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { rows: [], lastUpdated: null };

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));

  const findCol = (keywords: string[]) => {
    for (const kw of keywords) {
      const idx = headers.findIndex((h) => h.includes(kw));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const buildingIdx = findCol(["building", "location", "hall", "residence"]);
  const roomTypeIdx = findCol(["room type", "roomtype", "type", "unit"]);
  const genderIdx = findCol(["gender", "sex", "assignment"]);
  const bedIdx = findCol(["bed", "spaces", "available", "count"]);
  const updatedIdx = findCol(["last updated", "lastupdated", "updated"]);

  if (buildingIdx === -1 || bedIdx === -1) return { rows: [], lastUpdated: null };

  let lastUpdated: string | null = null;
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());

    const building = cells[buildingIdx]?.replace(/"/g, "").trim();
    if (!building) continue;

    if (!lastUpdated && updatedIdx !== -1 && cells[updatedIdx]) {
      lastUpdated = parseLastUpdated(cells[updatedIdx]);
    }

    rows.push({
      building,
      roomType: roomTypeIdx !== -1 ? cells[roomTypeIdx]?.replace(/"/g, "").trim() || "Unknown" : "Unknown",
      gender: genderIdx !== -1 ? cells[genderIdx]?.replace(/"/g, "").trim() || "All" : "All",
      bedSpaces: parseInt(cells[bedIdx]?.replace(/"/g, "")) || 0,
    });
  }

  return { rows, lastUpdated };
}

export async function POST(request: NextRequest) {
  const password = request.headers.get("x-admin-password");
  const correctPassword = process.env.ADMIN_PASSWORD;

  if (!correctPassword) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD environment variable not set on server." },
      { status: 500 }
    );
  }

  if (password !== correctPassword) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const text = await file.text();
    const { rows: parsed, lastUpdated: csvTimestamp } = parseCSV(text);

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "Could not parse any rows. Make sure the CSV has columns for building and bed spaces (available/count)." },
        { status: 400 }
      );
    }

    ensureDataDir();

    let existing: { snapshots: any[]; lastUpdated: string | null } = {
      snapshots: [],
      lastUpdated: null,
    };
    if (existsSync(DATA_PATH)) {
      try {
        existing = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
      } catch {}
    }

    const snapshotTime = csvTimestamp || new Date().toISOString();

    const snapshot = {
      timestamp: snapshotTime,
      rows: parsed,
    };

    existing.snapshots.push(snapshot);
    existing.lastUpdated = snapshotTime;

    writeFileSync(DATA_PATH, JSON.stringify(existing, null, 2));

    return NextResponse.json({
      success: true,
      rowsImported: parsed.length,
      totalSnapshots: existing.snapshots.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
