const dialog=document.querySelector('#search-dialog');
const input=document.querySelector('#search-input');
const results=document.querySelector('#search-results');
const themeButton=document.querySelector('.theme-button');
const menuButton=document.querySelector('.menu-button');
const pages=JSON.parse(document.querySelector('#search-data').textContent);
const storedTheme=(()=>{try{return localStorage.getItem('floor1-docs-theme');}catch{return null;}})();
const setTheme=theme=>{document.documentElement.dataset.theme=theme;themeButton.setAttribute('aria-label',`Switch to ${theme==='dark'?'light':'dark'} theme`);};
if(storedTheme==='dark'||storedTheme==='light')setTheme(storedTheme);
themeButton.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';setTheme(next);try{localStorage.setItem('floor1-docs-theme',next);}catch{}});
menuButton.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')!=='true';menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Close navigation':'Open navigation');document.querySelector('.sidebar').classList.toggle('open',open);});
const renderResults=()=>{const words=input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);const matches=pages.filter(p=>words.every(w=>(p.title+' '+p.description+' '+p.text).toLowerCase().includes(w))).sort((a,b)=>Number(b.title.toLowerCase().includes(input.value.toLowerCase()))-Number(a.title.toLowerCase().includes(input.value.toLowerCase()))).slice(0,8);results.replaceChildren();if(!matches.length){const empty=document.createElement('p');empty.className='search-empty';empty.textContent=pages.length?'No matching pages. Try “mint”, “slippage”, or “approval”.':'Search is unavailable. Use the navigation to browse the docs.';results.append(empty);return;}for(const p of matches){const link=document.createElement('a');link.href=p.url;link.setAttribute('role','listitem');const title=document.createElement('strong');title.textContent=p.title;const description=document.createElement('span');description.textContent=p.description;link.append(title,description);results.append(link);}};
const openSearch=()=>{dialog.showModal();renderResults();input.focus();};

document.querySelector('.search-trigger').addEventListener('click',openSearch);
document.querySelector('.search-close').addEventListener('click',()=>dialog.close());
input.addEventListener('input',renderResults);
input.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();results.querySelector('a')?.focus();}if(event.key==='Enter'){event.preventDefault();results.querySelector('a')?.click();}});
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
dialog.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp'].includes(event.key)||event.target===input)return;event.preventDefault();const links=[...results.querySelectorAll('a')];const i=links.indexOf(document.activeElement);links[(i+(event.key==='ArrowDown'?1:-1)+links.length)%links.length]?.focus();});
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(dialog.open)dialog.close();else openSearch();}if(event.key==='Escape'&&menuButton.getAttribute('aria-expanded')==='true')menuButton.click();});
for(const button of document.querySelectorAll('.copy'))button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.closest('.code-block').querySelector('code').textContent);button.textContent='Copied';button.setAttribute('aria-label','Code copied');setTimeout(()=>{button.textContent='Copy';button.setAttribute('aria-label','Copy code');},1800);}catch{button.textContent='Select code';const range=document.createRange();range.selectNodeContents(button.closest('.code-block').querySelector('code'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}});
const pattern=/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(import|from|const|let|await|async|if|throw|new|return|type|number|string|bigint|try|catch|else)\b|\b(\d[\d_]*n?)\b/g;
for(const code of document.querySelectorAll('code[data-language=TypeScript],code[data-language=JSON]')){const source=code.textContent;const fragment=document.createDocumentFragment();let at=0;for(const match of source.matchAll(pattern)){fragment.append(document.createTextNode(source.slice(at,match.index)));const span=document.createElement('span');span.className=match[1]?'syntax-string':match[2]?'syntax-keyword':'syntax-number';span.textContent=match[0];fragment.append(span);at=match.index+match[0].length;}fragment.append(document.createTextNode(source.slice(at)));code.replaceChildren(fragment);}
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){for(const link of document.querySelectorAll('.toc>a'))link.classList.toggle('active',link.hash==='#'+entry.target.id);}},{rootMargin:'-90px 0px -70% 0px'});
for(const heading of document.querySelectorAll('main h2[id]'))observer.observe(heading);

for(const button of document.querySelectorAll('.copy-page'))button.addEventListener('click',async()=>{try{const response=await fetch(button.dataset.path);if(!response.ok)throw new Error('Page unavailable');await navigator.clipboard.writeText(await response.text());button.textContent='Copied';setTimeout(()=>{button.textContent='Copy page';},1800);}catch{window.location.assign(button.dataset.path);}});
