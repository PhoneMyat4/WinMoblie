import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Square, Radio, Sparkles, Volume2, ArrowDown, X, MessageSquare } from 'lucide-react';
import { AudioVoiceWaveform } from './AudioVoiceWaveform';
import { AudioEngineState } from '../../utils/audioStreamController';

interface LiveVoiceOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  state: AudioEngineState;
  audioLevel: number;
  frequencyData?: Uint8Array;
  userTranscript: string;
  aiResponse: string;
  isHandsFree: boolean;
  onToggleHandsFree: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  onInterrupt: () => void;
  onQuickQuery: (promptText: string) => void;
  onSwitchToText: () => void;
}

export const LiveVoiceOverlay: React.FC<LiveVoiceOverlayProps> = ({
  isOpen,
  onClose,
  state,
  audioLevel,
  frequencyData,
  userTranscript,
  aiResponse,
  isHandsFree,
  onToggleHandsFree,
  onToggleMute,
  isMuted,
  onInterrupt,
  onQuickQuery,
  onSwitchToText,
}) => {
  const [waveformType, setWaveformType] = useState<'wave' | 'bars'>('wave');

  if (!isOpen) return null;

  // Status text in polite Burmese + English
  const getStatusBadge = () => {
    switch (state) {
      case 'listening':
        return {
          titleBurmese: 'အသံနားထောင်နေပါသည်...',
          titleEnglish: 'Listening to your voice...',
          badgeColor: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
          dotColor: 'bg-emerald-500 animate-ping',
        };
      case 'processing':
        return {
          titleBurmese: 'ဒေတာဘေ့စ် စစ်ဆေးတွက်ချက်နေပါသည်...',
          titleEnglish: 'Analyzing POS Database & Reports...',
          badgeColor: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
          dotColor: 'bg-sky-500 animate-pulse',
        };
      case 'speaking':
        return {
          titleBurmese: 'အော်ရာ ရှင်းပြနေပါသည်...',
          titleEnglish: 'Aura is speaking in Burmese...',
          badgeColor: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
          dotColor: 'bg-indigo-500 animate-pulse',
        };
      default:
        return {
          titleBurmese: 'စကားပြောရန် မိုက်ခရိုဖုန်းကို ဖွင့်ပါ',
          titleEnglish: 'Ready. Speak or tap microphone',
          badgeColor: 'bg-slate-100 text-slate-600 border-slate-200',
          dotColor: 'bg-slate-400',
        };
    }
  };

  const status = getStatusBadge();

  return (
    <div
      id="aura-live-voice-overlay"
      className="absolute inset-0 z-40 flex flex-col bg-slate-900/95 backdrop-blur-md text-white overflow-hidden transition-all duration-300"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/80 bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-sm shadow-indigo-500/30">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-white">Aura Live Voice</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                မြန်မာဘာသာ ဦးစားပေး
              </span>
            </div>
            <span className="text-xs text-slate-400">POS & Serialized Inventory Real-Time Voice Duplex</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Waveform toggle */}
          <button
            type="button"
            onClick={() => setWaveformType((prev) => (prev === 'wave' ? 'bars' : 'wave'))}
            className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Toggle visualizer style"
          >
            {waveformType === 'wave' ? 'Bars View' : 'Wave View'}
          </button>

          {/* Switch to text chat */}
          <button
            type="button"
            onClick={onSwitchToText}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Switch back to standard text conversation"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>

          {/* Close live voice */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
            title="Exit live voice mode"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Visualizer & Live Conversation Area */}
      <div className="flex-1 flex flex-col items-center justify-between p-5 overflow-y-auto">
        {/* Status Pill */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border bg-slate-800/80 border-slate-700 shadow-inner my-2">
          <span className={`w-2 h-2 rounded-full ${status.dotColor}`} />
          <span className="text-xs font-medium text-slate-200">{status.titleBurmese}</span>
          <span className="text-[11px] text-slate-400">({status.titleEnglish})</span>
        </div>

        {/* Animated Waveform Section */}
        <div className="w-full max-w-md my-auto px-4 py-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 shadow-2xl relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              {state === 'speaking' ? 'Aura Spoken Frequency' : state === 'listening' ? 'Microphone Voice Input' : 'Voice Signal'}
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              RMS: {(audioLevel * 100).toFixed(0)}%
            </span>
          </div>

          <AudioVoiceWaveform
            state={state}
            audioLevel={audioLevel}
            frequencyData={frequencyData}
            height={90}
            visualStyle={waveformType}
            className="rounded-lg"
          />

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
            <span>Low Latency AudioContext</span>
            <span className="text-emerald-400 font-medium">Duplex Active</span>
          </div>
        </div>

        {/* Subtitles & Transcripts Section */}
        <div className="w-full max-w-lg space-y-3 my-3">
          {/* User Transcript */}
          {userTranscript && (
            <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700/60 text-slate-200 text-sm">
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                <Mic className="w-3 h-3 text-emerald-400" /> သင်ပြောဆိုချက် (You)
              </div>
              <p className="font-medium text-emerald-200">{userTranscript}</p>
            </div>
          )}

          {/* AI Burmese Response Transcript */}
          {aiResponse && (
            <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-800/50 text-slate-100 text-sm max-h-48 overflow-y-auto">
              <div className="text-[10px] uppercase font-bold text-indigo-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Volume2 className="w-3 h-3 text-indigo-400" /> အော်ရာ ပြန်လည်ဖြေကြားချက် (Aura in Burmese)
                </span>
                {state === 'speaking' && (
                  <span className="text-[10px] text-indigo-300 font-normal animate-pulse">အသံထွက်နေပါသည်...</span>
                )}
              </div>
              <p className="leading-relaxed whitespace-pre-line text-slate-200">{aiResponse}</p>
            </div>
          )}
        </div>

        {/* Quick Burmese POS Voice Commands */}
        <div className="w-full max-w-lg mb-4">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2 px-1">
            အမြန်မေးမြန်းနိုင်သော မေးခွန်းများ (Quick Commands):
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onQuickQuery('ယနေ့ POS အရောင်းနှင့် Z-Report အကျဉ်းချုပ်ကို ရှင်းပြပေးပါ')}
              className="text-left px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 text-xs text-slate-300 hover:text-white transition"
            >
              📊 <strong>ယနေ့ Z-Report</strong>
              <div className="text-[10px] text-slate-400 truncate">အရောင်းနှင့် ငွေစာရင်းရှင်းတမ်း</div>
            </button>

            <button
              type="button"
              onClick={() => onQuickQuery('Redmi Note 14 Pro ပစ္စည်းလက်ကျန် ဘယ်လောက်ရှိလဲ စစ်ဆေးပေးပါ')}
              className="text-left px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 text-xs text-slate-300 hover:text-white transition"
            >
              📱 <strong>Redmi Note 14 Pro</strong>
              <div className="text-[10px] text-slate-400 truncate">လက်ကျန်စစ်ဆေးရန်</div>
            </button>

            <button
              type="button"
              onClick={() => onQuickQuery('ဆိုင်မှာ လက်ကျန်နည်းနေတဲ့ ဖုန်းတွေ စာရင်းပြပေးပါ')}
              className="text-left px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 text-xs text-slate-300 hover:text-white transition"
            >
              ⚠️ <strong>လက်ကျန်နည်းဖုန်းများ</strong>
              <div className="text-[10px] text-slate-400 truncate">ပြန်လည်မှာယူရမည့် စာရင်း</div>
            </button>

            <button
              type="button"
              onClick={() => onQuickQuery('ယနေ့အမြတ်အစွန်း PDF အစီရင်ခံစာကို ဒေါင်းလုဒ်ထုတ်ပေးပါ')}
              className="text-left px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 text-xs text-slate-300 hover:text-white transition"
            >
              📄 <strong>PDF အစီရင်ခံစာ</strong>
              <div className="text-[10px] text-slate-400 truncate">ယနေ့အမြတ် P&L ဒေါင်းလုဒ်</div>
            </button>
          </div>
        </div>
      </div>

      {/* Footer Voice Action Bar */}
      <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between">
        {/* Hands-free mode toggle */}
        <button
          type="button"
          onClick={onToggleHandsFree}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
            isHandsFree
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
          }`}
          title="Hands-free auto turn-taking: Aura automatically listens when you pause speaking"
        >
          <span className={`w-2 h-2 rounded-full ${isHandsFree ? 'bg-emerald-400' : 'bg-slate-500'}`} />
          {isHandsFree ? 'Auto Turn: ON (အလိုအလျောက်)' : 'Auto Turn: OFF'}
        </button>

        {/* Center Primary Microphone / Barge-in Actions */}
        <div className="flex items-center gap-3">
          {/* Interrupt / Stop Speaking Button (Active when Aura is speaking) */}
          {state === 'speaking' && (
            <button
              type="button"
              onClick={onInterrupt}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-900/40 transition active:scale-95"
              title="Interrupt Aura and stop playback immediately"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>စကားဖြတ်မည် (Stop)</span>
            </button>
          )}

          {/* Mic Mute / Unmute Button */}
          <button
            type="button"
            onClick={onToggleMute}
            className={`flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition active:scale-95 ${
              isMuted
                ? 'bg-slate-800 text-rose-400 border border-rose-500/40 hover:bg-slate-700'
                : state === 'listening'
                ? 'bg-emerald-500 text-white shadow-emerald-500/30 hover:bg-emerald-400 ring-4 ring-emerald-500/20'
                : 'bg-indigo-600 text-white shadow-indigo-500/30 hover:bg-indigo-500'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
        </div>

        {/* Language & Engine Indicator */}
        <div className="text-right">
          <span className="text-xs font-semibold text-slate-300">မြန်မာဘာသာ (Burmese)</span>
          <div className="text-[10px] text-slate-500">Web Audio API Pipeline</div>
        </div>
      </div>
    </div>
  );
};
