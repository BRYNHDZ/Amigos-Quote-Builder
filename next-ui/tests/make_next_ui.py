# Builds next-ui/index.html (design preview) from next/index.html.
# Pricing engine, services, rules and wording come from /next/ unchanged; only layout and rendering change.
# Run from repo root: python3 next-ui/tests/make_next_ui.py
import re,sys
src=open('./next/index.html',encoding='utf-8').read()
def cut(s,a,b,inc_b=False):
    i=s.index(a); j=s.index(b,i+len(a)) if b else len(s)
    return s[i:j+(len(b) if inc_b else 0)]
def one(s,old,new):
    n=s.count(old)
    if n!=1: sys.exit(f'expected 1 got {n}: {old[:80]!r}')
    return s.replace(old,new)

head=src[:src.index('</style>')]
head=re.sub(r"\n?\.test-tag\{[^}]*\}","",head,count=1)  # header tag removed (Bryan, Oct 20)
body=src[src.index('<body>'):src.index('<script src="route-fit.js"></script>')]
script=src[src.index('<script src="route-fit.js"></script>'):]

# ---------- reuse existing input markup verbatim ----------
addrBlock=cut(body,'<div style="display:flex;gap:6px;align-items:flex-end;margin-bottom:6px;flex-wrap:wrap">','<div class="g2" style="margin-bottom:6px">')
lotLine=[l for l in body.split('\n') if '<label class="lbl">Lot size</label>' in l][0]
meas=cut(body,'<details class="more-det"><summary>More property details</summary>\n  <div class="g2">','  </div>\n  </details>')
meas=meas.split('<div class="g2">',1)[1]
dials=cut(body,'<div class="g3">','<div id="estW"')
title=re.search(r'<div class="h1t">(.*?) <span class="test-tag">',body).group(1)
logo=re.search(r'<div class="logo">.*?</div>',body,re.S).group(0)

newBody=f'''<body>
<div class="wrap">
<header>
  <div style="display:flex;align-items:center;gap:8px">
    {logo}
    <div><div class="h1t">{title}</div></div>
  </div>
</header>
<nav class="steps" id="steps">
  <a href="#s1" class="step" id="st1"><span class="num">1</span>Property</a>
  <a href="#s2" class="step" id="st2"><span class="num">2</span>Services</a>
  <a href="#s3" class="step" id="st3"><span class="num">3</span>How they pay</a>
</nav>

<section class="card step-card" id="s1">
  <div class="step-hd"><span class="num">1</span>Property</div>
  {addrBlock}
  <div class="g2" style="margin-bottom:6px">
{lotLine}
  </div>
  <details class="more-det"><summary>Measurements (auto-filled from lot size)</summary>
  <div class="g2">{meas}  </div>
  </details>
  <div class="sub-hd">Job settings</div>
  {dials}
  <div id="estW" style="display:none" class="warn"></div>
  <div id="missBox"></div>
</section>

<section class="step-card" id="s2">
  <div class="step-hd solo"><span class="num">2</span>Services</div>
  <div id="svcCol"></div>
</section>

<section class="card step-card" id="s3">
  <div class="step-hd"><span class="num">3</span>How they pay</div>
  <div id="outCol"></div>
</section>

<details class="card det" id="detBox"><summary>Details</summary>
  <div class="det-hint">Fit score, route fit, price breakdowns and the line item reference.</div>
  <div id="avBox" style="display:none;margin-bottom:10px"></div>
  <div id="fitBox" style="display:none;margin-bottom:10px"></div>
  <div id="bdBox"></div>
  <div id="refBox"></div>
</details>
</div>
<div class="bar" id="bar"></div>

'''

