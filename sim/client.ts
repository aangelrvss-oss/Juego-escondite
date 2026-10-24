// Cliente SIMULADO. Tiene su propio reloj (con desfase configurable) y aplica los
// eventos en orden estricto de `seq`, ignorando duplicados y detectando huecos.

import type { Command, CommandResult } from '../engine/src/types.ts';
import type { Snapshot, VisiblePosition } from '../engine/src/view.ts';
import type { Endpoint, ServerMessage, SimHost } from './host.ts';

export interface AppliedEvent {
  seq: number;
  type: string;
  at: number;
  data: Record<string, unknown>;
}

export class SimClient implements Endpoint {
  playerId = '';
  secret = '';
  roomId = '';
  lastSeq = 0;
  clockOffsetMs = 0;
  needsResync = false;
  duplicatesIgnored = 0;
  snapshot: Snapshot | null = null;
  readonly applied: AppliedEvent[] = [];
  readonly positions: { at: number; positions: VisiblePosition[] }[] = [];
  readonly received: ServerMessage[] = [];
  private commandCounter = 0;

  readonly host: SimHost;
  readonly name: string;
  readonly deviceId: string;
  readonly clockSkewMs: number;

  constructor(host: SimHost, name: string, deviceId: string, clockSkewMs = 0) {
    this.host = host;
    this.name = name;
    this.deviceId = deviceId;
    this.clockSkewMs = clockSkewMs;
  }

  clientNow(): number {
    return this.host.now + this.clockSkewMs;
  }

  // Sincronización tipo NTP. En la simulación la latencia es 0, así que el desfase es exacto.
  syncClock(): void {
    this.clockOffsetMs = this.host.serverTime() - this.clientNow();
  }

  toServerTime(clientTime: number): number {
    return clientTime + this.clockOffsetMs;
  }

  createRoom(): CommandResult {
    const r = this.host.createRoom(this.deviceId, this.name);
    if (!r.ok) return { ok: false, error: r.error as never };
    this.playerId = r.playerId;
    this.secret = r.secret;
    this.roomId = r.roomId;
    this.connect();
    return { ok: true, data: { code: r.code } };
  }

  join(code: string): CommandResult {
    const r = this.host.join(code, this.deviceId, this.name);
    if (!r.ok) return { ok: false, error: r.error as never };
    this.playerId = r.playerId;
    this.secret = r.secret;
    this.roomId = r.roomId;
    this.connect();
    return { ok: true };
  }

  connect(): void {
    this.needsResync = false;
    this.host.connect(this.playerId, this.secret, this, this.lastSeq);
  }

  disconnect(): void {
    this.host.disconnect(this.playerId);
  }

  resyncIfNeeded(): void {
    if (this.needsResync) this.connect();
  }

  send(cmd: Command): CommandResult {
    this.commandCounter++;
    return this.sendWithId(`${this.deviceId}-${this.commandCounter}`, cmd);
  }

  sendWithId(commandId: string, cmd: Command): CommandResult {
    return this.host.send(this.playerId, this.secret, commandId, cmd) as CommandResult;
  }

  sendLocation(lat: number, lng: number, accuracyM: number, measuredClientTime = this.clientNow()): CommandResult {
    return this.send({
      type: 'location',
      sample: { lat, lng, accuracyM, measuredAt: this.toServerTime(measuredClientTime) },
    });
  }

  eventsOfType(type: string): AppliedEvent[] {
    return this.applied.filter((e) => e.type === type);
  }

  deliver(msg: ServerMessage): void {
    this.received.push(msg);
    switch (msg.kind) {
      case 'snapshot':
        this.snapshot = msg.snapshot;
        this.lastSeq = msg.seq;
        return;
      case 'positions':
        this.positions.push({ at: msg.at, positions: msg.positions });
        return;
      case 'event':
        if (msg.seq <= this.lastSeq) {
          this.duplicatesIgnored++;
          return;
        }
        if (msg.seq !== this.lastSeq + 1) {
          // Hueco: no se aplica fuera de orden; se pedirá reanudar desde lastSeq.
          this.needsResync = true;
          return;
        }
        this.lastSeq = msg.seq;
        this.applied.push({ seq: msg.seq, type: msg.type, at: msg.at, data: msg.data });
        return;
    }
  }
}
