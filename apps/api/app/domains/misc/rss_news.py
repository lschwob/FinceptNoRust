"""
RSS news fetcher — same behaviour as Rust (news.rs).
Fetches from 80+ financial, geopolitical and real-time RSS feeds.
Parses item/entry, strips HTML, parses dates, enriches with priority/sentiment/impact/category/tickers.
Uses parallel fetch to speed up loading; failed feeds (DNS/404) are skipped without blocking others.
"""
from __future__ import annotations

import hashlib
import logging
import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any

import httpx

# Feed: id, name, url, category, region, source, tier (1=wire, 2=major, 3=specialty, 4=blog)
def _feeds() -> list[dict[str, Any]]:
    return [
        # Tier 1 — Wire & official (URLs that work without auth)
        {"id": "ap-top", "name": "AP Top News", "url": "https://feeds.apnews.com/rss/topnews", "category": "GEOPOLITICS", "region": "GLOBAL", "source": "AP", "tier": 1},
        {"id": "ap-business", "name": "AP Business", "url": "https://feeds.apnews.com/rss/business", "category": "MARKETS", "region": "GLOBAL", "source": "AP", "tier": 1},
        {"id": "ap-finance", "name": "AP Finance", "url": "https://feeds.apnews.com/rss/finance", "category": "MARKETS", "region": "GLOBAL", "source": "AP", "tier": 1},
        {"id": "sec-press", "name": "SEC Press", "url": "https://www.sec.gov/news/pressreleases.rss", "category": "REGULATORY", "region": "US", "source": "SEC", "tier": 1},
        {"id": "fed-press", "name": "Federal Reserve", "url": "https://www.federalreserve.gov/feeds/press_all.xml", "category": "REGULATORY", "region": "US", "source": "FEDERAL RESERVE", "tier": 1},
        {"id": "un-news", "name": "UN News", "url": "https://news.un.org/feed/subscribe/en/news/all/rss.xml", "category": "GEOPOLITICS", "region": "GLOBAL", "source": "UN", "tier": 1},
        {"id": "worldbank", "name": "World Bank Blogs", "url": "https://blogs.worldbank.org/feed", "category": "ECONOMIC", "region": "GLOBAL", "source": "WORLD BANK", "tier": 1},
        {"id": "ecb-press", "name": "ECB Press", "url": "https://www.ecb.europa.eu/rss/press.html", "category": "REGULATORY", "region": "EU", "source": "ECB", "tier": 1},
        {"id": "cftc-press", "name": "CFTC Press", "url": "https://www.cftc.gov/RSS/RSSGP/rssgp.xml", "category": "REGULATORY", "region": "US", "source": "CFTC", "tier": 1},
        # Tier 2 — Major financial (no WSJ/Yahoo – 403/400; use alternatives)
        {"id": "marketwatch", "name": "MarketWatch", "url": "https://feeds.content.dowjones.io/public/rss/mw_topstories", "category": "MARKETS", "region": "US", "source": "MARKETWATCH", "tier": 2},
        {"id": "cnbc", "name": "CNBC", "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html", "category": "MARKETS", "region": "US", "source": "CNBC", "tier": 2},
        {"id": "benzinga", "name": "Benzinga", "url": "https://www.benzinga.com/feed", "category": "MARKETS", "region": "US", "source": "BENZINGA", "tier": 2},
        {"id": "bloomberg", "name": "Bloomberg", "url": "https://feeds.bloomberg.com/markets/news.rss", "category": "MARKETS", "region": "GLOBAL", "source": "BLOOMBERG", "tier": 2},
        {"id": "ft", "name": "Financial Times", "url": "https://www.ft.com/rss/home", "category": "MARKETS", "region": "GLOBAL", "source": "FT", "tier": 2},
        {"id": "bbc-world", "name": "BBC World", "url": "https://feeds.bbci.co.uk/news/world/rss.xml", "category": "GEOPOLITICS", "region": "GLOBAL", "source": "BBC", "tier": 2},
        {"id": "bbc-business", "name": "BBC Business", "url": "https://feeds.bbci.co.uk/news/business/rss.xml", "category": "MARKETS", "region": "GLOBAL", "source": "BBC", "tier": 2},
        {"id": "bbc-tech", "name": "BBC Technology", "url": "https://feeds.bbci.co.uk/news/technology/rss.xml", "category": "TECH", "region": "GLOBAL", "source": "BBC", "tier": 2},
        {"id": "nytimes-world", "name": "NYT World", "url": "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", "category": "GEOPOLITICS", "region": "GLOBAL", "source": "NYT", "tier": 2},
        {"id": "guardian-world", "name": "Guardian World", "url": "https://www.theguardian.com/world/rss", "category": "GEOPOLITICS", "region": "GLOBAL", "source": "GUARDIAN", "tier": 2},
        {"id": "guardian-biz", "name": "Guardian Business", "url": "https://www.theguardian.com/business/rss", "category": "MARKETS", "region": "GLOBAL", "source": "GUARDIAN", "tier": 2},
        {"id": "aljazeera", "name": "Al Jazeera", "url": "https://www.aljazeera.com/xml/rss/all.xml", "category": "GEOPOLITICS", "region": "GLOBAL", "source": "AL JAZEERA", "tier": 2},
        {"id": "dw-world", "name": "DW World", "url": "https://rss.dw.com/xml/rss-en-world", "category": "GEOPOLITICS", "region": "EU", "source": "DW", "tier": 2},
        {"id": "euronews", "name": "Euronews", "url": "https://www.euronews.com/rss", "category": "GEOPOLITICS", "region": "EU", "source": "EURONEWS", "tier": 2},
        {"id": "investing", "name": "Investing.com", "url": "https://www.investing.com/rss/news_285.rss", "category": "MARKETS", "region": "GLOBAL", "source": "INVESTING.COM", "tier": 2},
        # Energy & commodities
        {"id": "oilprice", "name": "OilPrice", "url": "https://oilprice.com/rss/main", "category": "ENERGY", "region": "GLOBAL", "source": "OILPRICE", "tier": 2},
        {"id": "reuters-energy", "name": "Reuters Energy", "url": "https://feeds.apnews.com/rss/energy", "category": "ENERGY", "region": "GLOBAL", "source": "AP", "tier": 2},
        # Forex & macro
        {"id": "fxstreet", "name": "FXStreet", "url": "https://www.fxstreet.com/rss/news", "category": "MARKETS", "region": "GLOBAL", "source": "FXSTREET", "tier": 2},
        {"id": "mining", "name": "Mining.com", "url": "https://www.mining.com/feed/", "category": "MARKETS", "region": "GLOBAL", "source": "MINING.COM", "tier": 2},
        # Tech
        {"id": "techcrunch", "name": "TechCrunch", "url": "https://techcrunch.com/feed/", "category": "TECH", "region": "GLOBAL", "source": "TECHCRUNCH", "tier": 2},
        {"id": "wired", "name": "Wired", "url": "https://www.wired.com/feed/rss", "category": "TECH", "region": "US", "source": "WIRED", "tier": 2},
        {"id": "arstechnica", "name": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/index", "category": "TECH", "region": "US", "source": "ARS TECHNICA", "tier": 2},
        {"id": "verge", "name": "The Verge", "url": "https://www.theverge.com/rss/index.xml", "category": "TECH", "region": "US", "source": "THE VERGE", "tier": 2},
        # Crypto
        {"id": "coindesk", "name": "CoinDesk", "url": "https://www.coindesk.com/arc/outboundfeeds/rss/", "category": "CRYPTO", "region": "GLOBAL", "source": "COINDESK", "tier": 2},
        {"id": "cointelegraph", "name": "Cointelegraph", "url": "https://cointelegraph.com/rss", "category": "CRYPTO", "region": "GLOBAL", "source": "COINTELEGRAPH", "tier": 2},
        {"id": "decrypt", "name": "Decrypt", "url": "https://decrypt.co/feed", "category": "CRYPTO", "region": "GLOBAL", "source": "DECRYPT", "tier": 3},
        # Central banks
        {"id": "boe", "name": "Bank of England", "url": "https://www.bankofengland.co.uk/rss/news", "category": "REGULATORY", "region": "UK", "source": "BANK OF ENGLAND", "tier": 1},
        # Think tanks & policy
        {"id": "brookings", "name": "Brookings", "url": "https://www.brookings.edu/feed/", "category": "ECONOMIC", "region": "US", "source": "BROOKINGS", "tier": 3},
        # Regional
        {"id": "nikkei-asia", "name": "Nikkei Asia", "url": "https://asia.nikkei.com/rss/feed/nar", "category": "MARKETS", "region": "ASIA", "source": "NIKKEI ASIA", "tier": 2},
        {"id": "scmp", "name": "SCMP", "url": "https://www.scmp.com/rss/91/feed", "category": "GEOPOLITICS", "region": "ASIA", "source": "SCMP", "tier": 2},
        {"id": "ap-africa", "name": "AP Africa", "url": "https://feeds.apnews.com/rss/international", "category": "GEOPOLITICS", "region": "GLOBAL", "source": "AP", "tier": 1},
        {"id": "bbc-latam", "name": "BBC Americas", "url": "https://feeds.bbci.co.uk/news/world/latin_america/rss.xml", "category": "GEOPOLITICS", "region": "LATAM", "source": "BBC", "tier": 2},
        # More markets
        {"id": "seekingalpha", "name": "Seeking Alpha", "url": "https://seekingalpha.com/market_currents.xml", "category": "MARKETS", "region": "US", "source": "SEEKING ALPHA", "tier": 2},
        {"id": "finextra", "name": "Finextra", "url": "https://www.finextra.com/rss/rss.aspx", "category": "BANKING", "region": "GLOBAL", "source": "FINEXTRA", "tier": 2},
        {"id": "foreignpolicy", "name": "Foreign Policy", "url": "https://foreignpolicy.com/feed/", "category": "GEOPOLITICS", "region": "GLOBAL", "source": "FOREIGN POLICY", "tier": 2},
    ]


FETCH_TIMEOUT = 8.0
MAX_WORKERS = 24
HEADERS = {
    "User-Agent": "FinceptTerminal/3.0",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]*>", "", html).strip()


def _parse_rss_date(pub_date_str: str | None) -> tuple[int, str]:
    """Return (sort_ts, time_display). time_display like Rust: %b %d, %H:%M."""
    if not pub_date_str or not pub_date_str.strip():
        return 0, ""
    s = pub_date_str.strip().replace("\n", " ").replace("GMT", "+0000")
    now = datetime.now(timezone.utc)
    formats = [
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%a, %d %b %Y %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S%Z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%d %H:%M:%S",
        "%d %b %Y %H:%M:%S %z",
        "%b %d, %Y %H:%M:%S",
        "%B %d, %Y %H:%M:%S",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(s[: min(len(s), 50)], fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            ts = int(dt.timestamp())
            time_display = dt.strftime("%b %d, %H:%M")
            return ts, time_display
        except (ValueError, TypeError):
            continue
    return 0, s[:22] if len(s) > 22 else s


def _text_el(el: ET.Element | None, default: str = "") -> str:
    if el is None:
        return default
    return (el.text or "").strip() or default


def _find_text(item: ET.Element, *tags: str) -> str:
    namespaces = (
        "{http://purl.org/rss/1.0/}",
        "{http://www.w3.org/2005/Atom}",
        "{http://purl.org/dc/elements/1.1/}",
        "{http://search.yahoo.com/mrss/}",
        "{http://purl.org/rss/1.0/modules/content/}",
    )
    for tag in tags:
        local = tag.split(":")[-1]
        e = item.find(tag)
        if e is not None and (e.text or "").strip():
            return (e.text or "").strip()
        if e is not None and e.text is None and len(e) > 0:
            # Some feeds put text in a child
            for child in e:
                if (child.text or "").strip():
                    return (child.text or "").strip()
        for ns in namespaces:
            e = item.find(ns + local)
            if e is not None and (e.text or "").strip():
                return (e.text or "").strip()
            if e is not None and len(e) > 0:
                for child in e:
                    if (child.text or "").strip():
                        return (child.text or "").strip()
    return ""


def _find_link(item: ET.Element) -> str:
    link_el = item.find("link")
    if link_el is not None:
        href = link_el.get("href")
        if href:
            return href.strip()
        if link_el.text:
            return link_el.text.strip()
    for ns in ("{http://www.w3.org/2005/Atom}", "{http://purl.org/rss/1.0/}"):
        link_el = item.find(ns + "link")
        if link_el is not None:
            href = link_el.get("href")
            if href:
                return href.strip()
    return ""


def _parse_feed(content: str, feed: dict[str, Any]) -> list[dict[str, Any]]:
    articles: list[dict[str, Any]] = []
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return articles
    # RSS: channel/item; Atom: feed/entry (often with namespace)
    items: list[ET.Element] = []
    channel = root.find("channel")
    if channel is not None:
        items = list(channel.findall("item"))
    if not items:
        # Atom: entry may be in namespace
        for ns in ("", "{http://www.w3.org/2005/Atom}"):
            items = list(root.findall(ns + "entry"))
            if items:
                break
    if not items and root.tag.endswith("}feed"):
        items = list(root)
        items = [e for e in items if e.tag.endswith("}entry")]
    feed_id = feed.get("id") or feed.get("source", "")
    category = feed.get("category", "MARKETS")
    region = feed.get("region", "GLOBAL")
    source = feed.get("source", "RSS")
    tier = int(feed.get("tier") or 2)
    for i, item in enumerate(items):
        title = _find_text(item, "title")
        if not title:
            continue
        summary = _find_text(item, "description", "summary", "content:encoded", "content")
        if summary:
            summary = _strip_html(summary)[:300]
        link = _find_link(item)
        pub_date_str = _find_text(item, "pubDate", "published", "updated", "dc:date", "date")
        sort_ts, time_str = _parse_rss_date(pub_date_str)
        if not time_str and sort_ts:
            time_str = datetime.fromtimestamp(sort_ts, tz=timezone.utc).strftime("%b %d, %H:%M")
        if not time_str:
            time_str = datetime.now(timezone.utc).strftime("%b %d, %H:%M")
        if sort_ts == 0:
            sort_ts = int(datetime.now(timezone.utc).timestamp())
        article_id = hashlib.sha256((link or title + pub_date_str or "").encode()).hexdigest()[:24]
        article = {
            "id": article_id,
            "time": time_str,
            "priority": "ROUTINE",
            "category": category,
            "headline": title[:500],
            "summary": summary or "",
            "source": source,
            "region": region,
            "sentiment": "NEUTRAL",
            "impact": "LOW",
            "tickers": [],
            "classification": "PUBLIC",
            "link": link or "",
            "sort_ts": sort_ts,
            "tier": tier,
            "velocity_hint": 0,
        }
        _enrich_article(article)
        articles.append(article)
    return articles


# Enrich article: priority, sentiment, impact, category refinement, tickers (same logic as Rust)
def _enrich_article(article: dict[str, Any]) -> None:
    text = f"{article.get('headline', '')} {article.get('summary', '')}".lower()
    # Priority
    if "breaking" in text or "alert" in text:
        article["priority"] = "FLASH"
    elif "urgent" in text or "emergency" in text:
        article["priority"] = "URGENT"
    elif "announce" in text or "report" in text:
        article["priority"] = "BREAKING"
    # Sentiment (weighted words)
    pos: list[tuple[str, int]] = [
        ("surge", 3), ("soar", 3), ("rally", 2), ("gain", 2), ("rise", 2), ("jump", 2), ("climb", 2), ("spike", 2),
        ("advance", 2), ("rebound", 2), ("boost", 2), ("beat", 2), ("growth", 2), ("expand", 2), ("recover", 2),
        ("strong", 1), ("robust", 1), ("record", 1), ("buy", 1), ("optimistic", 1), ("positive", 1), ("success", 1),
        ("deal", 1), ("partnership", 1), ("approval", 1), ("bullish", 1), ("upside", 1),
    ]
    neg: list[tuple[str, int]] = [
        ("crash", 3), ("plunge", 3), ("collapse", 3), ("fall", 2), ("drop", 2), ("decline", 2), ("tumble", 2),
        ("slide", 2), ("sink", 2), ("slump", 2), ("tank", 2), ("miss", 2), ("recession", 2), ("crisis", 2),
        ("dip", 1), ("worst", 1), ("poor", 1), ("weak", 1), ("loss", 1), ("concern", 1), ("fear", 1), ("risk", 1),
        ("cut", 1), ("sell", 1), ("bearish", 1), ("negative", 1), ("downside", 1),
    ]
    pos_score = sum(w for word, w in pos if word in text)
    neg_score = sum(w for word, w in neg if word in text)
    net = pos_score - neg_score
    if net >= 2:
        article["sentiment"] = "BULLISH"
    elif net >= 1:
        article["sentiment"] = "BULLISH"
    elif net <= -2:
        article["sentiment"] = "BEARISH"
    elif net <= -1:
        article["sentiment"] = "BEARISH"
    # Impact
    if article["priority"] in ("FLASH", "URGENT") or abs(net) >= 6:
        article["impact"] = "HIGH"
    elif article["priority"] == "BREAKING" or abs(net) >= 3:
        article["impact"] = "MEDIUM"
    # Category refinement
    if "earnings" in text or "quarterly results" in text or " eps " in text or "guidance" in text:
        article["category"] = "EARNINGS"
    elif "crypto" in text or "bitcoin" in text or "ethereum" in text or "blockchain" in text:
        article["category"] = "CRYPTO"
    elif "fed " in text or "federal reserve" in text or "inflation" in text or "gdp" in text or "rate hike" in text or "rate cut" in text:
        article["category"] = "ECONOMIC"
    elif "stock market" in text or "nasdaq" in text or "dow jones" in text or "equities" in text:
        article["category"] = "MARKETS"
    elif " oil " in text or "crude" in text or "natural gas" in text or "opec" in text or "energy" in text:
        article["category"] = "ENERGY"
    elif " tech " in text or " ai " in text or "software" in text or "semiconductor" in text:
        article["category"] = "TECH"
    elif "bank" in text or "jpmorgan" in text or "goldman" in text or "hedge fund" in text:
        article["category"] = "BANKING"
    elif "nato" in text or "ukraine" in text or "russia" in text or "china" in text or "gaza" in text or "war" in text or "sanctions" in text:
        article["category"] = "GEOPOLITICS"
    # Tickers (1–5 letter uppercase words)
    combined = f"{article.get('headline', '')} {article.get('summary', '')}"
    ticker_re = re.compile(r"\b[A-Z]{1,5}\b")
    found = list({m.group() for m in ticker_re.finditer(combined)})[:5]
    article["tickers"] = found


def _fetch_one_feed(feed: dict[str, Any]) -> list[dict[str, Any]]:
    """Fetch a single feed; returns list of articles or [] on error. Each thread uses its own client."""
    try:
        with httpx.Client(
            timeout=FETCH_TIMEOUT, follow_redirects=True, headers=HEADERS
        ) as client:
            resp = client.get(feed["url"])
            resp.raise_for_status()
            if resp.text.strip().startswith("<"):
                return _parse_feed(resp.text, feed)
    except (httpx.HTTPError, httpx.TimeoutException, OSError) as e:
        logging.getLogger(__name__).warning(
            "RSS feed %s failed: %s", feed.get("url"), e
        )
    return []


def fetch_all_rss_articles_sync() -> list[dict[str, Any]]:
    """Fetch all feeds in parallel and return merged articles sorted by sort_ts desc.
    Failed feeds (DNS, 404, timeout) are skipped without blocking others; total time ~single timeout.
    """
    feeds = _feeds()
    all_articles: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(feeds))) as executor:
        futures = {executor.submit(_fetch_one_feed, f): f for f in feeds}
        for future in as_completed(futures):
            try:
                items = future.result()
                if items:
                    all_articles.extend(items)
            except Exception as e:
                feed = futures[future]
                logging.getLogger(__name__).warning(
                    "RSS feed %s failed: %s", feed.get("url"), e
                )
    all_articles.sort(key=lambda a: a.get("sort_ts") or 0, reverse=True)
    return all_articles


def get_default_sources() -> list[str]:
    """Unique source names from all feeds (same as Rust get_active_sources)."""
    return list(dict.fromkeys(f["source"] for f in _feeds()))


def get_feed_count() -> int:
    """Number of configured feeds (same as Rust get_rss_feed_count)."""
    return len(_feeds())