css=r'''
/* ---------- design preview ---------- */
body{padding-bottom:90px}
.wrap{max-width:860px}
.steps{position:sticky;top:0;z-index:20;display:flex;gap:6px;background:#F3F4F6;padding:6px 0 10px;margin-bottom:4px}
.step{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 6px;border-radius:10px;background:#fff;border:1.5px solid #e0dfd8;color:#888;font-weight:700;font-size:12px;text-decoration:none;white-space:nowrap}
.step .num,.step-hd .num{width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#e0dfd8;color:#fff;font-size:11px;flex-shrink:0}
.step.done{border-color:#30471F;color:#30471F}.step.done .num{background:#30471F}
.step-card{scroll-margin-top:64px;margin-bottom:14px}
.step-hd{display:flex;align-items:center;gap:8px;font-family:'Fredoka',sans-serif;font-size:18px;color:#18240F;margin-bottom:12px}
.step-hd .num{width:26px;height:26px;font-size:14px;background:#30471F}
.step-hd.solo{margin:4px 2px 10px}
.sub-hd{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#30471F;margin:14px 0 8px}
#iAddr{font-size:16px!important;padding:12px!important;border-radius:10px!important}
#lkBtn{padding:12px 16px;font-size:14px}
#iLt{font-size:16px}
.seg button{padding:10px 4px;font-size:12px}
.seg button.def{background:#e6f0e0;color:#30471F}
.season{background:#fff;border:1px solid #e0dfd8;border-radius:12px;margin-bottom:10px;overflow:hidden}
.season>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px;font-family:'Fredoka',sans-serif;font-size:17px;color:#18240F}
.season>summary::-webkit-details-marker{display:none}
.season>summary::after{content:'\25BE';font-size:14px;color:#888;margin-left:6px}
.season:not([open])>summary::after{content:'\25B8'}
.season-meta{font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;color:#30471F;margin-left:auto}
.season-body{padding:0 12px 12px}
.season .cat-hd{margin:10px 4px 6px}
.svc-list{display:flex;flex-direction:column;gap:8px}
.svc{display:flex;align-items:flex-start;gap:10px;padding:12px;border:1.5px solid #e0dfd8;border-radius:10px;background:#fff;cursor:pointer;flex-wrap:nowrap;border-bottom-width:1.5px}
.svc:last-child{border-bottom:1.5px solid #e0dfd8}
.svc.sel{border-color:#30471F;background:#f5f9f4}
.svc.is-dis{cursor:default;background:#fafaf8}
.svc.is-dis .svc-nm{color:#aaa}
.svc .chk{width:22px;height:22px;border-radius:6px}
.svc .svc-nm{font-size:14px}
.rule{font-size:11px;color:#7a5800;background:#fffbec;border:1px solid #FFE08A;border-radius:6px;padding:5px 8px;margin-top:6px;display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px}
.rule.ovr-on{color:#30471F;background:#e6f0e0;border-color:#c9dcad}
.rule-btn{font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;border:1.5px solid #FFB300;background:#fff;color:#7a5800;cursor:pointer}
.desc-btn{font-family:'Nunito',sans-serif;font-size:11px;color:#30471F;background:none;border:none;padding:0;margin-top:5px;cursor:pointer;text-decoration:underline}
.svc-price{flex-shrink:0;text-align:right;min-width:92px;cursor:default}
.px-edit{display:inline-flex;align-items:center;gap:2px;border:1.5px solid #d8d8d0;border-radius:8px;background:#fafaf8;padding:2px 6px}
.px-edit span{font-weight:700;color:#30471F}
.svc .px-edit input.pi{width:70px;border:none;background:transparent;font-size:15px;font-weight:700;padding:5px 0;text-align:right}
.px-edit:has(input.ovr){border-color:#FFB300;background:#fffbec}
.px-big{font-size:16px;font-weight:700;color:#30471F;padding:6px 0}
.px-sub{font-size:11px;color:#888;margin-top:3px}
.px-sub a{color:#7a5800;text-decoration:underline;cursor:pointer}
.pay-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pay{border:1.5px solid #e0dfd8;border-radius:12px;padding:12px;cursor:pointer;background:#fff;text-align:left;font-family:'Nunito',sans-serif;color:#18240F}
.pay.on{border-color:#30471F;background:#f5f9f4;box-shadow:0 0 0 2px rgba(48,71,31,.15)}
.pay-t{font-size:12px;font-weight:700;color:#555}
.pay .amt{font-family:'Fredoka',sans-serif;font-size:22px;color:#30471F;margin:4px 0}
.pay-s{font-size:11px;color:#666;line-height:1.4}
.pay-s.warn-t{color:#7a5800}
@media(max-width:720px){.pay-cards{grid-template-columns:1fr}.pay{display:grid;grid-template-columns:1fr auto;align-items:center;column-gap:8px}.pay .amt{grid-row:1/3;grid-column:2;margin:0}.step{font-size:11px}}
.det>summary{cursor:pointer;font-weight:700;color:#30471F;font-size:14px}
.det-hint{font-size:11px;color:#888;margin:6px 0 10px}
.det .ref-section{border:none;padding:0}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:30;background:#18240F;color:#fff;padding:10px 16px calc(10px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:12px;box-shadow:0 -4px 16px rgba(0,0,0,.15)}
.bar-in{max-width:860px;margin:0 auto;width:100%;display:flex;align-items:center;gap:12px}
.bar-l{font-size:11px;color:#c9dcad;line-height:1.3}
.bar-amt{font-family:'Fredoka',sans-serif;font-size:22px;line-height:1.1}
.vis-ctl{display:inline-flex;align-items:center;gap:4px;margin-top:6px;font-size:11px;font-weight:700;color:#555}
.vis-ctl button{font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;min-width:30px;padding:5px 0;border-radius:7px;border:1.5px solid #d8d8d0;background:#fff;color:#555;cursor:pointer}
.vis-ctl button.on{border-color:#30471F;background:#30471F;color:#fff}
.bar-btn{margin-left:auto;font-family:'Nunito',sans-serif;font-weight:700;font-size:13px;padding:10px 14px;border-radius:10px;border:none;background:#FFB300;color:#18240F;cursor:pointer;text-decoration:none;white-space:nowrap}
'''

