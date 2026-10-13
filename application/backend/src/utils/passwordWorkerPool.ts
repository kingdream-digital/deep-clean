import os from "node:os";
import { Worker } from "node:worker_threads";

// bcryptjs (pur JavaScript) exécuté hors du thread principal. BUG CORRIGÉ
// (test de charge, 45 connexions simultanées) : le calcul bcrypt tournait sur
// le thread principal de Node et figeait TOUTE l'API, pour tout le monde,
// pendant ~4 s à chaque pic de connexions (prise de poste du matin). Les
// calculs partent désormais dans un petit groupe de threads : l'API reste
// réactive et les connexions profitent de plusieurs cœurs. Mêmes hachages
// qu'avant (bcryptjs, même coût) : aucun mot de passe existant n'est touché.

const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const bcrypt = require(workerData.bcryptPath);
parentPort.on("message", ({ id, op, a, b }) => {
  try {
    const result = op === "hash" ? bcrypt.hashSync(a, b) : bcrypt.compareSync(a, b);
    parentPort.postMessage({ id, result });
  } catch (err) {
    parentPort.postMessage({ id, error: String((err && err.message) || err) });
  }
});
`;

type Op = "hash" | "compare";
interface Task {
  id: number;
  op: Op;
  a: string;
  b: string | number;
  resolve: (value: string | boolean) => void;
  reject: (err: Error) => void;
}
interface Slot {
  worker: Worker;
  task: Task | null;
}

const SIZE = Math.max(1, Math.min(4, (os.availableParallelism?.() ?? os.cpus().length) - 1));
const slots: Slot[] = [];
const queue: Task[] = [];
let nextId = 1;

function spawn(): Slot {
  const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { bcryptPath: require.resolve("bcryptjs") } });
  // Libre au départ : ne retient pas le processus (arrêt propre du serveur et des tests).
  worker.unref();
  const slot: Slot = { worker, task: null };
  worker.on("message", (msg: { id: number; result?: string | boolean; error?: string }) => {
    const task = slot.task;
    slot.task = null;
    if (task && task.id === msg.id) {
      if (msg.error !== undefined) task.reject(new Error(msg.error));
      else task.resolve(msg.result!);
    }
    pump();
    // Thread libre : il ne retient plus le processus.
    if (!slot.task) worker.unref();
  });
  const fail = (err: Error) => {
    const task = slot.task;
    slot.task = null;
    task?.reject(err);
    const index = slots.indexOf(slot);
    if (index >= 0) slots.splice(index, 1);
    pump();
  };
  worker.on("error", fail);
  worker.on("exit", (code) => {
    if (code !== 0) fail(new Error(`Thread de hachage arrêté (code ${code}).`));
  });
  slots.push(slot);
  return slot;
}

function pump(): void {
  while (queue.length) {
    let slot = slots.find((s) => !s.task);
    if (!slot && slots.length < SIZE) slot = spawn();
    if (!slot) return;
    const task = queue.shift()!;
    slot.task = task;
    // Calcul en cours : le processus attend sa réponse (scripts comme le seed).
    slot.worker.ref();
    slot.worker.postMessage({ id: task.id, op: task.op, a: task.a, b: task.b });
  }
}

export function runBcrypt(op: "hash", a: string, b: number): Promise<string>;
export function runBcrypt(op: "compare", a: string, b: string): Promise<boolean>;
export function runBcrypt(op: Op, a: string, b: string | number): Promise<string | boolean> {
  return new Promise((resolve, reject) => {
    queue.push({ id: nextId++, op, a, b, resolve, reject });
    pump();
  });
}
