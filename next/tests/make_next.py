import re,sys
src=open('./legacy/index.html',encoding='utf-8').read()
s=src
def rep(old,new,count=1):
    global s
    n=s.count(old)
    if n!=count: sys.exit(f"expected {count} got {n}: {old[:90]!r}")
    s=s.replace(old,new)

# ---------- CSS ----------
rep(".cat-hd{", ".season-hd{font-family:'Fredoka',sans-serif;font-size:15px;font-weight:700;color:#18240F;margin:14px 2px 6px}\n.season-hd:first-child{margin-top:0}\n.more-det{margin-bottom:12px}\n.more-det>summary{cursor:pointer;font-size:12px;font-weight:700;color:#30471F;padding:6px 0;list-style:revert}\n.more-det>.g2{margin-top:8px}\n.test-tag{font-size:10px;padding:2px 8px;border-radius:20px;background:#FFB300;color:#18240F;font-weight:700;vertical-align:middle;margin-left:6px}\n.cat-hd{")
rep(".pi.ovr{",".svc input.pi{width:72px;flex-shrink:0}\n.pi.ovr{")

# ---------- header badge ----------
rep('<div class="h1t">Amigo Landscaping — Quote Builder</div>','<div class="h1t">Amigo Landscaping — Quote Builder <span class="test-tag">Test version</span></div>')

# ---------- property details: lot size visible, rest collapsed ----------
lines=s.split('\n')
i=[k for k,l in enumerate(lines) if '<div class="g2" style="margin-bottom:12px">' in l]; assert len(i)==1; i=i[0]
assert '<label class="lbl">Lot size</label>' in lines[i+1]
j=[k for k in range(i,len(lines)) if lines[k].strip()=='<div class="g3">'][0]
assert lines[j-1].strip()=='</div>'
lot=lines[i+1]; rest=lines[i+2:j-1]
new=['  <div class="g2" style="margin-bottom:6px">',lot,'  </div>','  <details class="more-det"><summary>More property details</summary>','  <div class="g2">']+rest+['  </div>','  </details>']
lines=lines[:i]+new+lines[j:]
s='\n'.join(lines)

# ---------- dials: snow + quote effort always visible, start month replaces visits ----------
rep('<div id="snowRow" style="display:none">','<div id="snowRow">')
rep('<div id="tierRow" style="display:none">','<div id="tierRow">')
m=re.search(r'\n\s*<div id="visRow".*?\n',s); assert m
sel=re.search(r'<select id="iPlanStart".*?</select>',s,re.S).group(0)
startRow='\n    <div id="startRow"><label class="lbl" style="margin-bottom:5px">Start month</label>'+sel.replace('font-size:12px;padding:5px 10px','font-size:12px;padding:6px 10px;width:100%')+'<div class="hint" id="planStartHint"></div></div>\n'
s=s[:m.start()]+startRow+s[m.end():]

# ---------- remove mode bar, per-visit/plan toggle, plan start row ----------
a=s.index('<div class="mode-bar">\n  <button class="mode-btn" id="mRec"')
b=s.index('<div class="cols">')
s=s[:a]+s[b:]

# ---------- state ----------
rep("mode:null,","payView:'visit',")
rep("recView:'visit',","")
rep("selOne:new Set(),","")
rep("ovOne:{},","")

# ---------- dead plan discount code ----------
rep("const PLAN_DISCOUNT=1.0;\n","")
rep("// Snow stays at full per-visit price even on the plan — no 5% discount, no mid-year proration.\nconst PLAN_SVCS=['A1','A2','C1','C2','B1','B2','B3','B4','D1','D2','G1','G2','G3','G4','G5','E1','E2','E5','E3','F1'];\n","")
rep("'G1','G2','G3','G4','G5','OB1'","'G1','G2','G3','OB1'")  # RATE_SVCS: G4/G5 no longer exist
rep("// Plan-start-month proration — mid-year sign-ups","// Start month: drives mowing proration (visits left) and the number of monthly payments")

