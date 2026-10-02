import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve(new URL('../dist/',import.meta.url).pathname);
const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.xml':'application/xml','.txt':'text/plain','.md':'text/markdown; charset=utf-8'};
const closing=(source,start)=>{let depth=0;for(let i=start;i<source.length;i++){if(source[i]==='\\'){i++;continue;}if(source[i]==='(')depth++;if(source[i]===')'&&--depth===0)return i;}throw new Error(`Unbalanced group in ${source}`);};
const compile=source=>{let regex='';const names=[];for(let i=0;i<source.length;){const named=source.slice(i).match(/^:(\w+)/);if(named){names.push(named[1]);i+=named[0].length;if(source[i]==='('){const end=closing(source,i);regex+=source.slice(i,end+1);i=end+1;}else regex+='([^/]+?)';continue;}if(source[i]==='('){const end=closing(source,i);names.push(String(names.length));regex+=source.slice(i,end+1);i=end+1;continue;}regex+=source[i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');i++;}return{regex:new RegExp(`^${regex}$`),names};};
const matcher=rule=>{const{regex,names}=compile(rule.source);return(path,headers)=>{const found=regex.exec(path);if(!found)return null;if(!(rule.has||[]).every(item=>item.type==='header'&&new RegExp(`^(?:${item.value})$`).test(headers[item.key.toLowerCase()]??'')))return null;return Object.fromEntries(names.map((name,i)=>[name,found[i+1]]));};};
const fill=(value,params)=>value.replace(/:(\w+)/g,(all,name)=>params[name]??all);
const headerRules=(config.headers||[]).map(rule=>({rule,match:matcher(rule)}));
const rewriteRules=(config.rewrites||[]).map(rule=>({rule,match:matcher(rule)}));
const find=async path=>{const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))return null;try{return(await stat(file)).isFile()?file:null;}catch{return null;}};
const server=createServer(async(req,res)=>{
 let url,path;
 try { url=new URL(req.url,'http://localhost');path=decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
 if (config.trailingSlash&&!path.endsWith('/')&&!/\.[^/]+$/.test(path)) {res.writeHead(308,{Location:path+'/'+url.search});return res.end();}
 const headers={};
 for (const {rule,match} of headerRules) {const params=match(path,req.headers);if(params)for(const header of rule.headers)headers[header.key]=fill(header.value,params);}
 let file=await find(path);
 for (const {rule,match} of rewriteRules) {if(file)break;const params=match(path,req.headers);if(params)file=await find(fill(rule.destination,params));}
 if (!file) {res.writeHead(404,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(await readFile(resolve(root,'404.html')));}
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store',...headers});res.end(await readFile(file));
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${server.address().port}`));
