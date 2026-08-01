/**
 * The Worker <-> main-thread message protocol. Hand-rolled discriminated
 * unions rather than an RPC library (see PRD_pseudogo_web.md, "Worker <->
 * main-thread communication"): the actual shape of this interaction is a
 * long-lived stream of events (many OUTPUTs, possibly many INPUT pauses, a
 * cancel signal) rather than a single request/response call, which maps
 * directly onto plain postMessage rather than onto an RPC-style API.
 */

/** Sent from the main thread to the worker. */
export type ToWorkerMessage =
  | { type: "RUN"; source: string }
  | { type: "INPUT_RESPONSE"; value: string | undefined }
  | { type: "CANCEL" };

/** Sent from the worker to the main thread. */
export type FromWorkerMessage =
  | { type: "OUTPUT"; text: string }
  | { type: "INPUT_REQUEST"; line: number }
  | { type: "ERROR"; phase: string; line: number; message: string }
  | { type: "DONE" }
  | { type: "CANCELLED" };
