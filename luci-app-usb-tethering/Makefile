include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI USB phone tethering manager
LUCI_DEPENDS:=+luci-base +rpcd +libubox +jshn +kmod-usb-net-ipheth +usbmuxd
LUCI_PKGARCH:=all
PKG_LICENSE:=MIT
PKG_VERSION:=1.1.0
PKG_RELEASE:=1

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
