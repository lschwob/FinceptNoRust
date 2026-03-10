import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, AlertTriangle, UserCheck, Eye, EyeOff, Shield, ExternalLink, List, Users } from 'lucide-react';
import { C } from './tokens';
import { insiderService, type InsiderTag, type FlaggedInsider, type InsiderScanResult } from '@/services/polymarket/polymarketInsiderService';
import { polymarketWatchlistService, type Watchlist } from '@/services/polymarket/polymarketWatchlistService';

const POLY_PROFILE_URL = 'https://polymarket.com/profile';

type ViewMode = 'users' | 'markets';

export default function InsiderView() {
  const [tags, setTags] = useState<InsiderTag[]>([]);
  const [insiders, setInsiders] = useState<FlaggedInsider[]>([]);
  const [results, setResults] = useState<Map<string, InsiderScanResult>>(new Map());
  const [scanning, setScanning] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('users');
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWlId, setSelectedWlId] = useState<string>('');

  const refresh = useCallback(() => {
    setTags(insiderService.getTags());
    setInsiders(insiderService.getAllInsiders());
    setResults(new Map(insiderService.getResults()));
    setScanning(insiderService.scanning);
    setWatchlists(polymarketWatchlistService.getAll());
  }, []);

  useEffect(() => {
    insiderService.loadTags().then(refresh);
    insiderService.startAutoScan();
    const unsub = insiderService.onChange(refresh);
    const iv = setInterval(refresh, 5000);
    return () => { unsub(); clearInterval(iv); };
  }, [refresh]);

  const handleAddTag = async () => {
    if (!newLabel.trim()) return;
    const keywords = newKeywords.split(',').map(k => k.trim()).filter(Boolean);
    if (keywords.length === 0) keywords.push(newLabel.trim());
    await insiderService.addTag(newLabel.trim(), keywords);
    setNewLabel(''); setNewKeywords('');
    refresh();
  };

  const handleAddWatchlistAsTag = async () => {
    if (!selectedWlId) return;
    const wl = watchlists.find(w => w.id === selectedWlId);
    if (!wl || wl.entries.length === 0) return;
    const keywords = wl.entries.map(e => {
      const words = e.question.split(/\s+/).slice(0, 4).join(' ');
      return words;
    }).slice(0, 5);
    await insiderService.addTag(`WL: ${wl.name}`, keywords);
    setSelectedWlId('');
    refresh();
  };

  const handleScan = () => insiderService.scan();

  // Build market-grouped view
  const marketMap = new Map<string, { question: string; insiders: FlaggedInsider[] }>();
  for (const ins of insiders) {
    for (const fm of ins.flaggedMarkets) {
      if (!marketMap.has(fm.marketId)) {
        marketMap.set(fm.marketId, { question: fm.question, insiders: [] });
      }
      const entry = marketMap.get(fm.marketId)!;
      if (!entry.insiders.some(i => i.wallet === ins.wallet)) {
        entry.insiders.push(ins);
      }
    }
  }
  const marketEntries = [...marketMap.entries()].sort((a, b) => b[1].insiders.length - a[1].insiders.length);
  const filteredInsiders = selectedMarket
    ? insiders.filter(i => i.flaggedMarkets.some(fm => fm.marketId === selectedMarket))
    : insiders;

  const inp: React.CSSProperties = {
    padding: '5px 8px', backgroundColor: C.bg, border: `1px solid ${C.border}`, color: C.white,
    borderRadius: 3, fontSize: 11, fontFamily: C.font, outline: 'none',
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: C.font }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={15} color={C.orange} />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.orange, letterSpacing: '1px' }}>INSIDER TRACKER</span>
          {scanning && <span style={{ fontSize: 9, color: C.muted }}>● SCANNING...</span>}
          {insiders.length > 0 && <span style={{ fontSize: 10, color: C.red, fontWeight: 700, backgroundColor: C.red + '20', padding: '2px 8px', borderRadius: 10 }}>{insiders.length} FLAGGED</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button onClick={() => setViewMode('users')} style={{ padding: '4px 10px', fontSize: 9, fontWeight: 700, fontFamily: C.font, background: viewMode === 'users' ? C.orange : 'transparent', color: viewMode === 'users' ? '#000' : C.muted, border: 'none', borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Users size={10} /> USERS
          </button>
          <button onClick={() => { setViewMode('markets'); setSelectedMarket(null); }} style={{ padding: '4px 10px', fontSize: 9, fontWeight: 700, fontFamily: C.font, background: viewMode === 'markets' ? C.orange : 'transparent', color: viewMode === 'markets' ? '#000' : C.muted, border: 'none', borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
            <List size={10} /> MARKETS
          </button>
          <button onClick={handleScan} disabled={scanning} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', backgroundColor: C.orange, color: '#000', border: 'none', borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: scanning ? 'wait' : 'pointer', fontFamily: C.font }}>
            <RefreshCw size={10} className={scanning ? 'animate-spin' : ''} /> SCAN
          </button>
        </div>
      </div>

      {/* Tag management */}
      <div style={{ padding: '8px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 8, color: C.muted, textTransform: 'uppercase', marginBottom: 5, letterSpacing: '0.5px' }}>Tags (scanned every 10min)</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Tag (ex: Trump)" style={{ ...inp, width: 110 }} onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); }} />
          <input value={newKeywords} onChange={e => setNewKeywords(e.target.value)} placeholder="Keywords (comma-sep)" style={{ ...inp, width: 200 }} onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); }} />
          <button onClick={handleAddTag} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 10px', backgroundColor: C.green, color: '#000', border: 'none', borderRadius: 3, fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: C.font }}>
            <Plus size={10} /> ADD
          </button>
          <span style={{ color: C.faint, fontSize: 9 }}>│</span>
          {watchlists.length > 0 && (
            <>
              <select value={selectedWlId} onChange={e => setSelectedWlId(e.target.value)} style={{ ...inp, width: 130, fontSize: 9 }}>
                <option value="">From watchlist...</option>
                {watchlists.filter(w => w.entries.length > 0).map(w => <option key={w.id} value={w.id}>{w.name} ({w.entries.length})</option>)}
              </select>
              <button onClick={handleAddWatchlistAsTag} disabled={!selectedWlId} style={{ padding: '4px 8px', backgroundColor: selectedWlId ? C.orange : C.bg, color: selectedWlId ? '#000' : C.muted, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 9, fontWeight: 700, cursor: selectedWlId ? 'pointer' : 'default', fontFamily: C.font }}>
                TRACK WL
              </button>
            </>
          )}
        </div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {tags.map(tag => {
              const r = results.get(tag.id);
              return (
                <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', backgroundColor: tag.enabled ? C.orange + '18' : C.bg, border: `1px solid ${tag.enabled ? C.orange + '60' : C.border}`, borderRadius: 2, fontSize: 9 }}>
                  <button onClick={() => insiderService.toggleTag(tag.id).then(refresh)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: tag.enabled ? C.orange : C.muted, padding: 0 }}>
                    {tag.enabled ? <Eye size={9} /> : <EyeOff size={9} />}
                  </button>
                  <span style={{ color: tag.enabled ? C.orange : C.muted, fontWeight: 600 }}>{tag.label}</span>
                  {r && <span style={{ color: C.faint, fontSize: 7 }}>{r.markets.length}m·{r.insiders.length}i</span>}
                  <button onClick={() => insiderService.removeTag(tag.id).then(refresh)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, padding: 0 }}><Trash2 size={8} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Markets view */}
        {viewMode === 'markets' && (
          <div style={{ display: 'flex', height: '100%' }}>
            {/* Market list */}
            <div style={{ width: 320, borderRight: `1px solid ${C.border}`, overflow: 'auto' }}>
              {marketEntries.length === 0 && !scanning && (
                <div style={{ padding: 30, textAlign: 'center', color: C.muted, fontSize: 10 }}>
                  <AlertTriangle size={20} style={{ opacity: 0.3, marginBottom: 6 }} />
                  <div>No markets with insiders</div>
                </div>
              )}
              {marketEntries.map(([mId, { question, insiders: mIns }]) => (
                <div key={mId} onClick={() => setSelectedMarket(mId)} style={{
                  padding: '8px 12px', borderBottom: `1px solid ${C.border}`,
                  backgroundColor: selectedMarket === mId ? C.orange + '22' : 'transparent', cursor: 'pointer',
                }}>
                  <div style={{ fontSize: 10, color: C.white, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{question}</div>
                  <div style={{ fontSize: 9, color: C.red, fontWeight: 700, marginTop: 3 }}>
                    {mIns.length} insider{mIns.length > 1 ? 's' : ''} · ${mIns.reduce((s, i) => s + i.flaggedMarkets.filter(f => f.marketId === mId).reduce((ss, f) => ss + f.positionSize, 0), 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                </div>
              ))}
            </div>
            {/* Insiders for selected market */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {selectedMarket ? (
                <InsiderList insiders={filteredInsiders} highlightMarket={selectedMarket} />
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 10 }}>Select a market to view insiders</div>
              )}
            </div>
          </div>
        )}

        {/* Users view */}
        {viewMode === 'users' && (
          <>
            {insiders.length === 0 && !scanning && (
              <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 11 }}>
                <AlertTriangle size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                <div>No insiders detected</div>
                <div style={{ color: C.faint, marginTop: 4, fontSize: 10 }}>Add tags and run a scan</div>
              </div>
            )}
            <InsiderList insiders={insiders} />
          </>
        )}
      </div>
    </div>
  );
}

function InsiderList({ insiders, highlightMarket }: { insiders: FlaggedInsider[]; highlightMarket?: string }) {
  return (
    <>
      {insiders.map((insider, idx) => (
        <div key={insider.wallet} style={{
          padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
          backgroundColor: idx % 2 === 0 ? 'transparent' : C.bg + '30',
        }}>
          {/* User header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {insider.profileImage ? (
                <img src={insider.profileImage} alt="" style={{ width: 28, height: 28, borderRadius: 14, border: `1px solid ${C.border}` }} />
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.red + '30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCheck size={13} color={C.red} />
                </div>
              )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: C.white, fontWeight: 700 }}>{insider.name || insider.pseudonym}</span>
                    {insider.verifiedBadge && <span style={{ fontSize: 8, color: C.green }}>✓</span>}
                    {insider.xUsername && <span style={{ fontSize: 8, color: C.faint }}>@{insider.xUsername}</span>}
                    <a href={`${POLY_PROFILE_URL}/${insider.wallet}`} target="_blank" rel="noopener noreferrer"
                      style={{ color: C.orange, display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, textDecoration: 'none' }}
                      onClick={e => e.stopPropagation()}>
                      <ExternalLink size={9} /> Profile
                    </a>
                  </div>
                  <div style={{ fontSize: 9, color: C.faint, fontFamily: 'monospace', userSelect: 'all', cursor: 'text' }}>
                    {insider.wallet}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, color: C.red, fontWeight: 800, fontFamily: 'monospace' }}>
                  ${insider.totalPositionValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontSize: 8, color: C.faint }}>
                  {insider.distinctMarkets} market{insider.distinctMarkets !== 1 ? 's' : ''} ({insider.openMarkets || '?'} open + {insider.closedMarkets || '?'} closed)
                  {insider.accountAgeDays !== null && ` · ${insider.accountAgeDays}d old`}
                  {insider.accountCreatedAt && ` · created ${new Date(insider.accountCreatedAt).toLocaleDateString()}`}
                </div>
              </div>
          </div>

          {/* Reasons */}
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 5 }}>
            {insider.reasons.map((r, i) => (
              <span key={i} style={{ fontSize: 8, padding: '1px 5px', borderRadius: 2, backgroundColor: C.red + '18', color: C.red, fontWeight: 600 }}>{r}</span>
            ))}
          </div>

          {/* Markets */}
          {insider.flaggedMarkets.slice(0, 8).map((fm, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '3px 8px', fontSize: 9, color: C.muted,
              backgroundColor: highlightMarket === fm.marketId ? C.orange + '20' : C.bg,
              border: highlightMarket === fm.marketId ? `1px solid ${C.orange}40` : '1px solid transparent',
              borderRadius: 2, marginBottom: 1,
            }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fm.question}</span>
              <span style={{ color: C.green, fontWeight: 600, marginLeft: 8, whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                {fm.outcome} · ${fm.positionSize.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
