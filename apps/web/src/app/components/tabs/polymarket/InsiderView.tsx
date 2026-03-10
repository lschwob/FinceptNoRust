import React, { useEffect, useState, useCallback } from 'react';
import { Search, Plus, Trash2, RefreshCw, AlertTriangle, UserCheck, Eye, EyeOff, Shield } from 'lucide-react';
import { C } from './tokens';
import { insiderService, type InsiderTag, type FlaggedInsider, type InsiderScanResult } from '@/services/polymarket/polymarketInsiderService';

export default function InsiderView() {
  const [tags, setTags] = useState<InsiderTag[]>([]);
  const [insiders, setInsiders] = useState<FlaggedInsider[]>([]);
  const [results, setResults] = useState<Map<string, InsiderScanResult>>(new Map());
  const [scanning, setScanning] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTags(insiderService.getTags());
    setInsiders(insiderService.getAllInsiders());
    setResults(new Map(insiderService.getResults()));
    setScanning(insiderService.scanning);
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
    if (keywords.length === 0 && newLabel.trim()) keywords.push(newLabel.trim());
    await insiderService.addTag(newLabel.trim(), keywords);
    setNewLabel('');
    setNewKeywords('');
    refresh();
  };

  const handleRemoveTag = async (id: string) => {
    await insiderService.removeTag(id);
    refresh();
  };

  const handleToggleTag = async (id: string) => {
    await insiderService.toggleTag(id);
    refresh();
  };

  const handleScan = async () => {
    await insiderService.scan();
    refresh();
  };

  const inp: React.CSSProperties = {
    padding: '5px 8px', backgroundColor: C.bg,
    border: `1px solid ${C.border}`, color: C.white,
    borderRadius: 3, fontSize: 11, fontFamily: C.font,
    outline: 'none',
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: C.font }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={16} color={C.orange} />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.orange, letterSpacing: '1px' }}>INSIDER TRACKER</span>
          {scanning && <span style={{ fontSize: 9, color: C.muted }}>● SCANNING...</span>}
          {insiders.length > 0 && (
            <span style={{ fontSize: 10, color: C.red, fontWeight: 700, backgroundColor: C.red + '20', padding: '2px 8px', borderRadius: 10 }}>
              {insiders.length} FLAGGED
            </span>
          )}
        </div>
        <button onClick={handleScan} disabled={scanning} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px',
          backgroundColor: C.orange, color: C.bg, border: 'none', borderRadius: 3,
          fontSize: 10, fontWeight: 700, cursor: scanning ? 'wait' : 'pointer', fontFamily: C.font,
        }}>
          <RefreshCw size={11} className={scanning ? 'animate-spin' : ''} /> SCAN NOW
        </button>
      </div>

      {/* Tag management */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }}>
          Tags to monitor (scanned every 10min)
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Tag name (ex: Trump)" style={{ ...inp, width: 120 }}
            onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); }} />
          <input value={newKeywords} onChange={e => setNewKeywords(e.target.value)} placeholder="Keywords (comma-separated)" style={{ ...inp, width: 220 }}
            onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); }} />
          <button onClick={handleAddTag} style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px',
            backgroundColor: C.green, color: C.bg, border: 'none', borderRadius: 3,
            fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: C.font,
          }}>
            <Plus size={11} /> ADD
          </button>
        </div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tags.map(tag => (
              <div key={tag.id} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                backgroundColor: tag.enabled ? C.orange + '20' : C.bg,
                border: `1px solid ${tag.enabled ? C.orange : C.border}`,
                borderRadius: 3, fontSize: 10,
              }}>
                <button onClick={() => handleToggleTag(tag.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: tag.enabled ? C.orange : C.muted, padding: 0 }}>
                  {tag.enabled ? <Eye size={10} /> : <EyeOff size={10} />}
                </button>
                <span style={{ color: tag.enabled ? C.orange : C.muted, fontWeight: 600 }}>{tag.label}</span>
                <span style={{ color: C.faint, fontSize: 8 }}>{tag.keywords.join(', ')}</span>
                {(() => {
                  const r = results.get(tag.id);
                  return r ? <span style={{ color: C.faint, fontSize: 8 }}>{r.markets.length}m · {r.insiders.length}i</span> : null;
                })()}
                <button onClick={() => handleRemoveTag(tag.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, padding: 0 }}>
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Insiders list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {insiders.length === 0 && !scanning && (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 11 }}>
            <AlertTriangle size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>No insiders detected</div>
            <div style={{ color: C.faint, marginTop: 4, fontSize: 10 }}>Add tags and run a scan to detect potential insiders</div>
          </div>
        )}

        {insiders.map((insider, idx) => (
          <div key={insider.wallet} style={{
            padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
            backgroundColor: idx % 2 === 0 ? 'transparent' : C.bg + '40',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {insider.profileImage ? (
                  <img src={insider.profileImage} alt="" style={{ width: 24, height: 24, borderRadius: 12, border: `1px solid ${C.border}` }} />
                ) : (
                  <div style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.red + '40', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserCheck size={12} color={C.red} />
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 11, color: C.white, fontWeight: 700 }}>{insider.pseudonym}</div>
                  <div style={{ fontSize: 8, color: C.faint, fontFamily: 'monospace' }}>{insider.wallet.slice(0, 8)}...{insider.wallet.slice(-6)}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: C.red, fontWeight: 800, fontFamily: 'monospace' }}>
                  ${insider.totalPositionValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontSize: 8, color: C.faint }}>
                  {insider.distinctMarkets} market{insider.distinctMarkets !== 1 ? 's' : ''}
                  {insider.accountAgeDays !== null && ` · ${insider.accountAgeDays}d old`}
                </div>
              </div>
            </div>

            {/* Reasons */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
              {insider.reasons.map((r, i) => (
                <span key={i} style={{
                  fontSize: 8, padding: '2px 6px', borderRadius: 2,
                  backgroundColor: C.red + '20', color: C.red, fontWeight: 600,
                }}>
                  {r}
                </span>
              ))}
            </div>

            {/* Flagged markets */}
            {insider.flaggedMarkets.slice(0, 5).map((fm, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '3px 8px', fontSize: 9, color: C.muted,
                backgroundColor: C.bg, borderRadius: 2, marginBottom: 2,
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fm.question}
                </span>
                <span style={{ color: C.green, fontWeight: 600, marginLeft: 8, whiteSpace: 'nowrap' }}>
                  {fm.outcome} · ${fm.positionSize.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
