import os from "node:os";

export type ServerInfo = { ips: string[]; port: number; urls: string[]; practice: boolean };

/** 他の端末からは届かない仮想ネットワーク（Docker・仮想マシンなど）のインターフェース名 */
const VIRTUAL_INTERFACE = /^(docker|br-|veth|virbr|vboxnet|vmnet|lxcbr|lxdbr|cni|flannel|tailscale|zt)/;

/** LAN上の（内部でも仮想でもない）IPv4アドレス */
export function pickLanAddresses(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string[] {
  return Object.entries(interfaces)
    .filter(([name]) => !VIRTUAL_INTERFACE.test(name))
    .flatMap(([, addrs]) => addrs ?? [])
    .filter((a) => a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
}

/** LAN上のIPv4アドレスと、各端末で開くURL。practice は練習モード（npm run practice）で起動中か */
export function getServerInfo(port = Number(process.env.PORT ?? 3000)): ServerInfo {
  const ips = pickLanAddresses(os.networkInterfaces());
  return { ips, port, urls: ips.map((ip) => `http://${ip}:${port}`), practice: process.env.TORICO_PRACTICE === "1" };
}