rep("function planMonths(){if(ST.mode==='recurring'&&ST.recView==='plan'){const m=ST.planStartMonth||3;return m>=3?15-m:3-m;}return 12;}",
    "function planMonths(){const m=ST.planStartMonth||3;return m>=3?15-m:3-m;}")
s=re.sub(r"function setMode\(m\)\{.*?\n","function setPay(v){ST.payView=v;render();}\n",s,count=1)
s=re.sub(r"function setRecView\(v\)\{.*?\n","",s,count=1)

# ---------- one service list grouped by season ----------
a=s.index("const REC_CATS="); b=s.index("const MDEPS=")
SEASONS=("const SEASONS=["
 "{title:'All season',cats:["
  "{id:'A',items:[{id:'A1',name:'Weekly Maintenance – Nutrient Standard',pop:true},{id:'A2',name:'Weekly Maintenance – Pristine Standard',auto:true}]},"
  "{id:'C',addon:'add-on to mowing',items:[{id:'C1',name:'Garden Maintenance – Clean Look Plan',pop:true,dep:true},{id:'C2',name:'Garden Maintenance – Estate Detail Plan',dep:true},{id:'F1',name:'Mulch Installation & Flower Bed Edging'},{id:'OF2',name:'One-Time Weeding',one:true},{id:'OF3',name:'Bed Reset / Garden Cleanup',one:true}]},"
  "{id:'E',items:[{id:'E1',name:'Annual Shaping'},{id:'E2',name:'Premium Managed Shaping',dep:true},{id:'E5',name:'Ladder Use Upgrade'},{id:'OE1',name:'Bush & Shrub Shaping',one:true},{id:'E3',name:'Perennial Flower Pruning'},{id:'OE3',name:'Perennial Flower Pruning',one:true}]}]},"
 "{title:'Spring',cats:["
  "{id:'B',items:[{id:'B1',name:'Spring Aeration'},{id:'B3',name:'Spring Overseeding'}]},"
  "{id:'D',items:[{id:'D1',name:'Spring Cleanup – Nutrient Standard',pop:true},{id:'D2',name:'Spring Cleanup – Pristine Standard'}]}]},"
 "{title:'Fall',cats:["
  "{id:'B',items:[{id:'B2',name:'Fall Aeration'},{id:'B4',name:'Fall Overseeding'}]},"
  "{id:'G',addon:'add-on to mowing',items:[{id:'G1',name:'Leaf Care – Standard',pop:true,dep:true},{id:'G2',name:'Leaf Care – Pristine',dep:true},{id:'G3',name:'Leaf Care – Estate',dep:true},{id:'OD3',name:'Fall Cleanup – Nutrient Standard',pop:true,one:true},{id:'OD4',name:'Fall Cleanup – Pristine Standard',one:true}]}]},"
 "{title:'Winter',cats:["
  "{id:'H',items:[{id:'H1',name:'Snow Removal – Standard'},{id:'H2',name:'Snow Removal – Premium'},{id:'H4',name:'Snow Removal – Zero Tolerance'},{id:'H3',name:'Salt Treatment'}]}]}"
 "];\n")
# sanity: every name above must exist verbatim in legacy catalog
for nm in re.findall(r"name:'([^']*)'",SEASONS): assert ("name:'"+nm+"'") in src[src.index("const REC_CATS="):src.index("const MDEPS=")], nm
s=s[:a]+SEASONS+s[b:]
rep("function hasTrim(){const s=ST.mode==='recurring'?ST.sel:ST.selOne;","function hasTrim(){const s=ST.sel;")
rep("function hasBeds(){const s=ST.mode==='recurring'?ST.sel:ST.selOne;","function hasBeds(){const s=ST.sel;")