# ---------- script: keep the engine, replace the renderers ----------
renSvc=cut(script,'function renderSvc(){','function renderOut(){')
renOut=cut(script,'function renderOut(){','\nlet refOpen=new Set();')
trimDial=cut(renSvc,"if((cat.id==='E'||cat.id==='OE')&&hasTrim()){","if(cat.id==='C'&&(!ST.sel.has('F1')")
weedDial=cut(renSvc,"if((cat.id==='C'||cat.id==='OF')&&hasBeds()){","\n    for(const item of cat.items){")
hintC=[l for l in renSvc.split('\n') if "if(cat.id==='C'&&ST.mulch>0)" in l][0].strip()
hintD=[l for l in renSvc.split('\n') if "if(cat.id==='D')" in l][0].strip()
warnJS=cut(renOut,"const miss=[];","h+='<div class=\"card\" style=\"margin-bottom:10px\">';")
bdJS=cut(renOut,"const trimSel=","if(ST.bufferOn){")
planMinBar=re.search(r"h\+='<div class=\"info-bar\" style=\"background:#fffbec;border:1px solid #FFB300;margin-top:6px\"><span style=\"color:#7a5800;font-weight:700\">Note: below \$'.*?</div>';",renOut).group(0)
floorBar=re.search(r"h\+='<div class=\"info-bar\" style=\"background:#fffbec;border:1px solid #FFB300\"><span style=\"color:#7a5800;font-weight:700\">Below '.*?floor</span></div>';",renOut).group(0)

