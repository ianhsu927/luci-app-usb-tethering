import os
import pathlib
import subprocess
import tempfile
import json

PACKAGE = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as temp:
    root = pathlib.Path(temp)
    sys = root / 'sys'
    usb = sys / 'bus/usb/devices'
    net = sys / 'class/net'
    usb.mkdir(parents=True)
    net.mkdir(parents=True)
    def device(port, vendor, product, serial='', cls='00'):
        real = sys / 'devices/usb1' / port
        real.mkdir(parents=True)
        for k,v in {'idVendor':vendor,'idProduct':product,'serial':serial,'bDeviceClass':cls,'product':'iPhone "Test"','manufacturer':'Apple'}.items():
            (real/k).write_text(v+'\n')
        (usb/port).symlink_to(real)
        return real
    phone = device('1-1','05ac','12a8','serial-one')
    other = device('1-2','1234','5678')
    device('usb1','1d6b','0002',cls='09')
    (phone/'1-1:4.2').mkdir()
    (net/'eth7').mkdir()
    (net/'eth7/device').symlink_to(phone/'1-1:4.2')
    (net/'eth0').mkdir()
    wired = sys/'devices/platform/ethernet'
    wired.mkdir(parents=True)
    (net/'eth0/device').symlink_to(wired)
    env = dict(os.environ, USB_SYS_ROOT=str(sys))
    scanner = '. "$1"; usb_device() { printf "%s|%s|%s|%s\\n" "$usb_port" "$usb_vendor" "$usb_serial" "$usb_interfaces"; }; usb_scan'
    def scan():
        return subprocess.check_output(['sh','-c',scanner,'sh',str(PACKAGE/'root/usr/lib/usb-tether/common.sh')],env=env,text=True)
    result = scan().splitlines()
    assert result == ['1-1|05ac|serial-one| eth7','1-2|1234||'], result
    (net/'eth7/device').unlink()
    assert scan().splitlines()[0] == '1-1|05ac|serial-one|'
    (net/'eth7/device').symlink_to(phone/'1-1:4.2')
    # Stub OpenWrt commands in a private directory; no host configuration is changed.
    commands = root/'bin'
    commands.mkdir()
    state = root/'state.json'
    trace = root/'trace'
    uci = commands/'uci'
    uci.write_text('''#!/usr/bin/env python3
import sys,json,os
p=os.environ['TEST_STATE'];s=json.load(open(p));args=sys.argv[1:]
if args[0]=='-q':args=args[1:]
op=args[0]
if op=='get':
 v=s.get(args[1]);print(v if v is not None else '');sys.exit(0 if v is not None else 1)
elif op=='changes':print(s.get('pending',''),end='')
elif op=='set':
 k,v=args[1].split('=',1);s[k]=v;json.dump(s,open(p,'w'))
elif op=='commit':
 with open(os.environ['TEST_TRACE'],'a') as f:f.write('commit '+args[1]+'\\n')
else:sys.exit(1)
''')
    uci.chmod(0o755)
    for name in ['ubus','ifup']:
        f=commands/name
        f.write_text('#!/bin/sh\nprintf "%s\\n" "'+name+' $*" >> "$TEST_TRACE"\n')
        f.chmod(0o755)
    rebind = root/'rebind'
    content = (PACKAGE/'root/usr/libexec/usb-tether-rebind').read_text()
    content = content.replace('. /usr/share/libubox/jshn.sh', 'json_load() { return 1; }')
    content = content.replace('/usr/lib/usb-tether/common.sh',str(PACKAGE/'root/usr/lib/usb-tether/common.sh')).replace('/var/lock/usb-tether-rebind',str(root/'lock'))
    rebind.write_text(content)
    baseline = {'usb_tether.main.enabled':'1','network.usb_tether.usb_tether_owned':'1','usb_tether.main.port':'old-port','usb_tether.main.vendor':'05ac','usb_tether.main.product_id':'12a8','usb_tether.main.serial':'serial-one','usb_tether.main.device':'eth2','network.usb_tether.device':'eth2'}
    env.update(PATH=str(commands)+os.pathsep+env['PATH'],TEST_STATE=str(state),TEST_TRACE=str(trace))
    def run(overrides=None):
        state.write_text(json.dumps(dict(baseline,**(overrides or {}))))
        trace.write_text('')
        subprocess.run(['sh',str(rebind)],env=env,check=True)
        return json.loads(state.read_text()),trace.read_text()
    s,t=run()
    assert s['network.usb_tether.device']=='eth7' and t=='commit network\nubus call network reload\nubus call network.interface.usb_tether status\nifup usb_tether\n',(s,t)
    s,t=run({'network.usb_tether.device':'eth7'})
    assert t=='ubus call network.interface.usb_tether status\nifup usb_tether\n'
    for change in [
        {'usb_tether.main.enabled':'0'},
        {'network.usb_tether.usb_tether_owned':'0'},
        {'pending':"network.wan.metric='10'"},
        {'usb_tether.main.serial':'other-phone'},
        {'usb_tether.main.vendor':'ffff'},
        {'usb_tether.main.serial':'','usb_tether.main.port':'old-port'}
    ]:
        s,t=run(change);assert t=='',t
    s,t=run({'usb_tether.main.serial':'','usb_tether.main.port':'1-1'})
    assert s['network.usb_tether.device']=='eth7'
    rebind.write_text(content.replace('json_load() { return 1; }', 'json_load() { return 0; }; json_get_var() { usb_up=1; }'))
    s,t=run({'network.usb_tether.device':'eth7'})
    assert t=='ubus call network.interface.usb_tether status\n'
    rebind.write_text(content)
    (net/'eth7/device').unlink()
    s,t=run();assert t==''
print('USB inventory and 11 hotplug scenarios passed')
