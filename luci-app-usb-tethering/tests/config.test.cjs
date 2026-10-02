const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/view/usb-tethering/overview.js'), 'utf8');
const usb = { devices: [{port:'1-1',vendor:'05ac',product_id:'12a8',serial:'phone-1',name:'iPhone',interfaces:[{name:'eth2',driver:'ipheth',carrier:'1'}]}] };
function setup(modify = () => {}) {
 const state = {
  usb_tether: {main:{'.type':'settings',enabled:'0'}},
  network: {lan:{'.type':'interface',device:'br-lan'},wan:{'.type':'interface',device:'eth1',proto:'dhcp'}},
  firewall: {wan:{'.type':'zone',name:'wan',masq:'1',network:['wan','wan6']},lan:{'.type':'zone',name:'lan',network:['lan']},lanwan:{'.type':'forwarding',src:'lan',dest:'wan'}}
 };
 let saves=0, applies=0, notifications=[];
 let fresh=structuredClone(usb);
 modify(state, fresh);
 const uci = {
  get:(c,s,k)=> k ? state[c]?.[s]?.[k] : state[c]?.[s],
  sections:(c,t,cb)=>{const rows=Object.entries(state[c]||{}).filter(([,v])=>v['.type']===t).map(([k,v])=>({...v,'.name':k}));if(cb)rows.forEach(r=>cb.call(uci,r));return rows},
  add:(c,t,s)=>{state[c][s]={'.type':t};return s},
  set:(c,s,k,v)=>{state[c][s][k]=v},
  unset:(c,s,k)=>{delete state[c][s][k]},
  remove:(c,s)=>{delete state[c][s]},
  save:()=>{saves++;return Promise.resolve()}
 };
 const ui = {createHandlerFn:(ctx,key,...args)=>ctx[key].bind(ctx,...args),changes:{apply:checked=>{assert.equal(checked,true);applies++;return Promise.resolve()}},addNotification:(a,b)=>notifications.push(b)};
 const rpc={declare:({object})=>()=>Promise.resolve(object==='usb.tether'?fresh:{})};
 const pollers=[];
 const E=(tag,attrs={},children=[])=>({tag,attrs,children:[].concat(children),value:attrs.value||'',options:[],appendChild(child){this.children.push(child);if(this.tag==='select')this.options.push(child);return child;}});
 const dom={content(node,children){node.children=[].concat(children);if(node.tag==='select')node.options=node.children;}};
 const view = new Function('view','rpc','uci','ui','poll','dom','L','E',source)(
  {extend:o=>o},rpc,uci,ui,{add:fn=>pollers.push(fn)},dom,{bind:(fn,ctx,...args)=>fn.bind(ctx,...args)},E
 );
 view.select={value:'1-1/eth2'};view.metric={value:'100'};view.zone={value:'wan'};
 return {view,state,notifications,pollers,fresh,counts:()=>[saves,applies]};
}
(async()=>{
 let count=0;
 let t=setup();const originalWan=structuredClone(t.state.network.wan);await t.view.configure(true);
 assert.equal(t.state.network.usb_tether.device,'eth2');assert.equal(t.state.network.usb_tether.proto,'dhcp');assert.equal(t.state.network.usb_tether.metric,'100');
 assert.deepEqual(t.state.network.wan,originalWan);assert.deepEqual(t.state.firewall.wan.network,['wan','wan6','usb_tether']);assert.equal(t.state.usb_tether.main.serial,'phone-1');assert.deepEqual(t.counts(),[1,1]);count++;
 await t.view.configure(true);assert.deepEqual(t.state.firewall.wan.network,['wan','wan6','usb_tether']);count++;
 await t.view.configure(false);assert.equal(t.state.network.usb_tether,undefined);assert.deepEqual(t.state.firewall.wan.network,['wan','wan6']);assert.equal(t.state.usb_tether.main.enabled,'0');count++;
 for (const scenario of [
  (s,d)=>d.devices=[],
  s=>s.network.usb_tether={'.type':'interface',proto:'static'},
  s=>s.network.other={'.type':'interface',device:'eth2'},
  s=>s.network.other={'.type':'interface',ifname:'eth2 eth3'},
  s=>s.network.bridge={'.type':'device',type:'bridge',name:'br-lan',ports:['eth2']},
  s=>s.firewall.wan.masq='0',
  s=>delete s.firewall.lanwan
 ]) {
  t=setup(scenario);const before=JSON.stringify(t.state);await t.view.configure(true);assert.equal(JSON.stringify(t.state),before);assert.deepEqual(t.counts(),[0,0]);assert.equal(t.notifications.length,1);count++;
 }
 for (const metric of ['-1','65536','a','1.5','']) {t=setup();t.view.metric.value=metric;await t.view.configure(true);assert.deepEqual(t.counts(),[0,0]);count++;}
 for (const metric of ['0','65535']) {t=setup();t.view.metric.value=metric;await t.view.configure(true);assert.equal(t.state.network.usb_tether.metric,metric);count++;}
 t=setup((s,d)=>{d.devices=[];s.network.usb_tether={'.type':'interface',usb_tether_owned:'1',device:'eth2'};s.firewall.wan.network.push('usb_tether')});await t.view.configure(false);assert.equal(t.state.network.usb_tether,undefined);count++;
 t=setup();const page=t.view.render([t.fresh,{}]);assert.equal(page.tag,'div');assert.equal(t.view.zone.options.length,1);assert.equal(t.pollers.length,1);count++;
 t.view.select.value='1-1/eth2';t.view.update(t.fresh,{'up':true,'ipv4-address':[{address:'172.20.10.2'}]});assert.equal(t.view.select.value,'1-1/eth2');count++;
 t.view.update({devices:[]},{});assert.equal(t.view.enableButton.disabled,true);count++;
 console.log(`${count} configuration scenarios passed`);
})().catch(e=>{console.error(e);process.exit(1)});
