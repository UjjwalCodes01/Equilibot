import { createConfig, http } from "wagmi";
import { bsc, bscTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const testnetRpcUrl = process.env.NEXT_PUBLIC_BNB_TESTNET_RPC_URL;
const mainnetRpcUrl = process.env.NEXT_PUBLIC_BNB_MAINNET_RPC_URL;

export const dashboardWagmiConfig = createConfig({
  chains: [bscTestnet, bsc],
  connectors: [injected()],
  transports: {
    [bscTestnet.id]: http(testnetRpcUrl || undefined),
    [bsc.id]: http(mainnetRpcUrl || undefined),
  },
  ssr: true,
});