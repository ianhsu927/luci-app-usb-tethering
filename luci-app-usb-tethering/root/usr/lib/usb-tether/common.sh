#!/bin/sh
# Enumerate physical USB devices and their network interfaces, never guess eth1.
USB_SYS_ROOT="${USB_SYS_ROOT:-/sys}"
usb_read() { cat "$1" 2>/dev/null || :; }
usb_scan() {
	for usb_path in "$USB_SYS_ROOT"/bus/usb/devices/*; do
		[ -r "$usb_path/idVendor" ] || continue
		[ "$(usb_read "$usb_path/bDeviceClass")" = 09 ] && continue
		usb_port="${usb_path##*/}"
		usb_real="$(readlink -f "$usb_path")"
		usb_vendor="$(usb_read "$usb_path/idVendor")"
		usb_product="$(usb_read "$usb_path/idProduct")"
		usb_serial="$(usb_read "$usb_path/serial")"
		usb_name="$(usb_read "$usb_path/product")"
		usb_maker="$(usb_read "$usb_path/manufacturer")"
		usb_interfaces=""
		for usb_net in "$USB_SYS_ROOT"/class/net/*; do
			[ -e "$usb_net/device" ] || continue
			usb_net_real="$(readlink -f "$usb_net/device")"
			case "$usb_net_real" in
				"$usb_real"/*) usb_interfaces="$usb_interfaces ${usb_net##*/}" ;;
			esac
		done
		usb_device
	done
}
