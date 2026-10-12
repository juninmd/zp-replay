// Offline step: .dem -> replay JSON for the viewer. Parsing a full match takes
// ~30 s, so the browser only ever loads the JSON.
//
//   bun scripts/extract-replay.ts <demo.dem> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { goldsrcParserEither } from "@cgdangelo/talent-parser-goldsrc";
import { extractTracks } from "../web/src/demo/tracks";

const [demoPath, outPath] = process.argv.slice(2);
if (!demoPath || !outPath) {
  console.error("usage: bun scripts/extract-replay.ts <demo.dem> <out.json>");
  process.exit(2);
}

const result: any = goldsrcParserEither(new Uint8Array(readFileSync(demoPath)) as any);
if (result._tag !== "Right") {
  console.error("not a parsable GoldSrc demo");
  process.exit(1);
}

const demo = result.right.value;
const replay = extractTracks(demo.directory, demo.header.mapName);
writeFileSync(outPath, JSON.stringify(replay));

const counts = Object.values(replay.players).map((s) => s.length);
console.log(
  `map=${replay.map} maxPlayers=${replay.maxPlayers} players=${counts.length} ` +
    `samples=${counts.reduce((a, b) => a + b, 0)} pov=${replay.pov?.length ?? 0}`
);
