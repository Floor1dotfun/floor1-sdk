import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics } from 'viem';
import { pages } from '../docs/content.mjs';
import { origin, updated, indexNowKey, search } from '../docs/seo.mjs';
const run=promisify(execFile);
const root=resolve(new URL('../',import.meta.url).pathname);
const out=resolve(root,'test-results/e2e');
await mkdir(out,{recursive:true});
const checks=[];
const transcript=[];
const check=async(name,fn)=>{await fn();checks.push({name,pass:true});console.log(`PASS ${name}`);};
const token='0x1111111111111111111111111111111111111111';
const account='0x2222222222222222222222222222222222222222';
let mode='valid';
let fixture;
let docs;
let browser;
let context;
let tarball;
let sha256;
let failure;
const sent=[];
try {
 const packed=await run('npm',['pack','--json','--pack-destination',out],{cwd:root,maxBuffer:10_000_000});
 await writeFile(resolve(out,'pack.log'),packed.stdout+'\n'+packed.stderr);
 const manifest=JSON.parse(packed.stdout)[0];
 tarball=resolve(out,manifest.filename);
 sha256=createHash('sha256').update(await readFile(tarball)).digest('hex');
 await check('Packed package contains only the public SDK',async()=>{
  assert(manifest.files.every(f=>f.path.startsWith('lib/')||['README.md','LICENSE','package.json'].includes(f.path)));
  for(const f of manifest.files.filter(f=>f.path.startsWith('lib/')))assert(!/createPublicClient|readContract|quoteCurve|INGEST_INTERNAL|SITE_PASSWORD|candles|sepolia-rpc/.test(await readFile(resolve(root,f.path),'utf8')));
 });
 const consumer=await mkdtemp(resolve(tmpdir(),'floor1-sdk-consumer-'));
 await writeFile(resolve(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 const install=await run('npm',['install','--ignore-scripts','--no-audit','--no-fund',tarball],{cwd:consumer,maxBuffer:10_000_000});
 await writeFile(resolve(out,'consumer-install.log'),install.stdout+'\n'+install.stderr);
 const sdk=await import(pathToFileURL(resolve(consumer,'node_modules/@floor1/sdk/lib/index.js')));
 await check('Clean consumer imports the exact public exports',async()=>assert.deepEqual(Object.keys(sdk).sort(),['Floor1Error','approvalAbi','createFloor1Client','decodeFloor1Revert','giwaSepolia','mintingAbi','parseMintReceipt','prepareBuy','prepareMint','prepareSell','prepareSellApproval','tradingAbi'].sort()));
 const consumerSource=`import {createFloor1Client,prepareMint,prepareBuy,prepareSellApproval,type Quote} from '@floor1/sdk';\nimport {createWalletClient,custom} from 'viem';\nconst wallet=createWalletClient({account:'${account}',chain:{id:91342,name:'Giwa Sepolia',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[]}}},transport:custom({request:async()=>[]})});\nconst client=createFloor1Client({wallet});\nconst quote:Quote=await client.quote({token:'${token}',side:'buy',amount:1n});\nprepareBuy(quote);\nprepareSellApproval('${token}',1n);\nprepareMint({name:'Frog',symbol:'FROG',metadataUri:'ar://${'a'.repeat(43)}'});\n`;
 await writeFile(resolve(consumer,'consumer.ts'),consumerSource);
 await run(process.execPath,[resolve(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--skipLibCheck','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','consumer.ts'],{cwd:consumer});
 checks.push({name:'Published declarations typecheck in a clean consumer',pass:true});
 fixture=createServer(async(req,res)=>{
  let text='';for await(const chunk of req)text+=chunk;
  const body=JSON.parse(text||'{}');transcript.push({url:req.url,method:req.method,headers:req.headers,body});
  assert.equal(req.url,'/api/v1/trading/quotes');assert.equal(req.method,'POST');assert.equal(req.headers.cookie,undefined);
  if(mode==='limited'){res.writeHead(429,{'Content-Type':'application/json','Retry-After':'2'});return res.end(JSON.stringify({error:{code:'rate_limited',message:'Wait.'}}));}
  if(mode==='malformed'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{');}
  if(mode==='slow')await new Promise(r=>setTimeout(r,200));
  const issuedAt=Date.now();
  const result={id:randomUUID(),chainId:91342,...body,mode:'exact_in',amountOut:'1000000',minimumOut:String(1000000n*BigInt(10000-body.slippageBps)/10000n),fee:'30',protocolFee:'20',creatorFee:'10',issuedAt,expiresAt:issuedAt+30000,snapshot:{source:'database',blockNumber:123,indexedAt:issuedAt,marketVersion:7}};
  if(mode==='expired'){result.issuedAt=issuedAt-31000;result.expiresAt=issuedAt-1000;}
  if(mode.startsWith('tamper:')){const key=mode.slice(7);result[key]=({token:account,side:'sell',chainId:1,amount:'9',minimumOut:'0',fee:'99',amountOut:'-1',slippageBps:5000,issuedAt:issuedAt+60000})[key];}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
 });
 await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
 const baseUrl=`http://127.0.0.1:${fixture.address().port}`;
 const wallet={chain:{id:91342},account:{address:account},sendTransaction:async tx=>{sent.push(tx);return `0x${'a'.repeat(64)}`;}};
 const client=sdk.createFloor1Client({baseUrl,wallet});
 await check('Quote roundtrip sends the exact request without credentials',async()=>{const q=await client.quote({token,side:'buy',amount:1000n});assert.equal(q.minimumOut,'990000');assert.deepEqual(transcript.at(-1).body,{token,side:'buy',amount:'1000',slippageBps:100});});
 await check('Buy builds local calldata and reaches the wallet boundary',async()=>{const result=await client.buy({token,amount:1000n,slippageBps:100});const tx=sent.at(-1);assert.equal(tx.to,sdk.giwaSepolia.market);assert.equal(tx.value,1000n);const decoded=decodeFunctionData({abi:sdk.tradingAbi,data:tx.data});assert.equal(decoded.functionName,'buyWithEth');assert.deepEqual(decoded.args,[token,990000n]);assert.equal(result.hash,`0x${'a'.repeat(64)}`);});
 await check('Sell uses zero value and never approves implicitly',async()=>{const before=sent.length;await client.sell({token,amount:2000n});assert.equal(sent.length,before+1);const tx=sent.at(-1);assert.equal(tx.value,0n);const decoded=decodeFunctionData({abi:sdk.tradingAbi,data:tx.data});assert.equal(decoded.functionName,'sellToEth');assert.deepEqual(decoded.args,[token,2000n,990000n]);});
 await check('Approval targets the token and authorizes only the exact amount',async()=>{const tx=sdk.prepareSellApproval(token,2000n);assert.equal(tx.to,token);assert.equal(tx.value,0n);assert.deepEqual(decodeFunctionData({abi:sdk.approvalAbi,data:tx.data}).args,[sdk.giwaSepolia.market,2000n]);});
 await check('Mint builds a factory launch with Arweave metadata and zero value',async()=>{const hash=await client.mint({name:'Floor Frog',symbol:'FROG',metadataUri:`ar://${'a'.repeat(43)}`,creatorFeeShareBps:2500});const tx=sent.at(-1);assert.equal(tx.to,sdk.giwaSepolia.factory);assert.equal(tx.value,0n);const decoded=decodeFunctionData({abi:sdk.mintingAbi,data:tx.data});assert.equal(decoded.functionName,'launch');assert.deepEqual(decoded.args,['Floor Frog','FROG',sdk.giwaSepolia.weth,`ar://${'a'.repeat(43)}`,2500]);assert(hash);});
 await check('Mint receipt parsing ignores another factory',async()=>{const args={token,creator:account,quote:sdk.giwaSepolia.weth,name:'Floor Frog',symbol:'FROG',metadataURI:`ar://${'a'.repeat(43)}`,supply:1000n,creatorFeeShareBps:2500};const event=sdk.mintingAbi.find(a=>a.type==='event');const plain=event.inputs.filter(i=>!i.indexed);const log={address:sdk.giwaSepolia.factory,topics:encodeEventTopics({abi:sdk.mintingAbi,eventName:'Launched',args}),data:encodeAbiParameters(plain,plain.map(i=>args[i.name])),blockHash:null,blockNumber:null,logIndex:null,transactionHash:null,transactionIndex:null,removed:false};assert.equal(sdk.parseMintReceipt([log]).token,token);assert.equal(sdk.parseMintReceipt([{...log,address:account}]),null);});
 await check('Invalid inputs fail before HTTP or wallet submission',async()=>{const requests=transcript.length;await assert.rejects(client.quote({token,side:'buy',amount:0n}),e=>e.code==='invalid_amount');await assert.rejects(client.quote({token,side:'buy',amount:2n**256n}),e=>e.code==='invalid_amount');await assert.rejects(client.quote({token,side:'buy',amount:1n,slippageBps:1}),e=>e.code==='invalid_slippage');assert.throws(()=>sdk.prepareMint({name:'Frog',symbol:'frog',metadataUri:'ar://bad'}),e=>e.code==='invalid_metadata');assert.equal(transcript.length,requests);});
 await check('Wrong wallet chain fails before requesting a quote',async()=>{const requests=transcript.length;await assert.rejects(client.buy({token,amount:1n},{wallet:{...wallet,chain:{id:1}}}),e=>e.code==='wrong_chain');assert.equal(transcript.length,requests);});
 for(const field of ['token','side','chainId','amount','minimumOut','fee','amountOut','slippageBps','issuedAt'])await check(`Tampered ${field} cannot reach wallet signing`,async()=>{mode=`tamper:${field}`;const count=sent.length;await assert.rejects(client.buy({token,amount:1n}),e=>e.code==='invalid_response');assert.equal(sent.length,count);});
 await check('Malformed and expired responses are rejected',async()=>{mode='malformed';await assert.rejects(client.quote({token,side:'buy',amount:1n}),e=>e.code==='invalid_response');mode='expired';await assert.rejects(client.quote({token,side:'buy',amount:1n}),e=>e.code==='quote_expired');});
 await check('Rate limit errors preserve status and Retry-After',async()=>{mode='limited';await assert.rejects(client.quote({token,side:'buy',amount:1n}),e=>e.code==='rate_limited'&&e.status===429&&e.retryAfterSeconds===2);});
 await check('Aborting a quote preserves cancellation',async()=>{mode='slow';const controller=new AbortController();const request=client.quote({token,side:'buy',amount:1n},{signal:controller.signal});controller.abort();await assert.rejects(request,e=>e.name==='AbortError');mode='valid';});
 await check('Wallet rejection passes through without a second submission',async()=>{const rejection=new Error('User rejected');await assert.rejects(client.buy({token,amount:1n},{wallet:{...wallet,sendTransaction:async()=>{throw rejection;}}}),e=>e===rejection);});
 if(process.env.FLOOR1_API_URL)await check('Packed SDK quotes against the configured local Floor1 API',async()=>{const q=await sdk.createFloor1Client({baseUrl:process.env.FLOOR1_API_URL}).quote({token:process.env.FLOOR1_TEST_TOKEN,side:'buy',amount:1000000000000000n});assert.equal(q.snapshot.source,'database');});
 docs=spawn(process.execPath,['docs/serve.mjs'],{cwd:root,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
 const docsUrl=await new Promise((resolve,reject)=>{let text='';docs.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/Local: (http:\/\/127\.0\.0\.1:\d+)/);if(match)resolve(match[1]);});docs.once('error',reject);docs.once('exit',code=>reject(new Error(`Docs server exited ${code}`)));});
 browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});const page=await context.newPage();
 const browserErrors=[];page.on('pageerror',e=>browserErrors.push(e.message));
 await check('Every built docs route renders and all local links resolve',async()=>{for(const p of pages){const url=`${docsUrl}/${p.slug?p.slug+'/':''}`;assert.equal((await page.goto(url)).status(),200);assert.equal(await page.locator('h1').textContent(),p.title);const links=await page.locator('a[href^="/"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));for(const link of new Set(links)){const response=await fetch(docsUrl+link.split('#')[0]);assert.equal(response.status,200,link);}assert(!(await page.locator('body').innerText()).toLowerCase().includes('database backed'));}assert.deepEqual(browserErrors,[]);});
 await page.goto(docsUrl);await check('Docs use the Floor1 purple brand tokens',async()=>{assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),'#b4a1ff');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()),'#0b0a10');});await page.screenshot({path:resolve(out,'desktop-dark.png'),fullPage:true});
 await check('Search opens by keyboard and navigates to minting',async()=>{await page.keyboard.press('Control+k');await page.locator('#search-input').fill('mint');await page.locator('#search-results a').filter({hasText:'Mint a token'}).first().click();await page.waitForURL('**/mint/');assert.equal(await page.locator('h1').textContent(),'Launch your next token.');});
 await check('Code and page copy controls write real clipboard content',async()=>{await page.getByRole('button',{name:'Copy code',exact:true}).first().click();assert((await page.evaluate(()=>navigator.clipboard.readText())).includes('floor1.mint'));await page.getByRole('button',{name:'Copy page',exact:true}).click();await page.getByRole('button',{name:'Copied',exact:true}).waitFor();assert((await page.evaluate(()=>navigator.clipboard.readText())).includes('# Launch your next token.'));});
 await check('Light theme persists after navigation',async()=>{await page.getByRole('button',{name:'Switch to light theme'}).click();await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.screenshot({path:resolve(out,'desktop-light.png'),fullPage:true});await page.getByRole('button',{name:'Switch to dark theme'}).click();});
 await check('Mobile navigation opens and every route avoids page overflow',async()=>{await page.setViewportSize({width:390,height:844});await page.goto(docsUrl);await page.getByRole('button',{name:'Open navigation'}).click();await page.locator('#sidebar').getByRole('link',{name:'Mint a token',exact:true}).click();await page.waitForURL('**/mint/');await page.screenshot({path:resolve(out,'mobile-mint.png'),fullPage:true});for(const p of pages){await page.goto(`${docsUrl}/${p.slug?p.slug+'/':''}`);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),p.slug);}await page.goto(docsUrl);await page.screenshot({path:resolve(out,'mobile-home.png'),fullPage:true});});
 await check('Markdown exports and llms.txt are available',async()=>{assert((await fetch(docsUrl+'/mint.md').then(r=>r.text())).includes('# Launch your next token.'));assert((await fetch(docsUrl+'/llms.txt').then(r=>r.text())).includes('mint.md'));});
 await check('Every page has distinct search metadata, structured data and a matching sitemap',async()=>{const titles=new Set(),descriptions=new Set();const sitemap=await fetch(docsUrl+'/sitemap.xml').then(r=>r.text());await writeFile(resolve(out,'sitemap.xml'),sitemap);const locs=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);const lastmods=[...sitemap.matchAll(/<lastmod>(.*?)<\/lastmod>/g)].map(m=>m[1]);assert.deepEqual(locs,pages.map(p=>`${origin}/${p.slug?p.slug+'/':''}`));assert.deepEqual(lastmods,pages.map(()=>updated));const seo=[];for(const p of pages){const canonical=`${origin}/${p.slug?p.slug+'/':''}`;const html=await fetch(`${docsUrl}/${p.slug?p.slug+'/':''}`).then(r=>r.text());const get=re=>html.match(re)?.[1];const title=get(/<title>(.*?)<\/title>/);const description=get(/<meta name="description" content="([^"]*)"/);assert.equal(title,search[p.slug].title.replaceAll('&','&amp;'));assert(title.length<=65&&!titles.has(title),title);assert(description.length>=70&&description.length<=165&&!descriptions.has(description),description);titles.add(title);descriptions.add(description);assert.equal(get(/<link rel="canonical" href="([^"]*)"/),canonical);assert.equal(get(/<meta property="og:url" content="([^"]*)"/),canonical);assert.equal(get(/<meta property="og:image" content="([^"]*)"/),`${origin}/social.jpg`);assert.equal(get(/<meta name="twitter:card" content="([^"]*)"/),'summary_large_image');assert.equal(get(/<meta name="robots" content="([^"]*)"/),'index, follow');assert(!/localhost|127\.0\.0\.1/.test(html.replace(/<script type="application\/json" id="search-data">[\s\S]*?<\/script>/,'')));const graph=JSON.parse(get(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/))['@graph'];const article=graph.find(n=>n['@type']==='TechArticle');const crumbs=graph.find(n=>n['@type']==='BreadcrumbList');assert.equal(article.url,canonical);assert.equal(article.dateModified,updated);assert.equal(article.publisher['@id'],'https://www.floor1.fun/#organization');assert.equal(crumbs.itemListElement.at(-1).item,canonical);if(!p.slug){assert(graph.some(n=>n['@type']==='WebSite'));assert.equal(graph.find(n=>n['@type']==='SoftwareSourceCode').codeRepository,'https://github.com/Floor1dotfun/floor1-sdk');}assert(html.includes(`datetime="${updated}"`));assert(html.includes('floor1-sdk/blob/main/docs/content.mjs'));seo.push({slug:p.slug,title,description,canonical,types:graph.map(n=>n['@type'])});}await writeFile(resolve(out,'seo.json'),JSON.stringify(seo,null,2));const image=await fetch(docsUrl+'/social.jpg');assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/jpeg/);assert.equal((await fetch(docsUrl+`/${indexNowKey}.txt`).then(r=>r.text())).trim(),indexNowKey);const robots=await fetch(docsUrl+'/robots.txt').then(r=>r.text());assert.match(robots,/Allow: \//);assert.match(robots,new RegExp(`Sitemap: ${origin}/sitemap.xml`));assert.match(await fetch(docsUrl+'/404.html').then(r=>r.text()),/<meta name="robots" content="noindex">/);const network=await fetch(docsUrl+'/network/').then(r=>r.text());for(const link of ['https://www.floor1.fun/guides/giwa-sepolia','https://www.floor1.fun/guides/giwa-scam-safety'])assert(network.includes(`href="${link}"`),link);});
 assert.deepEqual(browserErrors,[]);
} catch(error){failure={message:error.message,stack:error.stack};console.error(error);process.exitCode=1;}
finally{
 if(context)await context.tracing.stop({path:resolve(out,'trace.zip')});if(browser)await browser.close();if(docs)docs.kill('SIGTERM');if(fixture)await new Promise(r=>fixture.close(r));
 await writeFile(resolve(out,'http-transcript.json'),JSON.stringify(transcript,null,2));
 await writeFile(resolve(out,'report.json'),JSON.stringify({passed:!failure,checks,failure,tarball:tarball?.split('/').at(-1),sha256,coverage:'Packed consumer → quote HTTP → decoded wallet submission boundary, mint receipt parsing, built documentation browser journeys. No real chain transactions.',reproduce:'npm ci && npx playwright install chromium && npm run e2e',artifacts:['trace.zip','seo.json','sitemap.xml','desktop-dark.png','desktop-light.png','mobile-home.png','mobile-mint.png','http-transcript.json','pack.log','consumer-install.log']},null,2)+'\n');
}
