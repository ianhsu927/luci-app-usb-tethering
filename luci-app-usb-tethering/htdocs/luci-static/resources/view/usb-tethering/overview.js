'use strict';
'require view';
'require rpc';
'require uci';
'require ui';
'require poll';
'require dom';

var getUSB = rpc.declare({ object: 'usb.tether', method: 'status', expect: {} });
var getWAN = rpc.declare({ object: 'network.interface.usb_tether', method: 'status', expect: {} });
var IFACE = 'usb_tether';
function networks(zone) {
	var value = zone.network;
	return Array.isArray(value) ? value.slice() : (value || '').split(/\s+/).filter(Boolean);
}
function candidates(data) {
	var result = [];
	(data.devices || []).forEach(function(device) {
		(device.interfaces || []).forEach(function(net) {
			result.push({ key: device.port + '/' + net.name, usb: device, net: net });
		});
	});
	return result;
}
return view.extend({
	load: function() {
		return Promise.all([getUSB(), getWAN().catch(function() { return {}; }),
			uci.load('usb_tether'), uci.load('network'), uci.load('firewall')]);
	},
	render: function(data) {
		this.deviceData = data[0];
		this.select = E('select', { 'class': 'cbi-input-select' });
		this.metric = E('input', { 'type': 'number', 'min': '0', 'max': '65535',
			'value': uci.get('usb_tether', 'main', 'metric') || '100', 'class': 'cbi-input-text' });
		this.zone = E('select', { 'class': 'cbi-input-select' });
		uci.sections('firewall', 'zone').forEach(function(z) {
			if (z.masq === '1') this.zone.appendChild(E('option', { value: z['.name'] }, [z.name || z['.name']]));
		}, this);
		var wan = uci.sections('firewall', 'zone').filter(function(z) { return z.name === 'wan' && z.masq === '1'; })[0];
		if (wan) this.zone.value = wan['.name'];
		this.status = E('div');
		this.table = E('div');
		this.enableButton = E('button', { 'class': 'cbi-button cbi-button-apply',
			'click': ui.createHandlerFn(this, 'configure', true) }, ['启用']);
		this.disableButton = E('button', { 'class': 'cbi-button cbi-button-negative',
			'click': ui.createHandlerFn(this, 'configure', false) }, ['停用']);
		var root = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, ['USB 热点']), this.status, this.table,
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, ['上网设备']), this.select,
				E('p', {}, [this.enableButton, ' ', this.disableButton]),
				E('details', {}, [
					E('summary', {}, ['高级设置']),
					E('p', {}, ['防火墙区域']), this.zone,
					E('p', {}, ['路由优先级（数值越小越优先）']), this.metric
				])
			])
		]);
		this.update(data[0], data[1]);
		poll.add(L.bind(function() {
			return Promise.all([getUSB(), getWAN().catch(function() { return {}; })])
				.then(L.bind(function(values) { this.update(values[0], values[1]); }, this))
				.catch(L.bind(function() {
					this.enableButton.disabled = true;
					dom.content(this.status, E('p', { 'class': 'alert-message warning' }, ['读取设备失败，正在重试。']));
				}, this));
		}, this), 5);
		return root;
	},
	update: function(data, wan) {
		this.deviceData = data;
		var rows = candidates(data), selected = this.select.value;
		var savedDevice = uci.get('usb_tether', 'main', 'device');
		var savedSerial = uci.get('usb_tether', 'main', 'serial');
		var savedPort = uci.get('usb_tether', 'main', 'port');
		dom.content(this.select, [E('option', { value: '' }, ['选择设备'])].concat(rows.map(function(row) {
			return E('option', { value: row.key }, [row.usb.name + ' (' + row.net.name + ')']);
		})));
		if (rows.some(function(r) { return r.key === selected; })) this.select.value = selected;
		else {
			var saved = rows.filter(function(r) {
				return (savedSerial ? r.usb.serial === savedSerial : r.usb.port === savedPort) && r.net.name === savedDevice;
			})[0];
			if (saved) this.select.value = saved.key;
		}
		this.enableButton.disabled = !rows.length || !this.zone.options.length;
		var addresses = (wan['ipv4-address'] || []).map(function(a) { return a.address; }).join(', ');
		var enabled = uci.get('usb_tether', 'main', 'enabled') === '1';
		var state = !enabled ? '已停用' : wan.up && addresses ? '已连接 · ' + addresses : '等待连接';
		dom.content(this.status, E('p', {}, [state]));
		var table = E('table', { 'class': 'table' }, [E('tr', { 'class': 'tr table-titles' },
			['设备', '网卡', '状态'].map(function(s) { return E('th', { 'class': 'th' }, [s]); }))]);
		(data.devices || []).forEach(function(d) {
			var nets = d.interfaces || [];
			table.appendChild(E('tr', { 'class': 'tr' }, [d.name,
				nets.map(function(n) { return n.name; }).join(', ') || '—',
				nets.length ? (nets.some(function(n) { return n.carrier === '1'; }) ? '就绪' : '等待连接') : '未开启共享'
			].map(function(s) { return E('td', { 'class': 'td' }, [s]); })));
		});
		if (!(data.devices || []).length) table.appendChild(E('tr', { 'class': 'tr' }, [E('td', { colspan: 3 }, ['未连接 USB 设备'])]));
		dom.content(this.table, table);
	},
	configure: function(enabled) {
		return getUSB().then(L.bind(function(fresh) {
			var row = candidates(fresh).filter(L.bind(function(r) { return r.key === this.select.value; }, this))[0];
			var metric = this.metric.value;
			if (enabled && (!row || !/^\d+$/.test(metric) || Number(metric) > 65535))
				throw new Error('请选择当前已连接的共享网卡，并填写 0–65535 的 metric。');
			var existing = uci.get('network', IFACE);
			if (existing && uci.get('network', IFACE, 'usb_tether_owned') !== '1')
				throw new Error('usb_tether 接口已被其他配置使用，请先修改该接口名称。');
			var target = uci.sections('firewall', 'zone').filter(L.bind(function(z) { return z['.name'] === this.zone.value && z.masq === '1'; }, this))[0];
			if (enabled && !target) throw new Error('没有可用的 NAT 出口区域，请先在防火墙中设置 wan 区域和 LAN 到该区域的转发。');
			if (enabled) {
				var forwarding = uci.sections('firewall', 'forwarding').some(function(f) {
					return f.dest === target.name && f.src !== target.name && f.enabled !== '0';
				});
				if (!forwarding) throw new Error('所选出口区域没有其他区域到它的转发规则，请先配置 LAN 到该区域的转发。');
				var busy = uci.sections('network', 'interface').some(function(n) {
					return n['.name'] !== IFACE && (n.device === row.net.name || (Array.isArray(n.ifname) ? n.ifname : (n.ifname || '').split(/\s+/)).indexOf(row.net.name) !== -1);
				});
				busy = busy || uci.sections('network', 'device').some(function(d) {
					var ports = Array.isArray(d.ports) ? d.ports : (d.ports || '').split(/\s+/);
					return ports.indexOf(row.net.name) !== -1 || (d.name === row.net.name && d.type === 'bridge');
				});
				if (busy) throw new Error('该网卡已被其他网络接口使用，请先到“网络 → 接口”解除绑定。');
			}
			if (!uci.get('usb_tether', 'main')) uci.add('usb_tether', 'settings', 'main');
			uci.set('usb_tether', 'main', 'enabled', enabled ? '1' : '0');
			uci.sections('firewall', 'zone', function(z) {
				var original = networks(z), list = original.filter(function(n) { return n !== IFACE; });
				if (enabled && z['.name'] === target['.name']) list.push(IFACE);
				if (list.join(' ') !== original.join(' ')) {
					if (list.length) uci.set('firewall', z['.name'], 'network', list);
					else uci.unset('firewall', z['.name'], 'network');
				}
			});
			if (enabled) {
				if (!existing) uci.add('network', 'interface', IFACE);
				uci.set('network', IFACE, 'usb_tether_owned', '1');
				uci.set('network', IFACE, 'proto', 'dhcp');
				uci.set('network', IFACE, 'device', row.net.name);
				uci.set('network', IFACE, 'metric', metric);
				uci.set('network', IFACE, 'auto', '1');
				uci.set('network', IFACE, 'defaultroute', '1');
				uci.set('network', IFACE, 'peerdns', '1');
				['port', 'vendor', 'product_id', 'serial'].forEach(function(k) { uci.set('usb_tether', 'main', k, row.usb[k]); });
				uci.set('usb_tether', 'main', 'device', row.net.name);
				uci.set('usb_tether', 'main', 'metric', metric);
			} else if (existing) uci.remove('network', IFACE);
			return uci.save().then(function() { return ui.changes.apply(true); });
		}, this)).catch(function(err) { ui.addNotification(null, E('p', {}, [err.message]), 'error'); });
	},
	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