newRender=r'''const SEASON_CLOSED=new Set();
function seasonToggle(t,open){if(open)SEASON_CLOSED.delete(t);else SEASON_CLOSED.add(t);}
function warnHTML(){let h='';''' + warnJS + r'''return h;}
function breakdownHTML(){let h='';''' + bdJS + r'''return h;}
function seasonStats(season){let cnt=0,sub=0;season.cats.forEach(c=>c.items.forEach(i=>{if(ST.sel.has(i.id)){cnt++;sub+=gp(i.id)||0;}}));return{cnt:cnt,sub:Math.round(sub)};}
function seasonMeta(season){const x=seasonStats(season);return x.cnt?x.cnt+' selected · $'+x.sub.toLocaleString():'';}
function renderSvc(){
  const ae=document.activeElement;const focusId=ae&&ae.dataset&&ae.dataset.id?ae.dataset.id:null;
  let cursorPos=0;if(focusId){try{cursorPos=ae.selectionStart||0;}catch(e){}}
  const sug=getSug();const sel=ST.sel;let h='';
  for(const season of SEASONS){
    const open=!SEASON_CLOSED.has(season.title);
    h+='<details class="season"'+(open?' open':'')+' ontoggle="seasonToggle(\''+season.title+'\',this.open)"><summary><span>'+season.title+'</span><span class="season-meta" data-season="'+season.title+'">'+seasonMeta(season)+'</span></summary><div class="season-body">';
    for(const cat of season.cats){
      const m=MKT[cat.id];
      h+='<div class="cat-hd"><div class="cat-title">'+(m?m.title:cat.id)+'</div>'+(cat.addon?'<span class="atag">'+cat.addon+'</span>':'')+'</div>';
      ''' + trimDial + weedDial + r'''
      h+='<div class="svc-list">';
      for(const item of cat.items){
        const id=item.id;const selected=sel.has(id);
        const disMow=MDEPS.includes(id)&&!isMow();
        const disTrim=id==='E5'&&!hasTrim();
        const disMulch=MULCH_DEPS.includes(id)&&!hasMulch();
        const dis=disMow||disTrim||disMulch;
        const p=gp(id);const sp=sug[id]||0;const isExp=ST.exp.has(id);const isOvr=id in ST.ov;const mo=moOrCut(id,p);
        const chk=selected&&!dis?'<svg width="12" height="12" viewBox="0 0 12 12"><polyline points="1,6.5 4.5,10 11,2" stroke="white" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>':'';
        h+='<div class="svc'+(selected&&!dis?' sel':'')+(dis?' is-dis':'')+'" data-svc="'+id+'"'+(dis?'':' onclick="toggle(\''+id+'\',\''+cat.id+'\')"')+'>';
        h+='<div class="chk '+(selected&&!dis?'on':'')+(dis?' dis':'')+'">'+chk+'</div>';
        h+='<div class="svc-name-col"><div class="svc-nm">'+item.name+'</div>';
        if(item.one||item.pop)h+='<div class="svc-tags">'+(item.one?'<span class="atag">One-time</span>':'')+(item.pop?'<span class="pop">Popular</span>':'')+'</div>';
        if(VISIT_SVCS.includes(id)&&selected&&!dis){const v=leafVisits(id);h+='<div class="vis-ctl" data-vis="'+id+'" onclick="event.stopPropagation()"><span>Visits</span>';for(let k=1;k<=4;k++)h+='<button class="'+(k===v?'on':'')+'" onclick="setLeafVisits(\''+id+'\','+k+')">'+k+'</button>';h+='</div>';}
        if(disMow)h+='<div class="rule">Requires mowing. Add Weekly Mowing first.</div>';
        if(disTrim)h+='<div class="rule">Requires a trimming service.</div>';
        if(disMulch&&!disMow)h+='<div class="rule">Requires mulch. <button class="rule-btn" id="mulchOvr" onclick="event.stopPropagation();setMulchOverride()">Allow without mulch</button></div>';
        if(MULCH_DEPS.includes(id)&&ST.mulchOverride&&!sel.has('F1')&&!disMow)h+='<div class="rule ovr-on">Mulch rule overridden. <button class="rule-btn" id="mulchOvr" onclick="event.stopPropagation();setMulchOverride()">Undo</button></div>';
        h+='<button class="desc-btn" onclick="event.stopPropagation();toggleExp(\''+id+'\')">'+(isExp?'Hide description':'Description')+'</button>';
        if(isExp)h+='<div class="desc-txt">'+(DESCS[id]||'')+'</div>';
        h+='</div><div class="svc-price" onclick="event.stopPropagation()">';
        if(item.auto)h+='<div class="px-big" data-px="'+id+'">$'+Math.round(p).toLocaleString()+'</div><div class="px-sub">+25% auto</div>';
        else h+='<label class="px-edit"><span>$</span><input class="pi'+(isOvr?' ovr':'')+'" type="number" inputmode="decimal" data-id="'+id+'" value="'+(p>0?Math.round(p):'')+'" placeholder="'+(sp>0?Math.round(sp):'0')+'" oninput="ovr(\''+id+'\',this.value)"></label>';
        if(mo.v>0)h+='<div class="px-sub svc-mo" data-mo="'+id+'">$'+mo.v+mo.unit+'</div>';
        if(VISIT_SVCS.includes(id)&&selected&&!dis&&leafVisits(id)>1)h+='<div class="px-sub">'+leafVisits(id)+' visits</div>';
        if(!item.auto&&isOvr)h+='<div class="px-sub">✎ manual price · <a onclick="resetOvr(\''+id+'\',event)">reset to auto</a></div>';
        h+='</div></div>';
      }
      h+='</div>';
      ''' + hintC + '\n      ' + hintD + r'''
    }
    h+='</div></details>';
  }
  $('svcCol').innerHTML=h;
  if(focusId){const el=document.querySelector('.pi[data-id="'+focusId+'"]');if(el){el.focus();try{el.setSelectionRange(cursorPos,cursorPos);}catch(e){}}}
}
function markDefaults(){const d={rPg:ST.rate?null:0,lPg:ST.leaf==null?2:null,cxPg:ST.complex?null:0,bfPg:ST.bedFootprint?null:1};for(const g in d){document.querySelectorAll('#'+g+' button').forEach((b,i)=>b.classList.toggle('def',d[g]===i));}}
function money(n){return '$'+Math.round(n).toLocaleString();}
function renderOut(){
  $('missBox').innerHTML=warnHTML();
  let total=0;ST.sel.forEach(id=>{total+=gp(id)||0;});
  const mowA=(ST.sel.has('A1')?gp('A1'):0)+(ST.sel.has('A2')?gp('A2'):0);const perCut=mowA>0?Math.round(mowA/effVisits()):0;
  const n=planMonths();const mo=Math.round(total/n);const ap=annualPay(total);const sm=ST.planStartMonth||3;
  let h='';
  if(total<=0){h+='<div class="det-hint">Pick services in step 2 to see what they pay.</div>';}
  h+='<div class="pay-cards">';
  h+='<button class="pay'+(ST.payView==='visit'?' on':'')+'" id="payVisit" onclick="setPay(\'visit\')"><div class="pay-t">Pay-As-You-Go</div><div class="amt">'+money(total)+'</div><div class="pay-s">'+(perCut>0?'Per cut: $'+perCut.toLocaleString()+' · ':'')+'Total: '+money(total)+'</div></button>';
  h+='<button class="pay'+(ST.payView==='monthly'?' on':'')+'" id="payMonthly" onclick="setPay(\'monthly\')"><div class="pay-t">Spread monthly</div><div class="amt">'+money(mo)+'/mo</div><div class="pay-s">'+n+' payment'+(n===1?'':'s')+' of $'+mo.toLocaleString()+'/mo · '+MONTH_NAMES[sm]+' through February</div></button>';
  h+='<button class="pay'+(ST.payView==='annual'?' on':'')+'" id="payAnnual" onclick="setPay(\'annual\')"><div class="pay-t">Annual Payment</div><div class="amt">'+money(ap.pay)+'</div><div class="pay-s'+(ap.save?'':' warn-t')+'">'+(ap.save?'1 month free, save $'+ap.save.toLocaleString()+' · paid up front':'No free month: 1 month free needs a 12 month plan (March start). This start month gives '+ap.n+' payment'+(ap.n===1?'':'s')+'.')+'</div></button>';
  h+='</div>';
  if(total>0){
    if(ST.payView==='monthly'&&mo<PLAN_FLOOR){''' + planMinBar + r'''}
    if(!isMow()){const floor=TIER_FLOOR[ST.oneTier]||250;if(total<floor){''' + floorBar + r'''}}
  }
  h+='<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:10px;font-size:11px"><span style="color:#888">+20% buffer</span><button onclick="ST.bufferOn=!ST.bufferOn;render()" style="padding:3px 10px;border:1.5px solid '+(ST.bufferOn?'#FFB300':'#d8d8d0')+';border-radius:20px;background:'+(ST.bufferOn?'#fffbec':'#fafaf8')+';color:'+(ST.bufferOn?'#7a5800':'#888')+';font-weight:700;cursor:pointer;font-family:&apos;Nunito&apos;,sans-serif;font-size:11px">'+(ST.bufferOn?'ON':'OFF')+'</button></div>';
  if(ST.bufferOn&&total>0){const _buf=Math.round(total*1.2);const _mo=ST.payView==='monthly'?' ($'+Math.round(_buf/n).toLocaleString()+'/mo)':'';h+='<div class="info-bar" style="background:#fffbec;border:1px solid #FFB300;color:#7a5800;font-weight:700">With +20% buffer: $'+_buf.toLocaleString()+_mo+'</div>';}
  $('outCol').innerHTML=h;
  $('bdBox').innerHTML=breakdownHTML();
  $('refBox').innerHTML=renderRef();
  document.querySelectorAll('.season-meta[data-season]').forEach(el=>{const s=SEASONS.find(x=>x.title===el.dataset.season);if(s)el.textContent=seasonMeta(s);});
  const cnt=ST.sel.size;
  const barAmt=ST.payView==='monthly'?money(mo)+'/mo':ST.payView==='annual'?money(ap.pay):money(total);
  const barLbl=ST.payView==='monthly'?n+' payment'+(n===1?'':'s'):ST.payView==='annual'?(ap.save?'Annual Payment, 1 month free':'Annual Payment'):'Pay-As-You-Go';
  $('bar').innerHTML='<div class="bar-in"><div><div class="bar-l">'+cnt+' service'+(cnt===1?'':'s')+' · '+barLbl+'</div><div class="bar-amt">'+barAmt+'</div></div><a class="bar-btn" href="#s3">How they pay</a></div>';
  $('st1').classList.toggle('done',ST.lot>0);$('st2').classList.toggle('done',cnt>0);$('st3').classList.toggle('done',!!ST.payPicked);
  markDefaults();
}
'''
script=script.replace(renSvc+renOut,newRender)
# ---------- leaf work split across visits (Bryan, Oct 20) ----------
# Non-mowing end-of-season Leaf Work (OD3 Nutrient, OD4 Removal): every visit pays the full yard-pass part b,
# the leaf-volume extra is charged once. price(v) = one-visit price + (v-1) x b x (1 | 1.35), with the same
# complexity and rate multipliers. v=1 leaves every price exactly as before.
script=one(script,"let fb=0;if(lot>0&&leaf>0){const b=","let fb=0,fbB=0;if(lot>0&&leaf>0){const b=")
script=one(script,"fb=b*(1+[0,0,0.25,0.5,0.8,1.2][leaf]);}","fbB=b;fb=b*(1+[0,0,0.25,0.5,0.8,1.2][leaf]);}")
script=one(script,"if(rateM!==1)RATE_SVCS.forEach(k=>{if(R[k])R[k]=Math.round(R[k]*rateM);});return R;}",
  "if(rateM!==1)RATE_SVCS.forEach(k=>{if(R[k])R[k]=Math.round(R[k]*rateM);});for(const k in VISIT_SVCS_M){const v=leafVisits(k);if(v>1&&R[k])R[k]+=Math.round(fbB*VISIT_SVCS_M[k]*(v-1)*cxM*rateM);}return R;}")
