// scripts/fetch-snapshot.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data", "housing.json");

async function fetchCSV() {
  const res = await fetch("https://ucla.app.box.com/shared/static/0lsmybss0m99921jly29lqvgshyr74sb", {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes(",") || text.trim().split("\n").length < 3 || text.trim().startsWith("<")) {
    throw new Error("Response is not CSV");
  }
  return text;
}

function parseLastUpdated(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/"/g, "").trim();
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(.*)$/);
  if (!match) return null;
  const [, month, day, year, hour, minute] = match;
  const suffix = match[6]?.trim().toUpperCase() || "";
  let h = parseInt(hour);
  if (suffix.includes("PM") && h < 12) h += 12;
  if (suffix.includes("AM") && h === 12) h = 0;
  const mm = String(parseInt(month)).padStart(2, "0");
  const dd = String(parseInt(day)).padStart(2, "0");
  const hh = String(h).padStart(2, "0");
  const mi = String(parseInt(minute)).padStart(2, "0");
  const m = parseInt(month);
  const d = parseInt(day);
  const isPDT = m > 3 || (m === 3 && d >= 8);
  const offset = isPDT ? "-07:00" : "-08:00";
  return `${year}-${mm}-${dd}T${hh}:${mi}:00${offset}`;
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { rows: [], lastUpdated: null };
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const findCol = (keywords) => {
    for (const kw of keywords) { const idx = headers.findIndex((h) => h.includes(kw)); if (idx !== -1) return idx; }
    return -1;
  };
  const buildingIdx = findCol(["building", "location", "hall", "residence"]);
  const roomTypeIdx = findCol(["room type", "roomtype", "type", "unit"]);
  const genderIdx = findCol(["gender", "sex", "assignment"]);
  const bedIdx = findCol(["bed", "spaces", "available", "count"]);
  const updatedIdx = findCol(["last updated", "lastupdated", "updated"]);
  if (buildingIdx === -1 || bedIdx === -1) return { rows: [], lastUpdated: null };
  let lastUpdated = null;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = []; let current = ""; let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === "," && !inQuotes) { cells.push(current.trim()); current = ""; }
      else current += char;
    }
    cells.push(current.trim());
    const building = cells[buildingIdx]?.replace(/"/g, "").trim();
    if (!building) continue;
    if (!lastUpdated && updatedIdx !== -1 && cells[updatedIdx]) lastUpdated = parseLastUpdated(cells[updatedIdx]);
    rows.push({
      building,
      roomType: roomTypeIdx !== -1 ? cells[roomTypeIdx]?.replace(/"/g, "").trim() || "Unknown" : "Unknown",
      gender: genderIdx !== -1 ? cells[genderIdx]?.replace(/"/g, "").trim() || "All" : "All",
      bedSpaces: parseInt(cells[bedIdx]?.replace(/"/g, "")) || 0,
    });
  }
  return { rows, lastUpdated };
}

async function main() {
  const csvText = await fetchCSV();
  const { rows, lastUpdated: csvTimestamp } = parseCSV(csvText);
  if (rows.length === 0) { console.error("No rows parsed."); process.exit(1); }
  console.log(`Parsed ${rows.length} rows, Last Updated: ${csvTimestamp || "not found"}`);
  const dataDir = join(__dirname, "..", "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  let existing = { snapshots: [], lastUpdated: null };
  if (existsSync(DATA_PATH)) { try { existing = JSON.parse(readFileSync(DATA_PATH, "utf-8")); } catch {} }
  const snapshotTime = csvTimestamp || new Date().toISOString();
  if (existing.snapshots.some((s) => s.timestamp === snapshotTime)) { console.log("Snapshot already exists. Skipping."); process.exit(0); }
  existing.snapshots.push({ timestamp: snapshotTime, rows });
  existing.lastUpdated = snapshotTime;
  writeFileSync(DATA_PATH, JSON.stringify(existing));
  console.log(`Saved snapshot #${existing.snapshots.length}`);
}

main();
