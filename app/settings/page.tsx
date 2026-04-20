"use client";
import React, { useState, useEffect } from "react";
import { Save, Bot, Shield } from "lucide-react";

export default function SettingsPage() {
  const [config, setConfig] = useState({
    botToken: "",
    channelId: "",
    isEnabled: false,
    alertThreshold: "2.5"
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/telegram/settings")
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data) {
          setConfig(prev => ({ ...prev, ...json.data }));
        }
      });
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/telegram/settings", {
        method: "POST",
        body: JSON.stringify(config)
      });
      const json = await res.json();
      if (json.success) {
        setMessage("SETTINGS_SAVED_SUCCESSFULLY");
      }
    } catch {
      setMessage("ERROR_SAVING_SETTINGS");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div className="panel">
        <div className="panel-header">
          <Bot size={18} style={{ marginRight: '10px' }} />
          TELEGRAM BOT CONFIGURATION
        </div>
        
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>BOT_API_TOKEN</label>
            <input 
              className="input" 
              type="password"
              style={{ width: '100%' }}
              placeholder="e.g. 123456789:ABCDefgh..."
              value={config.botToken}
              onChange={e => setConfig({...config, botToken: e.target.value})}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>CHANNEL_OR_GROUP_ID</label>
            <input 
              className="input" 
              style={{ width: '100%' }}
              placeholder="e.g. -100123456789"
              value={config.channelId}
              onChange={e => setConfig({...config, channelId: e.target.value})}
            />
          </div>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>VOLUME_SPIKE_THRESHOLD (VOL RATIO)</label>
              <input 
                className="input" 
                type="number"
                style={{ width: '100%' }}
                value={config.alertThreshold}
                onChange={e => setConfig({...config, alertThreshold: e.target.value})}
              />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '20px' }}>
              <input 
                type="checkbox" 
                id="isEnabled"
                checked={config.isEnabled}
                onChange={e => setConfig({...config, isEnabled: e.target.checked})}
              />
              <label htmlFor="isEnabled" style={{ fontSize: '0.8rem' }}>ENABLE_REALTIME_ALERTS</label>
            </div>
          </div>

          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="button" onClick={handleSave} disabled={loading}>
              <Save size={16} style={{ marginRight: '8px' }} />
              {loading ? "SAVING..." : "SAVE_CONFIGURATION"}
            </button>
            {message && <span style={{ fontSize: '0.7rem', color: 'var(--accent-green)', fontWeight: 'bold' }}>{message}</span>}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '20px' }}>
        <div className="panel-header">
          <Shield size={18} style={{ marginRight: '10px' }} />
          BOT USAGE INSTRUCTIONS
        </div>
        <div style={{ padding: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <p>1. Start the bot on Telegram and add it to your channel/group as admin.</p>
          <p>2. Use the following commands for manual analysis:</p>
          <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
            <li><code style={{ color: 'var(--text-primary)' }}>/chart [TICKER]</code> - Get a screenshot of the technical chart.</li>
            <li><code style={{ color: 'var(--text-primary)' }}>/analysis [TICKER]</code> - Get detailed conviction analysis.</li>
            <li><code style={{ color: 'var(--text-primary)' }}>/top</code> - See current market gainers and losers.</li>
            <li><code style={{ color: 'var(--text-primary)' }}>/daytrade</code> - Get curated stocks for next session.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