script=one(script,"function getSug(){","const VISIT_SVCS_M={OD3:1,OD4:1.35};const VISIT_SVCS=Object.keys(VISIT_SVCS_M);\nfunction leafVisits(id){const v=(ST.leafVisits||{})[id]||1;return Math.max(1,Math.min(4,v));}\nfunction setLeafVisits(id,v){ST.leafVisits=ST.leafVisits||{};ST.leafVisits[id]=v;render();}\nfunction getSug(){")
# OD3/OD4 descriptions: drop the "one time" sentence now that Leaf Work can be split across visits (Bryan approved, Oct 20)
_SENT=" We come back one time at the end of the season for your Leaf Work."
if script.count(_SENT)!=2: sys.exit(f'expected 2 got {script.count(_SENT)}: {_SENT!r}')
script=script.replace(_SENT,"")
script=one(script,"function setPay(v){ST.payView=v;render();}","function setPay(v){ST.payView=v;ST.payPicked=true;render();}")
script=one(script,"function renderRef(){let h='<div class=\"card ref-section\"><div class=\"slbl\">","function renderRef(){let h='<div class=\"ref-section\"><div class=\"slbl\">")

out=head+css+'</style>\n</head>\n'+newBody+script
for bad in ['Clean Look','\u2014 ']:
    pass
open('./next-ui/index.html','w',encoding='utf-8').write(out)
print('ok',len(out))
