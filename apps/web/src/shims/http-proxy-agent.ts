/**
 * Browser stub for http-proxy-agent (Node-only). CCXT may import this; proxy is not used in web.
 */
function HttpProxyAgent(_proxy: string) {
  return null as unknown as { protocol: string };
}
HttpProxyAgent.prototype = null as unknown as object;
export { HttpProxyAgent };
export default HttpProxyAgent;
