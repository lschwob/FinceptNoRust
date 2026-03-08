/**
 * Browser stub for socks-proxy-agent (Node-only). CCXT may import this; SOCKS proxy is not used in web.
 */
function SocksProxyAgent(_proxy: string) {
  return null as unknown as { protocol: string };
}
SocksProxyAgent.prototype = null as unknown as object;
export { SocksProxyAgent };
export default SocksProxyAgent;
