import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve(new URL('../dist/',import.meta.url).pathname);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.xml':'application/xml','.txt':'text/plain','.md':'text/markdown; charset=utf-8'};
const server=createServer(async(req,res)=>{
 let path;
 try { path=decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
 const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
 if (!file.startsWith(root+sep)) {res.writeHead(403);return res.end();}
 try { const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data); }
 catch {res.writeHead(404,{'Content-Type':'text/html'});res.end(await readFile(resolve(root,'404.html')));}
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${server.address().port}`));
