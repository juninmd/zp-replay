// Static server for the PoC. Serves web/ and, under /maps/, only the local-maps folder.
// The map folder is local-only (game assets, gitignored), never part of the repo.
const web = `${import.meta.dir}/../web`;
const maps = `${import.meta.dir}/../local-maps`;
const replays = `${import.meta.dir}/../local-replays`;
const port = Number(process.env.PORT ?? 8080);

Bun.serve({
  port,
  async fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    if (path.startsWith("/replays/")) {
      const name = path.slice("/replays/".length);
      if (!/^[A-Za-z0-9_.-]+\.json$/.test(name)) return new Response("bad name", { status: 400 });
      const file = Bun.file(`${replays}/${name}`);
      return (await file.exists()) ? new Response(file) : new Response("replay not found", { status: 404 });
    }
    if (path.startsWith("/maps/")) {
      const name = path.slice("/maps/".length);
      if (!/^[A-Za-z0-9_.-]+\.bsp$/.test(name)) return new Response("bad name", { status: 400 });
      const file = Bun.file(`${maps}/${name}`);
      return (await file.exists()) ? new Response(file) : new Response("map not found", { status: 404 });
    }
    if (path.includes("..")) return new Response("bad path", { status: 400 });
    const file = Bun.file(`${web}${path === "/" ? "/index.html" : path}`);
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    return new Response(file);
  },
});
console.log(`http://localhost:${port}`);
