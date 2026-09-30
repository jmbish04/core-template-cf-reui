/**
 * @fileoverview A recorded take: a real transport over a real audio element,
 * with the transcription it produced.
 *
 * ReUI `ai-chat-8` drives its transport from a one-second `setInterval` over a
 * hardcoded duration. This plays the `MediaRecorder` blob — the clock, the
 * scrub and the end of the note all come from the `<audio>` element, so the
 * position is where the audio actually is.
 */
import { useEffect, useRef, useState } from "react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { PauseIcon, PencilIcon, PlayIcon, SendIcon } from "lucide-react";

import type { VoiceTake } from "./use-voice";

/** mm:ss, which is the only resolution a take of this length needs. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export interface VoiceTakeCardProps {
  take: VoiceTake;
  /** True once this take's transcript has been sent as a turn. */
  sent: boolean;
  onSend: (text: string) => void;
  /** Load the transcript into the composer instead of sending it as-is. */
  onEdit: (text: string) => void;
}

/**
 * Render one take.
 *
 * @param props The take plus its send/edit handlers.
 * @returns A playable bubble carrying the transcription.
 */
export function VoiceTakeCard({ take, sent, onSend, onEdit }: VoiceTakeCardProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  // The recorder does not always write a duration header, so the element's own
  // duration can be Infinity; the measured wall-clock length is the fallback.
  const [duration, setDuration] = useState(take.seconds);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setPosition(audio.currentTime);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setPosition(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  return (
    <Bubble variant="muted" align="end" className="w-full max-w-full">
      <BubbleContent className="flex w-full max-w-full flex-col gap-2.5 px-3 py-2.5">
        <audio ref={audioRef} src={take.url} preload="metadata" />

        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="icon-sm"
            aria-label={playing ? "Pause the take" : "Play the take"}
            onClick={toggle}
            className="rounded-full"
          >
            {playing ? <PauseIcon className="size-4" aria-hidden="true" /> : <PlayIcon className="size-4" aria-hidden="true" />}
          </Button>

          <div className="min-w-0 flex-1">
            <Slider
              value={[Math.min(position, duration)]}
              onValueChange={(next) => {
                const value = Array.isArray(next) ? next[0]! : next;
                setPosition(value);
                if (audioRef.current) audioRef.current.currentTime = value;
              }}
              min={0}
              max={Math.max(duration, 1)}
              step={0.1}
              aria-label="Playback position"
            />
          </div>

          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{clock(duration - position)}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Transcription</span>
          {take.transcript ? (
            <p className="text-sm leading-relaxed">{take.transcript}</p>
          ) : (
            <p className="text-muted-foreground text-sm italic">
              Nothing was recognised in this take. Play it back, then type the question instead.
            </p>
          )}
        </div>

        {take.transcript && !sent && (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(take.transcript)} className="gap-1.5">
              <PencilIcon aria-hidden="true" />
              Edit
            </Button>
            <Button size="sm" onClick={() => onSend(take.transcript)} className="gap-1.5">
              <SendIcon aria-hidden="true" />
              Send
            </Button>
          </div>
        )}
      </BubbleContent>
    </Bubble>
  );
}
