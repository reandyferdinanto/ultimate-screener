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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      const json = await res.json();
      if (json.success) {
        setMessage("SETTINGS_SAVED_SUCCESSFULLY");
      } else {
        setMessage(`ERROR: ${json.error || "INVALID_CONFIGURATION"}`);
      }
    } catch {
      setMessage("ERROR_SAVING_SETTINGS");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-shell">
      <div className="panel">
        <div className="panel-header">
          <span><Bot size={18} /> TELEGRAM BOT CONFIGURATION</span>
        </div>

        <div className="settings-form">
          <div>
            <label>BOT_API_TOKEN</label>
            <input
              className="input"
              type="password"
              placeholder="e.g. 123456789:ABCDefgh..."
              value={config.botToken}
              onChange={e => setConfig({...config, botToken: e.target.value})}
            />
          </div>

          <div>
            <label>CHANNEL_OR_GROUP_ID</label>
            <input
              className="input"
              placeholder="e.g. -100123456789"
              value={config.channelId}
              onChange={e => setConfig({...config, channelId: e.target.value})}
            />
          </div>

          <div className="settings-grid">
            <div>
              <label>VOLUME_SPIKE_THRESHOLD (VOL RATIO)</label>
              <input
                className="input"
                type="number"
                value={config.alertThreshold}
                onChange={e => setConfig({...config, alertThreshold: e.target.value})}
              />
            </div>

            <div className="checkbox-row">
              <input
                type="checkbox"
                id="isEnabled"
                checked={config.isEnabled}
                onChange={e => setConfig({...config, isEnabled: e.target.checked})}
              />
              <label htmlFor="isEnabled">ENABLE_REALTIME_ALERTS</label>
            </div>
          </div>

          <div className="settings-actions">
            <button className="button" onClick={handleSave} disabled={loading}>
              <Save size={16} />
              {loading ? "SAVING..." : "SAVE_CONFIGURATION"}
            </button>
            {message && <span className="settings-message">{message}</span>}
          </div>
        </div>
      </div>

      <div className="panel instructions-panel">
        <div className="panel-header">
          <span><Shield size={18} /> BOT USAGE INSTRUCTIONS</span>
        </div>
        <div className="instructions-copy">
          <p>1. Start the bot on Telegram and add it to your channel/group as admin.</p>
          <p>2. Use the following commands for manual analysis:</p>
          <ul>
            <li><code>/chart [TICKER]</code> - Get a screenshot of the technical chart.</li>
            <li><code>/analysis [TICKER]</code> - Get detailed conviction analysis.</li>
            <li><code>/top</code> - See current market gainers and losers.</li>
            <li><code>/daytrade</code> - Get curated stocks for next session.</li>
          </ul>
        </div>
      </div>

      <style jsx>{`
        .settings-shell {
          max-width: 840px;
          margin: 0 auto;
          padding: 20px;
          display: grid;
          gap: 18px;
        }

        .panel-header span {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }

        .settings-form {
          padding: 20px;
          display: grid;
          gap: 20px;
        }

        label {
          display: block;
          font-size: 0.7rem;
          color: var(--text-secondary);
          margin-bottom: 8px;
          font-weight: 800;
          letter-spacing: 0.05em;
        }

        .input {
          width: 100%;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 20px;
          align-items: end;
        }

        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 42px;
          padding: 0 2px;
        }

        .checkbox-row label {
          margin: 0;
          color: var(--text-primary);
          font-size: 0.78rem;
        }

        .settings-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .settings-actions .button {
          gap: 8px;
        }

        .settings-message {
          font-size: 0.72rem;
          color: var(--accent-green);
          font-weight: 900;
        }

        .instructions-copy {
          padding: 20px;
          font-size: 0.82rem;
          color: var(--text-secondary);
          line-height: 1.7;
        }

        .instructions-copy ul {
          margin-top: 10px;
          padding-left: 20px;
        }

        .instructions-copy code {
          color: var(--text-primary);
        }

        @media (max-width: 700px) {
          .settings-shell {
            padding: 10px 0 0;
            gap: 12px;
          }
          .settings-form,
          .instructions-copy {
            padding: 14px;
          }
          .settings-grid {
            grid-template-columns: 1fr;
          }
          .checkbox-row {
            min-height: 44px;
          }
          .settings-actions,
          .settings-actions .button {
            width: 100%;
          }
          .settings-actions .button {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
