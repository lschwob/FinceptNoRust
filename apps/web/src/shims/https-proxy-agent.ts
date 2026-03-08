/**
 * Browser stub for https-proxy-agent (Node-only). CCXT may import this; proxy is not used in web.
 */
function HttpsProxyAgent(_proxy: string) {
  return null as unknown as { protocol: string };
}
HttpsProxyAgent.prototype = null as unknown as object;
export { HttpsProxyAgent };
export default HttpsProxyAgent;
