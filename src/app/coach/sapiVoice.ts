import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import logger from '../logger';

/**
 * Windows voices (SAPI, through System.Speech) for the braking coach, the same
 * voices Dex Overlay uses. Each phrase is rendered to a WAV file in memory and
 * handed to the overlay, which plays it through its own audio context — on the
 * audio device the driver picked, and instantly, since the coach renders each
 * corner's phrase ahead of time.
 *
 * One PowerShell process stays open and reads one request per line; text
 * travels base64-encoded, so accents and quotes need no escaping and nothing
 * the driver types can reach the command line.
 */

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$def = $s.Voice.Name
$enc = [Text.Encoding]::UTF8
[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($l -eq $null) { break }
  $p = $l.Split([char]9)
  $id = $p[0]
  $out = ''
  try {
    if ($p[1] -eq 'LIST') {
      $v = $s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture.Name }
      $out = [Convert]::ToBase64String($enc.GetBytes(($v -join ';')))
    } elseif ($p[1] -eq 'SAY' -and $p.Count -ge 6) {
      $voice = $enc.GetString([Convert]::FromBase64String($p[2]))
      $lang = $p[3]
      if (-not $voice) {
        $base = $lang.Split('-')[0]
        $m = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq $lang } | Select-Object -First 1
        if (-not $m) { $m = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like ($base + '*') } | Select-Object -First 1 }
        if ($m) { $voice = $m.VoiceInfo.Name } else { $voice = $def }
      }
      $s.SelectVoice($voice)
      $s.Rate = [Math]::Max(-10, [Math]::Min(10, [int]$p[4]))
      $s.Volume = 100
      $ms = New-Object IO.MemoryStream
      $s.SetOutputToWaveStream($ms)
      $s.Speak($enc.GetString([Convert]::FromBase64String($p[5])))
      $s.SetOutputToNull()
      $out = [Convert]::ToBase64String($ms.ToArray())
    }
  } catch { $out = '' }
  [Console]::Out.WriteLine($id + [char]9 + $out)
  [Console]::Out.Flush()
}
`;

export interface SapiVoiceInfo {
  name: string;
  culture: string;
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

/** Gives up on a request after this long (a stuck voice must not hang the coach). */
const REQUEST_TIMEOUT_MS = 15000;

class SapiVoice {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<boolean> | null = null;
  private nextId = 1;
  private pending = new Map<string, (payload: string | null) => void>();
  private buffer = '';

  private start(): Promise<boolean> {
    if (process.platform !== 'win32') return Promise.resolve(false);
    if (this.ready) return this.ready;
    this.ready = new Promise<boolean>((resolve) => {
      let proc: ChildProcessWithoutNullStreams;
      try {
        proc = spawn(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-EncodedCommand',
            Buffer.from(SCRIPT, 'utf16le').toString('base64'),
          ],
          { windowsHide: true }
        );
      } catch (error) {
        logger.warn('[Coach] Could not start the Windows voice', error);
        this.ready = null;
        resolve(false);
        return;
      }
      this.proc = proc;
      let started = false;
      proc.stdout.setEncoding('ascii');
      proc.stdout.on('data', (chunk: string) => {
        this.buffer += chunk;
        let nl: number;
        while ((nl = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, nl).replace(/\r$/, '');
          this.buffer = this.buffer.slice(nl + 1);
          if (!started) {
            if (line === 'READY') {
              started = true;
              resolve(true);
            }
            continue;
          }
          const tab = line.indexOf('\t');
          if (tab < 0) continue;
          const id = line.slice(0, tab);
          const done = this.pending.get(id);
          if (done) {
            this.pending.delete(id);
            done(line.slice(tab + 1) || null);
          }
        }
      });
      proc.stderr.on('data', () => undefined);
      const stop = () => {
        if (this.proc !== proc) return;
        this.proc = null;
        this.ready = null;
        this.buffer = '';
        for (const done of this.pending.values()) done(null);
        this.pending.clear();
        if (!started) resolve(false);
      };
      proc.on('exit', stop);
      proc.on('error', (error) => {
        logger.warn('[Coach] Windows voice process failed', error);
        stop();
      });
    });
    return this.ready;
  }

  private async request(parts: string[]): Promise<string | null> {
    if (!(await this.start()) || !this.proc) return null;
    const id = String(this.nextId++);
    const proc = this.proc;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) resolve(null);
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
      proc.stdin.write([id, ...parts].join('\t') + '\n');
    });
  }

  /** The phrase as a WAV file, or null when there is no Windows voice. */
  async synthesize(
    text: string,
    voice: string,
    lang: string,
    rate: number
  ): Promise<Uint8Array | null> {
    const payload = await this.request([
      'SAY',
      b64(voice),
      lang.replace(/[^\w-]/g, ''),
      String(Math.round(rate)),
      b64(text),
    ]);
    return payload ? new Uint8Array(Buffer.from(payload, 'base64')) : null;
  }

  async listVoices(): Promise<SapiVoiceInfo[]> {
    const payload = await this.request(['LIST']);
    if (!payload) return [];
    return Buffer.from(payload, 'base64')
      .toString('utf8')
      .split(';')
      .filter(Boolean)
      .map((entry) => {
        const [name, culture = ''] = entry.split('|');
        return { name, culture };
      });
  }

  dispose() {
    this.proc?.kill();
    this.proc = null;
    this.ready = null;
  }
}

export const sapiVoice = new SapiVoice();