# ---------- pricing engine ----------
rep("const mowFactor=ST.mode==='recurring'?Math.max(1,Math.min(35,effVisits()))/V:1;","const mowFactor=Math.max(1,Math.min(35,effVisits()))/V;")
rep("G4:Math.round(fb*0.65),G5:Math.round(fb*0.65*1.2),","")
# THE ONLY PRICE CHANGE: one-time fall cleanups use Leaf Care pricing
rep("OD3:Math.round(fb*0.65),OD4:Math.round(fb*0.65*1.2),","OD3:Math.round(fb),OD4:Math.round(fb*1.35),")
rep("'G1','G2','G3','G4','G5','E3'","'G1','G2','G3','E3'")
rep("if(ST.mode==='recurring'&&ST.recView==='plan')PLAN_SVCS.forEach(k=>{if(R[k])R[k]=Math.round(R[k]*PLAN_DISCOUNT);});","")
rep("function getSel(){return ST.mode==='recurring'?ST.sel:ST.selOne;}","function getSel(){return ST.sel;}")
rep("function getOv(){return ST.mode==='recurring'?ST.ov:ST.ovOne;}","function getOv(){return ST.ov;}")
rep("function getCats(){return ST.mode==='recurring'?REC_CATS:ONE_CATS;}","function getCats(){return SEASONS.flatMap(x=>x.cats);}")
rep("function toggle(id,cid){const sel=getSel();const isRec=ST.mode==='recurring';","function toggle(id,cid){const sel=getSel();const isRec=true;")
rep("const vr=parseFloat($('iVr')&&$('iVr').value);ST.visitsRemain=isNaN(vr)||vr<=0?0:Math.min(35,vr);","")
rep("function moOrCut(id,p){const isCut=ST.mode==='recurring'&&ST.recView==='visit'&&(id==='A1'||id==='A2');const denom=isCut?effVisits():planMonths();const unit=isCut?'/cut':'/mo';const v=(ST.mode==='recurring'&&p>0)?Math.round(p/denom):0;return{v:v,unit:unit};}",
    "function moOrCut(id,p){const isCut=ST.payView==='visit'&&(id==='A1'||id==='A2');const denom=isCut?effVisits():planMonths();const unit=isCut?'/cut':'/mo';const v=(p>0&&(isCut||ST.payView==='monthly'))?Math.round(p/denom):0;return{v:v,unit:unit};}")

# ---------- renderSvc ----------
rep("const sug=getSug();const sel=getSel();const isRec=ST.mode==='recurring';","const sug=getSug();const sel=getSel();")
rep("  for(const cat of getCats()){\n    const m=MKT[cat.id];\n","  for(const season of SEASONS){\n  h+='<div class=\"season-hd\">'+season.title+'</div>';\n  for(const cat of season.cats){\n    const m=MKT[cat.id];\n")
rep("const disMow=isRec&&MDEPS.includes(item.id)&&!isMow();","const disMow=MDEPS.includes(item.id)&&!isMow();")
rep("if(item.pop||dis){h+='<div class=\"svc-tags\">'+(item.pop?'<span class=\"pop\">Popular</span>':'')","if(item.pop||dis||item.one){h+='<div class=\"svc-tags\">'+(item.one?'<span class=\"atag\">One-time</span>':'')+(item.pop?'<span class=\"pop\">Popular</span>':'')")
rep("if(isRec)h+='<div class=\"svc-mo\"","if(ST.payView==='monthly'||item.id==='A1'||item.id==='A2')h+='<div class=\"svc-mo\"")
rep("    h+='</div>';\n  }\n  $('svcCol').innerHTML=h;","    h+='</div>';\n  }\n  }\n  $('svcCol').innerHTML=h;")

