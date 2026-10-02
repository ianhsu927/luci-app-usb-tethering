#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo '请使用 root 安装。' >&2; exit 1; }
[ -f /etc/openwrt_release ] || { echo '此安装脚本只能在 OpenWrt 路由器上运行。' >&2; exit 1; }
base="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# Install the kernel package only from this router's own firmware repository.
if command -v apk >/dev/null 2>&1; then
	missing=""
	for pkg in luci-base rpcd jshn kmod-usb-net-ipheth usbmuxd; do
		apk info -e "$pkg" >/dev/null 2>&1 || missing="$missing $pkg"
	done
	if [ -n "$missing" ]; then
		apk update
		apk add $missing
	fi
elif command -v opkg >/dev/null 2>&1; then
	opkg update
	opkg install luci-base rpcd jshn kmod-usb-net-ipheth usbmuxd
else
	echo '未找到 apk / opkg。' >&2; exit 1
fi
stamp="$(date +%Y%m%d-%H%M%S)"
backup="/root/usb-tether-backup-$stamp"
mkdir -p "$backup"
for file in /etc/config/network /etc/config/firewall /etc/config/usb_tether; do
	[ ! -f "$file" ] || cp -p "$file" "$backup/"
done
# Preserve existing plugin settings during upgrades.
[ -f /etc/config/usb_tether ] || cp "$base/root/etc/config/usb_tether" /etc/config/usb_tether
for dir in usr etc/hotplug.d; do
	mkdir -p "/$dir"
	cp -R "$base/root/$dir/." "/$dir/"
done
mkdir -p /www/luci-static/resources/view/usb-tethering
cp "$base/htdocs/luci-static/resources/view/usb-tethering/overview.js" /www/luci-static/resources/view/usb-tethering/
chmod 755 /usr/libexec/rpcd/usb.tether /usr/libexec/usb-tether-rebind /etc/hotplug.d/net/90-usb-tether
sh "$base/root/etc/uci-defaults/90-usb-tether"
/etc/init.d/rpcd restart
rm -f /tmp/luci-indexcache
rm -rf /tmp/luci-modulecache
/etc/init.d/uhttpd reload
ubus call usb.tether status
printf '\n安装完成：LuCI → 网络 → USB 热点。配置备份：%s\n' "$backup"
