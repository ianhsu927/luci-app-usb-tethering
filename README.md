# luci-app-usb-tethering

OpenWrt LuCI USB 手机热点管理插件。检测 USB 设备，选择 iPhone 共享网卡作为 DHCP 上网接口，支持停用和重插匹配。页面保留连接状态、设备列表、选择和启停；防火墙区域和路由优先级折叠在“高级设置”。

## 编译进固件（推荐）

在 OpenWrt 构建树根目录执行：

```sh
./scripts/feeds update luci
./scripts/feeds install luci-base
git clone https://github.com/ianhsu927/luci-app-usb-tethering.git package/usb-tethering
make menuconfig
```

进入 `LuCI → Applications`，将 `luci-app-usb-tethering` 选为 `*`，然后正常编译固件。插件位置是仓库内的 `luci-app-usb-tethering/` 子目录，不要把仓库根目录改名成插件包。依赖包含 `kmod-usb-net-ipheth`、`usbmuxd`、`rpcd`、`jshn` 和 LuCI；UCI RPC 由 rpcd 提供，不依赖不存在的 rpcd-mod-uci 包。

仅编译软件包：

```sh
make package/luci-app-usb-tethering/compile V=s
```

## 用作自定义 feed

向 `feeds.conf.default` 添加：

```text
src-git usb_tethering https://github.com/ianhsu927/luci-app-usb-tethering.git
```

然后执行：

```sh
./scripts/feeds update luci usb_tethering
./scripts/feeds install -p luci luci-base
./scripts/feeds install -p usb_tethering luci-app-usb-tethering
make menuconfig
```

也可在固件构建 CI 的 feeds 更新之前用上述 clone 命令引入。为可重复构建，建议 checkout 已验证的 tag 或固定 commit。正式 APK 需要与你的固件匹配的 SDK；本仓库不分发预编译内核驱动。

## 直接安装到现有路由器

将仓库上传到路由器，进入子目录执行：

```sh
cd luci-app-usb-tethering
sh install.sh
```

安装脚本兼容 apk/opkg，缺少依赖时从路由器自己的软件源安装，复制插件并重启 rpcd、重载 uhttpd。它不进入包管理器的插件清单，适合试用；长期使用建议编译进固件。升级安装保留插件设置，配置备份位于路由器 `/root/usb-tether-backup-时间戳`。

## 使用

进入 LuCI 的“网络 → USB 热点”。iPhone 解锁，开启“个人热点 → 允许其他人加入”，连接数据线并确认信任。选择出现的网卡，点击“启用”。现有 Wi-Fi/LAN 通过已配置的防火墙转发和 NAT 分享网络；插件不创建无线热点。

高级设置中的 metric 越小越优先。默认 100，现有 WAN 通常是 0，此时 USB 是备用。要作为主线路，请在“网络 → 接口”中把原 WAN 的 metric 调为更大数值。备用仅按路由优先级工作，不做互联网健康检测。

“停用”删除插件接口和防火墙成员关系。不要在网络配置中将 `usb_tether` 名称用于其他接口。应用采用 LuCI 标准流程，会同时应用当前会话的其他已保存待应用配置。

有序列号的设备按序列号、VID/PID 匹配；无序列号设备按 USB 端口、VID/PID 匹配。多网卡设备不擅自切换网络功能。Android 等设备需要另外安装对应 RNDIS/NCM/CDC 驱动。当前自动配置范围是 IPv4 DHCP，不包括 IPv6 relay。

## 验证与范围

在 Cudy TR3600 v1 / OpenWrt 25.12-SNAPSHOT 上验证了真实 LuCI 页面、识别 iPhone、DHCP、启用、停用、重新启用、NAT/转发规则和重复事件不重启接口。指定 iPhone 网卡的 ping 成功，但 HTTP/HTTPS 请求测试仍超时；测试环境有 OpenClash，未确认完整网页访问、实际 Wi-Fi 客户端、物理拔插及重启恢复。

本地测试使用 Node.js 22：

```sh
node luci-app-usb-tethering/tests/config.test.cjs
python3 luci-app-usb-tethering/tests/devices.test.py
```

测试覆盖配置冲突、网桥占用、优先级边界、设备离线、USB sysfs 枚举和重绑定。仓库不包含 SDK 编译结果；使用前应在自己的 SDK/固件环境完成编译和验证。

## 许可与参考

MIT。

- [OpenWrt USB 网络共享](https://openwrt.org/docs/guide-user/network/wan/smartphone.usb.tethering)
- [OpenWrt LuCI 源码](https://github.com/openwrt/luci)