# ---------- renderOut ----------
rep("function renderOut(){const isRec=ST.mode==='recurring';let h='';","function renderOut(){let h='';")
mv=re.search(r"if\(isRec\)\{if\(!ST\.visitsRemain\)miss\.push\(.*?\);(if\(ST\.snow===null\)miss\.push\(.*?\);)\}",s)
assert mv
s=s[:mv.start()]+"if(['H1','H2','H4','H3'].some(id=>ST.sel.has(id))){"+mv.group(1)+"}"+s[mv.end():]
a=s.index("if(isRec){let planAnnual=0;")
t=s.index("const trimSel=",a)
mid=s.index("if(ST.visitsRemain&&ST.visitsRemain<35)",t)
endmid=s.index("}else{let oneTot=0;",mid)
endone=s.index("if(ST.mulch>0&&(ST.sel.has('F1')||ST.selOne.has('OF1')))",endmid)
trimPart=s[t:mid]; midPart=s[mid:endmid]
# legacy floor + plan-minimum strings reused verbatim
floorBar=re.search(r"h\+='<div class=\"info-bar\" style=\"background:#fffbec;border:1px solid #FFB300\"><span style=\"color:#7a5800;font-weight:700\">Below '.*?floor</span></div>';",s[endmid:endone]).group(0).replace("oneTot","total")
pay=("let total=0;ST.sel.forEach(id=>{total+=gp(id)||0;});"
 "h+='<label class=\"lbl\" style=\"margin-bottom:5px\">How they pay</label><div class=\"seg\" id=\"payPg\" style=\"margin-bottom:2px\"><button class=\"'+(ST.payView==='visit'?'on':'')+'\" onclick=\"setPay(\\'visit\\')\">Per visit / service</button><button class=\"'+(ST.payView==='monthly'?'on':'')+'\" onclick=\"setPay(\\'monthly\\')\">Spread monthly</button></div>';"
 "if(total>0){const mowA=(ST.sel.has('A1')?gp('A1'):0)+(ST.sel.has('A2')?gp('A2'):0);const perCut=mowA>0?Math.round(mowA/effVisits()):0;"
 "h+='<div class=\"info-bar\">'+(perCut>0?'<span style=\"color:#888\">Per cut: </span><span style=\"font-weight:700;color:#30471F\">$'+perCut.toLocaleString()+'</span><span style=\"color:#888\"> · </span>':'')+'<span style=\"color:#888\">Total: </span><span style=\"font-weight:700;color:#30471F\">$'+total.toLocaleString()+'</span></div>';"
 "if(ST.payView==='monthly'){const n=planMonths();const mo=Math.round(total/n);const sm=ST.planStartMonth||3;"
 "h+='<div class=\"info-bar\"><span style=\"font-weight:700;color:#30471F\">'+n+' payment'+(n===1?'':'s')+' of $'+mo.toLocaleString()+'/mo</span><span style=\"color:#888\"> · '+MONTH_NAMES[sm]+' through February</span></div>';"
 "if(mo<PLAN_FLOOR){h+='<div class=\"info-bar\" style=\"background:#fffbec;border:1px solid #FFB300;margin-top:6px\"><span style=\"color:#7a5800;font-weight:700\">Note: below $'+PLAN_FLOOR+'/mo plan minimum.</span> <span style=\"color:#888\"> Small property — consider adding services or quoting per-visit instead.</span></div>';}}"
 "if(!isMow()){const floor=TIER_FLOOR[ST.oneTier]||250;if(total<floor){"+floorBar+"}}}")
s=s[:a]+pay+trimPart+midPart+s[endone:]
rep("if(ST.mulch>0&&(ST.sel.has('F1')||ST.selOne.has('OF1'))){const id=isRec?'F1':'OF1';","if(ST.mulch>0&&ST.sel.has('F1')){const id='F1';")
rep("const weedIds=isRec?['C1','C2']:['OF2','OF3'];const sel=isRec?ST.sel:ST.selOne;","const weedIds=['C1','C2','OF2','OF3'];const sel=ST.sel;")
rep("['B1','B2','OB1','OB2'].forEach(id=>{const sel=isRec?ST.sel:ST.selOne;","['B1','B2'].forEach(id=>{const sel=ST.sel;")
rep("['B3','B4','OB3','OB4'].forEach(id=>{const sel=isRec?ST.sel:ST.selOne;","['B3','B4'].forEach(id=>{const sel=ST.sel;")
rep("if(isRec){ST.sel.forEach(id=>{_total+=gp(id)||0;});}else{ST.selOne.forEach(id=>{_total+=gp(id)||0;});}","ST.sel.forEach(id=>{_total+=gp(id)||0;});")
rep("const _mo=isRec?","const _mo=ST.payView==='monthly'?")

# ---------- reference list by season ----------
rep("const cats=getCats();for(const cat of cats){const m=MKT[cat.id];const open=refOpen.has(cat.id);",
    "for(const season of SEASONS){for(const cat of season.cats){const rk=season.title+cat.id;const m=MKT[cat.id];const open=refOpen.has(rk);")
