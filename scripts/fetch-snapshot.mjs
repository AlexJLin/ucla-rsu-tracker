// scripts/fetch-snapshot.mjs
// Fetches the UCLA Housing CSV from Box, parses it, and appends a snapshot to data/housing.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data", "housing.json");
const SHARED_NAME = "0lsmybss0m99921jly29lqvgshyr74sb";

function looksLikeCSV(text) {
  if (!text || text.length < 50) return false;
  if (!text.includes(",")) return false;
  const lines = text.trim().split("\n");
  if (lines.length < 3) return false;
  const first = lines[0].trim();
  if (first.startsWith("<") || first.startsWith("{") || first.startsWith("!")) return false;
  return (first.match(/,/g) || []).length >= 2;
}

async function fetchCSV() {
  const urls = [
    `https://ucla.app.box.com/shared/static/${SHARED_NAME}`,
    `https://ucla.app.box.com/index.php?rm=box_download_shared_file&shared_name=${SHARED_NAME}&file_id=f_0`,
  ];

  for (const url of urls) {
    try {
      console.log(`Trying: ${url.substring(0, 80)}...`);
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      console.log(`  Status: ${res.status}, Content-Type: ${res.headers.get("content-type")}`);
      if (!res.ok) continue;
      const text = await res.text();
      console.log(`  Got ${text.length} bytes, first 100: ${text.substring(0, 100).replace(/\n/g, "\\n")}`);
      if (looksLikeCSV(text)) return text;
      console.log("  Not CSV");
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  // Strategy: fetch the shared link page HTML to extract file ID
  console.log("Trying HTML page scrape for file ID...");
  try {
    const pageRes = await fetch(`https://ucla.app.box.com/s/${SHARED_NAME}`, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
    });
    console.log(`  Page status: ${pageRes.status}`);
    if (pageRes.ok) {
      const html = await pageRes.text();
      console.log(`  Page size: ${html.length}`);

      // Look for file ID patterns in Box's HTML/JS
      const patterns = [
        [/\"itemID\"\s*:\s*\"(\d+)\"/, "itemID"],
        [/\"file_id\"\s*:\s*\"(\d+)\"/, "file_id"],
        [/typedID\"\s*:\s*\"f_(\d+)\"/, "typedID"],
        [/\"itemTypedID\"\s*:\s*\"f_(\d+)\"/, "itemTypedID"],
        [/\/file\/(\d+)/, "/file/"],
        [/\"id\"\s*:\s*\"?(\d{8,})"?/, "long id"],
      ];

      let fileId = null;
      for (const [pat, name] of patterns) {
        const m = html.match(pat);
        if (m) {
          fileId = m[1];
          console.log(`  Found file ID via ${name}: ${fileId}`);
          break;
        }
      }

      if (fileId) {
        const dlUrl = `https://ucla.app.box.com/index.php?rm=box_download_shared_file&shared_name=${SHARED_NAME}&file_id=f_${fileId}`;
        console.log(`  Trying download with file ID...`);
        const dlRes = await fetch(dlUrl, {
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        });
        if (dlRes.ok) {
          const text = await dlRes.text();
          console.log(`  Download got ${text.length} bytes`);
          if (looksLikeCSV(text)) return text;
        }
      }

      // Also try the Box API with shared link header
      console.log("  Trying Box API shared_items...");
      const apiRes = await fetch("https://api.box.com/2.0/shared_items", {
        headers: {
          "BoxApi": `shared_link=https://ucla.app.box.com/s/${SHARED_NAME}`,
        },
      });
      console.log(`  API status: ${apiRes.status}`);
      if (apiRes.ok) {
        const data = await apiRes.json();
        console.log(`  API response type: ${data.type}, id: ${data.id}, name: ${data.name || "?"}`);

        if (data.type === "file" && data.id) {
          const dlUrl = `https://ucla.app.box.com/index.php?rm=box_download_shared_file&shared_name=${SHARED_NAME}&file_id=f_${data.id}`;
          const dlRes = await fetch(dlUrl, {
            redirect: "follow",
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          if (dlRes.ok) {
            const text = await dlRes.text();
            if (looksLikeCSV(text)) return text;
          }
        }

        // If folder, find CSV inside
        if (data.type === "folder") {
          const entries = data.item_collection?.entries || [];
          console.log(`  Folder has ${entries.length} items: ${entries.map(e => e.name).join(", ")}`);
          for (const item of entries) {
            if (item.type === "file") {
              console.log(`  Trying file: ${item.name} (${item.id})`);
              const dlRes = await fetch(
                `https://ucla.app.box.com/index.php?rm=box_download_shared_file&shared_name=${SHARED_NAME}&file_id=f_${item.id}`,
                { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } }
              );
              if (dlRes.ok) {
                const text = await dlRes.text();
                if (looksLikeCSV(text)) {
                  console.log(`  Success! Got CSV from ${item.name}`);
                  return text;
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.log(`  HTML scrape error: ${e.message}`);
  }

  throw new Error(
    "Could not fetch CSV from Box. All strategies failed. " +
    "Check the Action logs above for details on what each strategy returned."
  );
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
  console.log(`CSV headers: ${headers.join(", ")}`);

  const findCol = (keywords) => {
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

  console.log(`Column indices: building=${buildingIdx} roomType=${roomTypeIdx} gender=${genderIdx} bed=${bedIdx} updated=${updatedIdx}`);

  if (buildingIdx === -1 || bedIdx === -1) return { rows: [], lastUpdated: null };

  let lastUpdated = null;
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === "," && !inQuotes) { cells.push(current.trim()); current = ""; }
      else { current += char; }
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

async function main() {
  console.log("Fetching CSV from UCLA Housing Box...");
  console.log(`Shared name: ${SHARED_NAME}`);

  let csvText;
  try {
    csvText = await fetchCSV();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  console.log(`Fetched ${csvText.length} bytes of CSV`);

  const { rows, lastUpdated: csvTimestamp } = parseCSV(csvText);
  if (rows.length === 0) {
    console.error("No rows parsed from CSV. Check the format.");
    process.exit(1);
  }

  console.log(`Parsed ${rows.length} rows, Last Updated: ${csvTimestamp || "not found"}`);

  const dataDir = join(__dirname, "..", "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  let existing = { snapshots: [], lastUpdated: null };
  if (existsSync(DATA_PATH)) {
    try {
      existing = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
    } catch {}
  }

  const snapshotTime = csvTimestamp || new Date().toISOString();

  if (existing.snapshots.some((s) => s.timestamp === snapshotTime)) {
    console.log(`Snapshot for ${snapshotTime} already exists. Skipping.`);
    process.exit(0);
  }

  existing.snapshots.push({ timestamp: snapshotTime, rows });
  existing.lastUpdated = snapshotTime;

  writeFileSync(DATA_PATH, JSON.stringify(existing));
  console.log(`Saved snapshot. Total snapshots: ${existing.snapshots.length}`);
}

main();
