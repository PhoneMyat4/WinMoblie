import React, { useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Volume2,
  VolumeX,
  Sparkles,
  Cpu,
  RefreshCw,
  X,
  AlertCircle,
  Radio,
  Check,
  ChevronDown,
  Activity,
  Bot,
} from 'lucide-react';
import {
  useLiveVoice,
  VoiceProvider,
  GEMINI_VOICES,
  GPT_VOICES,
  LiveTranscriptItem,
} from '../../hooks/useLiveVoice';

interface LiveVoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  getStoreContext?: () => string;
  onTranscriptReceived?: (transcript: LiveTranscriptItem) => void;
}

export const LiveVoiceCallModal: React.FC<LiveVoiceCallModalProps> = ({
  isOpen,
  onClose,
  getStoreContext,
  onTranscriptReceived,
}) => {
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);

  const {
    isConnected,
    isConnecting,
    isMuted,
    isSpeaking,
    inputVolume,
    outputVolume,
    provider,
    activeVoice,
    errorMessage,
    liveTranscripts,
    currentModelText,
    currentUserText,
    connect,
    disconnect,
    switchProvider,
    switchVoice,
    toggleMute,
    stopAudioPlayback,
  } = useLiveVoice({
    getStoreContext,
    onCommitTranscript: onTranscriptReceived,
  });

  // Auto-connect when modal opens if not already connected
  useEffect(() => {
    if (isOpen && !isConnected && !isConnecting && !errorMessage) {
      connect();
    }
  }, [isOpen]);

  // Clean up when modal closed
  const handleHangup = () => {
    disconnect();
    onClose();
  };

  if (!isOpen) return null;

  const currentVoiceList = provider === 'gemini' ? GEMINI_VOICES : GPT_VOICES;
  const currentVoiceObj = currentVoiceList.find((v) => v.id === activeVoice) || currentVoiceList[0];

  return (
    <div
      id="live-voice-call-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
    >
      <div
        id="live-voice-call-card"
        className="relative w-full max-w-lg bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400">
              <Bot className="w-5 h-5" />
              {isConnected && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base text-slate-100 tracking-tight">Aura Live Voice</h3>
                <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Sub-Second
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isConnecting
                  ? 'Connecting audio stream...'
                  : isConnected
                  ? isSpeaking
                    ? 'Aura is speaking...'
                    : 'Listening to your voice...'
                  : 'Call disconnected'}
              </p>
            </div>
          </div>

          <button
            id="btn-close-live-voice"
            onClick={handleHangup}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close voice call"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Switcher: Gemini Live <-> GPT Realtime */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-800/90 rounded-xl border border-slate-700/60 text-xs">
            <button
              id="btn-switch-provider-gemini"
              onClick={() => switchProvider('gemini')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                provider === 'gemini'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gemini 3.8 Live</span>
            </button>
            <button
              id="btn-switch-provider-gpt"
              onClick={() => switchProvider('gpt')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                provider === 'gpt'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>GPT-4o Realtime</span>
            </button>
          </div>

          {/* Voice Selector Dropdown */}
          <div className="relative">
            <button
              id="btn-toggle-voice-menu"
              onClick={() => setShowVoiceMenu((prev) => !prev)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs text-slate-200 font-medium transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Voice: {currentVoiceObj.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showVoiceMenu && (
              <div
                id="voice-selector-dropdown"
                className="absolute right-0 top-full mt-2 w-56 p-1.5 bg-slate-900 border border-slate-700 rounded-2xl shadow-xl z-20"
              >
                <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Select {provider === 'gemini' ? 'Gemini' : 'GPT'} Voice
                </div>
                {currentVoiceList.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      switchVoice(v.id);
                      setShowVoiceMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-colors ${
                      activeVoice === v.id
                        ? 'bg-indigo-600/30 text-indigo-300 font-medium'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <p className="font-medium">{v.name}</p>
                      <p className="text-[10px] text-slate-400 line-clamp-1">{v.description}</p>
                    </div>
                    {activeVoice === v.id && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Central Audio Visualizer Orb */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[220px]">
          <div className="relative flex items-center justify-center">
            {/* Pulsing Ripple Rings */}
            {isConnected && (
              <>
                <div
                  className="absolute w-44 h-44 rounded-full bg-indigo-500/10 animate-ping"
                  style={{
                    animationDuration: isSpeaking ? '1.2s' : '3s',
                    opacity: isSpeaking ? 0.6 : 0.2,
                  }}
                />
                <div
                  className="absolute rounded-full border border-indigo-500/20 transition-all duration-150"
                  style={{
                    width: `${120 + (isSpeaking ? outputVolume * 100 : inputVolume * 80)}px`,
                    height: `${120 + (isSpeaking ? outputVolume * 100 : inputVolume * 80)}px`,
                  }}
                />
              </>
            )}

            {/* Core Glowing Orb */}
            <div
              className={`relative z-10 w-28 h-28 rounded-full flex flex-col items-center justify-center shadow-xl transition-all duration-300 ${
                isSpeaking
                  ? 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 shadow-indigo-500/50 scale-105'
                  : isConnected
                  ? inputVolume > 0.08
                    ? 'bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-500 shadow-emerald-500/40 scale-100'
                    : 'bg-gradient-to-tr from-slate-800 via-slate-700 to-slate-800 shadow-slate-900/50 scale-95'
                  : 'bg-slate-800 border border-slate-700'
              }`}
            >
              {isSpeaking ? (
                <Volume2 className="w-10 h-10 text-white animate-pulse" />
              ) : isMuted ? (
                <MicOff className="w-10 h-10 text-rose-400" />
              ) : (
                <Mic className="w-10 h-10 text-slate-100" />
              )}
              <span className="text-[10px] font-medium text-slate-200 mt-1 uppercase tracking-wider">
                {isSpeaking ? 'Aura' : isMuted ? 'Muted' : isConnected ? 'Live' : 'Off'}
              </span>
            </div>
          </div>

          {/* Sound Wave Bars */}
          <div className="flex items-center gap-1.5 mt-8 h-8">
            {Array.from({ length: 16 }).map((_, i) => {
              const activeVol = isSpeaking ? outputVolume : inputVolume;
              const pseudoRand = Math.sin(i * 0.7 + Date.now() / 300) * 0.5 + 0.5;
              const barHeight = isConnected
                ? Math.max(6, Math.min(32, activeVol * 32 * pseudoRand + (activeVol > 0.05 ? 8 : 4)))
                : 4;

              return (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-75 ${
                    isSpeaking
                      ? 'bg-indigo-400'
                      : inputVolume > 0.05
                      ? 'bg-emerald-400'
                      : 'bg-slate-700'
                  }`}
                  style={{ height: `${barHeight}px` }}
                />
              );
            })}
          </div>
        </div>

        {/* Live Subtitle Transcript Box */}
        <div className="px-6 pb-4">
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl min-h-[72px] max-h-[120px] overflow-y-auto text-xs space-y-1.5">
            {errorMessage ? (
              <div className="flex items-start gap-2 text-rose-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{errorMessage}</p>
              </div>
            ) : currentModelText || currentUserText ? (
              <>
                {currentUserText && (
                  <p className="text-slate-400">
                    <span className="font-semibold text-slate-300">You:</span> {currentUserText}
                  </p>
                )}
                {currentModelText && (
                  <p className="text-indigo-300 font-medium">
                    <span className="font-semibold text-indigo-200">Aura:</span> {currentModelText}
                  </p>
                )}
              </>
            ) : isConnected ? (
              <p className="text-slate-500 italic text-center py-2">
                "Start speaking naturally to query inventory, IMEI numbers, sales, or cash drawer..."
              </p>
            ) : (
              <p className="text-slate-500 text-center py-2">Click Call to start live voice.</p>
            )}
          </div>
        </div>

        {/* Bottom Control Actions */}
        <div className="flex items-center justify-center gap-4 px-6 py-5 bg-slate-950 border-t border-slate-800/80">
          {/* Mute Mic Button */}
          <button
            id="btn-mute-toggle"
            disabled={!isConnected}
            onClick={toggleMute}
            className={`p-3.5 rounded-full border transition-all ${
              isMuted
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 hover:bg-rose-500/30'
                : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:bg-slate-700 disabled:opacity-40'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Primary Call / Hang Up Button */}
          {isConnected ? (
            <button
              id="btn-end-call"
              onClick={disconnect}
              className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm shadow-lg shadow-rose-600/30 transition-all hover:scale-105 active:scale-95"
            >
              <PhoneOff className="w-5 h-5" />
              <span>End Call</span>
            </button>
          ) : (
            <button
              id="btn-start-call"
              disabled={isConnecting}
              onClick={() => connect()}
              className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 transition-all hover:scale-105 active:scale-95"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <PhoneCall className="w-5 h-5" />
                  <span>Start Voice Call</span>
                </>
              )}
            </button>
          )}

          {/* Stop / Interrupt Aura Speaking */}
          <button
            id="btn-interrupt-audio"
            disabled={!isSpeaking}
            onClick={stopAudioPlayback}
            className={`p-3.5 rounded-full border transition-all ${
              isSpeaking
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                : 'bg-slate-800/90 border-slate-700 text-slate-500 opacity-40 cursor-not-allowed'
            }`}
            title="Interrupt Aura"
          >
            <VolumeX className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