rep("onclick=\"toggleRef(\\''+cat.id+'\\',event)\"><span>'+(m?m.title:cat.id)+'</span>","onclick=\"toggleRef(\\''+rk+'\\',event)\"><span>'+season.title+': '+(m?m.title:cat.id)+'</span>")
rep("h+='</div>';}h+='</div>';}h+='</div>';return h;}","h+='</div>';}h+='</div>';}}h+='</div>';return h;}")

# ---------- render ----------
rep("if(ST.mode==='recurring'&&ST.recView==='plan'){if(_psm===3)","{if(_psm===3)")
rep("}else{$('planStartHint').innerHTML='';}}","}}")
s=re.sub(r"if\(!ST\.mode\)\{\$\('svcCol'\)\.innerHTML=.*?return;\}","",s,count=1)

# ---------- rule: ongoing weeding (C1, C2) requires mulch (F1), with an override ----------
rep("bufferOn:false,","bufferOn:false,mulchOverride:false,")
rep("const MDEPS=['C1','C2','G1','G2','G3','E2'];","const MDEPS=['C1','C2','G1','G2','G3','E2'];\nconst MULCH_DEPS=['C1','C2'];\nfunction hasMulch(){return ST.sel.has('F1')||ST.mulchOverride;}\nfunction setMulchOverride(){ST.mulchOverride=!ST.mulchOverride;if(!hasMulch())MULCH_DEPS.forEach(d=>ST.sel.delete(d));render();}")
rep("if(id==='E5'&&!hasTrim())return;","if(id==='E5'&&!hasTrim())return;if(MULCH_DEPS.includes(id)&&!hasMulch())return;")
rep("if(cid==='E'&&!sel.has('E1')&&!sel.has('E2'))sel.delete('E5');","if(cid==='E'&&!sel.has('E1')&&!sel.has('E2'))sel.delete('E5');if(id==='F1'&&!hasMulch())MULCH_DEPS.forEach(d=>sel.delete(d));")
rep("const disTrim=item.id==='E5'&&!hasTrim();\n      const dis=disMow||disTrim;","const disTrim=item.id==='E5'&&!hasTrim();\n      const disMulch=MULCH_DEPS.includes(item.id)&&!hasMulch();\n      const dis=disMow||disTrim||disMulch;")
rep("(disTrim?'<span class=\"req\">· requires a trimming service</span>':'')","(disTrim?'<span class=\"req\">· requires a trimming service</span>':'')+(disMulch?'<span class=\"req\">· requires mulch</span>':'')")
# override switch, same look as the "+20% buffer" ON/OFF switch, shown in the Flower Bed card while no mulch is selected
rep("if((cat.id==='C'||cat.id==='OF')&&hasBeds()){","if(cat.id==='C'&&(!ST.sel.has('F1')||ST.mulchOverride)){const on=ST.mulchOverride;h+='<div style=\"display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-bottom:8px;font-size:11px\"><span style=\"color:#888\">Override mulch rule</span><button id=\"mulchOvr\" onclick=\"setMulchOverride()\" style=\"padding:3px 10px;border:1.5px solid '+(on?'#FFB300':'#d8d8d0')+';border-radius:20px;background:'+(on?'#fffbec':'#fafaf8')+';color:'+(on?'#7a5800':'#888')+';font-weight:700;cursor:pointer;font-family:&apos;Nunito&apos;,sans-serif;font-size:11px\">'+(on?'ON':'OFF')+'</button></div>';}if((cat.id==='C'||cat.id==='OF')&&hasBeds()){")

for bad in ['ST.mode','recView','selOne','ovOne','isRec?','PLAN_DISCOUNT','PLAN_SVCS','REC_CATS','ONE_CATS','iVr\'','visRow','setMode','setRecView',"'G4'","'G5'",'G4:','G5:']:
    if bad in s: print('LEFTOVER',bad, [m.start() for m in re.finditer(re.escape(bad),s)][:5])
open('./next/index.html','w',encoding='utf-8').write(s)
print('ok',len(s))
