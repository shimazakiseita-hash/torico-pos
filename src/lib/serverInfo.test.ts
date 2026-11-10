import type os from "node:os";
import { describe, expect, it } from "vitest";
import { pickLanAddresses } from "./serverInfo";

const v4 = (address: string, internal = false) =>
  ({ address, family: "IPv4", internal, netmask: "", mac: "", cidr: null }) as os.NetworkInterfaceInfo;
const v6 = (address: string) =>
  ({ address, family: "IPv6", internal: false, netmask: "", mac: "", cidr: null, scopeid: 0 }) as os.NetworkInterfaceInfo;

describe("pickLanAddresses", () => {
  it("LANのIPv4だけを返し、Docker・ループバック・IPv6は除く", () => {
    expect(
      pickLanAddresses({
        lo: [v4("127.0.0.1", true)],
        wlp0s20f3: [v4("172.20.10.3"), v6("240a:61::1")],
        docker0: [v4("172.17.0.1")],
        "br-1a2b3c": [v4("172.18.0.1")],
        veth123: [v4("169.254.1.1")],
      }),
    ).toEqual(["172.20.10.3"]);
  });
});
